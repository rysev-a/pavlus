// In-memory http and ws plugins: inject requests and frames, read what the app
// answered, no sockets. They speak the same messages and effects as the real
// plugins, so the same handler runs unchanged against both.
import { readFile } from "node:fs/promises";
import type { Message, PluginContext } from "@pavlus/core";
import { newRid, ridOf } from "../ctx.ts";
import { parseQuery } from "../plugins/http/body.ts";
import { parseCookies } from "../plugins/http/cookies.ts";
import {
  mergeHeaders,
  normalizeRespond,
  type RespondEffect,
} from "../plugins/http/respond.ts";
import type { ServerPlugin } from "../runtime.ts";

type Any = Record<string, any>;

// ----------------------------------------------------------------- http ----

export interface FakeRequest {
  method?: string;
  /** May include a query string. */
  path?: string;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  /** Already parsed, as the real plugin would hand it over. */
  body?: unknown;
  ip?: string;
}

export interface FakeResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
  text: string;
  json: unknown;
  /** Streamed chunks (stream.* / sse.*), in order. */
  chunks: string[];
  /** Parsed SSE events. */
  events: { event?: string; id?: string; data: string }[];
  streamed: boolean;
  /** The app/runtime closed the connection instead of finishing. */
  closed: boolean;
}

export interface FakeHttpPlugin extends ServerPlugin {
  /** Dispatches `http.request`; resolves with the response. */
  request(req?: FakeRequest): Promise<FakeResponse>;
  /** Same, but also hands back the rid and lets you abort. */
  inject(req?: FakeRequest): {
    rid: string;
    done: Promise<FakeResponse>;
    /** Client goes away: dispatches `http.aborted`. */
    abort(): void;
  };
  /** Rids waiting for an answer. */
  pending(): string[];
  /** rids `cancel` was called for. */
  readonly cancelled: string[];
  /** Effects that arrived for unknown rids. */
  readonly orphans: number;
  /** Everything dispatched by the plugin. */
  readonly dispatched: Message[];
}

interface FakeConn {
  rid: string;
  method: string;
  headers: Record<string, string | string[]>;
  res: FakeResponse;
  state: "open" | "streaming" | "done";
  resolve(r: FakeResponse): void;
  ctx: Any;
  pendingHeaders: Record<string, string | string[]>;
}

export function fakeHttp(
  o: { etag?: boolean; deadlineMs?: number | null } = {},
): FakeHttpPlugin {
  let pc: PluginContext<any> | undefined;
  const conns = new Map<string, FakeConn>();
  const cancelled: string[] = [];
  const dispatched: Message[] = [];
  let orphans = 0;
  const send = (m: Message): void => {
    dispatched.push(m);
    pc?.dispatch(m);
  };

  function finish(c: FakeConn, closed = false): void {
    if (c.state === "done") return;
    c.state = "done";
    c.res.closed = closed;
    conns.delete(c.rid);
    c.resolve(c.res);
    if (closed) queueMicrotask(() => send({ id: "http.aborted", ctx: c.ctx }));
    else queueMicrotask(() => send({ id: "request.done", ctx: c.ctx }));
  }

  const fill = (
    res: FakeResponse,
    status: number,
    headers: Record<string, string | string[]>,
    body: Buffer,
  ): void => {
    res.status = status;
    res.headers = headers;
    res.body = body;
    res.text = body.toString("utf8");
    const ct = String(headers["content-type"] ?? "");
    try {
      res.json =
        ct.includes("json") && body.length ? JSON.parse(res.text) : undefined;
    } catch {
      res.json = undefined;
    }
  };

  function chunk(c: FakeConn, data: string | Uint8Array): void {
    if (c.state !== "streaming") return;
    const s =
      typeof data === "string" ? data : Buffer.from(data).toString("utf8");
    c.res.chunks.push(s);
    c.res.body = Buffer.concat([c.res.body, Buffer.from(s)]);
    c.res.text = c.res.body.toString("utf8");
  }

  function sseEvent(c: FakeConn, e: Any): void {
    const data = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
    const ev: FakeResponse["events"][number] = { data };
    if (e.event !== undefined) ev.event = e.event;
    if (e.id !== undefined) ev.id = e.id;
    c.res.events.push(ev);
    chunk(
      c,
      `${e.event ? `event: ${e.event}\n` : ""}${e.id ? `id: ${e.id}\n` : ""}${data
        .split("\n")
        .map((l: string) => `data: ${l}`)
        .join("\n")}\n\n`,
    );
  }

  function startStream(
    c: FakeConn,
    e: Any,
    extra: Record<string, string> = {},
  ): boolean {
    if (c.state !== "open") return false;
    const headers: Record<string, string | string[]> = {
      ...c.pendingHeaders,
      ...extra,
    };
    if (e.contentType) headers["content-type"] = e.contentType;
    mergeHeaders(headers, e.headers);
    fill(c.res, e.status ?? 200, headers, Buffer.alloc(0));
    c.res.streamed = true;
    c.state = "streaming";
    return true;
  }

  const plugin: FakeHttpPlugin = {
    name: "http",
    cancelled,
    dispatched,
    get orphans() {
      return orphans;
    },
    init(ctx) {
      pc = ctx;
    },
    pending: () => [...conns.keys()],
    inject(req = {}) {
      const rid = newRid();
      const raw = req.path ?? "/";
      const q = raw.indexOf("?");
      const path = q < 0 ? raw : raw.slice(0, q);
      const query = {
        ...parseQuery(q < 0 ? "" : raw.slice(q + 1)),
        ...req.query,
      };
      const headers = Object.fromEntries(
        Object.entries(req.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
      );
      const ctx: Any = { rid, conn: "http", requestId: rid };
      if (o.deadlineMs !== null)
        ctx.deadline = Date.now() + (o.deadlineMs ?? 30_000);
      let resolve!: (r: FakeResponse) => void;
      const done = new Promise<FakeResponse>((r) => (resolve = r));
      const res: FakeResponse = {
        status: 0,
        headers: {},
        body: Buffer.alloc(0),
        text: "",
        json: undefined,
        chunks: [],
        events: [],
        streamed: false,
        closed: false,
      };
      const method = (req.method ?? "GET").toUpperCase();
      conns.set(rid, {
        rid,
        method,
        headers,
        res,
        state: "open",
        resolve,
        ctx,
        pendingHeaders: { "x-request-id": rid },
      });
      send({
        id: "http.request",
        payload: {
          method,
          path,
          query,
          headers,
          cookies: parseCookies(headers.cookie),
          params: {},
          body: req.body,
          ip: req.ip ?? "127.0.0.1",
        },
        ctx,
      });
      return {
        rid,
        done,
        abort() {
          const c = conns.get(rid);
          if (c) finish(c, true);
        },
      };
    },
    request: (req) => plugin.inject(req).done,
    handle(effect: Any) {
      const rid = ridOf(effect);
      const c = rid === undefined ? undefined : conns.get(rid);
      if (!c) {
        orphans++;
        return;
      }
      switch (effect.type) {
        case "respond": {
          if (c.state !== "open") return;
          const { plugin: _p, type: _t, ctx: _c, ...rest } = effect;
          const fwd = c.headers["x-forwarded-proto"];
          const r = normalizeRespond(rest as RespondEffect, c.pendingHeaders, {
            method: c.method,
            etag: o.etag,
            ifNoneMatch: c.headers["if-none-match"] as string | undefined,
            // tests simulate proxies through the header (no socket here)
            secureCookies:
              String(Array.isArray(fwd) ? fwd[0] : (fwd ?? "")) === "https",
          });
          fill(
            c.res,
            r.status,
            r.headers,
            c.method === "HEAD" ? Buffer.alloc(0) : (r.body ?? Buffer.alloc(0)),
          );
          return finish(c);
        }
        case "header":
          mergeHeaders(c.pendingHeaders, { [effect.name]: effect.value });
          return;
        case "close":
          return finish(c, true);
        case "stream.start":
          startStream(c, effect);
          return;
        case "stream.chunk":
          return chunk(c, effect.data);
        case "stream.end":
        case "sse.end":
          if (c.state === "streaming") finish(c);
          return;
        case "sse.start":
          if (
            startStream(
              c,
              {
                headers: effect.headers,
                contentType: "text/event-stream; charset=utf-8",
              },
              { "cache-control": "no-cache, no-transform" },
            )
          )
            chunk(
              c,
              effect.retry !== undefined
                ? `retry: ${effect.retry}\n\n`
                : ":ok\n\n",
            );
          return;
        case "sse.send":
          if (c.state === "streaming") sseEvent(c, effect);
          return;
        case "file":
          void readFile(effect.path).then(
            (buf) => {
              if (c.state !== "open") return;
              fill(
                c.res,
                effect.status ?? 200,
                {
                  "content-type":
                    effect.contentType ?? "application/octet-stream",
                },
                buf,
              );
              c.state = "open";
              finish(c);
            },
            () => {
              if (c.state !== "open") return;
              fill(
                c.res,
                404,
                { "content-type": "application/json; charset=utf-8" },
                Buffer.from('{"error":"not_found"}'),
              );
              finish(c);
            },
          );
          return;
      }
    },
    cancel(rid) {
      cancelled.push(rid);
      const c = conns.get(rid);
      if (c && c.state === "streaming") finish(c);
    },
    dispose() {
      for (const c of [...conns.values()]) c.resolve(c.res);
      conns.clear();
    },
  };
  return plugin;
}

// ------------------------------------------------------------------- ws ----

export interface FakeWsClient {
  readonly connId: string;
  /** What the server sent, in order. */
  readonly received: { data: unknown; binary: boolean }[];
  readonly rooms: ReadonlySet<string>;
  readonly closed: { code: number; reason: string } | undefined;
  /** An inbound frame: dispatches `ws.message` with a fresh rid. */
  send(data: string | Uint8Array): void;
  /** The client closes: dispatches `ws.close`. */
  close(code?: number, reason?: string): void;
  /** Resolves with the next received message. */
  next(timeoutMs?: number): Promise<{ data: unknown; binary: boolean }>;
}

export interface FakeWsPlugin extends ServerPlugin {
  connect(open?: {
    path?: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
  }): FakeWsClient;
  clients(): FakeWsClient[];
  members(room: string): string[];
}

export function fakeWs(): FakeWsPlugin {
  let pc: PluginContext<any> | undefined;
  interface Rec extends FakeWsClient {
    rooms: Set<string>;
    closed: { code: number; reason: string } | undefined;
    waiters: ((m: { data: unknown; binary: boolean }) => void)[];
  }
  const clients = new Map<string, Rec>();
  const ctxFor = (id: string) => ({ rid: newRid(), conn: "ws", connId: id });

  function deliver(c: Rec, data: unknown): void {
    if (c.closed) return;
    const binary = data instanceof Uint8Array;
    const m = {
      data: binary
        ? Buffer.from(data as Uint8Array)
        : typeof data === "string"
          ? data
          : JSON.stringify(data),
      binary,
    };
    const w = c.waiters.shift();
    if (w) w(m);
    else c.received.push(m);
  }

  const find = (e: Any): Rec | undefined =>
    clients.get(e.connId ?? e.ctx?.connId);

  return {
    name: "ws",
    init(ctx) {
      pc = ctx;
    },
    clients: () => [...clients.values()],
    members: (room) =>
      [...clients.values()]
        .filter((c) => c.rooms.has(room))
        .map((c) => c.connId),
    connect(open = {}) {
      const connId = newRid();
      const c: Rec = {
        connId,
        received: [],
        rooms: new Set(),
        closed: undefined,
        waiters: [],
        send: (data) => {
          if (c.closed) return;
          pc?.dispatch({
            id: "ws.message",
            payload: {
              data: typeof data === "string" ? data : Buffer.from(data),
              binary: typeof data !== "string",
            },
            ctx: ctxFor(connId),
          });
        },
        close: (code = 1000, reason = "") => {
          if (c.closed) return;
          c.closed = { code, reason };
          clients.delete(connId);
          pc?.dispatch({
            id: "ws.close",
            payload: { code, reason, clean: true },
            ctx: ctxFor(connId),
          });
        },
        next: (ms = 1000) => {
          const have = c.received.shift();
          if (have) return Promise.resolve(have);
          return new Promise((resolve, reject) => {
            const t = setTimeout(
              () => reject(new Error("fakeWs: no message")),
              ms,
            );
            c.waiters.push((m) => {
              clearTimeout(t);
              resolve(m);
            });
          });
        },
      };
      clients.set(connId, c);
      pc?.dispatch({
        id: "ws.open",
        payload: {
          path: open.path ?? "/",
          query: open.query ?? {},
          headers: open.headers ?? {},
          ip: "127.0.0.1",
        },
        ctx: ctxFor(connId),
      });
      return c;
    },
    handle(effect: Any) {
      switch (effect.type) {
        case "send": {
          const c = find(effect);
          if (c) deliver(c, effect.data);
          return;
        }
        case "broadcast": {
          const skip = new Set([effect.except].flat().filter(Boolean));
          for (const c of clients.values())
            if (
              (effect.room === undefined || c.rooms.has(effect.room)) &&
              !skip.has(c.connId)
            )
              deliver(c, effect.data);
          return;
        }
        case "join":
          find(effect)?.rooms.add(effect.room);
          return;
        case "leave":
          find(effect)?.rooms.delete(effect.room);
          return;
        case "close": {
          const c = find(effect);
          if (!c || c.closed) return;
          c.closed = { code: effect.code ?? 1000, reason: effect.reason ?? "" };
          clients.delete(c.connId);
          pc?.dispatch({
            id: "ws.close",
            payload: { ...c.closed, clean: true },
            ctx: ctxFor(c.connId),
          });
          return;
        }
      }
    },
  };
}
