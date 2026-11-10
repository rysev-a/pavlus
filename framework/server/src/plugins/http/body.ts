// Request parsing helpers: query strings, bodies by content-type.
import type { IncomingMessage } from "node:http";

/** An error the plugin answers itself, without involving the application. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);

/** `a=1&a=2&b=x` -> `{ a: ["1","2"], b: "x" }`. Prototype-safe, bounded. */
export function parseQuery(
  search: string,
  maxParams = 1000,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!search) return out;
  let n = 0;
  for (const [k, v] of new URLSearchParams(search)) {
    if (++n > maxParams) throw new HttpError(400, "too_many_params");
    if (UNSAFE.has(k)) continue;
    const prev = out[k];
    if (prev === undefined) out[k] = v;
    else if (Array.isArray(prev)) prev.push(v);
    else out[k] = [prev, v];
  }
  return out;
}

export function contentTypeOf(header: string | undefined): string {
  return (header ?? "").split(";")[0]!.trim().toLowerCase();
}

/** Parses an already-read body by content type. */
export function parseBody(
  buf: Buffer | undefined,
  contentType: string,
): unknown {
  if (!buf || buf.length === 0) return undefined;
  if (contentType === "application/json" || contentType.endsWith("+json")) {
    try {
      return JSON.parse(buf.toString("utf8"));
    } catch {
      throw new HttpError(400, "invalid_json");
    }
  }
  if (contentType === "application/x-www-form-urlencoded")
    return parseQuery(buf.toString("utf8"));
  if (contentType.startsWith("text/")) return buf.toString("utf8");
  return buf;
}

export interface ReadBodyOptions {
  limit: number;
  timeoutMs: number;
  /** Timers are created through these so the plugin can count them. */
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
}

/** Reads the whole body with a size limit and a total time limit. */
export function readBody(
  req: IncomingMessage,
  o: ReadBodyOptions,
): { promise: Promise<Buffer | undefined>; cancel(): void } {
  let cancel!: () => void;
  const promise = new Promise<Buffer | undefined>((resolve, reject) => {
    const declared = req.headers["content-length"];
    if (declared !== undefined) {
      const n = Number(declared);
      if (!/^\d+$/.test(declared) || !Number.isSafeInteger(n))
        return reject(new HttpError(400, "bad_content_length"));
      if (n > o.limit) return reject(new HttpError(413, "payload_too_large"));
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const timer = o.setTimer(
      () => finish(new HttpError(408, "request_timeout")),
      o.timeoutMs,
    );
    const onData = (c: Buffer): void => {
      size += c.length;
      if (size > o.limit)
        return finish(new HttpError(413, "payload_too_large"));
      chunks.push(c);
    };
    const onEnd = (): void =>
      finish(undefined, size ? Buffer.concat(chunks, size) : undefined);
    const onClose = (): void => {
      if (!req.complete) finish(new HttpError(499, "client_closed"));
    };
    const onError = (): void => finish(new HttpError(499, "client_closed"));
    function finish(err?: HttpError, buf?: Buffer): void {
      if (done) return;
      done = true;
      o.clearTimer(timer);
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("close", onClose);
      req.off("error", onError);
      if (err) reject(err);
      else resolve(buf);
    }
    cancel = () => finish(new HttpError(499, "cancelled"));
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("close", onClose);
    req.on("error", onError);
  });
  // `cancel` is assigned synchronously by the executor unless it rejected early
  return { promise, cancel: () => cancel?.() };
}
