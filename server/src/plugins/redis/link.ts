import net from "node:net";
import tls from "node:tls";
import {
  RedisError,
  type RedisArg,
  RespParser,
  encodeCommand,
} from "./resp.ts";

export interface ReconnectOptions {
  /** First delay (default 50ms). */
  minMs?: number;
  /** Delay cap (default 5000ms). */
  maxMs?: number;
  factor?: number;
  /** 0..1 portion of the delay randomised away (default 0.3). */
  jitter?: number;
  /** Give up (and fail queued commands) after this many consecutive failures. */
  maxAttempts?: number;
}

export interface LinkOptions {
  host: string;
  port: number;
  tls?: boolean | tls.ConnectionOptions;
  username?: string;
  password?: string;
  db?: number;
  /** 3 sends HELLO 3 on connect (default 2). */
  protocol?: 2 | 3;
  connectTimeoutMs?: number;
  reconnect?: ReconnectOptions | false;
  random?: () => number;
}

export interface ParsedUrl extends LinkOptions {}

export function parseRedisUrl(url: string): LinkOptions {
  const u = new URL(url);
  if (u.protocol !== "redis:" && u.protocol !== "rediss:")
    throw new Error(`redis: unsupported url protocol "${u.protocol}"`);
  const o: LinkOptions = {
    host: u.hostname || "127.0.0.1",
    port: u.port ? Number(u.port) : 6379,
  };
  if (u.protocol === "rediss:") o.tls = true;
  if (u.username) o.username = decodeURIComponent(u.username);
  if (u.password) o.password = decodeURIComponent(u.password);
  const db = u.pathname.replace(/^\//, "");
  if (db) {
    if (!/^\d+$/.test(db))
      throw new Error(`redis: bad database "${db}" in url`);
    o.db = Number(db);
  }
  const proto = u.searchParams.get("protocol");
  if (proto === "3") o.protocol = 3;
  return o;
}

export type LinkStatus =
  | "connecting"
  | "ready"
  | "reconnecting"
  | "closed"
  | "failed";

/**
 * One TCP/TLS connection with handshake (AUTH/HELLO/SELECT), RESP parsing and
 * reconnect with exponential backoff. Subclasses decide what replies mean.
 */
export abstract class Link {
  protected opts: LinkOptions;
  status: LinkStatus = "closed";
  /** Set when reconnecting is pointless (bad password, gave up). */
  fatal?: Error;
  reconnects = 0;
  #socket?: net.Socket;
  #parser?: RespParser;
  #attempt = 0;
  #timer?: ReturnType<typeof setTimeout>;
  #connectTimer?: ReturnType<typeof setTimeout>;
  #handshakeLeft = 0;
  #started = false;
  #stopped = false;
  #corked = false;
  /** Callback when the status changes (logging, tests). */
  onStatus?: (status: LinkStatus, err?: Error) => void;

  constructor(opts: LinkOptions) {
    this.opts = opts;
  }

  protected abstract onReply(reply: unknown): void;
  /** The handshake is done; commands may flow. */
  protected abstract onReady(): void;
  /** The socket went away (not for a deliberate stop). */
  protected abstract onLost(err: Error): void;
  /** Reconnecting was given up on. */
  protected abstract onFatal(err: Error): void;

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#connect();
  }

  get ready(): boolean {
    return this.status === "ready";
  }

  /** Writes already encoded bytes; writes within one tick go out in one packet. */
  protected write(data: Buffer): void {
    const s = this.#socket!;
    if (!this.#corked) {
      this.#corked = true;
      s.cork();
      queueMicrotask(() => {
        this.#corked = false;
        if (!s.destroyed) s.uncork();
      });
    }
    s.write(data);
  }

  #set(status: LinkStatus, err?: Error) {
    this.status = status;
    this.onStatus?.(status, err);
  }

  #connect(): void {
    if (this.#stopped) return;
    this.#set(
      this.#attempt === 0 && this.reconnects === 0
        ? "connecting"
        : "reconnecting",
    );
    const o = this.opts;
    const socket: net.Socket = o.tls
      ? tls.connect({
          host: o.host,
          port: o.port,
          servername: net.isIP(o.host) ? undefined : o.host,
          ...(typeof o.tls === "object" ? o.tls : {}),
        })
      : net.connect({ host: o.host, port: o.port });
    this.#socket = socket;
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30_000);
    const parser = new RespParser((r) => this.#reply(r));
    this.#parser = parser;
    let lost = false;
    const lose = (err: Error) => {
      if (lost || this.#socket !== socket) return;
      lost = true;
      clearTimeout(this.#connectTimer);
      socket.destroy();
      this.#socket = undefined;
      if (this.#stopped) return;
      this.onLost(err);
      this.#scheduleReconnect(err);
    };
    this.#connectTimer = setTimeout(
      () => lose(new Error(`redis: connect timeout to ${o.host}:${o.port}`)),
      o.connectTimeoutMs ?? 5000,
    );
    socket.on(o.tls ? "secureConnect" : "connect", () => this.#handshake());
    socket.on("data", (d) => {
      try {
        parser.push(d);
      } catch (e) {
        lose(e as Error);
      }
    });
    socket.on("error", (e) => lose(e));
    socket.on("close", () => lose(new Error("redis: connection closed")));
  }

  #handshake(): void {
    clearTimeout(this.#connectTimer);
    const o = this.opts;
    const cmds: RedisArg[][] = [];
    const pw = o.password;
    if (o.protocol === 3)
      cmds.push([
        "HELLO",
        "3",
        ...(pw !== undefined ? ["AUTH", o.username ?? "default", pw] : []),
      ]);
    else if (pw !== undefined)
      cmds.push(["AUTH", ...(o.username ? [o.username, pw] : [pw])]);
    if (o.db) cmds.push(["SELECT", o.db]);
    this.#handshakeLeft = cmds.length;
    if (cmds.length === 0) return this.#becomeReady();
    for (const c of cmds) this.write(encodeCommand(c));
  }

  #becomeReady() {
    this.#attempt = 0;
    this.#set("ready");
    this.onReady();
  }

  #reply(r: unknown): void {
    if (this.#handshakeLeft > 0) {
      if (r instanceof RedisError) {
        const err = new RedisError(r.message);
        this.fatal = err;
        this.#stopped = true;
        this.#socket?.destroy();
        this.#socket = undefined;
        this.#set("failed", err);
        this.onFatal(err);
        return;
      }
      if (--this.#handshakeLeft === 0) this.#becomeReady();
      return;
    }
    this.onReply(r);
  }

  #scheduleReconnect(err: Error): void {
    const r = this.opts.reconnect;
    if (r === false) {
      this.#fail(err);
      return;
    }
    const max = r?.maxAttempts ?? Infinity;
    if (this.#attempt >= max) {
      this.#fail(
        new Error(
          `redis: gave up reconnecting after ${this.#attempt} attempts: ${err.message}`,
        ),
      );
      return;
    }
    const min = r?.minMs ?? 50;
    const cap = r?.maxMs ?? 5000;
    const base = Math.min(cap, min * (r?.factor ?? 2) ** this.#attempt);
    const jitter = r?.jitter ?? 0.3;
    const delay = Math.round(
      base * (1 - jitter * (this.opts.random ?? Math.random)()),
    );
    this.#attempt++;
    this.reconnects++;
    this.#set("reconnecting", err);
    this.#timer = setTimeout(() => this.#connect(), delay);
  }

  #fail(err: Error) {
    this.fatal = err;
    this.#stopped = true;
    this.#set("failed", err);
    this.onFatal(err);
  }

  /** Closes the socket for good. */
  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#timer);
    clearTimeout(this.#connectTimer);
    this.#socket?.destroy();
    this.#socket = undefined;
    this.#set("closed");
  }
}
