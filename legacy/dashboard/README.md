# dashboard

The tiny pavlus example: one component, one template — a users list you can
load, create and edit. It shows the two ideas that set pavlus apart:

- **The view repaints only when the component says so.** `Dashboard` sets
  `updateDomOnStateChange = true`; `createApp` reads the flag and mounts the
  view with `followState`. Without the flag, nothing would ever touch the
  DOM — state-only components (services, data slices) are free to change
  state without repainting, and a view can be repainted on demand with the
  `dom.update` effect.
- **The store answers its writes.** `store.set(..., { onSuccess })` sends a
  message once the change really landed (never for a no-op). The create flow
  chains through it: `user.created` appends the user and asks the store to
  answer `users.changed`, and that message closes the form. The edit flow
  closes the form right in the handler — both styles, side by side.

## Run it

It uses the admin-app backend (the real JSON API over Postgres, port 3000):

```sh
cd admin-app
docker compose up -d     # Postgres (user admin / admin, db admin_app)
npm run db:init          # once: tables + 8 seeded users
npm run dev              # the API on http://localhost:3000
```

Then, in another terminal:

```sh
cd examples/dashboard
npm run dev              # vite on http://localhost:5173, /api proxied to :3000
```

## Test it

```sh
npm test
```

The test boots the real API on a free port over the real Postgres (the same
harness the admin-app tests use), reseeded to `backend/db/seed.sql`: it loads
the 8 seeded users, creates `edsger@example.com` through the form, edits it,
and cancels the form. Docker (Postgres) must be up.
