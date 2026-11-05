# Routing

> **API as designed.** The router (`maximus/router`) is **wave 2** and is not shipped in 0.1. This page documents the contract in `DESIGN.md`. Anything beyond the contract is marked "unspecified". Until the module lands, use a signal fed by `location.hash`/`popstate` (see the todo example's filter, `examples/todo/main.ts`).

## Creating a router

```ts
import { createRouter } from "maximus/router";

const router = createRouter({
  base: "/app",
  routes: [
    { path: "/", component: Home },
    {
      path: "/users/:id",
      component: User,
      load: ({ params, signal }) => fetchUser(params.id, signal),
      guard: (ctx) => (loggedIn() ? true : "/login"),
      children: [{ path: "posts", component: UserPosts }],
    },
  ],
});

render(() => html`<nav>${router.a("/", "Home")}</nav>${router.outlet()}`, document.body);
```

## API from the design

| member | meaning |
| --- | --- |
| `router.navigate(path, { replace })` | programmatic navigation |
| `router.path()`, `router.params()`, `router.query()` | **signals** of the current location; bindings that read them update on navigation |
| `router.link("/users/1")` | a spread for `<a ${router.link(...)}>`: sets `href` and intercepts clicks |
| `router.a("/users/1", label)` | a ready-made anchor |
| `router.outlet()` | where the matched route's component renders; nested routes nest outlets |

Route fields: `path` (with `:param` segments), `component`, `load` (data loader receiving `{ params, signal }`), `guard` (runs before entering; can redirect or block), `children` (nested layouts).

Features listed in the design: nested layouts, loaders, guards, prefetch, view transitions, scroll restoration, typed params, focus management on route change, a live-region announcer, and `prefers-reduced-motion` aware transitions.

Unspecified in the design: the guard return convention (boolean vs redirect path), how loader data reaches the component (props vs a `useLoaderData` accessor), the prefetch trigger (hover/visible/explicit), the shape of typed params, and hash vs history mode.

## How it fits the rest

A route component is an ordinary component. The outlet renders it in a child owner, so leaving the route disposes its effects, listeners and in-flight resources. Reading `router.params()` inside a binding is how a component reacts to `/users/1` becoming `/users/2` without being re-created.

```ts
function User() {
  const user = resource(() => router.params().id, fetchUser); // wave 2 resource
  return html`<h1>${() => user()?.name}</h1>`;
}
```

Loader errors reach the nearest `errorBoundary`; pending loaders register with the nearest `suspense`.
