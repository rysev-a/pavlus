# Testing

`import { flow, scenario, fakeHttp, fakeWs, request, connectWs, collector, startTestRedis } from "@pavlus/server/testing"`

The point of the design: the app is `(message, state) => effects`, so there are four levels of test, and the same handler goes through all of them.

| level | what runs                                           | what it proves                                         | cost         |
| ----- | --------------------------------------------------- | ------------------------------------------------------ | ------------ |
| 1     | the handler alone (`flow`, `scenario`)              | the business logic of a flow                           | microseconds |
| 2     | handler + real runtime + `fakeHttp` / `fakeWs`      | routing, ctx, cancellation, deadlines                  | milliseconds |
| 3     | handler + runtime + real plugins on real sockets/DB | that the plugins do what the app assumes               | tens of ms   |
| 4     | `traceOf(rid)` / counters on level 3                | the flow you read is the flow that ran; nothing leaked | free         |

The todo example (`examples/todo-api`) has levels 1, 3 and 4: `todo.scenario.test.ts`, `todo.e2e.test.ts`, `todo.trace.test.ts`.

## Level 1: `scenario`, no I/O

```ts
scenario(app, steps, { routes, state });
```

A step is one of:

- `{ send: Message }` inject a message (give it a `ctx`; with `routes`, an `http.request` is routed like in production);
- `{ expect: pattern | pattern[], reply?, error?, from?, exact? }` assert the effects produced by the previous step, then optionally answer one of them:
  - `reply: { payload }` answers the effect at `from` (default: the first matched) with a message whose id is the effect's `replyTo` and whose **ctx is the effect's ctx**, i.e. what the plugin would do;
  - `error: { code, message }` answers its `onError` instead (the effect must have one);
  - `exact: false` matches a _subsequence_, ignoring the other effects (useful to skip `log` and bookkeeping);
- `{ state: pattern }` assert (partially) the state.

Patterns are structural: plain values must be equal (note `3600` is not `"3600"`), `RegExp` for strings, predicates `(x) => boolean`, partial objects, exact-length arrays. A failure names the step and prints the effects that were produced:

```
scenario step 6: effect[1].args[4]: expected "3600", got 3600
  effects: [{"plugin":"requests","type":"req.merge", ...}, {"plugin":"redis","type":"cmd","args":["SET", ...]}]
```

`scenario` returns `{ state, effects }` (the effects of the last step) for further `expect`s. A few patterns from the example's tests:

```ts
// the rate limiter: over the limit asks Redis for the TTL, then answers 429
{ send: httpReq("POST", "/login", { body }) },
{ expect: [{ type: "req.merge" }, { plugin: "redis", args: ["INCR", "rl:203.0.113.9"] }],
  reply: { payload: 4 }, from: 1 },                         // the counter says 4, the limit is 3
{ expect: [{ type: "req.set", value: "retry" }, { plugin: "redis", args: ["TTL", "rl:203.0.113.9"] }],
  reply: { payload: 42 }, from: 1 },
{ expect: [{ plugin: "log", level: "warn" },
           { plugin: "http", status: 429, headers: { "retry-after": 42 } },
           { plugin: "log" }] },

// a transaction that must roll back, then answer: it never commits
{ expect: [{ type: "req.set", value: "renumber" }, { plugin: "pg", type: "query", tx: "tx1" }],
  error: { code: "40001", message: "could not serialize access" }, from: 1 },
{ expect: [{ plugin: "log", level: "error" }, { type: "req.merge" },
           { plugin: "pg", type: "tx.rollback", tx: "tx1" }], reply: { payload: { tx: "tx1" } }, from: 2 },
{ expect: [{ plugin: "http", status: 409 }, { plugin: "log" }] },
```

Things worth asserting that are awkward elsewhere and trivial here: the order of effects, that something was _not_ done (`expect(effects.some(e => e.type === "tx.commit")).toBe(false)`), that a secret never reaches the state (`JSON.stringify(state.requests)` does not contain the password), that a stale reply is ignored (send a `...failed` message when the slice is at `step: "rollback"`, expect `[]`).

`flow(handler, { state, routes })` is the lower-level tool: `send(msg)` returns the effects (ctx stamped, state effects applied) and `f.state` / `f.log` expose the rest. Use it for property-style tests or when the script is not a straight line.

Pure code needs no framework at all: validators (`validate.ts`) are tested with plain `expect`.

## Level 2: the real runtime, fake plugins

`fakeHttp()` and `fakeWs()` are in-memory plugins named `http` / `ws` that speak the same messages and use the same `normalizeRespond` as the real ones:

```ts
const http = fakeHttp();
const server = createServerApp({
  app,
  routes,
  plugins: [http, fakePg, fakeRedis],
});
const res = await http.request({ method: "GET", path: "/users/7" });
expect(res.status).toBe(200);
```

`http.inject(req)` also returns `{ rid, abort() }` (dispatches `http.aborted`), so cancellation and deadline behaviour can be tested without a socket. Writing a tiny plugin for your own effect (a function that replies with canned data) takes four lines (see `docs/examples/readme-app.test.ts`); `collector()` is a test dispatcher that records the messages a plugin sends and lets you `await next("id")`.

For the clock, `createTimePlugin({ clock: createFakeClock(t0) })` and `clock.advance(ms)`; a request deadline is just a timer, so deadline tests are instant.

## Level 3: real sockets, real Postgres, real Redis

```ts
const up = await stackAvailable();            // Postgres reachable && redis-server on PATH
describe.skipIf(!up)("end to end", () => { ... });
```

`examples/todo-api/testkit.ts` shows the shape: `startTestRedis()` (a throwaway `redis-server` on a free port), a unique Postgres schema per run (`-c search_path=...` in the pool config, dropped at the end), and as many server instances as you like on port 0. `request({ port }, { method, path, body })` is a real-socket client (objects are sent as JSON), `connectWs({ port }, path)` is a hand-rolled websocket client, and a raw `node:http` request can be `destroy()`ed to be a client that hangs up. With the local database: `DATABASE_URL=postgres://admin@127.0.0.1:54329/postgres` (start it with `pg_ctl` if it is down); the tests skip themselves when it or `redis-server` is missing.

Two instances sharing one database and one Redis (as two pods would) test what a single instance cannot: a session created on A accepted on B, a write on A arriving on B's event stream through pub/sub.

### Assert on counters, not on sleeps

The runtime and plugins expose counters so "nothing leaked" is an assertion:

```ts
await waitFor(
  () => A.pg.metrics().cancelled > before.cancelled,
  "query cancelled",
);
await waitFor(() => server.stats().active === 0 && server.stats().timers === 0);
expect(A.pg.metrics().txOpen).toBe(0);
expect(A.http.stats()).toMatchObject({ timers: 0, heartbeats: 0 });
```

The abort test of the example: a client requests `/slow?ms=20000`, the test waits until Postgres really reports an active `pg_sleep`, destroys the socket, then waits for `pg.metrics().cancelled` to grow and asks `pg_stat_activity` that **no `pg_sleep` is still running**. The timeout test does the same with `requestTimeoutMs: 300` and a `504`. The concurrency test signs up 50 users (split over two instances), each creating todos concurrently, and checks every user sees exactly their own.

`waitFor(cond, what)` polls with a deadline and names what it waited for; there is no fixed `sleep` in the assertions that matter.

## Level 4: traces

```ts
const rid = res.headers["x-request-id"]; // the rid, echoed by the http plugin
console.log(traceOf(rid));
```

`traceOf(rid)` is the ordered list of the messages the app handled and the effects it returned, with timestamps. `todo.trace.test.ts` prints it for one login and asserts its shape:

```
traceOf("szAQxmEh-KBf")  POST /login -> 200
   0ms  message http.request
   0ms  note    route:auth.login
   0ms  effect  requests.req.merge
   0ms  effect  redis.cmd                 INCR rl:<ip>
   1ms  message gate.counted
   1ms  effect  requests.req.set
   1ms  effect  pg.query                  select the user
   2ms  message auth.login.found
   2ms  effect  crypto.verify
   5ms  message auth.login.verified
   5ms  effect  crypto.randomToken
   5ms  message auth.login.token
   5ms  effect  redis.cmd                 SET sess:<token> EX
   6ms  message auth.login.stored
   6ms  effect  log.log
   6ms  effect  http.respond
   6ms  message request.done
   7ms  note    finished:request.done
```

(The comments on the right are added here.) The same rid is on every structured log line, so `grep rid` over the logs and `traceOf` tell the same story; the e2e suite asserts that the log lines of a request are exactly `["signup", "response"]` and that the password appears in no log line.

## Testing a plugin

See [plugins.md](plugins.md): a plugin is tested by handing it an effect and a `collector()` dispatcher, no runtime needed.
