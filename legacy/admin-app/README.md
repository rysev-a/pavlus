# admin-app

A full-stack admin dashboard built on [pavlus](../framework):

- **frontend/**: built by Vite. Pages are pavlus components, routed by URL: a
  home page, a dashboard (users, shop, billing), an about page and an admin
  page (roles). Every page is rendered on the server and hydrated in the
  browser (see [Server-side rendering](#server-side-rendering)).
  - `pages/` one folder per routed page (`index`, `dashboard`, `admin`, `about`,
    `not-found`); the dashboard's sub-pages (`overview`, `shop`, `billing`) sit inside it.
  - `modules/` the components with data and logic the pages embed (`users`, `roles`).
  - `components/` the templates of the shell (`header`, `footer`).
  - `tests/` every frontend test.
- **backend/**: plain `node:http`, no framework. A JSON API over Postgres
  through the `pg` driver, and the pages, rendered on the server.

```
browser ──▶ node backend :3000 ──▶ Postgres :5432
            /api/*   JSON
            /...     the page, rendered (ssr.ts), then hydrated in the browser
            assets   from Vite inside the server (development) or dist/ (production)
```

## Run it

Requires Node 24 (it runs the TypeScript backend directly) and Docker.

```sh
npm install              # from the workspace root, once
cd admin-app
docker compose up -d     # Postgres (user admin / admin, db admin_app)
npm run db:init          # creates the tables and seeds 8 users, 3 roles, 10 products, 10 payments
npm run dev              # the server, with Vite inside it (hot reload)
```

Open http://localhost:3000. Configuration is read from `.env` if present
(see `.env.example`): `DATABASE_URL`, `PORT`.

| Script              | Does                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`       | `node --watch backend/server.ts` on :3000, Vite in middleware mode for the frontend                                                             |
| `npm run build`     | the frontend to `dist/` (assets) and `dist/server/entry-server.js` (for rendering)                                                              |
| `npm start`         | production: `NODE_ENV=production`, pages rendered from the build, `dist/` as static files                                                       |
| `npm run db:init`   | drop, create and seed the tables (demo data, safe to repeat)                                                                                    |
| `npm test`          | Vitest. Needs the Postgres of `compose.yaml`: the frontend tests run the real API over the real database (reseeded first); no fake API anywhere |
| `npm run typecheck` | `tsc` over frontend and backend                                                                                                                 |

## Pages

| URL           | Page                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`           | **Home**: links to the pages                                                                                                                                          |
| `/dashboard`  | **Dashboard**: users as a list or a table (switchable), with a filter; `/dashboard/shop` (10 products) and `/dashboard/billing` (10 last payments) are its other tabs |
| `/about`      | **About**: a template without logic                                                                                                                                   |
| `/admin`      | **Admin**: roles and how many users have each                                                                                                                         |
| anything else | _Page not found_                                                                                                                                                      |

## API

| Route                      | Answer                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/users`           | `[{ id, name, email, role }]`, role joined by name                                          |
| `GET /api/roles`           | `[{ id, name, description, users }]`, `users` is the count                                  |
| `GET /api/products`        | `[{ id, name, price, stock }]`, the catalogue                                               |
| `GET /api/payments`        | `[{ id, customer, amount, status, paid_at }]`, last 10, newest first                        |
| `DELETE /api/users/:id`    | `{ deleted: id }`; a user that is not there is `404 { error }`; their payments go with them |
| anything else under `/api` | `404 { error }`; other methods `405`                                                        |

`backend/api.ts` is pure: the handlers take a `query(sql, params)` function
and return `{ status, body }`, so the routing is unit-tested with a recording
`query` and no server, and then against Postgres. `backend/server.ts` adds
`node:http`, the pool and static files. The frontend tests start that server
on a free port (`frontend/tests/backend.ts`) and point the http plugin at it.

## Routing

The shell, `frontend/app.ts`, declares its pages and puts one `+outlet` in its
template, where the page the route selects is rendered:

```ts
routing: {
  "/": { view: indexView, props: (s) => ({ pages: ... }) },
  "/dashboard": { component: dashboard, key: "dashboard" },
  "/about": { view: aboutView, props: (s) => ({ pages: s.menu }) },
  "/admin": { component: admin, key: "admin" },
  "*": { view: notFoundView },
}
```

The dashboard routes again below `/dashboard`, with its own tab bar and
`+outlet`, without knowing where it is mounted:

```ts
routing: {
  "/": { component: overview, key: "overview", name: "overview" }, // /dashboard
  "/shop": { view: shopView }, // /dashboard/shop
  "/billing": { view: billingView }, // /dashboard/billing
  "*": { view: notFoundView },
}
```

A tab's click sends `router.navigate("/shop")`; the framework turns it into
`/dashboard/shop` because the dashboard is a routed child. Its `href` is built
from `route.base` in the template, so copy-link works too.

- The shell has no handlers: `Component` wires a component with `routing` by
  default. `mounted` → `router.listen("routeChanged")`; `routeChanged` →
  `setRoute(payload)` stores the route and sends **`enter` / `leave`** to the
  pages that appear or go away. A page loads its data in `enter`: the shell has
  no table of pages.
- A link is a real `href` whose click is intercepted
  (`@click.prevent=navigate(item.path)`): copy-link and middle-click work, and
  a click goes through the router plugin without reloading the page. The
  `navigate` message needs no handler either: by default it becomes
  `router.navigate(url)`, relative to the component that receives it.
- The server answers any path without a file extension with the rendered
  page, so a direct load of `/admin` works, and arrives with its data.

More on nested routing in [framework/docs/routing.md](../framework/docs/routing.md).

## How the frontend uses pavlus

- Templates are `.pavlus` files next to their component; the `pavlus()` Vite
  plugin compiles them. There is one stylesheet, `frontend/styles.css`,
  imported by `main.ts`: the shadcn-style `.ui-*` classes copied from
  `lab/packages/ui_kit/styles`, plus a short app section at the end (a test
  builds the real bundle to make sure it is in).
- `overview.ts` declares its children once; the same name (`users`) is the
  embed in the template, the key in `children` and the key in the state.
  `users` is a **component value** in the state (`+{usersComponent}`), so the
  list/table switch swaps it.
- All effects are built with the plugin effectors (`store.set`, `http.request`,
  `router.navigate`, `log.info`), imported from
  `@service-laboratory/pavlus/plugins`.
- `frontend/main.ts` is the only place with side effects: it creates the
  plugins and the app, and `createApp({ mount: "#app" })` renders the shell. In the browser console `pavlus.store.getState()` and
  `pavlus.store.history` are available in development.

The frontend never calls the backend directly: components return
`http.request(...)` effects, the http plugin performs them, and the answer
comes back as a message (`loaded` / `failed`).

## Server-side rendering

A page request runs the same application on the server (`backend/ssr.ts`):

1. `renderPage(frontend, url, query)` creates the app with the store and an
   http plugin whose `fetch` calls the API handlers in-process, dispatches
   `routeChanged` with the requested location (so the right pages `enter` and
   load), waits for `http.settled()`, and returns the HTML of the shell's view
   (`renderToString`) and the state as JSON (`serializeState`; the component
   value `usersComponent` is serialized by its name in `components`).
2. `renderDocument(template, page)` puts the HTML inside `<div id="app">` of
   `index.html` and the state in `<script>window.__PAVLUS_STATE__ = ...` at
   the end of `<head>`.
3. In the browser `main.ts` starts the store from that state
   (`reviveState`) and `createApp({ mount: "#app" })` hydrates the markup:
   the DOM plugin attaches its listeners and ids to the nodes the server
   sent instead of rendering again, and nothing is loaded twice.

`frontend/entry-server.ts` is what the server renders with (the shell, its
initial state, `components`). In development `backend/server.ts` runs Vite in
middleware mode and loads it through `vite.ssrLoadModule`; `npm run build`
bundles it to `dist/server/entry-server.js` for `npm start`. The framework is
not bundled into it (`vite.config.ts`): Node imports it, so the server and the
frontend share one `Component` class. If rendering fails, the plain document
is sent and the app renders in the browser as before.

`backend/ssr.test.ts` renders the pages against Postgres;
`frontend/tests/hydrate.test.ts` renders one, hydrates it with `main.ts` and
checks that the nodes are kept, nothing is requested again, and clicks work.
More in [framework/docs/ssr.md](../framework/docs/ssr.md).
