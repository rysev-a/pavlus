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

## The idea: the repaint is a message

Nothing follows the state, and plugins never talk to each other — everything
goes through the application. A store write answers with a message carrying
`{ prev, next }` (the state before and after, only when the write landed),
and the application turns that answer into the repaint:

```ts
const paint = { onSuccess: "paint" } as const;

"users.loaded"(msg: Message): Effect[] {
  return [
    store.set("users", msg.payload.data, paint), // → the store answers
  ];
}

"paint"(msg: Message): Effect[] {
  const { prev, next } = msg.payload;
  return [dom.update(prev, next)]; // the dom plugin diffs prev → next
}
```

A state change alone paints nothing: a no-op write never answers, and a
handler that only asks for data (`submitForm`) writes nothing at all. The
`{ prev, next }` pair is frozen when the write lands, so the paints of one
batch chain exactly (S0→S1, then S1→S2) — every landed write paints.

## Run it

```sh
docker compose up -d     # Postgres (once)
npm run db:init          # schema + seed
npm run dev              # http://localhost:3000 — SSR + Vite hot reload
```

`npm test` runs against the real API and the real database (it reseeds the
development database first, and once more at the end).
