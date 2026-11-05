/**
 * `resource`: reactive queries over the shared cache.
 *
 * @module
 */
import {
  getOwner,
  handleError,
  onCleanup,
  renderEffect,
  signal,
  untrack,
  useSuspense,
} from "../core/mod.ts";
import type { Accessor } from "../core/mod.ts";
import {
  DEFAULT_CACHE_TIME,
  abortFetch,
  acquireEntry,
  isFresh,
  releaseEntry,
  startFetch,
} from "./cache.ts";
import type { Entry, FetchContext, QueryKey } from "./cache.ts";

export interface ResourceOptions<T, S> {
  /** Cache key for a source value. Resources with equal keys share data, dedupe fetches and stay in sync. Default: private to this resource (`[id, source]`). */
  key?: (source: S) => QueryKey;
  /** Milliseconds a result counts as fresh (no refetch when a resource subscribes). Default 0. */
  staleTime?: number;
  /** Milliseconds an unused entry stays cached. Default 5 minutes; `Infinity` keeps it. */
  cacheTime?: number;
  /** Register with the nearest `suspense` while loading without data. Default true. */
  suspense?: boolean;
  /** Returned by `resource()` while there is no data (does not change `loading()`). */
  initialValue?: T;
  /** Also report fetch errors to the nearest `errorBoundary` (as well as `error()`). Default false. */
  throwOnError?: boolean;
  onError?: (error: unknown) => void;
}

export interface Resource<T> {
  /** The data for the current source, `undefined` while there is none. Reactive. */
  (): T | undefined;
  /** True while a fetch is in flight and there is no data yet. */
  loading: Accessor<boolean>;
  /** True while any fetch is in flight (including background revalidation). */
  fetching: Accessor<boolean>;
  /** The last fetch error (data from before stays available). `undefined` when fine. */
  error: Accessor<unknown>;
  /** Like `resource()` but keeps the previous source's value while the new one loads. */
  latest: Accessor<T | undefined>;
  /** Fetch again now (aborting an in-flight fetch). Resolves with the data; never rejects. */
  refetch(): Promise<T | undefined>;
  /**
   * Write data into the cache (optimistic update). Aborts an in-flight fetch so
   * it cannot overwrite the value. Returns a rollback that restores the
   * previous data unless something newer arrived meanwhile.
   */
  mutate(value: T | ((prev: T | undefined) => T)): () => void;
}

let uid = 0;

function defaultKey(id: number, s: unknown): QueryKey {
  return ["$resource", id, s];
}

/**
 * A query. `source` returns the input (re-evaluated reactively; `false`,
 * `null` or `undefined` disable the resource), `fetcher` loads it with an
 * `AbortSignal` that fires when the source changes or the owner is disposed.
 */
export function resource<T, S>(
  source: () => S | false | null | undefined,
  fetcher: (source: S, ctx: FetchContext<T>) => Promise<T> | T,
  options: ResourceOptions<T, S> = {},
): Resource<T> {
  const id = ++uid;
  const staleTime = options.staleTime ?? 0;
  const cacheTime = options.cacheTime ?? DEFAULT_CACHE_TIME;
  const owner = getOwner();
  const sus = options.suspense === false ? null : useSuspense();
  const current = signal<Entry<T> | null>(null);
  let held: Entry<T> | null = null;
  let lastSeen: T | undefined;

  const report = (err: unknown): void => {
    options.onError?.(err);
    if (options.throwOnError) handleError(err, owner);
  };

  const sourceNow = (): { s: S } | null => {
    const s = source();
    return s === false || s == null ? null : { s };
  };

  const remember = (e: Entry<T>): void => {
    const v = e.data.peek();
    if (v !== undefined) lastSeen = v;
  };

  // Called after a fetch is (or may be) in flight for `e`.
  const track = (e: Entry<T>): void => {
    const p = e.promise;
    if (p === null) return;
    if (sus !== null && e.data.peek() === undefined) sus.register(p);
    const run = e.runId;
    void p.then(() => {
      if (held === e && e.runId === run && e.error.peek() !== undefined)
        report(e.error.peek());
    });
  };

  const begin = (e: Entry<T>): void => {
    if (e.promise === null) {
      if (e.data.peek() !== undefined && isFresh(e, staleTime)) return;
      startFetch(e, e.data.peek() !== undefined);
    }
    track(e);
  };

  renderEffect(() => {
    const src = sourceNow();
    untrack(() => {
      const old = held;
      if (src === null) {
        if (old !== null) {
          remember(old);
          held = null;
          releaseEntry(old);
        }
        current.set(null);
        return;
      }
      const s = src.s;
      const e = acquireEntry<T>(
        options.key ? options.key(s) : defaultKey(id, s),
        cacheTime,
      );
      e.fetcher = (ctx) => fetcher(s, ctx);
      if (old === e) return; // same key: only the fetcher closure changed
      if (old !== null) remember(old);
      e.subscribers++;
      held = e;
      if (old !== null) releaseEntry(old);
      current.set(e);
      begin(e);
    });
  });

  onCleanup(() => {
    const e = held;
    if (e === null) return;
    remember(e);
    held = null;
    releaseEntry(e);
  });

  const read = ((): T | undefined => {
    const e = current();
    const v = e === null ? undefined : e.data();
    if (e !== null && v !== undefined) lastSeen = v;
    return v === undefined ? options.initialValue : v;
  }) as Resource<T>;

  read.loading = () => {
    const e = current();
    return e !== null && e.fetching() && e.data() === undefined;
  };
  read.fetching = () => {
    const e = current();
    return e !== null && e.fetching();
  };
  read.error = () => {
    const e = current();
    return e === null ? undefined : e.error();
  };
  read.latest = () => {
    const v = read();
    return v === undefined || v === options.initialValue
      ? (lastSeen ?? v)
      : v;
  };
  read.refetch = () => {
    const e = untrack(current);
    if (e === null) return Promise.resolve(undefined);
    const p = startFetch(e, true);
    track(e);
    return p.then(() => e.data.peek());
  };
  read.mutate = (value) => {
    const e = untrack(current);
    if (e === null) return () => {};
    const prev = e.data.peek();
    const prevAt = e.updatedAt;
    abortFetch(e);
    const next =
      typeof value === "function"
        ? (value as (p: T | undefined) => T)(prev)
        : value;
    e.data.set(next);
    e.error.set(undefined);
    e.updatedAt = Date.now();
    return () => {
      if (e.data.peek() === next) {
        e.data.set(prev);
        e.updatedAt = prevAt;
      }
    };
  };
  return read;
}

