# pavlus-server compared, honestly

pavlus-server is a young, small framework built around one bet: **the application is a pure function from messages to effects, and everything else is a plugin**. This page says what that buys, what it costs, and how it sits next to the frameworks you would otherwise reach for. It was written by the people who built it; read the "costs" with the same attention as the "strengths".

## What you get

**Testability.** A request flow is data, so `scenario(app, [...])` runs login, rate limiting, cache hit/miss or a transaction rollback with scripted replies: no server, no database, no mocking library, microseconds per test. The todo example's 23 scenario tests run in about 50 ms in total. In Express/Fastify/Nest the same coverage means supertest plus a database or a pile of mocks of a driver; you test _through_ the framework. Here the framework is not in the test at all, and the same handler then runs unchanged on real sockets (the example's e2e suite) and on in-memory fakes.

**Cancellation that is the default, not a discipline.** Every effect carries the request id; when the request ends (client hung up, deadline, shutdown) the runtime tells every plugin that worked for it to stop. The e2e test hangs up on a 20 s `pg_sleep` and asserts that Postgres is no longer sleeping, that no transaction is open and no timer is left. In Node frameworks this is `AbortSignal` plumbing that each handler must remember to pass down; in Go it is `context.Context`, which is the closest idea (see below).

**Traceability.** `traceOf(rid)` is the ordered list of messages the app handled and the effects it returned, with timestamps; every log line carries the `rid`. There is no tracing library to configure and no "which request did this query belong to" question, because the answer travels with the query.

**Errors have one shape and cannot take the process down.** Handler exceptions, plugin exceptions, deadlines, a runaway flow (message budget) all arrive as messages the app can handle, with a sane default (`500`/`504`).

**Everything outside is replaceable.** Swapping Redis for another cache changes one plugin and the effect builders you call; the flow's structure stays.

## What it costs

**Indirection.** To read "what happens on login" you follow message ids: `auth.login` -> `gate.counted` -> `auth.login.found` -> `auth.login.verified` -> ... across files. The trace and the naming convention (`<feature>.<flow>.<step>`) help; they do not make it as linear as `await`. A function with three `await`s in Express is three lines; here it is three cases of a `switch` plus state.

**Verbosity of flows.** The login flow of the example is ~60 lines (`auth.ts`) where an async function would be ~15. Every step needs a message id, a `replyTo`/`onError`, and, for multi-step flows, a `step` check. Parallel fan-out and join (`/readyz` checking Postgres and Redis) is manual bookkeeping in the request slice, where `Promise.all` is one line. Early returns and `try/finally` become explicit effects (see the `abort` helper that rolls back before answering). This is the price of making every suspension point a value; if you do not need to test or trace flows that way, it is a bad trade.

**You get a smaller ecosystem.** No middleware catalogue, no ORM integrations, no OpenAPI generator, no auth libraries, no APM agents. The plugins here are small and hand-written (an own RESP client, an own RFC 6455 implementation, own http glue on `node:http`); they are tested but young compared with `pg`-the-driver-in-production-for-ten-years, `ioredis`, `ws`, Fastify's plugin ecosystem. Postgres goes through `node-postgres`; the rest is ours. Writing a plugin is ~100 lines (see [plugins.md](plugins.md)) but you will write more of them than you would in Express.

**A different mental model, and few people who know it.** Debugging with a stepping debugger across an `app` call and a plugin's callback is less natural than stepping through an `await` chain. New team members learn messages, effects, slices.

**Raw overhead.** Measured below: ~12% fewer requests/s on hello world, ~35% on a one-row query, and a higher p99. Dispatch goes through an extra layer (runtime tracking, ctx stamping, trace, a request slice).

**State is shared by convention.** Per-request slices live in one process-wide map (updated in place for speed); a handler that holds on to `state.requests` across messages would see it change. Everything in the store is in memory and per process: there is no built-in clustering story (we use Redis pub/sub for cross-instance events, as the example does).

## Benchmark

`server/bench/`: hello world and a one-row Postgres lookup (`select id, title from bench_items where id = $1`), each as plain `node:http` (+ `pg.Pool`, 10 connections) and as a pavlus-server pure handler (+ the `pg` plugin, 10 connections). The load generator is a closed-loop client on node's own `http` module with a keep-alive agent: **100 concurrent connections**, 1 s warm-up, 5 s measured, in a **separate process**; each case is run 3 times and the median is reported (`node bench/run.ts`, results in `bench/results.json`).

| case                               |      req/s | vs baseline | p50 (ms) | p99 (ms) |
| ---------------------------------- | ---------: | ----------: | -------: | -------: |
| hello, `node:http`                 |     21,162 |           - |     4.59 |     7.90 |
| hello, pavlus-server               |     18,573 |         88% |     5.23 |    11.93 |
| hello, pavlus-server, trace off    |     20,146 |         95% |     4.70 |    11.68 |
| pg query, `node:http` + `pg.Pool`  |     11,930 |           - |     8.03 |    14.86 |
| pg query, pavlus-server            |      7,758 |         65% |    12.23 |    21.64 |
| pg query, pavlus-server, trace off | 6,862 (\*) |         58% |    13.72 |    26.24 |

(\*) the three runs were 6,359 / 8,011 / 6,862: on this machine the spread of the pg case is larger than the effect of switching the trace off, so read "trace off" as "within noise" there. Hello-world run ranges: baseline 21.1-21.5k, pavlus 17.0-19.0k.

Caveats, all of which matter:

- One shared **4 vCPU virtual machine** (Xeon 2.1 GHz, Node 22.23) runs the server, the load generator _and_ PostgreSQL 16 (on loopback). The numbers are not "what the server can do alone"; they are comparable to each other, not to anyone else's benchmark. The load generator is itself a Node process and caps what it can drive.
- Both servers do the minimum: no TLS, no body, no middleware, tiny responses. The overhead you measure here is the framework's _fixed cost per request_; in an application where each request does real work it is a smaller fraction. A real endpoint with several round trips pays the overhead per message, not per request.
- Closed-loop load (a client sends the next request when the previous one returns) understates tail latency under overload compared with an open-loop generator.
- Single process, single event loop for both. Nothing here says anything about multi-core scaling.
- Medians of 3 short runs; no confidence intervals. Treat differences under ~10% as noise.

**What the first measurement found.** The first run had the pg case at 3.3k req/s against 10.9k for the baseline, and the throughput _fell_ as concurrency rose. Profiling showed the `requests` state plugin copying its whole `requests` map on every `open`, `drop` and `req.set` (O(requests in flight), with 100 in flight): a third of the CPU. It now replaces the slice and updates the map in place (7.2-7.7k req/s, flat from 10 to 100 connections). The other hot spot, `randomBytes` for every `rid` (7%), is now served from a pooled buffer. Remaining overhead is the architecture's: from the numbers above about 7 us per hello-world request, and about 45 us for a request with a Postgres round trip (more messages, tracking and ctx stamping per hop, a request slice, a result copy).

## Against the alternatives

### Express

Express is a middleware chain around `(req, res)`; handlers are imperative and async. Compared with it, pavlus-server trades the enormous ecosystem and the linear `await` style for testability, built-in cancellation and traceability. If your service is a handful of CRUD endpoints and a team that knows Express, Express wins on speed of development and hiring. Where Express hurts and this does not: nothing cancels the query when the client hangs up unless you wire it, an unhandled rejection in the wrong place is a crash, and tests that need the database or heavy mocking.

### Fastify

Fastify is fast, has schemas, a real plugin system and a healthy ecosystem; it is built to stay close to raw `node:http` throughput (we did not measure it here) and nothing in this framework competes with that. Fastify's plugins are encapsulation/DI units (decorators, hooks); ours are I/O adapters that the app talks to only through data. Fastify handlers can be unit-tested with `inject()`, which is good, but still goes through the framework and still needs fakes for the database. Pick Fastify when throughput, JSON-schema validation and ecosystem matter most.

### NestJS

Nest gives structure at scale (modules, DI, decorators, guards/interceptors) and a large team convention. pavlus-server gets structure from the message/feature convention and does not need DI at all, since the handler has no dependencies: a test passes values, not mocks of injected services. Nest is far heavier to learn and run and far better supported. If your organisation wants a standard shape for 40 engineers, Nest; if you want the smallest possible surface and pure business logic, this.

### Elixir / Phoenix (OTP)

The closest in spirit to the _ideology_ (message passing, supervision, "let it crash"), and the clear winner on what we do not have: preemptive scheduling across all cores, per-process isolation and heap, supervision trees, hot code reload, Phoenix Channels/PubSub/LiveView, a mature runtime for millions of connections. A request there is also a process that receives messages. We have none of that; we have a single-threaded event loop and an in-process dispatch queue, and a CPU-bound handler stalls everything (next section). What we offer instead is a plain-data effect boundary: because effects are values, you can assert them without running anything, which GenServer-based code can do only with mocks (Mox) or by running the process. If you need Phoenix's runtime properties, use Phoenix.

### Go-style services (`net/http`, `context`, goroutines)

Go's `context.Context` carries cancellation and deadlines through the call tree explicitly, which is exactly the property we build in; the `rid` plus per-plugin `cancel(rid)` is the same idea made automatic (you cannot forget to pass the context) at the price of making the data flow of a request explicit as messages. Go gives you real parallelism, simple blocking-style code that is linear to read, a static binary and excellent throughput; tests there are usually table tests with interfaces and fakes (which is also where the effort goes). Go wins on CPU-bound work, raw performance and operational simplicity. This wins if you want the whole business flow testable as data with no interfaces to fake.

## CPU-bound work and the single dispatch queue

All messages go through one queue, handled one at a time on one thread, by a function that must be fast. That is what makes the app deterministic, and it has three consequences:

1. **A slow handler blocks everything.** Anything that takes milliseconds of CPU (a big JSON transform, markdown rendering, an image resize, bcrypt) delays every other request's next step, and the p99 of all of them. I/O does not have this problem (it happens in plugins, off the queue).
2. **That is why hashing is a plugin.** `crypto.hash` runs scrypt on libuv's thread pool and replies with a message; the handler stays pure and the queue free. The e2e suite hashes 50 passwords concurrently and the loop keeps serving.
3. **The remedy is the same: put the CPU work behind an effect.** The planned answer is a **`worker` plugin**: `worker.run { task, input, replyTo, onError }` backed by a pool of `node:worker_threads` that load a module of named pure functions, with `cancel(rid)` terminating or discarding the job and a bounded queue for backpressure. The app stays one pure function; heavy functions become tasks, testable as plain functions and as scripted replies. It is not built yet (it is about a hundred lines on top of the plugin contract, and the mail example shows the shape: a queue, a concurrency limit, an `AbortSignal`). Until then a handler doing real CPU work should be moved to such a task, or to another service.

The pure `app` itself is cheap to profile (it is a function), but nothing stops a handler from being written slowly, and the framework cannot tell you: watch event-loop delay.

## When to use it, when not to

Use it when: the logic of your flows is the hard part and you want to test it exhaustively and cheaply; you care that cancellation, deadlines and request ids are never forgotten; you value being able to explain exactly what a request did; your load is I/O-bound, one node (or a few behind a balancer) is enough.

Do not use it when: you need the best raw throughput or multi-core CPU work in-process; you depend on a rich framework ecosystem (auth providers, ORMs, GraphQL servers, observability agents) you do not want to re-wrap; the team will not buy into the model; the endpoints are simple enough that the machinery is pure overhead.
