import type { Plugin } from "@service-laboratory/pavlus";
import { type Cancellable, type Ctx, fail, ok, ridOf } from "../_reply.ts";

export { fetchEffector } from "./helpers.ts";
export type { FetchEffector } from "./helpers.ts";

export type FetchParse = "auto" | "json" | "text" | "buffer" | "none";

export interface FetchRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Appended to the url. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Serialised as JSON, content-type set when absent. */
  json?: unknown;
  /** Raw body (string / bytes). */
  body?: string | Uint8Array;
  /** How the response body is parsed (default "auto": json by content-type, else text). */
  parse?: FetchParse;
  /** Timeout of each attempt (default plugin option, 30s). Also capped by ctx.deadline. */
  timeoutMs?: number;
  /** Max response bytes (default plugin option, 10 MiB). */
  maxBytes?: number;
  /** Extra attempts after a retryable failure (default 2 for idempotent methods, 0 otherwise). */
  retries?: number;
  /** Retry non-idempotent methods too (default false). */
  retryUnsafe?: boolean;
  /** First backoff delay (default 100ms), doubled each attempt with jitter. */
  backoffMs?: number;
  /** Statuses worth retrying (default 429, 502, 503, 504). */
  retryOn?: number[];
  redirect?: "follow" | "error" | "manual";
}

export type FetchEffect = FetchRequest & {
  plugin: "fetch";
  type: "request";
  replyTo: string;
  onError?: string;
  ctx?: Ctx;
};

export interface FetchResponse {
  status: number;
  ok: boolean;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  url: string;
  attempts: number;
}

export interface FetchPluginOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  backoffMs?: number;
  /** Cap for a single backoff or Retry-After wait. */
  maxBackoffMs?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface FetchPlugin extends Plugin<FetchEffect, any>, Cancellable {
  inflight(): number;
}

class FetchFailure extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

const IDEMPOTENT = new Set([
  "GET",
  "HEAD",
  "PUT",
  "DELETE",
  "OPTIONS",
  "TRACE",
]);

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

async function readLimited(res: Response, max: number): Promise<Buffer> {
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > max)
    throw new FetchFailure(
      "TOO_LARGE",
      `response of ${len} bytes exceeds limit ${max}`,
    );
  if (!res.body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => {});
        throw new FetchFailure(
          "TOO_LARGE",
          `response exceeds limit ${max} bytes`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks);
}

function parseBody(
  buf: Buffer,
  mode: FetchParse,
  contentType: string | null,
): unknown {
  switch (mode) {
    case "none":
      return undefined;
    case "buffer":
      return buf;
    case "text":
      return buf.toString("utf8");
    case "json":
      return parseJson(buf);
    default:
      if (contentType && /json/i.test(contentType) && buf.length)
        return parseJson(buf);
      return buf.toString("utf8");
  }
}
function parseJson(buf: Buffer): unknown {
  if (buf.length === 0) return null;
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch (e) {
    throw new FetchFailure(
      "PARSE",
      `invalid JSON body: ${(e as Error).message}`,
    );
  }
}

export function createFetchPlugin(opts: FetchPluginOptions = {}): FetchPlugin {
  const doFetch = opts.fetch ?? ((...a) => globalThis.fetch(...a));
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const now = opts.now ?? Date.now;
  const byRid = new Map<string, Set<AbortController>>();
  let inflight = 0;

  async function run(
    req: FetchRequest,
    ctxDeadline: number | undefined,
    signal: AbortSignal,
  ): Promise<FetchResponse> {
    const method = (
      req.method ??
      (req.json !== undefined || req.body !== undefined ? "POST" : "GET")
    ).toUpperCase();
    const safe = IDEMPOTENT.has(method) || req.retryUnsafe === true;
    const retries = safe
      ? (req.retries ?? opts.retries ?? 2)
      : (req.retries ?? 0);
    const retryOn = req.retryOn ?? [429, 502, 503, 504];
    const base = req.backoffMs ?? opts.backoffMs ?? 100;
    const maxWait = opts.maxBackoffMs ?? 10_000;
    const maxBytes = req.maxBytes ?? opts.maxBytes ?? 10 * 1024 * 1024;
    const timeout = req.timeoutMs ?? opts.timeoutMs ?? 30_000;
    const parse = req.parse ?? "auto";

    let url = req.url;
    if (req.query) {
      const u = new URL(url);
      for (const [k, v] of Object.entries(req.query))
        if (v !== undefined) u.searchParams.set(k, String(v));
      url = u.toString();
    }
    const headers = { ...req.headers };
    let body: string | Uint8Array | undefined = req.body;
    if (req.json !== undefined) {
      body = JSON.stringify(req.json);
      if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type"))
        headers["content-type"] = "application/json";
    }

    for (let attempt = 1; ; attempt++) {
      signal.throwIfAborted();
      let wait =
        Math.min(maxWait, base * 2 ** (attempt - 1)) * (0.5 + random() / 2);
      let ms = timeout;
      if (ctxDeadline !== undefined) {
        ms = Math.min(ms, ctxDeadline - now());
        if (ms <= 0)
          throw new FetchFailure("TIMEOUT", "request deadline exceeded");
      }
      const attemptSignal = AbortSignal.any([signal, AbortSignal.timeout(ms)]);
      try {
        const res = await doFetch(url, {
          method,
          headers,
          body: body as RequestInit["body"],
          signal: attemptSignal,
          redirect: req.redirect ?? "follow",
        });
        if (retryOn.includes(res.status) && attempt <= retries) {
          const ra = Number(res.headers.get("retry-after"));
          if (Number.isFinite(ra) && ra >= 0)
            wait = Math.min(maxWait, ra * 1000);
          await res.body?.cancel().catch(() => {});
          await sleep(wait, signal);
          continue;
        }
        const buf =
          method === "HEAD"
            ? Buffer.alloc(0)
            : await readLimited(res, maxBytes);
        const h: Record<string, string> = {};
        res.headers.forEach((v, k) => (h[k] = v));
        return {
          status: res.status,
          ok: res.ok,
          statusText: res.statusText,
          headers: h,
          body: parseBody(buf, parse, res.headers.get("content-type")),
          url: res.url || url,
          attempts: attempt,
        };
      } catch (e) {
        if (signal.aborted)
          throw new FetchFailure("ABORTED", "request cancelled");
        let err: FetchFailure;
        if (e instanceof FetchFailure) err = e;
        else if (attemptSignal.aborted)
          err = new FetchFailure("TIMEOUT", `timed out after ${ms}ms`, true);
        else {
          const cause = (e as { cause?: { code?: string; message?: string } })
            .cause;
          err = new FetchFailure(
            "NETWORK",
            `${(e as Error).message}${cause?.code ? ` (${cause.code})` : ""}`,
            true,
          );
        }
        if (err.retryable && attempt <= retries) {
          await sleep(wait, signal);
          continue;
        }
        throw err;
      }
    }
  }

  return {
    name: "fetch",
    handle(effect, pc) {
      const rid = ridOf(effect);
      const ac = new AbortController();
      let set: Set<AbortController> | undefined;
      if (rid) {
        set = byRid.get(rid);
        if (!set) byRid.set(rid, (set = new Set()));
        set.add(ac);
      }
      inflight++;
      const deadline =
        typeof effect.ctx?.deadline === "number"
          ? effect.ctx.deadline
          : undefined;
      run(effect, deadline, ac.signal)
        .then(
          (res) => !ac.signal.aborted && ok(pc.dispatch, effect, res),
          (e) => {
            if (ac.signal.aborted) return;
            const f = e as FetchFailure;
            fail(
              pc.dispatch,
              effect,
              { code: f.code ?? "ERROR", message: f.message },
              "fetch.error",
            );
          },
        )
        .finally(() => {
          inflight--;
          if (rid && set) {
            set.delete(ac);
            if (set.size === 0) byRid.delete(rid);
          }
        });
    },
    cancel(rid) {
      for (const ac of byRid.get(rid) ?? []) ac.abort(new Error("cancelled"));
    },
    inflight: () => inflight,
    dispose() {
      for (const s of byRid.values())
        for (const ac of s) ac.abort(new Error("disposed"));
    },
  };
}
