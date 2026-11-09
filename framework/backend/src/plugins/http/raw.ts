// A second transport for the `http` plugin: HTTP/1.1 spoken by hand over
// node:net sockets — no node:http, every answer goes through socket.write().
// Same messages out ("http.request"), same effects in ("http.respond",
// "header", "close"), same plugin name, so app modules work unchanged.
// Scope: Content-Length framing only (chunked → 501), one request in flight
// per socket, pipelined requests answered in order. Streaming/SSE/file
// effects answer 501 — this transport is an experiment, not a replacement.
import { type AddressInfo, createServer, type Socket } from "node:net";
import type { Message, Plugin, PluginContext } from "@pavlus/core";
import { type Ctx, newRid } from "../../ctx.ts";
import type { ServerPlugin } from "../../runtime.ts";
import { contentTypeOf, HttpError, parseBody, parseQuery } from "./body.ts";
import { parseCookies } from "./cookies.ts";
import type { HttpEffect, HttpServerOptions } from "./mod.ts";
import { normalizeRespond, type RespondEffect } from "./respond.ts";

type WithCtx = { ctx?: Record<string, unknown> };

interface Req {
  rid: string;
  ctx: Ctx;
  method: string;
  path: string; // the whole request-target, query included
  version: "HTTP/1.0" | "HTTP/1.1";
  keepAlive: boolean; // what the client asked for
  contentLength: number;
  reqHeaders: Record<string, string | string[]>;
  /** response headers accumulated before the answer ("header" effect) */
  headers: Record<string, string>;
  dispatched: boolean;
  responded: boolean;
}

/** One connection: a byte buffer plus a small parse state machine. */
interface Sock {
  sock: Socket;
  buf: Buffer; // bytes not yet parsed
  phase: "head" | "body" | "busy" | "idle";
  cur?: Req;
  need: number; // body bytes still waited for (phase "body")
  requests: number;
  skippedEmpty: number; // leading CRLFs swallowed before the request-line
  headerTimer?: NodeJS.Timeout;
  bodyTimer?: NodeJS.Timeout;
  idleTimer?: NodeJS.Timeout;
}

export interface RawHttpStats {
  sockets: number;
  socketsOpen: number;
  requests: number;
  rejected: number;
  aborted: number;
  doubleResponses: number;
  written: number; // response bytes handed to socket.write()
  timers: number; // live header/body/idle timers
}

export interface RawHttpServerPlugin extends ServerPlugin {
  readonly server: ReturnType<typeof createServer>;
  readonly transport: "raw";
  get port(): number;
  listening(): Promise<AddressInfo>;
  address(): AddressInfo | null;
  stats(): RawHttpStats;
  stop(): void;
  cancel(rid: string): void;
  closed(): Promise<void>;
  dispose(): void;
}

const REQUEST_ID = /^[!-~]{1,128}$/; // printable, no spaces (mirrors mod.ts)
const REASON: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  404: "Not Found",
  405: "Method Not Allowed",
  408: "Request Timeout",
  411: "Length Required",
  413: "Payload Too Large",
  414: "URI Too Long",
  431: "Request Header Fields Too Large",
  500: "Internal Server Error",
  501: "Not Implemented",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  503: "Service Unavailable",
};
const reason = (s: number): string => REASON[s] ?? "Unknown";

function headerOf(
  h: Record<string, string | string[]>,
  name: string,
): string | undefined {
  const v = h[name];
  return Array.isArray(v) ? v[0] : v;
}

/** The whole point: status+headers+body → one buffer → socket.write(). */
function serialize(
  status: number,
  headers: Record<string, string | string[]>,
  body: Buffer | undefined,
  keepAlive: boolean,
): Buffer {
  const out: string[] = [`HTTP/1.1 ${status} ${reason(status)}\r\n`];
  for (const [k, v] of Object.entries(headers)) {
    if (k === "connection" || k === "transfer-encoding") continue; // ours
    if (Array.isArray(v)) for (const x of v) out.push(`${k}: ${x}\r\n`);
    else out.push(`${k}: ${v}\r\n`);
  }
  out.push(`connection: ${keepAlive ? "keep-alive" : "close"}\r\n`, "\r\n");
  return Buffer.concat([
    Buffer.from(out.join(""), "latin1"),
    body ?? Buffer.alloc(0),
  ]);
}

/** Parses the header block. Throws HttpError on anything suspicious. */
function parseHead(head: string): Req {
  const lines = head.split("\r\n");
  const parts = lines[0]!.split(" ");
  if (parts.length !== 3) throw new HttpError(400, "bad_request");
  const method = parts[0]!;
  const target = parts[1]!;
  const version = parts[2]!;
  if (version !== "HTTP/1.1" && version !== "HTTP/1.0")
    throw new HttpError(505, "http_version_not_supported");
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(method))
    throw new HttpError(400, "bad_method");
  if (!target.startsWith("/")) throw new HttpError(400, "bad_url");

  const h: Record<string, string | string[]> = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(":");
    if (i <= 0 || /[\s:]/.test(line.slice(0, i)))
      throw new HttpError(400, "bad_header");
    if (line.startsWith(" ") || line.startsWith("\t"))
      throw new HttpError(400, "obs_fold_not_supported"); // no smuggling
    const name = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (value.includes("\0")) throw new HttpError(400, "bad_header");
    const prev = h[name];
    if (prev === undefined) h[name] = value;
    else if (Array.isArray(prev)) prev.push(value);
    else if (prev !== value)
      h[name] = name === "set-cookie" ? [prev, value] : [prev, value];
    // two different content-length values would be answered below (400)
  }

  if (h["transfer-encoding"] !== undefined)
    throw new HttpError(501, "chunked_not_supported");
  const cl = headerOf(h, "content-length");
  let contentLength = 0;
  if (cl !== undefined) {
    if (!/^\d+$/.test(cl) || Array.isArray(h["content-length"]))
      throw new HttpError(400, "bad_content_length");
    contentLength = Number(cl);
  }

  const conn = (headerOf(h, "connection") ?? "").toLowerCase();
  const wantsClose = conn
    .split(",")
    .map((s) => s.trim())
    .includes("close");
  const wantsKeep = conn
    .split(",")
    .map((s) => s.trim())
    .includes("keep-alive");
  return {
    rid: newRid(),
    ctx: { rid: "", conn: "http" } as Ctx, // filled by the caller
    method,
    path: target,
    version,
    keepAlive: version === "HTTP/1.1" ? !wantsClose : wantsKeep,
    contentLength,
    reqHeaders: h,
    headers: {},
    dispatched: false,
    responded: false,
  };
}

export function createRawHttpServerPlugin(
  o: HttpServerOptions = {},
): RawHttpServerPlugin {
  const lim = {
    bodyBytes: o.limits?.bodyBytes ?? 1024 * 1024,
    bodyTimeoutMs: o.limits?.bodyTimeoutMs ?? 10_000,
    headersTimeoutMs: o.limits?.headersTimeoutMs ?? 10_000,
    receiveTimeoutMs: o.limits?.receiveTimeoutMs ?? 60_000,
    requestTimeoutMs: o.limits?.requestTimeoutMs ?? 30_000,
    maxHeaderBytes: o.limits?.maxHeaderBytes ?? 16 * 1024,
    keepAliveTimeoutMs: o.limits?.keepAliveTimeoutMs ?? 5000,
    maxRequestsPerSocket: o.limits?.maxRequestsPerSocket ?? 1000,
  };
  const now = o.now ?? Date.now;
  const idHeader = (o.requestIdHeader ?? "x-request-id").toLowerCase();
  const trust = o.trustProxy ?? false;

  const server = createServer();
  const socks = new Set<Sock>();
  const byRid = new Map<string, Sock>();
  const timers = new Set<NodeJS.Timeout>();
  const st: RawHttpStats = {
    sockets: 0,
    socketsOpen: 0,
    requests: 0,
    rejected: 0,
    aborted: 0,
    doubleResponses: 0,
    written: 0,
    timers: 0,
  };
  let pc: PluginContext<any> | undefined;
  let closing = false;
  let serverClosed = false;
  let resolveListening!: (a: AddressInfo) => void;
  const listeningP = new Promise<AddressInfo>(
    (res) => (resolveListening = res),
  );
  let markClosed!: () => void;
  const closedP = new Promise<void>((res) => (markClosed = res));

  const setT = (fn: () => void, ms: number): NodeJS.Timeout => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    t.unref?.();
    timers.add(t);
    return t;
  };
  const clearT = (t: NodeJS.Timeout | undefined): void => {
    if (t && timers.delete(t)) clearTimeout(t);
  };
  const send = (m: Message): void => pc?.dispatch(m);

  function clientIp(s: Sock, h: Req["reqHeaders"]): string {
    const remote = s.sock.remoteAddress ?? "";
    if (!trust) return remote;
    const xff = headerOf(h, "x-forwarded-for");
    if (!xff) return remote;
    const hops = xff.split(",").map((x) => x.trim());
    const n = typeof trust === "number" ? trust : 1;
    return hops[Math.max(0, hops.length - n)] ?? remote;
  }

  function fail(s: Sock, status: number, code: string): void {
    st.rejected++;
    const body = Buffer.from(`{"error":"${code}"}`);
    const buf = serialize(
      status,
      {
        "content-type": "application/json; charset=utf-8",
        "content-length": String(body.length),
      },
      body,
      false,
    );
    s.sock.end(buf); // refuse + close: we may not understand the stream anymore
  }

  function clearReqTimers(s: Sock): void {
    clearT(s.headerTimer);
    s.headerTimer = undefined;
    clearT(s.bodyTimer);
    s.bodyTimer = undefined;
    clearT(s.idleTimer);
    s.idleTimer = undefined;
  }

  function drop(s: Sock): void {
    // called on socket "close": account for an abandoned request
    const r = s.cur;
    if (r?.dispatched && !r.responded) {
      st.aborted++;
      send({ id: "http.aborted", ctx: r.ctx });
    }
    clearReqTimers(s);
    if (r) byRid.delete(r.rid);
    socks.delete(s);
    st.socketsOpen = socks.size;
    if (serverClosed && socks.size === 0) markClosed();
  }

  function dispatchReq(s: Sock, r: Req, body: Buffer): void {
    r.dispatched = true;
    byRid.set(r.rid, s);
    let parsed: unknown;
    try {
      parsed = parseBody(
        body.length ? body : undefined,
        contentTypeOf(headerOf(r.reqHeaders, "content-type")),
      );
    } catch (e) {
      byRid.delete(r.rid);
      s.cur = undefined;
      return fail(
        s,
        e instanceof HttpError ? e.status : 400,
        e instanceof HttpError ? e.code : "bad_request",
      );
    }
    const q = r.path.indexOf("?");
    const payload = {
      method: r.method,
      path: q < 0 ? r.path : r.path.slice(0, q),
      query: parseQuery(q < 0 ? "" : r.path.slice(q + 1)),
      headers: r.reqHeaders,
      cookies: parseCookies(headerOf(r.reqHeaders, "cookie")),
      params: {},
      body: parsed,
      ip: clientIp(s, r.reqHeaders),
    };
    send({ id: "http.request", payload, ctx: r.ctx });
  }

  /** The per-socket state machine: "data" events and responses re-run it. */
  function step(s: Sock): void {
    if (s.sock.destroyed) return;
    if (s.phase === "head") {
      // RFC 9112: ignore empty line(s) before the request-line — some
      // clients and relays emit them; a flood of them is refused, not fed
      while (
        s.buf.length >= 2 &&
        s.buf[0] === 0x0d &&
        s.buf[1] === 0x0a &&
        ++s.skippedEmpty <= 8
      ) {
        s.buf = s.buf.subarray(2);
      }
      if (s.skippedEmpty > 8) {
        s.phase = "idle";
        return void fail(s, 400, "bad_request");
      }
      if (s.buf.length > lim.maxHeaderBytes)
        return void ((s.phase = "idle"), fail(s, 431, "headers_too_large"));
      const i = s.buf.indexOf("\r\n\r\n");
      if (i < 0) return; // more bytes come; headerTimer guards slowloris
      if (i > lim.maxHeaderBytes) {
        s.phase = "idle";
        return void fail(s, 431, "headers_too_large");
      }
      const head = s.buf.subarray(0, i).toString("latin1");
      s.buf = s.buf.subarray(i + 4);
      let r: Req;
      try {
        r = parseHead(head);
      } catch (e) {
        s.phase = "idle";
        return void fail(
          s,
          e instanceof HttpError ? e.status : 400,
          e instanceof HttpError ? e.code : "bad_request",
        );
      }
      clearT(s.headerTimer);
      s.headerTimer = undefined;
      s.skippedEmpty = 0;
      const incoming = headerOf(r.reqHeaders, idHeader);
      const requestId =
        idHeader === "x-request-id" &&
        typeof incoming === "string" &&
        REQUEST_ID.test(incoming)
          ? incoming
          : newRid();
      r.ctx = {
        rid: r.rid,
        conn: "http",
        deadline: now() + lim.requestTimeoutMs,
        requestId,
      };
      r.headers = { "x-request-id": requestId };
      if (r.contentLength > lim.bodyBytes) {
        s.phase = "idle";
        return void fail(s, 413, "body_too_large");
      }
      // a curl-ism: the client waits for permission before sending the body
      if (
        (headerOf(r.reqHeaders, "expect") ?? "")
          .toLowerCase()
          .includes("100-continue")
      )
        s.sock.write("HTTP/1.1 100 Continue\r\n\r\n");
      s.cur = r;
      s.requests++;
      st.requests++;
      s.need = r.contentLength;
      s.phase = "body";
      return step(s); // the body may already sit in the buffer
    }
    if (s.phase === "body") {
      if (s.buf.length < s.need) {
        s.bodyTimer ??= setT(() => {
          if (s.phase === "body" && s.cur) {
            s.phase = "idle";
            fail(s, 408, "body_timeout");
          }
        }, lim.bodyTimeoutMs);
        return;
      }
      clearT(s.bodyTimer);
      s.bodyTimer = undefined;
      const body = s.buf.subarray(0, s.need);
      s.buf = s.buf.subarray(s.need);
      s.phase = "busy";
      dispatchReq(s, s.cur!, Buffer.from(body));
      return;
    }
    // "busy": the answer decides what happens next
    if (s.phase === "idle") {
      if (s.buf.length > 0) {
        // a pipelined request already waits in the buffer: parse it now
        s.phase = "head";
        s.headerTimer ??= setT(() => {
          if (s.phase === "head" && s.buf.indexOf("\r\n\r\n") < 0) {
            s.phase = "idle";
            fail(s, 408, "headers_timeout");
          }
        }, lim.headersTimeoutMs);
        return step(s);
      }
      if (!s.idleTimer)
        s.idleTimer = setT(() => {
          if (s.phase === "idle") s.sock.destroy(); // keep-alive ran out
        }, lim.keepAliveTimeoutMs);
    }
  }

  function afterRespond(s: Sock, r: Req): void {
    if (s.cur === r) {
      s.cur = undefined;
      byRid.delete(r.rid);
    }
    if (s.sock.destroyed) return;
    if (s.phase !== "busy") return;
    s.phase = "idle";
    send({ id: "request.done", ctx: r.ctx });
    step(s); // a pipelined request may already sit in the buffer
  }

  function answer(s: Sock, r: Req, e: RespondEffect): void {
    if (r.responded) {
      st.doubleResponses++;
      return;
    }
    r.responded = true;
    let norm;
    try {
      const fwdProto = trust
        ? (headerOf(r.reqHeaders, "x-forwarded-proto") ?? "")
            .split(",")[0]
            ?.trim()
        : "";
      norm = normalizeRespond(
        e,
        { ...r.headers },
        {
          method: r.method,
          etag: o.etag,
          ifNoneMatch: headerOf(r.reqHeaders, "if-none-match"),
          secureCookies: fwdProto === "https", // plain socket: a proxy is the only https
        },
      );
    } catch {
      norm = {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: Buffer.from('{"error":"internal_error"}'),
      };
    }
    const ka = r.keepAlive && !closing && s.requests < lim.maxRequestsPerSocket;
    const out = serialize(
      norm.status,
      norm.headers,
      r.method === "HEAD" ? undefined : norm.body, // HEAD: length stays, bytes go
      ka,
    );
    st.written += out.length;
    const flushed = s.sock.write(out);
    if (!ka) {
      s.sock.end();
      if (s.cur === r) {
        s.cur = undefined;
        byRid.delete(r.rid);
      }
      send({ id: "request.done", ctx: r.ctx });
      return;
    }
    if (flushed) afterRespond(s, r);
    else s.sock.once("drain", () => afterRespond(s, r)); // backpressure
  }

  function handle(effect: HttpEffect & WithCtx): void {
    const rid =
      typeof effect.ctx?.rid === "string" ? effect.ctx.rid : undefined;
    const s = rid ? byRid.get(rid) : undefined;
    const r = s?.cur;
    if (!s || !r || r.rid !== rid) return;
    switch (effect.type) {
      case "respond": {
        const {
          plugin: _p,
          type: _t,
          ctx: _c,
          ...rest
        } = effect as never as RespondEffect & {
          plugin: string;
          type: string;
          ctx: unknown;
        };
        return answer(s, r, rest);
      }
      case "header": {
        const name = effect.name.toLowerCase();
        if (
          !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) ||
          /[\r\n\0]/.test(effect.value)
        )
          return; // ignore invalid, like node:http would refuse to send
        r.headers[name] = String(effect.value);
        return;
      }
      case "close":
        s.sock.destroy();
        return;
      default:
        // stream.*/sse.*/file: honest refusal, the app meant to stream
        if (!r.responded)
          answer(s, r, { status: 501, json: { error: "not_implemented" } });
        return;
    }
  }

  server.on("connection", (sock) => {
    st.sockets++;
    const s: Sock = {
      sock,
      buf: Buffer.alloc(0),
      phase: "head",
      need: 0,
      requests: 0,
      skippedEmpty: 0,
    };
    socks.add(s);
    st.socketsOpen = socks.size;
    sock.on("data", (c: Buffer) => {
      s.buf = s.buf.length ? Buffer.concat([s.buf, c]) : Buffer.from(c);
      if (s.phase === "idle") {
        s.phase = "head";
        clearT(s.idleTimer);
        s.idleTimer = undefined;
      }
      if (s.phase === "head" && !s.cur) {
        // slowloris guard: the headers of THIS request must arrive in time
        s.headerTimer ??= setT(() => {
          if (
            s.phase === "head" &&
            s.buf.length &&
            s.buf.indexOf("\r\n\r\n") < 0
          ) {
            s.phase = "idle";
            fail(s, 408, "headers_timeout");
          }
        }, lim.headersTimeoutMs);
      }
      step(s);
    });
    sock.on("error", () => {}); // "close" follows and cleans up
    sock.on("close", () => drop(s));
  });

  const plugin: RawHttpServerPlugin = {
    name: "http", // drop-in: effects say plugin "http"
    server,
    transport: "raw",
    get port() {
      return (server.address() as AddressInfo | null)?.port ?? 0;
    },
    init(ctx) {
      pc = ctx;
      server.once("error", (err) => {
        send({
          id: "http.listen_failed",
          payload: {
            code: (err as NodeJS.ErrnoException).code,
            message: err.message,
          },
          ctx: { rid: newRid(), conn: "system" },
        });
      });
      server.listen(o.port ?? 0, o.host ?? "127.0.0.1", () => {
        const a = server.address() as AddressInfo;
        resolveListening(a);
        send({
          id: "http.listening",
          payload: { port: a.port, host: o.host ?? a.address },
          ctx: { rid: newRid(), conn: "system" },
        });
      });
    },
    handle(effect) {
      handle(effect as HttpEffect & WithCtx);
    },
    cancel(rid) {
      const s = byRid.get(rid);
      const r = s?.cur;
      if (s && r && r.rid === rid && !r.responded)
        answer(s, r, { status: 504, json: { error: "cancelled" } });
    },
    listening: () => listeningP,
    address: () => server.address() as AddressInfo | null,
    stats: () => ({ ...st, socketsOpen: socks.size, timers: timers.size }),
    stop() {
      closing = true;
      if (server.listening)
        server.close(() => {
          serverClosed = true;
          if (socks.size === 0) markClosed();
        });
      for (const s of socks)
        if (s.phase === "idle" || (s.phase === "head" && !s.buf.length))
          s.sock.end(); // idle keep-alives go; in-flight answers finish
    },
    closed: () =>
      server.listening || socks.size ? closedP : Promise.resolve(),
    dispose() {
      closing = true;
      for (const t of [...timers]) clearTimeout(t);
      timers.clear();
      for (const s of [...socks]) {
        clearReqTimers(s);
        s.sock.destroy();
      }
      socks.clear();
      st.socketsOpen = 0;
      serverClosed = true;
      markClosed();
      server.close();
      // every tracked socket was destroyed above; nothing else to close
    },
  };
  return plugin;
}
