# maximus/resource

Async state on the same primitives as everything else: `resource` for **reads** (a keyed, shared, abortable cache) and `action` for **writes** (pending/error/result, invalidation, optimistic updates).

```ts
import { resource, action, invalidate, prefetch } from "maximus";

const id = signal(1);
const user = resource(
  () => id(), // source; false/null/undefined disables
  (id, { signal }) => fetch(`/u/${id}`, { signal }).then((r) => r.json()),
  { key: (id) => ["user", id], staleTime: 30_000 },
);

html`<p>${() => (user.loading() ? "loading..." : user()?.name)}</p>`;

const save = action(
  async (input: Draft, { signal, optimistic }) => {
    optimistic(() => user.mutate((u) => ({ ...u!, ...input }))); // rolled back if this throws
    await fetch("/u", { method: "POST", body: JSON.stringify(input), signal });
  },
  { invalidates: [["user"]] }, // refetch everything keyed ["user", ...] afterwards
);
save.run(draft);
save.pending();
save.error();
save.result();
save.reset();
```

## resource(source, fetcher, options?)

| member              | meaning                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `r()`               | data of the current source (`undefined` while none). Never throws.                                 |
| `r.loading()`       | fetching **and** no data yet (a first load)                                                        |
| `r.fetching()`      | any fetch in flight, including background revalidation                                             |
| `r.error()`         | last fetch error; older data stays available                                                       |
| `r.latest()`        | like `r()` but keeps the previous source's value while the next one loads                          |
| `r.refetch()`       | refetch now (aborts an in-flight fetch); resolves with the data, never rejects                     |
| `r.mutate(v \| fn)` | write into the cache; aborts an in-flight fetch so it cannot clobber the value; returns a rollback |

Options: `key(source)` (default: private to this resource), `staleTime` (default 0), `cacheTime` (default 5 min, `Infinity` keeps), `suspense` (default true), `initialValue`, `onError`, `throwOnError`.

- **Shared cache and dedupe.** Entries are keyed by the _structure_ of the key array (object key order does not matter). Resources with equal keys share data, loading state and the single in-flight fetch, and stay in sync after `mutate`.
- **Cancellation.** The fetcher gets an `AbortSignal`. It fires when the source changes to another key, when the owner is disposed and nobody else uses the entry, when `refetch`/`mutate`/`invalidate` supersedes the fetch. Results of aborted or superseded fetches are dropped. A fetch started by `prefetch` is _detached_ and survives having no subscribers.
- **Stale-while-revalidate.** Cached data is returned immediately. If it is older than `staleTime` (or invalidated, or the last fetch failed) a background fetch runs; `loading()` stays false, `fetching()` is true.
- **Eviction.** An entry nobody subscribes to is dropped after `cacheTime`. Subscribing again cancels the countdown.
- **Suspense.** When a fetch is in flight and there is no data, the promise is registered with the nearest `suspense()` boundary (captured when the resource is created), so the fallback shows. Revalidation never re-triggers the fallback. `suspense: false` opts out.
- **Errors.** They land in `error()` and `onError`. With `throwOnError: true` they are also reported to the nearest `errorBoundary`.
- Fetchers that resolve `undefined` count as "no data". Resources created outside any owner are never released (create them under `root`/`render`).

## action(fn, options?)

`run(input)` resolves with the result, or `undefined` if the run failed or was superseded; **it never rejects** (read `error()`), so `@click=${() => save.run(x)}` is safe.

- `pending()` is true from `run` until the run, including its invalidation refetch, is done.
- `optimistic(apply)` runs `apply` now; if it returns a function (as `resource.mutate` does) that is the rollback. On failure or supersession rollbacks run newest-first. On success the optimistic data stays until `invalidates` refetches the truth.
- `invalidates`: key prefixes, or `(input, result) => prefixes`; applied only on success and awaited.
- `concurrency`: `"latest"` (default) aborts and rolls back the previous run when a new one starts; `"queue"` runs them one after another (a failure does not block the queue); `"parallel"` runs them side by side (the newest started run owns `result`).
- Actions do not abort when their owner is disposed (a save should survive navigating away); use the `signal` yourself if you want that.

## Cache helpers

`invalidate(prefix?)` marks matching entries stale and refetches the ones in use (resolves when done; no argument = everything). `prefetch(key, fetcher, { staleTime })` warms an entry (deduped, never rejects). `clearCache()`, `cacheSize()`, `getCached(key)` for tests and diagnostics.
