/**
 * Multi-process without a process manager: `node:cluster` forks N workers that
 * run the same entry file, and cluster shares one listening port between them.
 * Handlers are pure and every request lives on one socket, so workers need no
 * coordination — only the usual per-worker resources (pg pool, metrics, ws
 * connections) are N of them now.
 *
 * In the worker this just calls `main`. In the primary it forks, restarts dead
 * workers, and drains them on SIGINT/SIGTERM: each worker gets the signal, the
 * primary waits up to `graceMs`, then exits 0 (SIGKILL after the grace).
 */

import cluster from "node:cluster";
import { availableParallelism } from "node:os";

export interface ClusterOptions {
  /** How many workers. A number, `"max"` for `availableParallelism()`, default 1. */
  workers?: number | "max";
  /** Restart a worker that died. Default true. */
  respawn?: boolean;
  /** How long to wait for workers to drain on a signal before SIGKILL. Default 10s. */
  graceMs?: number;
  /** No `cluster:` lines. */
  quiet?: boolean;
}

export function runCluster(
  main: () => void | Promise<void>,
  opts: ClusterOptions = {},
): void {
  // The worker: the same entry file re-ran; only the app boots here.
  if (!cluster.isPrimary) {
    void main();
    return;
  }

  const asked =
    opts.workers === "max" ? availableParallelism() : (opts.workers ?? 1);
  const count = Number.isFinite(asked) ? Math.max(1, Math.floor(asked)) : 1;
  const graceMs = opts.graceMs ?? 10_000;
  const respawn = opts.respawn !== false;
  const log = (...args: unknown[]): void => {
    if (!opts.quiet) console.log("cluster:", ...args);
  };

  let shuttingDown = false;
  let stopping = false;
  const forkedAt = new Map<number, number>();
  let fastDeaths = 0;

  const fork = (): void => {
    const worker = cluster.fork();
    forkedAt.set(worker.id, Date.now());
  };

  cluster.on("exit", (worker, code, signal) => {
    const age = Date.now() - (forkedAt.get(worker.id) ?? Infinity);
    forkedAt.delete(worker.id);
    if (shuttingDown || !respawn) return;
    // A worker that dies right after fork is a boot error (bad port, bad env):
    // restart a few times, then stop instead of looping forever.
    if (age < 1000 && ++fastDeaths > 5) {
      console.error(
        `cluster: worker died ${fastDeaths} times right after starting ` +
          `(last: ${signal ?? code}); giving up`,
      );
      process.exit(1);
    }
    if (age >= 1000) fastDeaths = 0;
    log(`worker ${worker.id} died (${signal ?? code}), restarting`);
    setTimeout(fork, 250);
  });

  const shutdown = (signal: "SIGINT" | "SIGTERM"): void => {
    if (stopping) return;
    stopping = true;
    shuttingDown = true;
    log(`${signal}: stopping ${count} worker${count === 1 ? "" : "s"}`);
    for (const worker of Object.values(cluster.workers ?? {}))
      worker?.process?.kill(signal);
    const drained = new Promise<void>((resolve) => {
      const check = (): void => {
        if (Object.keys(cluster.workers ?? {}).length === 0) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
    void Promise.race([
      drained,
      new Promise((r) => setTimeout(r, graceMs)),
    ]).then(() => {
      for (const worker of Object.values(cluster.workers ?? {}))
        worker?.process?.kill("SIGKILL");
      log("stopped");
      process.exit(0);
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  for (let i = 0; i < count; i++) fork();
  log(`${count} worker${count === 1 ? "" : "s"} (primary pid ${process.pid})`);
}
