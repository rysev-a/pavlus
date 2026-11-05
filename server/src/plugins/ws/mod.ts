// The websocket plugin: RFC 6455 on the same node:http server (upgrade),
// hand-written framing, rooms, heartbeat and backpressure. Every inbound
// frame gets a fresh rid: ctx = { rid, conn: "ws", connId }.
import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Message, PluginContext } from "@service-laboratory/pavlus";
import { newRid } from "../../ctx.ts";
import type { ServerPlugin } from "../../runtime.ts";
import { parseQuery } from "../http/body.ts";
import type { HttpServerPlugin } from "../http/mod.ts";
import {
  closePayload,
  createFrameParser,
  encodeFrame,
  OP,
  type FrameParser,
} from "./frame.ts";

export { OP, createFrameParser, encodeFrame, closePayload } from "./frame.ts";
export type { FrameParser, FrameParserOptions } from "./frame.ts";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export const acceptKey = (key: string): string =>
  createHash("sha1")
    .update(key + GUID)
    .digest("base64");

type WithCtx = { ctx?: Record<string, unknown> };

export type WsEffect =
  | {
      plugin: "ws";
      type: "send";
      connId?: string;
      /** string -> text frame, bytes -> binary frame, other values -> JSON text. */
      data: unknown;
    }
  | {
      plugin: "ws";
      type: "broadcast";
      /** Omit to reach every connection. */
      room?: string;
      data: unknown;
      /** connId(s) that do not receive it. */
      except?: string | readonly string[];
    }
  | { plugin: "ws"; type: "join"; room: string; connId?: string }
  | { plugin: "ws"; type: "leave"; room: string; connId?: string }
  | {
      plugin: "ws";
      type: "close";
      connId?: string;
      code?: number;
      reason?: string;
    }
  | { plugin: "ws"; type: "ping"; connId?: string; data?: string };

export interface WsOptions {
  /** The http plugin whose server takes the upgrades. */
  http: Pick<HttpServerPlugin, "server">;
  /** Largest message (after reassembly) in bytes. Default 1 MiB. */
  maxPayload?: number;
  /** Ping interval; a connection that did not answer by the next tick is culled. 0 disables. Default 30 s. */
  heartbeatMs?: number;
  /** Time a closing handshake may take before the socket is destroyed. Default 3 s. */
  closeTimeoutMs?: number;
  /** Only these paths upgrade (others get 404). */
  path?: string | RegExp | ((path: string) => boolean);
  /** Subprotocols the server speaks, in preference order. */
  subprotocols?: readonly string[];
  /** Allowed `Origin`s (exact) or a predicate. Requests without Origin are allowed. */
  origins?: readonly string[] | ((origin: string) => boolean);
  /** Return false (403) or a status number to refuse a handshake. */
  verify?: (req: IncomingMessage) => boolean | number;
  maxConnections?: number;
  /** What to do when a client's send buffer is full. Default `{ policy: "close" }`. */
  backpressure?: { maxBufferedBytes?: number; policy?: "drop" | "close" };
}

export interface WsStats {
  connections: number;
  rooms: number;
  /** Live timers (heartbeat + closing handshakes). */
  timers: number;
  opened: number;
  messagesIn: number;
  messagesOut: number;
  dropped: number;
  culled: number;
  orphans: number;
  rejectedUpgrades: number;
  protocolErrors: number;
}

export interface WsServerPlugin extends ServerPlugin {
  stats(): WsStats;
  /** connIds currently open. */
  connections(): string[];
  /** connIds in `room`. */
  members(room: string): string[];
}

interface WsConn {
  id: string;
  socket: Duplex;
  parser: FrameParser;
  rooms: Set<string>;
  alive: boolean;
  /** We sent a close frame (or the peer did). */
  closing: boolean;
  peerClosed: boolean;
  closeCode?: number;
  closeReason?: string;
  closeTimer?: NodeJS.Timeout;
  reported: boolean;
}

const toBuf = (d: Uint8Array): Buffer =>
  Buffer.from(d.buffer, d.byteOffset, d.byteLength);

function reject(
  socket: Duplex,
  status: number,
  text: string,
  extra = "",
): void {
  if (socket.writable)
    socket.end(
      `HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n${extra}\r\n`,
    );
  else socket.destroy();
}

export function createWsServerPlugin(o: WsOptions): WsServerPlugin {
  const maxPayload = o.maxPayload ?? 1024 * 1024;
  const heartbeatMs = o.heartbeatMs ?? 30_000;
  const closeTimeoutMs = o.closeTimeoutMs ?? 3000;
  const maxBuffered = o.backpressure?.maxBufferedBytes ?? 1024 * 1024;
  const policy = o.backpressure?.policy ?? "close";
  const server = o.http.server;

  const conns = new Map<string, WsConn>();
  const rooms = new Map<string, Set<WsConn>>();
  const st: WsStats = {
    connections: 0,
    rooms: 0,
    timers: 0,
    opened: 0,
    messagesIn: 0,
    messagesOut: 0,
    dropped: 0,
    culled: 0,
    orphans: 0,
    rejectedUpgrades: 0,
    protocolErrors: 0,
  };
  let pc: PluginContext<any> | undefined;
  let beat: NodeJS.Timeout | undefined;
  let stopping = false;
  let drained: (() => void) | undefined;

  const send = (m: Message): void => pc?.dispatch(m);
  const ctxFor = (c: WsConn) => ({ rid: newRid(), conn: "ws", connId: c.id });

  function startBeat(): void {
    if (beat || heartbeatMs <= 0) return;
    beat = setInterval(() => {
      for (const c of [...conns.values()]) {
        if (!c.alive) {
          st.culled++;
          c.socket.destroy();
          continue;
        }
        c.alive = false;
        write(c, encodeFrame({ opcode: OP.ping }));
      }
    }, heartbeatMs);
    beat.unref?.();
  }
  function stopBeat(): void {
    if (beat) clearInterval(beat);
    beat = undefined;
  }

  /** Writes with the backpressure policy applied. Returns false when not written. */
  function write(c: WsConn, frame: Buffer): boolean {
    const s = c.socket;
    if (s.destroyed || !s.writable) return false;
    if (s.writableLength + frame.length > maxBuffered) {
      if (policy === "drop") {
        st.dropped++;
        return false;
      }
      st.dropped++;
      closeConn(c, 1013, "send buffer full");
      return false;
    }
    s.write(frame);
    return true;
  }

  function closeConn(c: WsConn, code = 1000, reason = ""): void {
    if (c.socket.destroyed) return;
    if (!c.closing) {
      c.closing = true;
      c.closeCode = code;
      if (c.socket.writable)
        c.socket.write(
          encodeFrame({
            opcode: OP.close,
            payload: closePayload(code, reason),
          }),
        );
    }
    if (c.peerClosed) return void c.socket.end();
    if (!c.closeTimer) {
      c.closeTimer = setTimeout(() => c.socket.destroy(), closeTimeoutMs);
      c.closeTimer.unref?.();
    }
  }

  function leaveAll(c: WsConn): void {
    for (const r of c.rooms) {
      const set = rooms.get(r);
      set?.delete(c);
      if (set?.size === 0) rooms.delete(r);
    }
    c.rooms.clear();
  }

  function finish(c: WsConn): void {
    if (c.reported) return;
    c.reported = true;
    if (c.closeTimer) clearTimeout(c.closeTimer);
    c.closeTimer = undefined;
    conns.delete(c.id);
    leaveAll(c);
    if (conns.size === 0) {
      stopBeat();
      drained?.();
    }
    send({
      id: "ws.close",
      payload: {
        code: c.closeCode ?? 1006,
        reason: c.closeReason ?? "",
        clean: c.peerClosed && c.closing,
      },
      ctx: ctxFor(c),
    });
  }

  function onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const refuse = (status: number, text: string, extra?: string): void => {
      st.rejectedUpgrades++;
      reject(socket, status, text, extra);
    };
    socket.on("error", () => socket.destroy());
    const url = req.url ?? "/";
    const q = url.indexOf("?");
    const path = q < 0 ? url : url.slice(0, q);
    if (o.path !== undefined) {
      const ok =
        typeof o.path === "string"
          ? o.path === path
          : o.path instanceof RegExp
            ? o.path.test(path)
            : o.path(path);
      if (!ok) return refuse(404, "Not Found");
    }
    if (stopping) return refuse(503, "Service Unavailable");
    if (o.maxConnections && conns.size >= o.maxConnections)
      return refuse(503, "Service Unavailable");
    const h = req.headers;
    const tokens = (v: string | undefined): string[] =>
      (v ?? "")
        .toLowerCase()
        .split(",")
        .map((s) => s.trim());
    if (
      req.method !== "GET" ||
      (h.upgrade ?? "").toLowerCase() !== "websocket" ||
      !tokens(h.connection).includes("upgrade")
    )
      return refuse(400, "Bad Request");
    if (h["sec-websocket-version"] !== "13")
      return refuse(426, "Upgrade Required", "Sec-WebSocket-Version: 13\r\n");
    const key = h["sec-websocket-key"];
    if (typeof key !== "string" || Buffer.from(key, "base64").length !== 16)
      return refuse(400, "Bad Request");
    const origin = h.origin;
    if (o.origins && origin !== undefined) {
      const ok =
        typeof o.origins === "function"
          ? o.origins(origin)
          : o.origins.includes(origin);
      if (!ok) return refuse(403, "Forbidden");
    }
    if (o.verify) {
      const v = o.verify(req);
      if (v !== true)
        return refuse(typeof v === "number" ? v : 403, "Forbidden");
    }
    let proto: string | undefined;
    if (o.subprotocols && typeof h["sec-websocket-protocol"] === "string") {
      const offered = h["sec-websocket-protocol"]
        .split(",")
        .map((s) => s.trim());
      proto = o.subprotocols.find((p) => offered.includes(p));
    }

    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n` +
        (proto ? `Sec-WebSocket-Protocol: ${proto}\r\n` : "") +
        "\r\n",
    );
    const raw = socket as Duplex & {
      setNoDelay?(v: boolean): void;
      setTimeout?(ms: number): void;
    };
    raw.setNoDelay?.(true);
    raw.setTimeout?.(0);

    const c: WsConn = {
      id: newRid(),
      socket,
      rooms: new Set(),
      alive: true,
      closing: false,
      peerClosed: false,
      reported: false,
      parser: undefined as never,
    };
    c.parser = createFrameParser({
      maxPayload,
      onMessage(data, binary) {
        st.messagesIn++;
        send({
          id: "ws.message",
          payload: { data: binary ? data : data.toString("utf8"), binary },
          ctx: ctxFor(c),
        });
      },
      onPing(data) {
        write(c, encodeFrame({ opcode: OP.pong, payload: data }));
      },
      onPong() {},
      onClose(code, reason) {
        c.peerClosed = true;
        if (!c.closing) {
          c.closeCode = code ?? 1005;
          c.closing = true;
          if (socket.writable)
            socket.write(
              encodeFrame({
                opcode: OP.close,
                payload: closePayload(code === undefined ? undefined : code),
              }),
            );
        } else if (code !== undefined && c.closeCode === undefined) {
          c.closeCode = code;
        }
        socket.end();
        c.closeReason = reason;
      },
      onError(code, reason) {
        st.protocolErrors++;
        closeConn(c, code, reason);
        // do not read more from a broken peer
        socket.end();
      },
    });
    conns.set(c.id, c);
    st.opened++;
    startBeat();
    socket.on("data", (chunk: Buffer) => {
      c.alive = true;
      c.parser.push(chunk);
    });
    socket.on("end", () => {
      if (!socket.destroyed && socket.writable) socket.end();
    });
    socket.on("close", () => finish(c));
    send({
      id: "ws.open",
      payload: {
        path,
        query: parseQuery(q < 0 ? "" : url.slice(q + 1)),
        headers: req.headers,
        subprotocol: proto,
        ip: req.socket.remoteAddress,
      },
      ctx: ctxFor(c),
    });
    if (head.length) c.parser.push(head);
  }

  const encodeData = (data: unknown): Buffer =>
    data instanceof Uint8Array
      ? encodeFrame({ opcode: OP.binary, payload: data })
      : encodeFrame({
          opcode: OP.text,
          payload: Buffer.from(
            typeof data === "string" ? data : (JSON.stringify(data) ?? "null"),
            "utf8",
          ),
        });

  function target(e: { connId?: string } & WithCtx): WsConn | undefined {
    const id = e.connId ?? (e.ctx?.connId as string | undefined);
    const c = id === undefined ? undefined : conns.get(id);
    if (!c) st.orphans++;
    return c;
  }

  const plugin: WsServerPlugin = {
    name: "ws",
    init(ctx) {
      pc = ctx;
      server.on("upgrade", onUpgrade);
    },
    handle(effect: WsEffect & WithCtx) {
      switch (effect.type) {
        case "send": {
          const c = target(effect);
          if (c && write(c, encodeData(effect.data))) st.messagesOut++;
          return;
        }
        case "broadcast": {
          const frame = encodeData(effect.data);
          const skip = new Set(
            effect.except === undefined
              ? []
              : typeof effect.except === "string"
                ? [effect.except]
                : effect.except,
          );
          const set =
            effect.room === undefined
              ? conns.values()
              : rooms.get(effect.room)?.values();
          for (const c of [...(set ?? [])])
            if (!skip.has(c.id) && write(c, frame)) st.messagesOut++;
          return;
        }
        case "join": {
          const c = target(effect);
          if (!c || c.closing) return;
          let set = rooms.get(effect.room);
          if (!set) rooms.set(effect.room, (set = new Set()));
          set.add(c);
          c.rooms.add(effect.room);
          return;
        }
        case "leave": {
          const c = target(effect);
          if (!c) return;
          c.rooms.delete(effect.room);
          const set = rooms.get(effect.room);
          set?.delete(c);
          if (set?.size === 0) rooms.delete(effect.room);
          return;
        }
        case "close": {
          const c = target(effect);
          if (c) closeConn(c, effect.code ?? 1000, effect.reason ?? "");
          return;
        }
        case "ping": {
          const c = target(effect);
          if (c)
            write(
              c,
              encodeFrame({
                opcode: OP.ping,
                payload: Buffer.from(effect.data ?? "", "utf8"),
              }),
            );
          return;
        }
      }
    },
    stats: () => ({
      ...st,
      connections: conns.size,
      rooms: rooms.size,
      timers:
        (beat ? 1 : 0) + [...conns.values()].filter((c) => c.closeTimer).length,
    }),
    connections: () => [...conns.keys()],
    members: (room) => [...(rooms.get(room) ?? [])].map((c) => c.id),
    stop() {
      stopping = true;
      for (const c of [...conns.values()]) closeConn(c, 1001, "going away");
    },
    closed: () =>
      conns.size === 0
        ? Promise.resolve()
        : new Promise<void>((res) => {
            drained = res;
          }),
    dispose() {
      stopping = true;
      server.off("upgrade", onUpgrade);
      stopBeat();
      for (const c of [...conns.values()]) {
        if (c.closeTimer) clearTimeout(c.closeTimer);
        c.closeTimer = undefined;
        c.socket.destroy();
      }
    },
  };
  return plugin;
}
