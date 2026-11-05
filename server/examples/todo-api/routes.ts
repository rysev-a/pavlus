// The route table and what each route needs before its handler runs.
// Pure data: the router and the gate both read it.

export interface RouteMeta {
  /** The message id the router rewrites `http.request` into. */
  id: string;
  /** Needs a valid session. */
  auth?: boolean;
  /** Counts against the per-IP rate limit (default true). */
  limit?: boolean;
}

export const ROUTES: Record<string, RouteMeta> = {
  "GET /healthz": { id: "health.live", limit: false },
  "GET /readyz": { id: "health.ready", limit: false },
  "POST /signup": { id: "auth.signup" },
  "POST /login": { id: "auth.login" },
  "POST /logout": { id: "auth.logout", auth: true },
  "GET /me": { id: "auth.me", auth: true },
  "GET /todos": { id: "todos.list", auth: true },
  "POST /todos": { id: "todos.create", auth: true },
  "POST /todos/reorder": { id: "todos.reorder", auth: true },
  "GET /todos/:id": { id: "todos.get", auth: true },
  "PATCH /todos/:id": { id: "todos.update", auth: true },
  "DELETE /todos/:id": { id: "todos.remove", auth: true },
  "GET /events": { id: "stream.open", auth: true },
  "GET /slow": { id: "demo.slow" },
};

/** `{ "GET /todos": "todos.list", ... }` for `createServerApp({ routes })`. */
export const routeTable: Record<string, string> = Object.fromEntries(
  Object.entries(ROUTES).map(([pattern, meta]) => [pattern, meta.id]),
);

export const META: Record<string, RouteMeta> = Object.fromEntries(
  Object.values(ROUTES).map((meta) => [meta.id, meta]),
);
