# social-network-app

Orbit (the ui-kit social network template) on a pavlus frontend, a plain node backend and Postgres.

## Frontend

The root (`app/app.ts`) is a thin pavlus `Component` that embeds the Orbit template (`ui-kit/frontend/templates/orbit-social`) full page, reusing the ui-kit styles, design, theming and blocks by relative import (nothing is copied).

- **Persistence over HTTP.** `frontend/http-backend.ts` is an `idb`-compatible `Backend` that talks to `/api/sync/{load,put,remove,replace}`; the template is unchanged. All tables are requested once on start (about 7.7 MB), with a loading state, and a failed load shows an error with "Try again" (a dedicated "server is offline" text when `/api/health` fails). The `session` table (who is signed in) stays in this browser's `localStorage`.
- **Real URLs** (`app/routes.ts`, `app/orbit-app.ts`): `/login`, `/register`, `/wall`, `/blog`, `/profile`, `/photos`, `/messages`, `/communities`, `/games`, `/music`, `/admin`, and `/<screen>/:id` for a user's wall/profile/photos, an article, a community or an admin user detail. `/` redirects to `/wall`. A signed-out visit to any screen goes to `/login?next=...` and returns there after sign-in. Unknown paths show a not-found page. The address bar, the `<a href>` navigation, back/forward and the document title (`Music · Orbit`) follow the screen.
- Dev: `npm run dev` (vite on 5175, `/api` proxied to the API on 3020). Build: `npm run build`. Tests: `npm test` (frontend tests use a stubbed `fetch`).
