# Async: resource, action, suspense, errorBoundary

Async work is split in two:

- **Queries** (`resource`): read data derived from reactive input. Cached under a key, de-duplicated, abortable, stale-while-revalidate.
- **Mutations** (`action`): do something when asked. Track pending/error/result, support optimistic updates with rollback, and _invalidate_ queries when they succeed.

Both live in the owner tree: unmounting a component aborts its in-flight requests and drops its subscriptions, and both report to the nearest `suspense` and `errorBoundary`. The snippets on this page run as tests in `docs/concepts/concepts.test.ts`.

## resource

```ts
import { resource } from "maximus/resource";

const id = signal(1);
const user = resource(
  () => id(), // source: re-fetches when it changes; false/null/undefined disables
  (id, { signal }) => fetchUser(id, signal),
  { key: (id) => ["user", id], staleTime: 30_000 },
);

html`<p>${() => (user.loading() ? "loading..." : user()?.name)}</p>`;
```

`user()` is the data (`undefined` until there is some, never throws), `user.loading()` is "fetching and no data yet", `user.fetching()` includes background revalidation, `user.error()`, `user.latest()` keeps the previous source's value while the next loads, `user.refetch()`, `user.mutate(v | fn)` writes into the cache and returns a rollback.

- **Keyed cache and dedupe.** Resources with equal keys (compared structurally) share data, loading state and the single in-flight request. Without `key` the resource is private.
- **Abort.** The fetcher receives an `AbortSignal` that fires when the source changes to another key, when the owner is disposed and nobody else uses the entry, or when `refetch`/`mutate`/`invalidate` supersedes the request. Results of aborted requests are dropped.
- **Stale-while-revalidate.** Data older than `staleTime` (default 0) is returned immediately and refreshed in the background; `loading()` stays false, `fetching()` is true. Going back to a cached, fresh key (`id.set(1)` above) does no request at all.
- **Eviction.** An unused entry is dropped after `cacheTime` (default 5 minutes).
- **Errors.** They land in `error()` and `onError`; older data stays. With `throwOnError: true` they also go to the nearest `errorBoundary`. There is no automatic retry; call `refetch()`.

See [`src/resource/README.md`](../../src/resource/README.md) for the complete option list and the cache helpers (`invalidate`, `prefetch`, `clearCache`, `getCached`).

## action

```ts
import { action } from "maximus/resource";

const rename = action(
  async (name: string, { optimistic, signal }) => {
    optimistic(() => user.mutate((u) => ({ ...u!, name }))); // rolled back if this throws
    await saveUser({ id: 1, name }, signal);
  },
  { invalidates: [["user"]] }, // refetch everything keyed ["user", ...] afterwards
);

rename.run("Ada L."); // resolves with the result, never rejects
rename.pending(); // true until the run, including the invalidation refetch, is done
rename.error();
rename.result();
```

`run` never rejects (read `error()`), so `@click=${() => rename.run(x)}` is safe. The `concurrency` option decides what a second `run` does while one is pending: `"latest"` (default) aborts and rolls back the first, `"queue"`, `"parallel"`. Actions are _not_ aborted when their owner goes away: a save should survive navigating off the page.

## suspense

```ts
import { suspense, html } from "maximus";

suspense(
  () => html`<p>loading...</p>`, // fallback
  () => {
    const user = resource(
      () => 1,
      (id) => fetchUser(id),
    ); // created inside the boundary
    return html`<h1>${() => user()?.name}</h1>`;
  },
);
```

`suspense(fallback, view)` creates `view` **immediately**, so loading starts right away, keeps it detached while anything registered below it is pending, shows the fallback meanwhile, and swaps back when everything settles. The nearest boundary wins.

A `resource` registers with the boundary that is current **when the resource is created**. A resource created outside the boundary (a parent component, module scope) does not trigger its fallback: create it inside the view function, as above. Revalidation never brings the fallback back.

The contract with your own async work is two functions:

```ts
registerPending(promise); // tell the nearest boundary something is loading
useSuspense(); // { register(promise), pending() } or null
```

```ts
function Avatar() {
  const el = document.createElement("img");
  registerPending(loaded(el)); // any promise
  return el;
}
```

A rejected promise counts as settled; the failing resource reports through `error()` / `throwOnError`.

## lazy

```ts
const Chart = lazy(() => import("./chart.ts")); // default export, or the component itself
Chart.preload(); // start early, for example on hover
suspense(fallback, () => Chart({ data }));
```

A failed import throws into the nearest `errorBoundary`.

## errorBoundary

```ts
errorBoundary(
  (err, reset) =>
    html`<p>${String(err)} <button @click=${reset}>retry</button></p>`,
  () => suspense(Skeleton, () => UserPage()),
);
```

It catches errors from rendering, effects, event handlers and resources with `throwOnError`. `reset()` discards the fallback and builds the view again, which starts a resource-backed view loading again (clear or `invalidate` the cache entry first if the failed result should not be reused). An error thrown by the fallback goes to the next boundary up. Put `errorBoundary` outside `suspense`: errors are handled at the outer level, pending states at the inner one.

## On the server

`renderToString` waits for everything registered with a boundary, `renderToStream` flushes the shell and streams each boundary as it becomes ready, and keyed resources travel to the browser in the HTML so hydration does not fetch again. See [SSR](./ssr.md).

## Not there yet

No automatic retry/backoff, no polling or refetch-on-focus options (write them with `effect` and `refetch()`), no infinite-query helper (see the [infinite scroll recipe](../recipes.md)), no persistence of the cache across reloads.
