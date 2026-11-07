# cluster

`runCluster(main, opts)` — multi-process in one entry file, on `node:cluster`:

```ts
import { runCluster } from "@pavlus/backend";

runCluster(() => startServer(), { workers: "max" }); // node server.ts
```

- The primary forks `workers` processes that re-run the same entry file; in a
  worker `runCluster` just calls `main`. One listening port is shared, requests
  are round-robined to the workers.
- A worker that dies is restarted (250ms later). A worker that dies within 1s
  of its fork is a boot error (bad port, bad env): after 6 such the primary
  gives up and exits 1 instead of looping forever.
- SIGINT/SIGTERM to the primary are forwarded to the workers; it waits up to
  `graceMs` (default 10s) for them to exit, then SIGKILLs and exits 0. Workers
  drain with their own signal handlers (`server.close()` style).

## Options

| option    | default |                                            |
| --------- | ------- | ------------------------------------------ |
| `workers` | `1`     | a number, or `"max"` for all cores         |
| `respawn` | `true`  | restart dead workers                       |
| `graceMs` | `10000` | drain window before SIGKILL on shutdown    |
| `quiet`   | `false` | no `cluster:` lines                        |

## What is per-worker now

Handlers are pure and a request never crosses processes, so nothing
coordinates — but each worker owns its own:

- **pg pool** — `workers × pool.max` must fit `max_connections`;
- **metrics** — scrape every worker (Prometheus sums) or aggregate yourself;
- **ws connections** — a socket lives in one worker; cross-worker fanout goes
  through the redis plugin (pub/sub);
- **the pages plugin in `dev`** — every worker runs its own Vite; keep
  `workers: 1` in development.
