# maximus/router

Nested routes with layouts, guards, loaders, typed params, links with prefetch, and the accessibility chores of navigation (focus, live-region announcement, scroll) built in. All state is signals; the history is a driver you can swap.

```ts
import { createRouter, route, html, render } from "maximus";

const router = createRouter({
  base: "/app",
  routes: [
    { path: "/", title: "Home", component: Home },
    route({
      path: "/users/:id", // params: { id: string }, inferred
      title: ({ params }) => `User ${params.id}`,
      guard: ({ to }) => (loggedIn() ? true : `/login?next=${to.path}`),
      load: ({ params, signal }) =>
        fetch(`/api/u/${params.id}`, { signal }).then((r) => r.json()),
      component: (p) => html`<h1>${() => p.data()?.name}</h1>`,
    }),
    {
      path: "/settings",
      component: () =>
        html`<section>
          ${router.a("/settings/profile", "Profile")} ${router.outlet()}
        </section>`,
      children: [
        { path: "", component: Overview },
        { path: "profile", component: Profile },
      ],
    },
    { path: "*", component: NotFound },
  ],
});

render(
  () =>
    html`<nav>${router.a("/", "Home")}</nav>
      <main>${router.outlet()}</main>`,
  document.body,
);
```

## Signals and navigation

`router.path()`, `query()` (repeated keys become arrays), `params()` (merged over the matched chain), `hash()`, `matches()`, `notFound()`, `navigating()`, `data()` (data of the deepest matched route with a `load`). `navigate(to, { replace, state, scroll, force })` resolves `true` when committed, `false` when cancelled, superseded or blocked. `replace`, `back`, `forward`, `go`, `setQuery(patch)` (merge into the current query), `url("/users/:id", { id })` (typed builder), `href(path)`, `isActive(path)`, `prefetch(path)`, `announce(text)`, `dispose()`. `router.ready` resolves after the initial navigation (which is synchronous when no guard or loader is involved). Targets starting with `?` or `#` are relative to the current page. External URLs make `navigate` reject.

## Matching

`/users/:id` param, `/users/:id?` optional, `/files/*` or `/files/*rest` wildcard (last segment, may be empty, value is the rest of the path). Ranking per segment: static > param > optional > wildcard; an exact match beats an optional/wildcard tail; ties prefer the deeper route, then definition order. Static segments are case-insensitive unless `caseSensitive`. Children are relative to the parent (a leading `/` is ignored). A route with children and a path also matches exactly (its own `component` with an empty outlet); a pathless layout never matches alone; a child with `path: ""` is the index. `redirect` routes (`"/new"` or `(to) => path`). `notFound` option for unmatched URLs, or a `*` route.

`trailingSlash`: `"never"` (default, `/a/` is canonicalised to `/a` in the history entry), `"always"`, `"ignore"`. `base` is stripped from history locations and added when writing; a URL outside the base is "not found".

## Layouts and outlets

`router.outlet()` renders the next level of the matched chain. Call it synchronously while building a layout (its depth comes from the owner chain). Only the level whose route changed is rebuilt: `/users/1 -> /users/2` keeps the component, and its `params()`/`data()` signals update; a layout survives child changes. Components receive `{ params, query, data, router }` (accessors). A route without `component` just renders its child. `lazy()` components and `suspense` work as anywhere else, and a throwing component reaches the nearest `errorBoundary`.

## Navigation pipeline

resolve -> match -> redirects -> **guards** (global, then parent to child, sequential) -> **loaders** (all matched, in parallel) -> history write -> commit signals -> title, announcement, focus, scroll. The old page stays up while guards and loaders run (`navigating()` is true). A newer navigation aborts the older one: guard and loader `signal`s fire and stale results are discarded.

- **guard**: `true`/`undefined` allow, `false` cancels (a blocked back/forward is undone with `history.go`), a string redirects (max 10). A thrown error rejects `navigate()` and leaves the state alone; for link clicks and history pops it goes to `onError`.
- **load** `({ params, query, location, signal })`: reused when the route, its own params and the query string are unchanged; otherwise re-run. Throw `redirect("/login")` to redirect. Other errors commit the route with the error: its `error(err, retry)` render prop is shown, or the error is thrown into the nearest `errorBoundary`. `retry` re-runs the loaders.
- **prefetch**: `router.prefetch(path)` starts the loaders ahead of time (guards are not run); the next navigation to that URL takes the result once, within `prefetchTtl` (30 s). Failed prefetches stay silent.

## Links

```ts
html`<a ${router.link("/users/1")}>Ann</a>`; // spread: href, aria-current, click, prefetch listeners
router.a("/users/1", "Ann", { class: "nav" }); // the same as an element
router.a(
  "/docs",
  "Docs",
  {},
  { exact: false, prefetch: "visible", replace: false },
);
```

A click is handled client-side only for the primary button without Ctrl/Meta/Shift/Alt, without `target` (other than `_self`), `download` or `rel~=external`, and when nobody called `preventDefault`. Links to external URLs (`https:`, `mailto:`, `//host`) are plain anchors; `javascript:` is rejected by the DOM layer. `aria-current="page"` on the exact page, `"true"` on ancestors for `exact: false`. Prefetch: `hover` (pointer enter and focus, default), `visible` (IntersectionObserver, if present) or `none`; `prefetch` router option sets the default. The `link` spread object replaces a directive form: use it as `<a ${router.link(...)}>`.

## Accessibility and viewport

- **Title and announcement**: a route's `title` (string or function; the deepest wins; `titleTemplate` wraps it) sets `document.title`. After a navigation that changes the path (not on the first load, not for query/hash-only changes) a visually hidden `aria-live="polite"` `role="status"` region announces the page: the title, else the first `h1`, else the path. `announce: false` disables it, `announce: (title, location) => string` customises it.
- **Focus**: focus moves to `[data-router-focus]`, else `main`, else `[role=main]`, else `h1` (made programmatically focusable with `tabindex=-1`, removed on blur, `preventScroll`). `focus: "selector"` or `false` to override.
- **Scroll**: positions are remembered per history entry; back/forward restore them, new pages scroll to top or to the `#anchor`; query-only changes do not scroll; `navigate(..., { scroll: false })`. `scroll: false` disables, or pass a `Scroller` object. Browser drivers set `history.scrollRestoration = "manual"`. With the memory driver there is no default scroller.
- **View Transitions**: when `document.startViewTransition` exists and `prefers-reduced-motion` is not `reduce`, the commit runs inside a transition (`viewTransitions: false` opts out).

## History drivers

`createMemoryHistory(entries?, index?)` (tests and SSR; pops notify synchronously), `createBrowserHistory(window?)`, `createHashHistory(window?)`; one `History` interface: `location()`, `push`, `replace`, `go/back/forward`, `listen` (pops only, with the delta), `href`, `destroy`. Without `history` the router uses the browser driver when a `window` exists, otherwise memory. Entry keys and indexes live in `history.state`, which is how pops know their delta and which scroll position to restore.

## Lifecycle

A router created under an owner disposes with it (`dispose()` also works by hand): history listener removed, in-flight navigation aborted, prefetches aborted, live region removed.
