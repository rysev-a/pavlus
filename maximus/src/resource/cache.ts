/**
 * The shared query cache behind `resource`: one entry per key, holding the
 * data/error/fetching signals, the in-flight fetch (deduplicated), the
 * subscriber count and the garbage-collection timer.
 *
 * @module
 */
import { batch, signal } from "../core/mod.ts";
import type { Signal } from "../core/mod.ts";

/** A cache key: an array of JSON-like values, e.g. `["user", 42]`. */
export type QueryKey = readonly unknown[];

export interface FetchContext<T> {
  /** Aborted when the source changes, the last subscriber leaves, or a newer fetch replaces this one. */
  signal: AbortSignal;
  /** The data currently cached (stale-while-revalidate), if any. */
  value: T | undefined;
  /** True for explicit `refetch()` / invalidation, false for a first or automatic load. */
  refetching: boolean;
}

export type Fetcher<T> = (ctx: FetchContext<T>) => Promise<T> | T;

export interface Entry<T = unknown> {
  readonly hash: string;
  /** Per-element hashes, for prefix matching. */
  readonly parts: readonly string[];
  data: Signal<T | undefined>;
  error: Signal<unknown>;
  fetching: Signal<boolean>;
  updatedAt: number;
  invalidated: boolean;
  subscribers: number;
  cacheTime: number;
  fetcher: Fetcher<T> | null;
  /** Settles (never rejects) when the in-flight fetch ends or is aborted. */
  promise: Promise<void> | null;
  controller: AbortController | null;
  /** A detached fetch (prefetch) survives the loss of its last subscriber. */
  detached: boolean;
  runId: number;
  settle: (() => void) | null;
  gc: ReturnType<typeof setTimeout> | null;
}

// Entries of every value type live in one map; the type parameter is erased here only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, Entry<any>>();

/** Deterministic string for one key element (object keys sorted). */
export function hashPart(v: unknown): string {
  try {
    return (
      JSON.stringify(v, (_k, x: unknown) =>
        x !== null && typeof x === "object" && !Array.isArray(x)
          ? Object.fromEntries(
              Object.entries(x as Record<string, unknown>).sort(([a], [b]) =>
                a < b ? -1 : a > b ? 1 : 0,
              ),
            )
          : x,
      ) ?? "undefined"
    );
  } catch {
    return String(v);
  }
}

export const DEFAULT_CACHE_TIME = 5 * 60_000;

export function acquireEntry<T>(
  key: QueryKey,
  cacheTime = DEFAULT_CACHE_TIME,
): Entry<T> {
  const parts = key.map(hashPart);
  const hash = parts.join("\u0001");
  let e: Entry<T> | undefined = cache.get(hash);
  if (e === undefined) {
    e = {
      hash,
      parts,
      data: signal<T | undefined>(undefined),
      error: signal<unknown>(undefined, { equals: false }),
      fetching: signal(false),
      updatedAt: 0,
      invalidated: false,
      subscribers: 0,
      cacheTime,
      fetcher: null,
      promise: null,
      controller: null,
      detached: false,
      runId: 0,
      settle: null,
      gc: null,
    };
    cache.set(hash, e);
  } else if (cacheTime > e.cacheTime) e.cacheTime = cacheTime;
  if (e.gc !== null) {
    clearTimeout(e.gc);
    e.gc = null;
  }
  return e;
}

export function isFresh<T>(e: Entry<T>, staleTime: number): boolean {
  return (
    e.data.peek() !== undefined &&
    !e.invalidated &&
    e.error.peek() === undefined &&
    Date.now() - e.updatedAt < staleTime
  );
}

/** Abort the in-flight fetch, if any, and settle its promise. */
export function abortFetch<T>(e: Entry<T>): void {
  if (e.controller === null) return;
  const settle = e.settle;
  e.controller.abort();
  e.controller = null;
  e.promise = null;
  e.settle = null;
  e.runId++;
  e.fetching.set(false);
  settle?.();
}

/**
 * Start a fetch for the entry (aborting any in-flight one). Never rejects:
 * failures land in `entry.error`. Stale results of superseded fetches are dropped.
 */
export function startFetch<T>(
  e: Entry<T>,
  refetching: boolean,
  detached = false,
): Promise<void> {
  const fetcher = e.fetcher;
  if (fetcher === null) return Promise.resolve();
  abortFetch(e);
  const ctrl = new AbortController();
  const run = ++e.runId;
  e.controller = ctrl;
  e.detached = detached;
  e.fetching.set(true);
  const promise = new Promise<void>((resolve) => {
    e.settle = resolve;
    const finish = (apply: () => void): void => {
      if (e.runId !== run) return;
      batch(() => {
        apply();
        e.fetching.set(false);
      });
      e.controller = null;
      e.promise = null;
      e.settle = null;
      resolve();
      if (e.subscribers === 0) scheduleGc(e);
    };
    let result: Promise<T> | T;
    try {
      result = fetcher({ signal: ctrl.signal, value: e.data.peek(), refetching });
    } catch (err) {
      finish(() => fail(e, err));
      return;
    }
    Promise.resolve(result).then(
      (v) =>
        finish(() => {
          e.data.set(v);
          e.error.set(undefined);
          e.updatedAt = Date.now();
          e.invalidated = false;
        }),
      (err: unknown) => finish(() => fail(e, err)),
    );
  });
  if (e.runId === run && e.controller === ctrl) e.promise = promise;
  return promise;
}

function fail<T>(e: Entry<T>, err: unknown): void {
  e.error.set(err ?? new Error("rejected"));
  e.updatedAt = Date.now();
}

export function scheduleGc<T>(e: Entry<T>): void {
  if (e.gc !== null) clearTimeout(e.gc);
  e.gc = null;
  if (e.cacheTime === Infinity) return;
  const sweep = (): void => {
    e.gc = null;
    if (e.subscribers > 0) return;
    if (e.controller !== null) return scheduleGc(e);
    if (cache.get(e.hash) === e) cache.delete(e.hash);
  };
  if (e.cacheTime <= 0) sweep();
  else {
    const t = setTimeout(sweep, e.cacheTime);
    (t as { unref?: () => void }).unref?.();
    e.gc = t;
  }
}

/** Drop a subscriber; the last one to leave aborts an attached fetch and starts the GC clock. */
export function releaseEntry<T>(e: Entry<T>): void {
  if (--e.subscribers > 0) return;
  e.subscribers = 0;
  if (!e.detached) abortFetch(e);
  scheduleGc(e);
}

function matches<T>(e: Entry<T>, prefix: readonly string[]): boolean {
  if (prefix.length > e.parts.length) return false;
  for (let i = 0; i < prefix.length; i++)
    if (e.parts[i] !== prefix[i]) return false;
  return true;
}

/**
 * Mark every entry whose key starts with `prefix` as stale and refetch the
 * ones somebody is using. Resolves when those refetches settled. An empty
 * prefix invalidates everything.
 */
export function invalidate(prefix: QueryKey = []): Promise<void> {
  const p = prefix.map(hashPart);
  const pending: Promise<void>[] = [];
  for (const e of [...cache.values()]) {
    if (!matches(e, p)) continue;
    e.invalidated = true;
    if (e.subscribers > 0 && e.fetcher !== null)
      pending.push(startFetch(e, true));
  }
  return Promise.all(pending).then(() => undefined);
}

/**
 * Warm the cache for `key` without subscribing. Deduplicates with an
 * in-flight fetch and skips when fresh within `staleTime`. Never rejects.
 */
export function prefetch<T>(
  key: QueryKey,
  fetcher: Fetcher<T>,
  options: { staleTime?: number; cacheTime?: number } = {},
): Promise<void> {
  const e = acquireEntry<T>(key, options.cacheTime);
  try {
    if (e.promise !== null) return e.promise;
    if (isFresh(e, options.staleTime ?? 0)) return Promise.resolve();
    e.fetcher = fetcher;
    return startFetch(e, false, true);
  } finally {
    if (e.subscribers === 0 && e.controller === null) scheduleGc(e);
  }
}

/** Remove every cached entry (aborting fetches). Mostly for tests and logout. */
export function clearCache(): void {
  for (const e of cache.values()) {
    abortFetch(e);
    if (e.gc !== null) clearTimeout(e.gc);
  }
  cache.clear();
}

/** Number of cached entries (diagnostics, leak tests). */
export function cacheSize(): number {
  return cache.size;
}

/** The cached data for an exact key, if any. */
export function getCached<T>(key: QueryKey): T | undefined {
  const hash = key.map(hashPart).join("\u0001");
  return cache.get(hash)?.data.peek() as T | undefined;
}
