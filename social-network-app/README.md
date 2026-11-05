# social-network-app

Orbit (the ui-kit social network template) on a pavlus frontend, a plain node backend and Postgres.

## Backend

Plain `node:http` (no framework) over Postgres, run by Node itself (types stripped). `backend/api.ts` is a pure `handleApi(method, pathname, db, body, {token, params})` returning `{status, body}`; `backend/server.ts` adds the transport (Bearer header, JSON body, `dist/` + SPA fallback under `NODE_ENV=production`, graceful shutdown on SIGINT/SIGTERM).

- **Run.** `docker compose up -d`, copy `.env.example` to `.env`, `npm run db:init` (drops and recreates the `orbit` schema and seeds ~51k rows from the frontend `seedDb()`, a few seconds), `npm run dev:api` (port 3020). The server also creates and seeds the schema on the first request when it is missing.
- **Schema** (`backend/db/schema.sql`, Postgres schema `orbit`, so apps never collide): the 16 Db tables are normalized. Typed columns, `timestamp`/`date`, foreign keys with `ON DELETE` rules matching the template's delete plan (user and post cascades; community owner, artist with albums and album with songs are `RESTRICT`), CHECKs for enums, `interests`/`tags` as `text[]`, likes/members/playlist songs as ordered child tables, a frontend "0" (no wall, no song...) stored as `NULL`, indexes for walls/feeds, messages by conversation, songs by genre/artist/album, and trigram indexes for search when `pg_trgm` is available. `credentials` (scrypt) and `auth_sessions` (sha256 of the token) are extra tables.
- **Repository** (`backend/db/repo.ts`): maps rows to and from the Db shapes; writes are bulk `INSERT ... SELECT FROM unnest(...) ON CONFLICT`.
- **API.** Errors are `{error}` (`field` names the input when known): 400 validation, 401/403 guards, 404 unknown route or row, 405 wrong verb, 409 conflict (duplicate, broken link, still-referenced row).
  - `GET /api/health`; `POST /api/sync/{load,put,remove,replace,reset}` (open, one transaction per write; `put` upserts, `replace` and `reset` sign everyone out).
  - `GET /api/<table>?q=&sort=&dir=&page=&size=` and `GET|POST|PUT|DELETE /api/<table>/:id` for every Db table (names as in Db: `photoAlbums`...). Writes need a moderator or admin token (users: admin). Lists never show `passwordHash`.
  - `POST /api/auth/{register,login,logout}`, `GET /api/auth/me`: scrypt, Bearer tokens that live 7 days, banned users cannot sign in (and their tokens stop working). Seeded users have the demo password `orbit123`; their first sign-in upgrades the template's hash to a scrypt credential.
  - `GET /api/users/:id/profile`, `GET /api/feed?userId=&page=`, `GET /api/search/songs?q=&genre=&artist=&album=&page=`, `GET /api/leaderboard/:game`, and for admins `GET /api/admin/overview`, `GET /api/admin/users/:id/data`.
- **Tests.** `npm test` runs `tests/backend.test.ts` against a real Postgres (`TEST_DATABASE_URL` or `DATABASE_URL`, e.g. `postgres://app:app@localhost:5432/orbit`); without a database the database tests are skipped. Test files share the one database, so run them one at a time (`test.fileParallelism: false`).

## Frontend

The root (`app/app.ts`) is a thin pavlus `Component` that embeds the Orbit template (`ui-kit/frontend/templates/orbit-social`) full page, reusing the ui-kit styles, design, theming and blocks by relative import (nothing is copied).

- **Persistence over HTTP.** `frontend/http-backend.ts` is an `idb`-compatible `Backend` that talks to `/api/sync/{load,put,remove,replace}`; the template is unchanged. All tables are requested once on start (about 7.7 MB), with a loading state, and a failed load shows an error with "Try again" (a dedicated "server is offline" text when `/api/health` fails). The `session` table (who is signed in) stays in this browser's `localStorage`.
- **Real URLs** (`app/routes.ts`, `app/orbit-app.ts`): `/login`, `/register`, `/wall`, `/blog`, `/profile`, `/photos`, `/messages`, `/communities`, `/games`, `/music`, `/admin`, and `/<screen>/:id` for a user's wall/profile/photos, an article, a community or an admin user detail. `/` redirects to `/wall`. A signed-out visit to any screen goes to `/login?next=...` and returns there after sign-in. Unknown paths show a not-found page. The address bar, the `<a href>` navigation, back/forward and the document title (`Music · Orbit`) follow the screen.
- Dev: `npm run dev` (vite on 5175, `/api` proxied to the API on 3020). Build: `npm run build`. Tests: `npm test` (frontend tests use a stubbed `fetch`).
