# pavlus-server

A backend where **the application is one pure function** and everything that touches the world (sockets, Postgres, Redis, timers, `fetch`, password hashing, logs) is a **plugin**.

```
(message, state) => effects
```

A request is a _flow_: socket -> app -> database -> app -> cache -> app -> socket. Every arrow is a plain value, so a whole business flow can be tested with no network, no database and no clock. And because every message and every effect carries the request id (`rid`), you can follow any request through the whole system.

## The idea on one screen

```
 client     http plugin          app (pure)            pg plugin        redis plugin
   |  GET /users/7  |                |                      |                 |
   |--------------->| mints rid=k3Zq |                      |                 |
   |                |-http.request-->|  ctx{rid:k3Zq}       |                 |
   |                |   (routed:     |                      |                 |
   |                |   user.get)    |-- pg.query --------->| select ... 7    |
   |                |                |   ctx{rid:k3Zq}      |                 |
   |                |                |<-- loaded -----------| rows            |
   |                |                |   ctx{rid:k3Zq}      |                 |
   |                |                |-- redis.incr ------------------------>| INCR views:7
   |                |                |   ctx{rid:k3Zq}                       |
   |                |                |<-- counted ---------------------------| 42
   |                |                |   ctx{rid:k3Zq}                       |
   |                |<-http.respond--|  {json:{id:7,views:42}}               |
   |<---- 200 ------|  (finds the    |                                       |
   |                |   socket by    |                                       |
   |                |   rid k3Zq)    |                                       |
```

Three rules make this work:

1. **The context rides on the message.** A plugin that accepts a connection mints a `rid` and dispatches the first message with `ctx = { rid, conn, deadline, ... }`. The runtime copies the `ctx` of the message being handled onto every effect the app returns. A plugin that finishes an effect answers with a message that carries the effect's `ctx` (`reply(effect, ...)`). So the answer from Postgres arrives in the app _with the same `rid`_, and `http.respond` finds the right socket by that `rid`. The handler never threads an id by hand.
2. **Plugins do the I/O, the app returns data.** `pg.query(...)`, `redis.incr(...)`, `http.json(...)` are plain objects (`{ plugin: "pg", type: "query", sql, params, replyTo, onError }`). Nothing happens until a plugin handles them.
3. **State is a slice, not a variable.** `state.requests[rid]` is the memory of one request (created with its first message, dropped when it ends); `state.shared` is process-wide. The app changes them with effects (`rq.set(...)`) so a flow can be written as a state machine (`step: "verify"`).

## The whole app

This is the app of the diagram (imports omitted; the file is `docs/examples/readme-app.ts` and it is tested):

```ts
export const routes = { "GET /users/:id": "user.get" };
const ask = (replyTo: string) => ({ replyTo, onError: "failed" });

export const app = (msg: Message, state: ServerState): Effect[] => {
  const p = msg.payload as any;
  const mine = state.requests[msg.ctx?.rid as string] as any;
  switch (msg.id) {
    case "user.get":
      return [
        pg.query(
          sql`select * from users where id = ${p.params.id}`,
          ask("loaded"),
        ),
      ];
    case "loaded":
      return p.rows[0]
        ? [
            rq.set("user", p.rows[0]),
            redis.incr(`views:${p.rows[0].id}`, ask("counted")),
          ]
        : [http.json({ error: "not found" }, 404)];
    case "counted":
      return [http.json({ ...mine.user, views: p })];
    case "failed":
      return [
        log.error("dependency failed", { error: p }),
        http.json({ error: "unavailable" }, 503),
      ];
  }
  return [];
};
```

Wiring it to the real world is a list of plugins:

```ts
import {
  createServerApp,
  createHttpServerPlugin,
  createPostgresPlugin,
  createRedisPlugin,
  createLogPlugin,
} from "pavlus-server";

const server = createServerApp({
  app,
  routes,
  plugins: [
    createLogPlugin(),
    createPostgresPlugin({ url: process.env.DATABASE_URL }),
    createRedisPlugin({ url: process.env.REDIS_URL }),
    createHttpServerPlugin({ port: 3000 }),
  ],
});
process.on("SIGTERM", () => server.shutdown({ timeoutMs: 10_000 }));
```

## Testing it with no I/O

`scenario` plays a flow: inject a message, assert the effects the handler returned, answer one of them with a scripted reply (it gets the same `ctx`, so the same `rid`), assert the next effects.

```ts
scenario(
  app,
  [
    {
      send: {
        id: "http.request",
        ctx,
        payload: { method: "GET", path: "/users/7" },
      },
    },
    {
      expect: [
        { plugin: "pg", sql: /from users where id = \$1/, params: ["7"] },
      ],
      reply: { payload: { rows: [{ id: 7, name: "Ann" }] } }, // what Postgres would say
    },
    {
      expect: [
        { type: "req.set" },
        { plugin: "redis", args: ["INCR", "views:7"] },
      ],
      reply: { payload: 42 },
      from: 1, // answer the second effect
    },
    {
      expect: [
        {
          plugin: "http",
          type: "respond",
          json: { id: 7, name: "Ann", views: 42 },
        },
      ],
    },
  ],
  { routes },
);
```

No server, no database, no mocks of a driver, no timers: it runs in microseconds, and it fails with the step number and the effects that were actually produced. Errors are as easy as successes (`error: { code: "ECONNREFUSED", ... }` answers the effect's `onError`).

The same handler then runs unchanged on real sockets, a real Postgres and a real Redis. The example application in [`examples/todo-api`](examples/todo-api) is written only this way and is tested at both levels.

## What is in the box

| plugin               | factory                                         | effect builders                        |
| -------------------- | ----------------------------------------------- | -------------------------------------- |
| http server          | `createHttpServerPlugin({ port })`              | `httpEffector` (respond, SSE, streams) |
| websocket (RFC 6455) | `createWsServerPlugin({ http })`                | `wsEffector` (send, broadcast, rooms)  |
| Postgres             | `createPostgresPlugin({ url })`                 | `pgEffector` + `sql` tag (tx, migrate) |
| Redis (own client)   | `createRedisPlugin({ url })`                    | `redisEffector` (any command, pub/sub) |
| fetch                | `createFetchPlugin()`                           | `fetchEffector`                        |
| time                 | `createTimePlugin()`                            | `timeEffector` (timers, cron)          |
| log                  | `createLogPlugin()`                             | `logEffector` (+ metrics)              |
| crypto               | `createCryptoPlugin()`                          | `cryptoEffector` (scrypt hash, tokens) |
| request/shared state | `createRequestsPlugin()` (added by the runtime) | `requestsEffector`                     |

One runtime, `createServerApp({ app, plugins, routes, state, limits })`, adds what a server needs around a pure function: per-`rid` tracking, **cancellation** (a client that hangs up cancels its running query), **deadlines**, late replies discarded, errors isolated (a throwing handler is a `500`, never a crash), a message budget per request, and **graceful shutdown**. `traceOf(rid)` gives the ordered messages and effects of any request.

## Read next

- [docs/concepts.md](docs/concepts.md): messages, ctx and rid, effects, plugins, state slices, cancellation, deadlines, errors, shutdown.
- [docs/testing.md](docs/testing.md): `flow`, `scenario`, fakes, real sockets, leak counters, traces.
- [docs/plugins.md](docs/plugins.md): writing your own plugin (the contract, a worked example, its test).
- [docs/comparison.md](docs/comparison.md): an honest comparison with Express, Fastify, NestJS, Phoenix and Go-style services, with benchmark numbers.
- [docs/runtime.md](docs/runtime.md) and [docs/routing.md](docs/routing.md): reference. Each plugin has a README in `src/plugins/<name>/`.
- [DESIGN.md](DESIGN.md): the original design note.

Run the example: `DATABASE_URL=... REDIS_URL=... PORT=3000 node examples/todo-api/main.ts` (Node 22.18+ runs the TypeScript directly). Tests: `npx vitest run` (the end-to-end tests are skipped when the local Postgres or `redis-server` are missing).
