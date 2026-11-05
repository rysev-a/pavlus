// The http server plugin (node:http). It mints the `rid` of every request,
// dispatches `http.request` with `ctx = { rid, conn: "http" }` and answers
// `http.respond` & friends by finding the ServerResponse through `ctx.rid`.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { pipeline } from "node:stream";
import type { Message, PluginContext } from "@service-laboratory/pavlus";
import { newRid, ridOf, type Ctx } from "../../ctx.ts";
import type { ServerPlugin } from "../../runtime.ts";
import {
  contentTypeOf,
  HttpError,
  parseBody,
  parseQuery,
  readBody,
} from "./body.ts";
import { parseCookies } from "./cookies.ts";
import {
  checkHeader,
  contentDisposition,
  mergeHeaders,
  normalizeRespond,
  type RespondEffect,
} from "./respond.ts";

export { parseCookies, serializeCookie, clearCookie } from "./cookies.ts";
export type { CookieOptions } from "./cookies.ts";
export { httpEffector } from "./helpers.ts";
export type { HttpEffector } from "./helpers.ts";
export { normalizeRespond } from "./respond.ts";
export type { RespondEffect, NormalizedResponse } from "./respond.ts";
export { parseQuery, parseBody, HttpError } from "./body.ts";

export interface HttpLimits {
  /** Max body size in bytes. Default 1 MiB. */
  bodyBytes?: number;
  /** Max time to receive the body. Default 10 s. */
  bodyTimeoutMs?: number;
  /** Max time to receive the request headers (slowloris). Default 10 s. */
  headersTimeoutMs?: number;
  /** Max time to receive a whole request. Default 60 s. */
  receiveTimeoutMs?: number;
  /** Deadline put on `ctx` for the runtime. Default 30 s. */
  requestTimeoutMs?: number;
  /** Max size of the header block. Default 16 KiB. */
  maxHeaderBytes?: number;
  keepAliveTimeoutMs?: number;
  /** Requests served on one keep-alive socket. Default 1000. */
  maxRequestsPerSocket?: number;
  maxConnections?: number;
  /** Bytes a stream may buffer for a slow client before it is dropped. Default 1 MiB. */
  streamBufferBytes?: number;
  /** SSE comment interval. Default 15 s. */
  sseHeartbeatMs?: number;
  /** Node's timeout sweep interval. Default 30 s (lower in tests). */
  checkIntervalMs?: number;
  /** Max query parameters. Default 1000. */
  maxQueryParams?: number;
}

export interface HttpServerOptions {
  /** 0 picks an ephemeral port. Default 0. */
  port?: number;
  host?: string;
  limits?: HttpLimits;
  /**
   * `true` trusts the last `X-Forwarded-For` hop, a number N trusts N proxies
   * (the client is the Nth entry from the right). Default false.
   */
  trustProxy?: boolean | number;
  /** ETag + 304 for GET/HEAD 200 bodies, unless an effect says otherwise. */
  etag?: boolean;
  /** Default `x-request-id`. */
  requestIdHeader?: string;
  now?: () => number;
}

export type HttpEffect =
  | ({ plugin: "http"; type: "respond" } & RespondEffect)
  | { plugin: "http"; type: "header"; name: string; value: string }
  | { plugin: "http"; type: "close" }
  | {
      plugin: "http";
      type: "stream.start";
      status?: number;
      headers?: RespondEffect["headers"];
      contentType?: string;
      download?: string;
    }
  | { plugin: "http"; type: "stream.chunk"; data: string | Uint8Array }
  | { plugin: "http"; type: "stream.end" }
  | {
      plugin: "http";
      type: "sse.start";
      headers?: RespondEffect["headers"];
      retry?: number;
      heartbeatMs?: number;
    }
  | {
      plugin: "http";
      type: "sse.send";
      data: unknown;
      event?: string;
      id?: string;
      retry?: number;
    }
  | { plugin: "http"; type: "sse.end" }
  | {
      plugin: "http";
      type: "file";
      path: string;
      filename?: string;
      contentType?: string;
      status?: number;
      headers?: RespondEffect["headers"];
    };

type WithCtx = { ctx?: Record<string, unknown> };

export interface HttpStats {
  /** Connections (rids) currently open. */
  conns: number;
  /** Live timers: body timeouts and SSE heartbeats. */
  timers: number;
  heartbeats: number;
  /** TCP connections accepted since start / currently open. */
  sockets: number;
  socketsOpen: number;
  requests: number;
  /** Rejected by the plugin itself (413, 400, 408, 503...). */
  rejected: number;
  /** Client left before the app saw the request. */
  abortedEarly: number;
  aborted: number;
  doubleResponses: number;
  /** Effects for a rid that has no connection any more. */
  orphans: number;
  slowConsumers: number;
}

export interface HttpServerPlugin extends ServerPlugin {
  readonly server: Server;
  /** Resolves when the server listens. */
  listening(): Promise<AddressInfo>;
  address(): AddressInfo | null;
  stats(): HttpStats;
  /** Port of the listening server. */
  readonly port: number;
}

interface Conn {
  rid: string;
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  ctx: Ctx;
  headers: Record<string, string | string[]>;
  state: "reading" | "open" | "streaming" | "done";
  dispatched: boolean;
  queue: Buffer[];
  queued: number;
  blocked: boolean;
  endWanted: boolean;
  heartbeat?: unknown;
  sse: boolean;
  cancelBody?: () => void;
  onDrain?: () => void;
}

const MIME: Record<string, string> = {
  ".txt": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

function clientIp(req: IncomingMessage, trust: boolean | number): string {
  const remote = req.socket.remoteAddress ?? "";
  const hops = trust === true ? 1 : trust === false ? 0 : trust;
  if (!hops) return remote;
  const xff = req.headers["x-forwarded-for"];
  const list = (Array.isArray(xff) ? xff.join(",") : (xff ?? ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // the connection peer is the last proxy; each trusted hop peels one entry
  const chain = [...list, remote];
  return chain[Math.max(0, chain.length - 1 - hops)] ?? remote;
}

export function createHttpServerPlugin(
  o: HttpServerOptions = {},
): HttpServerPlugin {
  const lim = {
    bodyBytes: o.limits?.bodyBytes ?? 1024 * 1024,
    bodyTimeoutMs: o.limits?.bodyTimeoutMs ?? 10_000,
    headersTimeoutMs: o.limits?.headersTimeoutMs ?? 10_000,
    receiveTimeoutMs: o.limits?.receiveTimeoutMs ?? 60_000,
    requestTimeoutMs: o.limits?.requestTimeoutMs ?? 30_000,
    maxHeaderBytes: o.limits?.maxHeaderBytes ?? 16 * 1024,
    streamBufferBytes: o.limits?.streamBufferBytes ?? 1024 * 1024,
    sseHeartbeatMs: o.limits?.sseHeartbeatMs ?? 15_000,
    maxQueryParams: o.limits?.maxQueryParams ?? 1000,
  };
  const now = o.now ?? Date.now;
  const idHeader = (o.requestIdHeader ?? "x-request-id").toLowerCase();
  const trust = o.trustProxy ?? false;

  const server = createServer({
    maxHeaderSize: lim.maxHeaderBytes,
    keepAliveTimeout: o.limits?.keepAliveTimeoutMs ?? 5000,
    headersTimeout: lim.headersTimeoutMs,
    requestTimeout: Math.max(lim.receiveTimeoutMs, lim.headersTimeoutMs),
    ...(o.limits?.checkIntervalMs && {
      connectionsCheckingInterval: o.limits.checkIntervalMs,
    }),
  });
  server.maxRequestsPerSocket = o.limits?.maxRequestsPerSocket ?? 1000;
  if (o.limits?.maxConnections) server.maxConnections = o.limits.maxConnections;

  const conns = new Map<string, Conn>();
  const timers = new Set<unknown>();
  const st: HttpStats = {
    conns: 0,
    timers: 0,
    heartbeats: 0,
    sockets: 0,
    socketsOpen: 0,
    requests: 0,
    rejected: 0,
    abortedEarly: 0,
    aborted: 0,
    doubleResponses: 0,
    orphans: 0,
    slowConsumers: 0,
  };
  let pc: PluginContext<any> | undefined;
  let closing = false;
  let resolveListening!: (a: AddressInfo) => void;
  let rejectListening!: (e: unknown) => void;
  const listeningP = new Promise<AddressInfo>((res, rej) => {
    resolveListening = res;
    rejectListening = rej;
  });
  listeningP.catch(() => {}); // surfaced through `http.listen_failed`
  const closedP = new Promise<void>((res) => server.once("close", () => res()));
  let listenStarted = false;

  const setT = (fn: () => void, ms: number): unknown => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    t.unref?.();
    timers.add(t);
    return t;
  };
  const clearT = (t: unknown): void => {
    if (timers.delete(t)) clearTimeout(t as NodeJS.Timeout);
  };
  const setI = (fn: () => void, ms: number): unknown => {
    const t = setInterval(fn, ms);
    t.unref?.();
    timers.add(t);
    return t;
  };
  const clearI = (t: unknown): void => {
    if (timers.delete(t)) clearInterval(t as NodeJS.Timeout);
  };

  const send = (m: Message): void => pc?.dispatch(m);

  function reject(conn: Conn, e: HttpError): void {
    st.rejected++;
    const { res, req } = conn;
    if (!res.headersSent && !res.writableEnded) {
      const body = Buffer.from(JSON.stringify({ error: e.code }));
      res.writeHead(e.status === 499 ? 400 : e.status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": body.length,
        connection: "close",
        "x-request-id": String(conn.headers["x-request-id"] ?? ""),
      });
      res.end(body);
    }
    // stop an upload we refuse: close the socket once the answer is out
    res.once("finish", () => req.socket.destroy());
  }

  function cleanup(conn: Conn): void {
    conns.delete(conn.rid);
    st.conns = conns.size;
    if (conn.heartbeat !== undefined) {
      clearI(conn.heartbeat);
      conn.heartbeat = undefined;
      st.heartbeats--;
    }
    conn.cancelBody?.();
    if (conn.onDrain) conn.res.off("drain", conn.onDrain);
    conn.queue.length = 0;
    conn.queued = 0;
  }

  function onRequest(req: IncomingMessage, res: ServerResponse): void {
    st.requests++;
    const rid = newRid();
    const incoming = req.headers[idHeader];
    const requestId =
      typeof incoming === "string" && REQUEST_ID.test(incoming)
        ? incoming
        : rid;
    const ctx: Ctx = {
      rid,
      conn: "http",
      deadline: now() + lim.requestTimeoutMs,
      requestId,
    };
    const conn: Conn = {
      rid,
      req,
      res,
      method: (req.method ?? "GET").toUpperCase(),
      ctx,
      headers: { "x-request-id": requestId },
      state: "reading",
      dispatched: false,
      queue: [],
      queued: 0,
      blocked: false,
      endWanted: false,
      sse: false,
    };
    conns.set(rid, conn);
    st.conns = conns.size;
    res.setHeader("x-request-id", requestId);

    res.once("close", () => {
      const wasDispatched = conn.dispatched;
      const finished = res.writableFinished;
      cleanup(conn);
      if (!wasDispatched) {
        if (!finished) st.abortedEarly++;
        return;
      }
      if (finished) send({ id: "request.done", ctx });
      else {
        st.aborted++;
        send({ id: "http.aborted", ctx });
      }
    });

    if (closing) {
      res.shouldKeepAlive = false;
      return reject(conn, new HttpError(503, "shutting_down"));
    }

    void (async () => {
      try {
        const rawUrl = req.url ?? "/";
        if (!rawUrl.startsWith("/")) throw new HttpError(400, "bad_url");
        const q = rawUrl.indexOf("?");
        const path = q < 0 ? rawUrl : rawUrl.slice(0, q);
        const query = parseQuery(
          q < 0 ? "" : rawUrl.slice(q + 1).split("#")[0]!,
          lim.maxQueryParams,
        );
        const reading = readBody(req, {
          limit: lim.bodyBytes,
          timeoutMs: lim.bodyTimeoutMs,
          setTimer: setT,
          clearTimer: clearT,
        });
        conn.cancelBody = reading.cancel;
        const raw = await reading.promise;
        conn.cancelBody = undefined;
        const body = parseBody(raw, contentTypeOf(req.headers["content-type"]));
        if (res.destroyed || conn.state !== "reading") return;
        conn.state = "open";
        conn.dispatched = true;
        const payload = {
          method: conn.method,
          path,
          query,
          headers: req.headers,
          cookies: parseCookies(req.headers.cookie),
          params: {},
          body,
          ip: clientIp(req, trust),
        };
        send({ id: "http.request", payload, ctx });
      } catch (e) {
        conn.cancelBody = undefined;
        if (res.destroyed || conn.state !== "reading") return;
        if (e instanceof HttpError) {
          if (e.status === 499) return void res.destroy();
          return reject(conn, e);
        }
        reject(conn, new HttpError(500, "internal_error"));
      }
    })();
  }

  // ---------------------------------------------------------- the effects --

  function connFor(effect: {
    ctx?: Record<string, unknown>;
  }): Conn | undefined {
    const rid = ridOf(effect);
    const c = rid === undefined ? undefined : conns.get(rid);
    if (!c) st.orphans++;
    return c;
  }

  function writeHeadFor(conn: Conn, status: number, headers: object): void {
    if (closing) {
      (headers as Record<string, string>)["connection"] = "close";
      conn.res.shouldKeepAlive = false;
    }
    conn.res.writeHead(status, headers as never);
  }

  function respond(conn: Conn, e: RespondEffect): void {
    if (conn.state !== "open") {
      st.doubleResponses++;
      return;
    }
    const r = normalizeRespond(e, conn.headers, {
      method: conn.method,
      etag: o.etag,
      ifNoneMatch: conn.req.headers["if-none-match"],
    });
    conn.state = "done";
    writeHeadFor(conn, r.status, r.headers);
    if (conn.method === "HEAD" || !r.body) conn.res.end();
    else conn.res.end(r.body);
  }

  function beginStream(
    conn: Conn,
    e: {
      status?: number;
      headers?: RespondEffect["headers"];
      contentType?: string;
      download?: string;
    },
    extra: Record<string, string> = {},
  ): boolean {
    if (conn.state !== "open") {
      st.doubleResponses++;
      return false;
    }
    const headers: Record<string, string | string[]> = {
      ...conn.headers,
      "x-content-type-options": "nosniff",
      ...extra,
    };
    if (e.contentType) headers["content-type"] = e.contentType;
    mergeHeaders(headers, e.headers);
    if (e.download !== undefined)
      headers["content-disposition"] = contentDisposition(e.download);
    conn.state = "streaming";
    writeHeadFor(conn, e.status ?? 200, headers);
    conn.res.flushHeaders();
    if (conn.method === "HEAD") conn.res.end();
    return true;
  }

  function flush(conn: Conn): void {
    const { res } = conn;
    while (conn.queue.length && !conn.blocked) {
      const c = conn.queue.shift()!;
      conn.queued -= c.length;
      if (!res.write(c)) {
        conn.blocked = true;
        conn.onDrain = () => {
          conn.blocked = false;
          conn.onDrain = undefined;
          flush(conn);
        };
        res.once("drain", conn.onDrain);
      }
    }
    if (!conn.queue.length && conn.endWanted && !res.writableEnded) res.end();
  }

  function enqueue(conn: Conn, chunk: Buffer): void {
    if (conn.state !== "streaming" || conn.endWanted) return;
    if (conn.queued + chunk.length > lim.streamBufferBytes) {
      // a client that cannot keep up must not make the server buffer forever
      st.slowConsumers++;
      conn.state = "done";
      conn.queue.length = 0;
      conn.queued = 0;
      conn.res.destroy();
      return;
    }
    conn.queue.push(chunk);
    conn.queued += chunk.length;
    flush(conn);
  }

  const toBuf = (d: string | Uint8Array): Buffer =>
    typeof d === "string"
      ? Buffer.from(d, "utf8")
      : Buffer.from(d.buffer, d.byteOffset, d.byteLength);

  function sseFrame(e: {
    data: unknown;
    event?: string;
    id?: string;
    retry?: number;
  }): string {
    const line = (s: string): string => s.replace(/[\r\n]+/g, " ");
    let out = "";
    if (e.event !== undefined) out += `event: ${line(e.event)}\n`;
    if (e.id !== undefined) out += `id: ${line(e.id)}\n`;
    if (e.retry !== undefined) out += `retry: ${Math.floor(e.retry)}\n`;
    const data = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
    for (const l of data.split(/\r\n|\r|\n/)) out += `data: ${l}\n`;
    return out + "\n";
  }

  function endStream(conn: Conn): void {
    if (conn.heartbeat !== undefined) {
      clearI(conn.heartbeat);
      conn.heartbeat = undefined;
      st.heartbeats--;
    }
    conn.endWanted = true;
    flush(conn);
  }

  async function sendFile(
    conn: Conn,
    e: Extract<HttpEffect, { type: "file" }>,
  ): Promise<void> {
    if (conn.state !== "open") {
      st.doubleResponses++;
      return;
    }
    conn.state = "streaming";
    try {
      const s = await stat(e.path);
      if (!s.isFile())
        throw Object.assign(new Error("not a file"), { code: "ENOENT" });
      if (conn.res.destroyed) return;
      const ext = e.path.slice(e.path.lastIndexOf(".")).toLowerCase();
      const headers: Record<string, string | string[]> = {
        ...conn.headers,
        "content-type":
          e.contentType ?? MIME[ext] ?? "application/octet-stream",
        "content-length": String(s.size),
        "x-content-type-options": "nosniff",
      };
      mergeHeaders(headers, e.headers);
      if (e.filename !== undefined)
        headers["content-disposition"] = contentDisposition(e.filename);
      writeHeadFor(conn, e.status ?? 200, headers);
      if (conn.method === "HEAD") return void conn.res.end();
      pipeline(createReadStream(e.path), conn.res, () => {});
    } catch (err) {
      if (conn.res.headersSent || conn.res.destroyed)
        return void conn.res.destroy();
      const missing = (err as { code?: string }).code === "ENOENT";
      conn.state = "open";
      respond(conn, {
        status: missing ? 404 : 500,
        json: { error: missing ? "not_found" : "internal_error" },
      });
    }
  }

  function handle(effect: HttpEffect & WithCtx): void {
    const conn = connFor(effect);
    if (!conn) return;
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
        return respond(conn, rest);
      }
      case "header": {
        const name = effect.name.toLowerCase();
        checkHeader(name, String(effect.value));
        conn.headers[name] = String(effect.value);
        return;
      }
      case "close":
        conn.res.destroy();
        return;
      case "stream.start":
        beginStream(conn, effect);
        return;
      case "stream.chunk":
        return enqueue(conn, toBuf(effect.data));
      case "stream.end":
        return endStream(conn);
      case "sse.start": {
        const ok = beginStream(
          conn,
          {
            headers: effect.headers,
            contentType: "text/event-stream; charset=utf-8",
          },
          {
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
          },
        );
        if (!ok) return;
        conn.sse = true;
        enqueue(
          conn,
          Buffer.from(
            effect.retry !== undefined
              ? `retry: ${Math.floor(effect.retry)}\n\n`
              : ":ok\n\n",
          ),
        );
        const every = effect.heartbeatMs ?? lim.sseHeartbeatMs;
        if (every > 0) {
          conn.heartbeat = setI(() => {
            if (!conn.queue.length) enqueue(conn, Buffer.from(":hb\n\n"));
          }, every);
          st.heartbeats++;
        }
        return;
      }
      case "sse.send":
        if (!conn.sse) return;
        return enqueue(conn, Buffer.from(sseFrame(effect)));
      case "sse.end":
        return endStream(conn);
      case "file":
        void sendFile(conn, effect);
        return;
    }
  }

  // ------------------------------------------------------------- server ----

  server.on("request", onRequest);
  server.on("connection", (socket) => {
    st.sockets++;
    st.socketsOpen++;
    socket.once("close", () => st.socketsOpen--);
  });
  server.on("clientError", (err: NodeJS.ErrnoException, socket) => {
    if (err.code === "ECONNRESET" || !socket.writable)
      return void socket.destroy();
    st.rejected++;
    const status =
      err.code === "HPE_HEADER_OVERFLOW"
        ? 431
        : err.code === "ERR_HTTP_REQUEST_TIMEOUT"
          ? 408
          : 400;
    socket.end(
      `HTTP/1.1 ${status} ${status === 431 ? "Request Header Fields Too Large" : status === 408 ? "Request Timeout" : "Bad Request"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
  });

  const plugin: HttpServerPlugin = {
    name: "http",
    server,
    get port() {
      return (server.address() as AddressInfo | null)?.port ?? 0;
    },
    init(ctx) {
      pc = ctx;
      if (listenStarted) return;
      listenStarted = true;
      server.once("error", (err) => {
        rejectListening(err);
        send({
          id: "http.listen_failed",
          payload: {
            code: (err as NodeJS.ErrnoException).code,
            message: err.message,
          },
          ctx: { rid: newRid(), conn: "system" },
        });
      });
      server.listen(o.port ?? 0, o.host, () => {
        const a = server.address() as AddressInfo;
        resolveListening(a);
        send({
          id: "http.listening",
          payload: { port: a.port, host: o.host ?? a.address },
          ctx: { rid: newRid(), conn: "system" },
        });
      });
    },
    handle(effect: HttpEffect & WithCtx) {
      handle(effect);
    },
    cancel(rid) {
      const conn = conns.get(rid);
      if (!conn) return;
      if (conn.state === "streaming") return endStream(conn);
      if (conn.state === "open") {
        // the request is over but nobody answered: do not leave the client hanging
        respond(conn, { status: 504, json: { error: "cancelled" } });
      }
    },
    listening: () => listeningP,
    address: () => server.address() as AddressInfo | null,
    stats: () => ({ ...st, timers: timers.size, conns: conns.size }),
    stop() {
      closing = true;
      if (server.listening) server.close();
      server.closeIdleConnections();
    },
    closed: () => (server.listening || closing ? closedP : Promise.resolve()),
    dispose() {
      closing = true;
      for (const c of [...conns.values()]) {
        cleanup(c);
        c.res.destroy();
      }
      for (const t of [...timers]) {
        clearT(t);
        clearI(t);
      }
      st.heartbeats = 0;
      if (server.listening) server.close();
      server.closeAllConnections();
    },
  };
  return plugin;
}
