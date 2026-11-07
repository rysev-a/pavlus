# team-up (the port)

The [team-up](../..) service — profiles with skills, projects with role
slots, a computed two-way match, applications, friends and live chat —
re-implemented on the pavlus stack as a framework exercise: this is the
first app that runs the whole set — http, pg, crypto, **ws** (rooms,
identity at the handshake) and **redis** (pub/sub fanout across workers,
the online set, a notification queue) — end to end.

## Run it

```sh
docker compose up -d      # postgres :5434, redis :6380 (OrbStack)
npm run db:init           # the tables, the directory, the demo world
npm run dev               # http://localhost:3020/  (vite inside)
```

The demo world: six members (`ann|bob|clara|dmitry|elena|felix@team.up`,
password `teamup123`), three projects (orbit-labs, nord-hr, copy-boost),
bob's application, two friendships, two chats. Ann owns Orbit Labs and can
accept Bob — the slot fills, his application is accepted, the other pending
one declined, and he lands in the project's chat.

Production: `npm run build && npm start` (the `dist/` build, no Vite).

## The shape

```
backend/
  server.ts            the wiring: pg + crypto + redis + pages + ws + http,
                       the boot dispatch (chat.subscribe) and the notify tick
  app.ts               the pure application: the module list, first match wins
  routes.ts            "METHOD /path/:param" -> message id
  match.ts             the match, pure: computeMatch, bestBucket, byMatchDesc
  api/                 the modules — class methods ARE the message handlers
  db/
    pool.ts            the pg pool + the redis url
    init/              schema.sql, seed.sql (directory), seed.ts (the world)
    services/          static classes that build effects: db.select({...}),
                       redisEffector.set(...) — plain objects, no I/O
app/                   the frontend: a shell + five routed pages, pure
frontend/main.ts       the browser wiring: store, dom, http, router, ws
tests/                 the real API on a free port (backend.test.ts) and the
                       pure match (match.test.ts)
```

## The ideas it exercises

- **The match is computed, never stored** (`backend/match.ts`): the
  profession is a hard filter, the grade a soft comparison, the coverage the
  average of `min(mine/required, 1)` — every number explainable
  (`details: ["0/7", "6/6"]`).
- **Multi-step writes as chains of effects**: accepting an application is
  six steps (fetch, check the owner, set the status, fill the slot, decline
  the others, join the chat), each its own `db.execute`, each answering to
  its own continuation handler.
- **Every step's id is namespaced per flow** (`ProjectService.bySlug(slug,
  "apps.project")`): two modules re-reading a project must not hear each
  other's continuations — ids are unique across the whole application.
- **The live side**: a ws at `/ws` — the cookie of the upgrade request says
  who this is (frames carry nothing), the identity moves to redis
  (`ws:{connId}`), a `welcome` frame opens the protocol. A message is
  inserted once, then published to `team-up:chat`; every worker's
  subscription broadcasts it to the thread's room (`thread:{id}`).
- **The notification queue**: at send time one `SMISMEMBER team-up:online`
  decides who will not see it live; a job per offline member is `LPUSH`ed;
  a tick in server.ts pops one job and the drain chains itself until the
  queue is empty, inserting a `notifications` row per job.
- **Stateless workers**: `WORKERS=max node backend/server.ts` forks one
  process per core on one port — pub/sub makes the ws fanout equivalent on
  every worker, and `RPOP` hands each job to exactly one.
