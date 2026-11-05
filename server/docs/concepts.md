# Concepts

Nine ideas. Everything else in pavlus-server is a consequence of them.

## 1. Messages

```ts
interface Message {
  id: string;
  payload?: unknown;
  ctx?: Ctx;
}
```

A message is something that _happened_. The handler (`app`) is called once per message: `(message, state) => Effect[]`. Message ids come from two places:

- **plugins**, named `plugin.thing`: `http.request`, `http.aborted`, `ws.open`, `ws.message`, `ws.close`, `request.timeout`, `request.done`, `request.error`;
- **you**, as the `replyTo`/`onError` of an effect you returned. By convention `<feature>.<flow>.<step>`: `auth.login.found`, `todos.reorder.locked`. The id is the name of the _next step_ of the flow.

The router (`routes: { "GET /users/:id": "user.get" }`) rewrites `http.request` into the route's own message (`user.get`, payload gets `params` and `route`) and answers 404/405/OPTIONS/308/400 itself, so the app only sees requests that matched.

## 2. Context and the rid

```ts
interface Ctx {
  rid: string; // request id, minted by the plugin that accepted the connection
  conn: "http" | "ws" | "job" | string;
  connId?: string; // websocket connection (one rid per inbound frame)
  deadline?: number; // absolute ms since epoch
  requestId?: string; // the client's X-Request-Id, echoed
}
```

- The `rid` is server-minted (72 random bits, never taken from the client), so a client cannot guess or collide with another request.
- **The runtime stamps the ctx of the message being handled onto every effect the handler returns** (`effect.ctx ??= message.ctx`). A handler may also set `ctx` on an effect explicitly to act on another request (the example ends open event streams that way at shutdown).
- A plugin that finishes an effect replies with the effect's ctx. One convention, in `ctx.ts`, for every plugin:

```ts
dispatch(reply(effect, { id: effect.replyTo, payload })); // explicit id
deliver(dispatch, ok(effect, payload)); // to replyTo; nothing if fire-and-forget
deliver(dispatch, fail(effect, error, "pg.error")); // to onError, else the fallback id
```

`fail` normalises anything into `{ code, message, ... }`. The fallback id (`pg.error`, `redis.error`, `fetch.error`, `crypto.error`) is how a failure of an effect that named no `onError` still reaches the app instead of vanishing.

- Why this matters: a server interleaves thousands of requests in one process. With the ctx on every message the answer from Postgres lands in the handler _with the rid of the request that asked_, and `http.respond` finds the right socket by it.
- For websockets each inbound frame gets its own `rid` plus the connection's `connId`. Per-connection data (who is this socket) lives in `state.shared` keyed by `connId`; per-frame data lives in the frame's `rid` slice.
- Jobs started by the `time` plugin's cron get a fresh `rid` (`job:<id>:<time>`, `conn: "job"`).

## 3. Effects

```ts
{ plugin: "pg", type: "query", sql, params, replyTo: "loaded", onError: "failed", ctx? }
```

An effect is a request to a plugin, as plain data. It names the plugin and the operation and, if it expects an answer, the message ids for success (`replyTo`) and failure (`onError`). Each plugin ships an _effector_ object with typed builders (`pgEffector.query`, `redisEffector.incr`, `httpEffector.json`, ...) so the handler reads like a script.

A handler may return several effects; they are performed in order, and independent ones run concurrently (the Postgres read and the Redis `SET` of a cache fill, say). To _join_ parallel answers use the request slice (`/readyz` in the example waits for a `pg` and a `redis` check).

An effect for a plugin that is not installed does not crash: the runtime reports it and dispatches `request.error`.

## 4. Plugins

A plugin owns a piece of the world and a set of effects: `http` owns sockets, `pg` owns a connection pool. Its contract is small (see [plugins.md](plugins.md)): `handle(effect, ctx)`, plus optional `cancel(rid)`, `stop()`, `closed()`, `dispose()`. A plugin never calls the app; it _dispatches messages_ and the runtime queues them. Because the dispatch is the only way back in, everything a plugin does is visible as a message and a trace entry.

The app never imports a driver. That is what lets the same handler run on fakes.

## 5. State slices

```ts
state = { requests: { [rid]: {...} }, shared: {...}, ...yourRootKeys };
```

- `state.requests[rid]` exists from the first message of a request until it ends. It is the place for "what this flow knows so far": the user id after authentication, the transaction id, `step`.
- `state.shared` is process-wide (readiness flag, open streams by rid, websocket connections by connId).
- Your own root keys come from `createServerApp({ state: { config } })` and are read-only config by convention; `state.set` exists as an escape hatch.
- The handler never assigns. It returns `rq.set(path, value)`, `rq.merge(obj)`, `rq.clear()`, `rq.sharedSet/sharedMerge/sharedRemove(path, ...)` and the `requests` plugin applies them _after the handler returned_. So within one call the state you read is the state at the call; your writes are visible to the next message of the flow. Writes for a rid without a slice are ignored, so a late effect of a finished request cannot resurrect it.
- The `requests` map is updated in place (each slice is replaced, never mutated). Copying a map of hundreds of in-flight requests on every write cost more than the rest of the request; read `state.requests[rid]` when handling, do not hold on to the map.

**Flows as state machines.** A multi-step flow keeps `step` in its slice and each continuation first checks it:

```ts
const r = at(state, msg, "verify"); // the slice only if step === "verify"
if (!r) return []; // a stale or duplicate reply is dropped, not acted on
```

This turns "what if the reply comes twice" and "what if the error arrives after the rollback started" into one line. The login and `reorder` flows of the example use it.

## 6. Cancellation

The runtime knows, per `rid`, which plugins received an effect for it. When the request _finishes_ it calls `plugin.cancel(rid)` on each of them:

| plugin | what `cancel(rid)` does                                                            |
| ------ | ---------------------------------------------------------------------------------- |
| pg     | `pg_cancel_backend` for running queries, rolls back transactions the rid left open |
| redis  | drops queued commands, removes the rid's subscriptions                             |
| fetch  | aborts the request (and a retry back-off wait)                                     |
| time   | clears the rid's timers                                                            |
| http   | ends a stream, or answers 504 if the request is over and nobody answered           |
| crypto | discards the answer                                                                |

A rid finishes when: `request.done` (the http plugin sends it after the response is out), `http.aborted` (the client closed first), `request.timeout`, `ws.close` (all rids of that `connId`), the message budget, or shutdown. Frames and jobs (`conn !== "http"`) also settle by themselves once nothing they wait for is outstanding.

After that, **late replies are discarded** and counted (`stats().discarded`). The consequence the tests check by counters: a client that hangs up mid-query leaves no running query, no open transaction and no timer.

## 7. Deadlines

`ctx.deadline` is an absolute time: the http plugin sets `now + limits.requestTimeoutMs` (default 30 s), a handler or another plugin may set an earlier one. Three things use it:

- the runtime arms one timer per rid; at the deadline it dispatches `request.timeout` with the ctx, and if the app returns nothing the default responder answers `504`;
- `pg`, `redis` and `fetch` shorten their own timeouts to the time left (and a deadline already in the past fails without touching the database);
- `http.stream.start` / `http.sse.start` (or any effect with `longLived: true`) lifts the deadline: an event stream is meant to live.

The app owns the policy: handle `request.timeout` to log it and answer in your own format.

## 8. Errors

Nothing a request does can crash the process:

- an exception in the handler becomes `request.error { code, message, source, messageId }` with the ctx; if the app returns nothing for it, `500` for http;
- an exception in a plugin goes to the effect's `onError` if it has one, else to `request.error`;
- an effect error reaches the app as the payload of its `onError` message: `{ code, message }` (for Postgres `code` is the SQLSTATE: `23505` unique violation, `40001` serialization failure, `57014` cancelled/timeout; for Redis the error word or `TIMEOUT`, `CONNECTION`);
- a request that produces more than `limits.maxMessagesPerRid` (1000) messages is cut off with `request.error { code: "message_budget" }`: a loop in a flow cannot spin the server;
- every isolated exception is also reported to `onError(error, { rid, source, messageId })`.

Policy is yours: the example treats the rate limiter as fail-open (Redis down must not take the API down), the session check as fail-closed (503), a broken cache as a miss, and a failure after a committed write as a logged warning.

## 9. Shutdown

`server.shutdown({ timeoutMs })`:

1. `plugin.stop()` in reverse order (the listener first): no new connections; keep-alive sockets close, in-flight responses finish with `Connection: close`;
2. wait for in-flight rids up to the timeout, then force-finish the rest (`stats().forced`);
3. dispose plugins in reverse order (rolls back open transactions, closes pools) and await each `plugin.closed()` (max 2 s).

It is idempotent. Plugins are listed in dependency order (`[log, crypto, pg, redis, ws, http]`) so the front door closes first and the database last. Long-lived streams do not drain by themselves, so the example's `main.ts` first dispatches `app.drain` (readiness flips to 503, event streams end), waits a moment for the load balancer, and only then calls `shutdown`.

## The single dispatch queue

All messages are handled one at a time, on one thread, in arrival order, by a function that must not block. That is what makes the app deterministic and testable, and it is also the limit on CPU-bound work: see [comparison.md](comparison.md#cpu-bound-work-and-the-single-dispatch-queue).
