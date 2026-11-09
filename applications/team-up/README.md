# team-up (the port)

The [team-up](../..) service — profiles with skills, projects with role
slots, a computed two-way match, applications, friends and live chat —
re-implemented on the pavlus stack as a framework exercise: this is the
first app that runs the whole set — http, pg, crypto, **ws** (rooms,
identity at the handshake) and **redis** (pub/sub fanout across workers,
the online set, a notification queue) — end to end.

It is now a port of the **whole** original: the public site (the home, the
project catalog, the blog, the members directory, the about page, the 404)
and the signed-in app. The original's URLs are the port's URLs — the public
site at `/`, the app under `/app`.

```
/                     the public site (the original's header and footer)
/projects             the project catalog (the filters, the cards, the pager,
                      the star of a project, the saved searches)
/projects/:slug       a public project
/blog, /blog/:pid     the blog
/users, /users/:slug  the members directory and a member
/about                the about page
/startups             the old address of the catalog → /projects (a 301)
/app                  the app: the feed (the match)
/app/login            the login
/app/signup           the registration
/app/projects/new     a new project
/app/projects/:slug   a project of the app (the slots, the apply)
/app/chat             the messages (over ws)
/app/people/:slug     a profile of the app
/app/friends          the friends and the requests
/app/settings         the settings (the language, the letters, the password,
                      the e-mail address, the blocked people, the deletion)
/app/moderation       the safety page (the blocked people, the reports)
```

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
one declined, and he lands in the project's chat. The public world: the
blog of the original (six posts), a members directory (118 members) and a
project catalog (63 projects with their slots) — the seeds of the original.

Production: `npm run build && npm start` (the `dist/` build, no Vite).

## The shape

```
backend/
  server.ts            the wiring: pg + crypto + redis + pages + ws + http,
                       the boot dispatch (chat.subscribe) and the notify tick
  app.ts               the pure application: the module list, first match wins
  routes.ts            "METHOD /path/:param" -> message id
  match.ts             the match, pure: computeMatch, bestBucket, byMatchDesc
  i18n/                the Russian dictionary (the original's ru.rs) and Tr
  lib/                 the shared helpers: the pager, the query addresses,
                       the views (initials, the avatar hue, the dates)
  api/                 the modules — class methods ARE the message handlers
  db/
    pool.ts            the pg pool + the redis url
    init/              schema.sql, seed.sql (directory), seed.ts (the world)
    services/          static classes that build effects: db.select({...}),
                       redisEffector.set(...) — plain objects, no I/O
app/                   the frontend: a shell + the routed pages, pure
  site/                the header and the footer of the public site
  projects-hub/        the cabinet (`/app/projects`): my projects, the
                       applications and the invitations, the recommended ones
  person/              the member's page in the app (`/app/people/:slug`)
  apply-dialog/        the shared dialog of an application (a child of the
                       pages that show it)
  skill-tree/          the skill tree with the ten-segment meter (a child of
                       the pages that rate the skills)
frontend/main.ts       the browser wiring: store, dom, http, router, ws
tests/                 the real API on a free port (backend.test.ts) and the
                       pure match (match.test.ts)
PORTING.md             the contract the port follows (for the next feature)
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
- **Two layouts in one root**: the public site and the app are the same
  pavlus app with two shells — `shell.app` (written when the route changes)
  picks the header and the footer of the original or the nav of the app.
- **The language belongs to the server**: the `lang` cookie (the switch in
  the header writes it) picks the dictionary; the API answers the texts
  already translated, so the templates stay pure. A continuation that needs
  the language takes it from the request's slice — the db reply carries the
  rows, not the request.
- **The cabinet is one page with three tabs** (`app/projects-hub/`): the bar,
  the tab row and the panel of the tab are the same markup — three instances of
  one class, one slice, three addresses (`/app/projects`, `/app/projects/activity`,
  `/app/projects/match`). The tab is a route, so a deep link works.
- **The invitation lives on the slot** (the original's model): the slot holds
  the invitee (`user_id`), the inviter (`invited_by`) and the status `invited`;
  accepting it fills the team, declining it opens the slot again. Any member of
  the team may invite, the owner and the inviter may take the invitation back.
- **The relation is computed from the mirrored pairs** (`friendships` holds two
  rows per relation): `self`, `none`, `waiting`, `incoming`, `friends` — the
  page of the member shows the right button and the contacts only to the
  friends and to the member.
- **The tasks of the system** (`backend/api/tasks.ts`): the queue of the
  back office, its handlers (the cleanups) and its actions. Running a task is
  a chain too: it starts, the handler does its work, the row is finished.
- **The recommended tab is a filtered feed** (`GET /api/match/startups`): the
  text, the profession and the grade go to the backend as the query of the
  request, the ranking is server-side (the best percent first, the rest is
  reached by narrowing the search), and the "Apply" button opens the shared
  dialog on the openings that are still free.
- **The skill tree with the ten-segment meter** (`app/skill-tree/`): the
  branches of the directory's skills are collapsible, the leaves carry a
  rating (click a segment to set it, × to clear it, the pointer previews it).
  The same tree rates the skills of the profile and the requirements of an
  opening — the tree owns the ratings, the page saves them.
- **Trust and safety**: a member reports a person, a project or a message
  (the rate limit is ten a day), blocks a person (one-way: the blocked
  cannot write, ask or invite), and an administrator answers the queue in
  the back office (dismiss, cancel the project, remove the message, suspend
  the member).

