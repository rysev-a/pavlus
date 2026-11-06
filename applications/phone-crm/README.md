# phone-crm-app

The Phone Retail CRM: the `ui-kit` template on a pavlus frontend, a plain
Node backend and Postgres.

## Backend

`node:http` with no framework (Node 22+ strips the TypeScript types itself),
Postgres through `pg`. The whole logic and seed data come from the ui-kit
template (`ui-kit/frontend/templates/phone-retail-crm/`): the backend imports
its `seedDb()`, `parseSnapshot`/`snapshotOf` and `stats.ts`.

```
backend/
  server.ts      node:http shell: JSON body, no CORS, dist/ + SPA fallback in production, graceful shutdown
  api.ts         pure handleApi(method, pathname, query, body, searchParams) -> {status, body}
  validate.ts    row validation (400 names the field)
  db/schema.sql  normalized schema in the Postgres schema `phone_crm`
  db/repo.ts     repository: the 11 Db tables <-> SQL (role_permissions, order_items are child tables)
  db/{pool,query,reset,init}.ts
```

Tables live in their own Postgres schema `phone_crm` (`search_path` is set per
connection), so they never collide with other apps in the same database. Foreign
keys mirror the delete guards of `entities.ts` (`ON DELETE RESTRICT`: role to
users, manufacturer to models, model to products, product to order items,
category to shops, user/shop to orders) and its cleanups (`CASCADE`: user to
sessions, permission to role_permissions; `SET NULL`: shop to budget, where
`NULL` is `shopId: 0` on the wire). `users.email`, `permissions.code` and
`products.sku` are unique.

### API

Row shapes on the wire are exactly the frontend `Db` rows; table names are the
`Db` keys (`users`, `shopCategories`, ...). Errors are `{error}` with 400
(validation, naming the field), 404, 405 or 409 (foreign key or unique conflict).

| Route                                                  |                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                      | `{ok, db}`                                                                                                                 |
| `POST /api/sync/load` `{tables?}`                      | `{data}`, rows ordered by id                                                                                               |
| `POST /api/sync/put` `{table, rows}`                   | `{saved}` upsert, one transaction                                                                                          |
| `POST /api/sync/remove` `{table, ids}`                 | `{removed}`                                                                                                                |
| `POST /api/sync/replace` `{data}`                      | `{rows}` clears everything, writes `data`                                                                                  |
| `POST /api/sync/reset`                                 | `{rows}` restores the seed                                                                                                 |
| `GET /api/<table>?q&sort&dir&page&size`                | `{rows, total, page, size}` (`q` searches the text columns, defaults page 1, size 20, max 200)                             |
| `POST /api/<table>`, `GET/PUT/DELETE /api/<table>/:id` | one row (the id is optional on create)                                                                                     |
| `GET /api/stats/orders`, `/api/stats/budget`           | month series of the last 12 months, status breakdown, top shops, totals (`?today=YYYY-MM-DD`, the demo's today by default) |
| `GET /api/export`, `POST /api/import`                  | the frontend `Snapshot`, validated with `parseSnapshot`                                                                    |

### Run

Postgres: `docker compose up -d` (user/password/db `app`/`app`/`phone_crm`), then
copy `.env.example` to `.env` (`DATABASE_URL`, `PORT`, default 3010).

```
npm run db:init      # drop + create + seed the phone_crm schema (also safe to re-run)
npm run dev:api      # API on :3010 with --watch (creates the tables and seeds an empty database itself)
npm start            # NODE_ENV=production: also serves dist/ (run `npm run build` first)
npm test             # vitest; the backend tests need Postgres and are skipped without it
npm run typecheck
```

The tests use `TEST_DATABASE_URL ?? DATABASE_URL` and **reset the `phone_crm`
schema** of that database, so do not point them at data you care about.

## Frontend

A standalone pavlus app that renders the ui-kit's Phone Retail CRM template full page.
The template, its blocks, styles and theming are imported from `../ui-kit/frontend` (nothing is copied);
only a small optional export was added there (`setScreenHrefs`, an optional `href` of a navigation item).

- `app/` is pure: `app.ts` (the shell: router + routed outlet), `crm.ts` (the template component made URL-aware:
  every screen is an address, forms are `/<screen>/new` and `/<screen>/<id>`, a failed load is an error with a retry),
  `routes.ts` (screen <-> path, document titles), `state.ts`.
- `frontend/` wires the plugins: `http-backend.ts` is an `idb`-compatible plugin whose `Backend` talks to
  `/api/sync/{load,put,remove,replace}` (same effects and replies as `createIdbPlugin`), `title.ts` sets `document.title`.
- Routes: `/` redirects to `/orders`; `/users /roles /permissions /sessions /manufacturers /models /products /shops /shops/map
  /shop-categories /orders /sales /budget /budget/entries /settings`, each list entity also `/<path>/new` and `/<path>/<id>`;
  anything else is the not-found screen. Navigation links are real `<a href>`; deep links work in dev and behind the production server's SPA fallback.
- If `/api` cannot be reached the page shows "The server is offline" with a Try again button instead of the data.

```sh
npm run dev:api   # API on :3010 (needs Postgres, see .env.example)
npm run dev       # vite on :5174, /api proxied to :3010
npm run build     # dist/, served by the backend with NODE_ENV=production
npm test          # vitest (jsdom): http-backend over a fake fetch, routes, the app booted on a stubbed fetch
```
