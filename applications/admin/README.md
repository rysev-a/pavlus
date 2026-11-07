# admin-app

The pavlus application, arranged the way the framework intends:

```
app/        the application — pure, isomorphic code:
            state.ts (data only; each page reads one slice),
            app.ts + app.pavlus (the shell: a sidebar, an outlet and a
            routing table), sidebar/ (the menu column, a view-only child),
            user-list/ (the users page, `/` — its rows an embedded child,
            user-list-row/), user-edit/ (`/:id/edit`), user-new/ (`/new`) —
            a component per folder: its own .pavlus template and .ts file,
            entry-server.ts (what the server loads)
frontend/   the browser shell: main.ts wires the plugins (store, dom, http,
            router, the devtools agent) and mounts the app into #app
backend/    the server, on @pavlus/backend: app.ts (the application — one
            pure function over the api/ modules), routes.ts (the route
            table), api/ (users/, roles/, reset/ — classes whose methods are
            the handlers of the messages with those ids, db effects in, http
            effects out; the pages module is the framework's PagesAPI),
            db/ (init/ — schema, seed, the reset statements; services/ —
            UserService, RoleService: static classes that build the db
            effects; pool.ts). The pages plugin, the flow fetch and the
            server render are the framework's too: @pavlus/backend's
            createPagesPlugin, createFlowFetch and @pavlus/backend/ssr
public/     the stylesheet — the ui-kit look (the shadcn "new-york" tokens and
            .ui-* classes, copied from ui-kit/frontend/styles.css)
tests/      the app over the real API on the real database, and the server render
```

`frontend` and `backend` are thin adapters: both run the same `app/`. The
browser mounts it and repaints on demand; the server runs it without a DOM
and renders the final state to HTML — answering with an `http.respond`
effect, like every other answer the server gives.

## Pages are routed children

There is no difference between the whole app and a component — they compose
hierarchically. The shell (`app.ts`) is a template with the sidebar and an
outlet, and a routing table; each page lives in its own folder and knows the
state key the shell gave it:

- `/` — `UserList`: the users table, a data table with selection and
  sorting. Its `enter` loads the users; a row's edit button and the header's
  "new user" navigate to their pages. The row itself is an embedded child
  (`+Row#row`, user-list-row/): the page passes its props per iteration and
  its events come back prefixed `row.` — the page handles the table's
  concerns (pick, edit, remove), the row's own component the star.
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

A child without a slice of its own composes the same way from the other
side: the table's row (user-list-row.ts) reads and writes beside its page
and lets the page paint — the row's DOM is part of the page's view (the
`+Row#row` embed renders it there), so its patches come out of the page's
diff, their ids walking the whole chain: the outlet (`/4`), the loop's key
(`#1`), the embed (`/38`), the row's own nodes.

## Run it

```sh
docker compose up -d     # Postgres (once)
npm run db:init          # schema + seed
npm run dev              # http://localhost:3000 — SSR + Vite hot reload
```

Production: `npm run build`, then `WORKERS=max NODE_ENV=production node
backend/server.ts` forks one process per core on the same port (keep one
worker in dev — every worker runs its own Vite).

`npm test` runs against the real API and the real database (it reseeds the
development database first, and once more at the end).
