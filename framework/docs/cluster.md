# cluster

`runCluster(main, opts)` in `@pavlus/server` runs the app in N processes on
one port, on `node:cluster` — no process manager needed:

```ts
import { runCluster } from "@pavlus/server";

runCluster(() => startServer(), { workers: "max" }); // node backend/server.ts
```

The primary forks `workers` processes that re-run the same entry file; in a
worker, `runCluster` just calls `main`. One listening port is shared and
requests are round-robined to the workers. This works because pavlus handlers
are pure and a request never crosses processes: no sticky sessions, no shared
in-flight state. Sessions live in Postgres, so any worker serves any request.

## What it handles

- **restart** — a dead worker is replaced 250ms later; a worker that dies
  within 1s of its fork 6 times in a row is a boot error (bad port, bad env),
  and the primary exits 1 instead of looping forever;
- **shutdown** — SIGINT/SIGTERM reach the primary, it forwards them, waits up
  to `graceMs` (default 10s) for the workers to drain with their own signal
  handlers, SIGKILLs the leftovers, exits 0.

## What is per-worker now

| resource     | consequence                                                        |
| ------------ | ------------------------------------------------------------------ |
| pg pool      | `workers × pool.max` must fit Postgres `max_connections`           |
| metrics      | scrape every worker (Prometheus sums over targets)                 |
| ws rooms     | a socket lives in one worker; cross-worker fanout via redis pub/sub |
| Vite (`dev`) | every worker runs its own Vite — keep 1 worker in development      |

The admin app opts in with `WORKERS=max node backend/server.ts`; without
`WORKERS` it boots exactly as before, one process.

## When to bother

One pavlus process already pushes tens of thousands rps of pure dispatch.
Cluster buys CPU headroom for heavy SSR and crash redundancy — an external
prefork (compose replicas behind Caddy/nginx) buys the same plus rolling
restarts and TLS, with zero framework code. Use `runCluster` when the process
tree should stay one command.
