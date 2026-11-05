# routing

`route(table, {trailingSlash})` is pure. Keys are `METHOD /path/:param/*`.

- ranking static > param > wildcard per segment, with backtracking; a better route that lacks the method yields to a worse one that has it
- results: `match {id, params, pattern}`, `not_found`, `method_not_allowed {allow}` (405), `options {allow}` (automatic), `redirect` (308, policy `redirect`), `bad_request` (bad percent escape)
- `HEAD` falls back to `GET`; trailing slash policy `ignore` (default) | `strict` | `redirect`; segments are split first and then percent-decoded (`%2F` stays inside a param); `*` is the rest of the path in `params["*"]`
- `createServerApp({ routes })` rewrites `http.request` into the route's message id (payload gets `params` and `route`) and answers 404/405/OPTIONS/308/400 itself. `routed(table)(msg)` is the same as a pure helper for a handler: it returns a `requests.dispatch` effect or the answering `http.respond`. `dispatchRoute(router, msg)` is the underlying pure function.
