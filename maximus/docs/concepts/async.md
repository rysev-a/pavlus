# Async: resource, action, suspense, errorBoundary

> **API as designed.** `suspense`, `errorBoundary`, `lazy`, `registerPending`/`useSuspense` are **shipped** (wave 1, `maximus/dom` and `maximus/core`). `resource` and `action` are **wave 2** (`maximus/resource`) and are documented here from the contract in `DESIGN.md`. Names and shapes below are fixed by the design; details that the design does not pin down are marked "unspecified". Once the module lands, this page will be reconciled with the code.

## The model

Async work is split in two:

- **Queries** (`resource`): read data keyed by some reactive input. Cached, de-duplicated, abortable.
- **Mutations** (`action`): do something once when asked. Track pending/error/result and *invalidate* queries when they succeed.

Both live in the owner tree, so unmounting a component aborts its in-flight requests and drops its subscriptions, and both report to the nearest `suspense` and `errorBoundary`.

## resource (as designed)

```ts
import { resource } from "maximus/resource";

const id = signal(1);
const user = resource(
  () => id(),                                              // source: re-fetches when it changes
  (id, { signal }) => fetch(`/u/${id}`, { signal }).then((r) => r.json()),
  { key: (id) => ["user", id], staleTime: 30_000 },
);

user();          // T | undefined  (tracked read)
user.loading();  // boolean
user.error();    // unknown
user.refetch();
user.mutate(v);  // write the cached value (optimistic update)
```

Contract from the design:

| capability | meaning |
| --- | --- |
| keyed cache | the `key` function maps the source value to a cache key; same key shares data |
| dedupe | concurrent reads of the same key share one request |
| abort | the fetcher receives an `AbortSignal`; changing the source or disposing the owner aborts the previous request |
| stale-while-revalidate | with `staleTime`, cached data is returned immediately while a refresh may run in the background |
| `refetch()` | force a reload |
| `mutate(v)` | replace the cached value now (optimistic UI) |

Unspecified in the design today: exact cache eviction (`cacheTime`), retry policy, how a `null` source disables the query, and the precise argument list of the fetcher beyond `{ signal }`.

## action (as designed)

```ts
import { action } from "maximus/resource";

const save = action(
  async (input: { name: string }, { signal }) => {
    const r = await fetch("/u", { method: "POST", body: JSON.stringify(input), signal });
    return r.json();
  },
  { invalidates: [["user"]] }, // cache keys (prefixes) to refetch after success
);

save.run({ name: "Ada" });
save.pending();  // boolean
save.error();    // unknown
save.result();   // last result
```

`invalidates` names resource keys; a successful run marks matching cached entries stale so mounted readers refetch.

## suspense (shipped)

```ts
import { suspense, html } from "maximus";

suspense(
  () => html`<p>loading...</p>`,       // fallback
  () => html`<h1>${() => user()?.name}</h1>`, // view
);
```

`suspense(fallback, view)`:

1. creates `view` **immediately**, so loading begins right away;
2. keeps it alive but **detached** while anything registered below it is pending, and shows the fallback;
3. swaps the view back when all registered promises settle; a later registration shows the fallback again;
4. nearest boundary wins.

The contract between async primitives and boundaries is two functions exported from `maximus` (and `maximus/core`):

```ts
registerPending(promise);   // tell the nearest boundary something is loading
useSuspense();              // { register(promise), pending() } or null; pending() is the number of unsettled promises
```

`resource` and `lazy` use `registerPending`. A rejected promise counts as settled (the boundary does not show errors): the resource surfaces its own error through `user.error()` and the `errorBoundary`. You can use it for your own async work:

```ts
function Avatar(props: { src: string }) {
  const img = new Image();
  registerPending(
    new Promise<void>((resolve) => {
      img.onload = img.onerror = () => resolve();
      img.src = props.src;
    }),
  );
  return img;
}
```

Streaming suspense on the server (`renderToStream`) is designed but not implemented; see [SSR](./ssr.md).

## lazy (shipped)

```ts
const Chart = lazy(() => import("./chart.ts")); // default export, or the component itself
Chart.preload();                                // start early (for example on hover)
suspense(fallback, () => Chart({ data }));
```

A failed import throws into the nearest `errorBoundary`.

## errorBoundary (shipped)

```ts
errorBoundary(
  (err, reset) => html`<p>${String(err)} <button @click=${reset}>retry</button></p>`,
  () => Page(),
);
```

Catches errors from rendering, effects, event handlers and (wave 2) resources created under it. `reset()` discards the fallback and renders the view afresh, which for a resource-backed view starts loading again. An error thrown by the fallback goes to the next boundary up.

## Typical composition

```ts
errorBoundary(
  (e, reset) => ErrorPage(e, reset),
  () => suspense(Skeleton, () => UserPage()),
);
```

Put `errorBoundary` outside `suspense`: errors are handled at the outer level while pending states are handled at the inner one.

## Today, without resource

Everything above except `resource`/`action` works now. Plain signals plus `registerPending` cover simple cases; the [infinite scroll](../recipes.md#2-infinite-scroll) and [optimistic list](../recipes.md#5-optimistic-list) recipes do exactly that.
