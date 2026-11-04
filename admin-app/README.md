# admin-app

The pavlus application, arranged the way the framework intends:

```
app/        the application — pure, isomorphic code:
            state.ts (data only), app.ts (the component, one handler per
            message), app.pavlus (the template), entry-server.ts (what the
            server loads)
frontend/   the browser shell: main.ts wires the plugins (store, dom, http,
            the devtools agent) and mounts the app into #app
backend/    the server: server.ts (plain node:http), api.ts (the JSON API
            over Postgres), ssr.ts (renders pages from the same app/ code),
            db/ (schema, seed)
tests/      the app over the real API on the real database, and the server render
```

`frontend` and `backend` are thin adapters: both run the same `app/`. The
browser mounts it and repaints on demand; the server runs it without a DOM
and renders the final state to HTML.

## The idea: the repaint is an effect

Nothing follows the state. A state change alone never touches the DOM —
a handler that changed something the user should see returns the repaint
next to the write:

```ts
"users.loaded"(msg: Message): Effect[] {
  return [
    store.set("users", msg.payload.data),
    dom.update(),          // the list paints now — because we asked
  ];
}
```

The effects run in order: the store replaces the state first, then the dom
plugin re-diffs the view against the state that already has the change. A
handler that only asks for data (`submitForm`) returns no `dom.update()`
at all — there is nothing to paint until the answer comes back as a new
message.

## Run it

```sh
docker compose up -d     # Postgres (once)
npm run db:init          # schema + seed
npm run dev              # http://localhost:3000 — SSR + Vite hot reload
```

`npm test` runs against the real API and the real database (it reseeds the
development database first, and once more at the end).
