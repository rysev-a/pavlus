# @pavlus/backend: the backend with the same ideology

Yes: the pavlus idea (the whole application is a pure function `(message, state) -> effects`, and plugins do all the I/O) is a better fit for a server than for a browser. A request is a *flow*: socket -> app -> database -> app -> redis -> app -> socket. Each arrow is a message or an effect, every step is a plain value, so a whole business flow can be tested without a network, a database or a clock.

## The one new idea: context rides on the message
A server handles thousands of interleaved requests, so every message carries a **context**:

```ts
interface Message { id: string; payload?: unknown; ctx?: Ctx }
interface Ctx { rid: string; conn: "http" | "ws" | "job" | string; connId?: string; deadline?: number; [k: string]: unknown }
```
* A plugin that accepts a connection mints the `rid` (a request id; for a websocket, one `rid` per connection plus one per inbound frame `rid` + `connId`) and dispatches the first message with `ctx`.
* The runtime **stamps the context of the message being handled onto every effect it returns** (`effect.ctx ??= message.ctx`). The handler never threads the id by hand.
* A plugin that finishes an effect replies with `dispatch(reply(effect, { id: effect.replyTo, payload }))` (or `deliver(dispatch, ok(effect, payload))`), which copies the effect's `ctx` onto the reply. So the answer from Postgres arrives in the handler *with the same `rid`*: the flow continues exactly where it was. This is the "by requestId I know which connection it is" part.
* Which connection a `rid` belongs to is plugin knowledge (http plugin: the `ServerResponse`; ws plugin: the socket). The app only says `http.respond` / `ws.send` and the plugin finds the connection through `effect.ctx.rid` / `connId`.

No other change to pavlus is needed: `createApp` gets an additive `ctx` stamping step; everything else is plugins.

## State
State is data owned by a plugin, as in the browser (the `store` plugin). The server adds the **request slice**: the `requests` plugin keeps `state.requests[rid]` (created on the first message of a request, deleted when its connection ends or on `request.done`) and exposes pure effects `req.set(path, value)` / `req.merge(obj)`. A handler reads `state.requests[msg.ctx.rid]` and `state.shared`. Flows can therefore be written as small state machines (`state.requests[rid].step`).

## Standard messages and effects (names are the contract)
http plugin (`createHttpServerPlugin({ port, host, limits })`)
* in:  `http.request` payload `{ method, path, query, headers, params: {}, body, ip }` (body parsed by content-type: json, urlencoded, text, raw Buffer; size limit), `http.aborted` (client went away before respond), `http.listening`.
* out: `http.respond {status?, headers?, body?, json?, text?, html?, redirect?, cookies?}`, `http.stream.start/chunk/end` (SSE and downloads), `http.header`, `http.close`.
ws plugin (`createWsServerPlugin({ http })` shares the http server for upgrades; hand-written RFC6455 framing, no deps)
* in: `ws.open {path, query, headers}`, `ws.message {data, binary}`, `ws.close {code, reason}` (ctx has `connId`)
* out: `ws.send {connId?, data}`, `ws.broadcast {room, data, except?}`, `ws.join {room}`, `ws.leave {room}`, `ws.close {code, reason}`, `ws.ping`.
postgres plugin (`createPostgresPlugin({ pool|url })`, node-postgres is allowed as a dependency)
* out: `pg.query {sql, params, replyTo, onError}` replies `{rows, rowCount}`; `pg.tx.begin {replyTo}` replies `{tx}` then `pg.query {tx, ...}`, `pg.tx.commit {tx, replyTo}`, `pg.tx.rollback {tx}`; transactions not finished when the request ends are rolled back automatically; statement timeout from `ctx.deadline`; errors are replies to `onError` with `{code, message, constraint?}`.
redis plugin (`createRedisPlugin({ url })`, own RESP2/3 client over node:net, no dependency)
* out: `redis.cmd {args:[...], replyTo, onError}` (any command), typed helpers `get/set(ex,nx)/del/incr/expire/hget/hset/lpush/rpop/...`, `redis.pipeline`, `redis.subscribe {channel, onMessage}` / `redis.unsubscribe` / `redis.publish`; reconnect with backoff; cancel on request end.
time plugin: `timer.after {ms, replyTo}`, `timer.every`, `timer.cancel`, cron expressions for jobs (`job` conn). A request deadline is just a `timer.after` replying `request.timeout`.
fetch plugin: `fetch.request {url, method, headers, body, replyTo, onError, timeoutMs}` using node fetch with AbortSignal.
log plugin: `log {level, msg, fields}`; every line gets `rid`. Runtime also keeps an in-memory **trace ring buffer per rid** (message ids and effect types in order) retrievable with `traceOf(rid)`.

## Cancellation and lifetime
Effects emitted for a `rid` are tracked by the runtime. When the connection closes (`http.aborted`, `ws.close`) or the request is finished (`request.done`, or `http.respond` completed for http), the runtime calls `plugin.cancel(rid)` on every plugin that has in-flight work for it (queries get `AbortSignal`/`pg_cancel_backend`, redis awaits are dropped, timers cleared, transactions rolled back). Replies for a cancelled `rid` are discarded. Messages that arrive for a `rid` after it is done are dropped and counted.

## Testing (the payoff)
`server/src/testing`: `flow(handler, { state })` runs `send(msg)` and returns the stamped effects; `scenario([...steps])` plays `expect effect X -> inject reply Y` scripts, so a whole flow (`http.request` -> `pg.query` -> `redis.cmd` -> `http.respond`) is asserted with no I/O; `fakePlugins()` give in-memory pg/redis/http for integration-style tests; property: the same handler runs unchanged against the fakes and the real plugins.

## Package layout
`server/src/`: `ctx.ts` (types + `reply`, `traceOf`), `runtime.ts` (`createServerApp({ app, plugins })` wraps pavlus `createApp` with ctx stamping, per-rid tracking, cancel, shutdown), `plugins/{http,ws,postgres,redis,time,fetch,log,requests}/`, `routing.ts` (pure `route(table)`: `GET /users/:id` -> message id + params, no side effects), `testing/`, `mod.ts`; `examples/` (a todo API with auth, redis rate-limit + cache, postgres, a websocket chat), `docs/`.
