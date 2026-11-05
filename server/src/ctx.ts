// The context that rides on every message and effect (see DESIGN.md), the
// reply helpers plugins use to continue a flow, and the per-rid trace buffer.
import { randomBytes } from "node:crypto";
import type { Message } from "@service-laboratory/pavlus";

/** What a message carries so a flow keeps its identity from socket to socket. */
export interface Ctx {
  rid: string;
  conn: "http" | "ws" | "job" | (string & {});
  connId?: string;
  /** Absolute deadline, ms since epoch. */
  deadline?: number;
  [k: string]: unknown;
}

/** An unguessable short request id (72 random bits, 12 url-safe chars). */
export function newRid(): string {
  return randomBytes(9).toString("base64url");
}

/** The rid of a message or an effect, when it has one. */
export function ridOf(x: {
  ctx?: Record<string, unknown>;
}): string | undefined {
  const rid = x.ctx?.rid;
  return typeof rid === "string" ? rid : undefined;
}

/** The answer to `effect`: a message with the effect's ctx copied onto it. */
export function reply(
  effect: { ctx?: Record<string, unknown> },
  msg: { id: string; payload?: unknown },
): Message {
  const m: Message = { id: msg.id };
  if (msg.payload !== undefined) m.payload = msg.payload;
  if (effect.ctx) m.ctx = effect.ctx;
  return m;
}

export interface ErrorPayload {
  code: string;
  message: string;
  [k: string]: unknown;
}

/** Normalises anything thrown or passed to `fail` into `{code, message}`. */
export function toErrorPayload(error: unknown, code = "error"): ErrorPayload {
  if (typeof error === "string") return { code, message: error };
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown };
    return {
      ...(error as object),
      code: typeof e.code === "string" ? e.code : code,
      message: typeof e.message === "string" ? e.message : String(error),
    };
  }
  return { code, message: String(error) };
}

/**
 * Replies to `effect.onError` with the error. Returns `undefined` when the
 * effect names no error message (fire-and-forget), so plugins can write
 * `const m = fail(e, err); if (m) dispatch(m)`.
 */
export function fail(
  effect: { ctx?: Record<string, unknown>; onError?: unknown },
  error: unknown,
): Message | undefined {
  if (typeof effect.onError !== "string") return undefined;
  return reply(effect, {
    id: effect.onError,
    payload: toErrorPayload(error),
  });
}

// ---------------------------------------------------------------- trace ----

export interface TraceEntry {
  /** ms since epoch. */
  t: number;
  kind: "message" | "effect" | "note";
  /** Message id, or `plugin.type` for an effect. */
  name: string;
}

export interface TraceBuffer {
  add(rid: string, entry: Omit<TraceEntry, "t"> & { t?: number }): void;
  get(rid: string): TraceEntry[];
  delete(rid: string): void;
  /** Number of rids currently remembered. */
  size(): number;
  clear(): void;
}

export interface TraceOptions {
  /** How many rids are remembered; the oldest is evicted. Default 1000. */
  maxRids?: number;
  /** Entries kept per rid; the oldest is dropped. Default 200. */
  maxEntries?: number;
  now?: () => number;
}

/** A bounded ring buffer of what happened to each rid, in order. */
export function createTraceBuffer(opts: TraceOptions = {}): TraceBuffer {
  const maxRids = opts.maxRids ?? 1000;
  const maxEntries = opts.maxEntries ?? 200;
  const now = opts.now ?? Date.now;
  const byRid = new Map<string, TraceEntry[]>();
  return {
    add(rid, entry) {
      let list = byRid.get(rid);
      if (!list) {
        if (byRid.size >= maxRids) {
          const oldest = byRid.keys().next().value;
          if (oldest !== undefined) byRid.delete(oldest);
        }
        list = [];
        byRid.set(rid, list);
      }
      list.push({ t: entry.t ?? now(), kind: entry.kind, name: entry.name });
      if (list.length > maxEntries) list.shift();
    },
    get: (rid) => [...(byRid.get(rid) ?? [])],
    delete: (rid) => void byRid.delete(rid),
    size: () => byRid.size,
    clear: () => byRid.clear(),
  };
}

/** The process-wide buffer the runtime writes to unless given its own. */
export const defaultTrace: TraceBuffer = createTraceBuffer();

/** What happened to `rid` (message ids and effect types, in order). */
export function traceOf(rid: string, buffer: TraceBuffer = defaultTrace) {
  return buffer.get(rid);
}
