# runtime, ctx and routing

`createServerApp` wraps pavlus `createApp` with what a server needs around a pure `(message, state) -> effects` function.

```ts
const http = createHttpServerPlugin({ port: 3000 });
const server = createServerApp({
  app, // (message, state) => Effect[]
  plugins: [http, createWsServerPlugin({ http }), pg, redis],
  state: { config }, // + state.requests, state.shared
  routes: { "GET /users/:id": "user.get" },
  limits: { requestTimeoutMs: 10_000, maxMessagesPerRid: 500 },
});
process.on("SIGTERM", () => server.shutdown({ timeoutMs: 10_000 }));
```

## ctx.ts

- `Ctx { rid, conn, connId?, deadline?, ... }` rides on messages and effects (the core stamps effects; plugins reply with the effect's ctx).
- `reply(effect, {id, payload})` -> message with `effect.ctx`. `fail(effect, error)` -> message to `effect.onError` (or `undefined`).
- `newRid()` 12 url-safe chars, 72 random bits.
- `traceOf(rid)`: ring buffer (`createTraceBuffer({maxRids, maxEntries})`) of message ids and `plugin.type` of effects, plus `finished:<reason>` notes.

## What the runtime does

- **Tracking**: a rid exists from its first message until it finishes. It is finished by `request.done` (the http plugin sends it after the response is out; `{plugin:"requests", type:"done"}` sends it from the app), `http.aborted`, `request.timeout`, `ws.close` (all rids of that `connId`), the message budget, or shutdown. `conn !== "http"` rids (ws frames, jobs) also _settle_ by themselves once no effect with `replyTo`/`onError` is outstanding (`autoSettle`).
- **Cancel**: on finish, `plugin.cancel(rid)` is called for every plugin that received an effect for the rid (and the connection plugin). Then `state.requests[rid]` is dropped.
- **Deadline**: `ctx.deadline`, else `limits.requestTimeoutMs` (30 s). At the deadline `request.timeout` is dispatched with the ctx; if the app returns nothing, `defaultResponder` answers `504` for http. `http.stream.start` / `sse.start` (or any effect with `longLived: true`) lifts the deadline.
- **Late replies**: messages of finished rids are dropped and counted (`stats().discarded`); `request.done` is exempt.
- **Errors never crash the process**: an exception in the handler becomes `request.error {code, message, source, messageId}` with the ctx; if the app returns nothing for it, `defaultResponder` answers `500` (`defaultResponder: false` disables). A plugin exception goes to the effect's `onError` message if it has one, else to `request.error`. An effect for a missing plugin is a `request.error` too. Everything is also reported to `onError(error, info)` (default `console.error`).
- **Budget**: more than `limits.maxMessagesPerRid` (1000) messages for one rid -> `request.error {code:"message_budget"}` and the rid is cut off.
- **Shutdown**: `shutdown({timeoutMs})` calls `plugin.stop()` (reverse order: stop accepting), waits for in-flight rids, force-finishes the rest after the timeout, disposes plugins in reverse, awaits `plugin.closed()` (max 2 s). Idempotent.
- `stats()`: `active, timers, messages, effects, discarded, errors, timeouts, budgetExceeded, cancels, finished, forced` (use them to assert "nothing leaked").

A plugin joins the lifecycle by implementing the optional `ServerPlugin` members `cancel(rid)`, `stop()`, `closed()`.
