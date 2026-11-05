# Routing

`maximus/router` is a small router built on signals: nested layouts, guards, loaders, typed params, prefetching links, and the accessibility chores of navigation (focus, announcement, scroll). The snippets run as tests in `docs/concepts/concepts.test.ts`; the full reference is [`src/router/README.md`](../../src/router/README.md).

## Creating a router

```ts
import { createRouter } from "maximus/router";

const router = createRouter({
  routes: [
    { path: "/", title: "Home", component: Home },
    { path: "/login", component: Login },
    {
      path: "/users/:id",
      title: ({ params }) => `User ${params.id}`,
      guard: () => (loggedIn() ? true : "/login"), // true allows, false cancels, a string redirects
      load: ({ params, signal }) => fetchUser(Number(params.id), signal),
      component: (p) =>
        html`<section>
          <h1>${() => p.data()?.name}</h1>
          ${router.a("/users/1/posts", "Posts")} ${router.outlet()}
        </section>`,
      children: [
        { path: "", component: Overview },
        { path: "posts", component: Posts },
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

Without a `history` option the router uses the browser History API when there is a `window`, and a memory history otherwise (tests, Node). On the server it reads the request URL from `useServer()?.url` (see [SSR](./ssr.md)). `base: "/app"` mounts it under a prefix.

## Reading and changing the location

`router.path()`, `router.query()`, `router.params()`, `router.hash()` and `router.data()` are signals: a binding that reads them updates on navigation without the component being rebuilt (`/users/1` to `/users/2` keeps the component and updates `params()`/`data()`).

```ts
await router.navigate("/users/1?tab=a"); // resolves true when committed, false when cancelled or superseded
router.query().tab; // "a"
await router.setQuery({ tab: "b" }); // merge into the current query; undefined removes a key
router.back();
```

Components receive `{ params, query, data, router }` as accessors. Links: `router.a(path, label)` makes an anchor, `<a ${router.link(path)}>` spreads `href`, click handling, `aria-current="page"` and prefetch listeners onto yours. Modified clicks, `target`, `download` and external URLs are left to the browser.

## Loaders, guards, redirects

Navigation runs: match, redirects, **guards** (parent to child, sequential), **loaders** (all matched routes in parallel), then commits. The old page stays up while guards and loaders run (`router.navigating()` is true) and a newer navigation aborts the older one through the `signal` both receive. A loader is re-run only if the route, its params or the query changed. A loader that throws commits the route with the error: render it with the route's `error(err, retry)` option, or let it reach the nearest `errorBoundary`. `throw redirect("/login")` redirects from a loader.

## Data with `resource`

Loaders are right for data the page needs before it shows. For data that changes with the URL while the page stays up (search, filters in the query string), key a `resource` by the signals:

```ts
const user = resource(
  () => Number(router.params().id),
  (id) => fetchUser(id),
  { key: (id) => ["user", id] },
);
```

## Nesting

`router.outlet()` renders the next level of the matched chain; call it synchronously while building a layout. A layout survives child changes, and only the level that changed is rebuilt. A pathless route is a layout that never matches alone. `*` (or the `notFound` option) handles unmatched URLs.

## Accessibility and viewport

After a navigation that changes the path the router sets `document.title` (from `title`), announces the page in a polite live region, moves focus to `[data-router-focus]`, else `main`, `[role=main]` or `h1`, and restores or resets scroll. All of it can be turned off or replaced (`announce`, `focus`, `scroll`). Where `document.startViewTransition` exists and the user has not asked for reduced motion, the commit runs in a view transition.

## Not there yet

No route-level code splitting convention beyond `lazy()` in a component, no generated typed `href` builders from a route table beyond `router.url()`, no scroll restoration for inner scroll containers, no loader-data transfer for hydration (the server render waits for loaders, but their data is not serialised into the page; use a keyed `resource` for pages that must hydrate without refetching).
