# admin-app

The pavlus application, arranged the way the framework intends:

```
app/        the application — pure, isomorphic code:
            state.ts (data only; each page reads one slice),
            app.ts + app.pavlus (the shell: a sidebar, an outlet and a
            routing table), sidebar/ (the menu column, a view-only child),
            user-list/ (the users page, `/`), user-edit/ (`/:id/edit`),
            user-new/ (`/new`) — a component per folder: its own .pavlus
            template and .ts file, entry-server.ts (what the server loads)
frontend/   the browser shell: main.ts wires the plugins (store, dom, http,
            router, the devtools agent) and mounts the app into #app
backend/    the server: server.ts (plain node:http), api.ts (the JSON API
            over Postgres), ssr.ts (renders pages from the same app/ code),
            db/ (schema, seed)
tests/      the app over the real API on the real database, and the server render
```

`frontend` and `backend` are thin adapters: both run the same `app/`. The
browser mounts it and repaints on demand; the server runs it without a DOM
and renders the final state to HTML.

## Pages are routed children

There is no difference between the whole app and a component — they compose
hierarchically. The shell (`app.ts`) is a template with the sidebar and an
outlet, and a routing table; each page lives in its own folder and knows the
state key the shell gave it:

- `/` — `UserList`: the users table, a data table with selection and
  sorting. Its `enter` loads the users; a row's edit button and the header's
  "new user" navigate to their pages.
- `/new` — `UserNew`: an empty form, written by its `enter`.
- `/:id/edit` — `UserEdit`: its `enter` fetches that user and fills the form.

Saving and cancelling navigate back to `/`, which re-enters and reloads
itself. The shell only owns the route, the sidebar's menu and the role
catalogue (passed to the forms as a prop); the sidebar is a view-only child —
its `navigate` clicks fall through to the framework's default.

## The idea: components paint themselves

Every store write that changed anything answers `paint` with the states
around it (`{ prev, next }`). A page diffs its own slice — the answer
arrives already sliced — and returns the patches with no target; the
outlet's boundary scopes them to where the page renders, so they land on
the right nodes of the one mount. The shell paints the same way for what
only it can see: the route itself (a route change swaps the outlet's page)
and the role catalogue.

```ts
// user-list/user-list.ts — slice `list`:
paint(msg: Message): Effect[] {
  const { prev, next } = msg.payload as { prev: ListState; next: ListState };
  return [DomPlugin.update(view.diff(prev, next))]; // ids relative to itself
}
```

The dom plugin still never reads the state: it mounts, and applies the
patches it is given.

## Run it

```sh
docker compose up -d     # Postgres (once)
npm run db:init          # schema + seed
npm run dev              # http://localhost:3000 — SSR + Vite hot reload
```

`npm test` runs against the real API and the real database (it reseeds the
development database first, and once more at the end).
