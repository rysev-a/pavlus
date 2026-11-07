/**
 * The team-up server, on @pavlus/backend: the application is a pure function
 * (app.ts), and everything that touches the world is a plugin.
 *
 * - `pg`    — the Postgres pool; db effects of the app run here.
 * - `redis` — pub/sub (chat fanout across workers), the online set, the
 *             notification queue.
 * - `ws`    — the live chat: RFC 6455 on the same node:http server (/ws),
 *             rooms per thread, identity parked in redis at the handshake.
 * - `pages` — the frontend: Vite in development, `dist/` in production, the
 *             server render (through the flow) in both.
 * - `http`  — node:http; requests arrive as `http.request` messages, answers
 *             go back as `http.respond` effects — SSR included.
 *
 * Run with `node backend/server.ts` (Node strips the types itself).
 */

import type { Server as NodeServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCryptoPlugin,
  createFlowFetch,
  createHttpServerPlugin,
  createPagesPlugin,
  createPostgresPlugin,
  createRedisPlugin,
  createServerApp,
  createWsServerPlugin,
  type FrontendMode,
  type PagesPlugin,
  type RedisPlugin,
  runCluster,
  type ServerApp,
} from "@pavlus/backend";
import type { Frontend } from "@pavlus/backend/ssr";
import { renderDocument, renderPage } from "@pavlus/backend/ssr";
import { createTeamUpApp } from "./app.ts";
import { resetDatabase } from "./db/init/reset.ts";
import { seedWorld } from "./db/init/seed.ts";
import { createPool, DEFAULT_REDIS_URL } from "./db/pool.ts";
import { routes } from "./routes.ts";

const PORT = Number(process.env.PORT ?? 3020);
// Plain paths: under jsdom (the tests) the global `URL` is not Node's.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** How often the notification queue is offered a drain tick. */
const NOTIFY_TICK_MS = Number(process.env.NOTIFY_TICK_MS ?? 2000);

/** What `startServer` gives back: the runtime, the listener, a clean stop. */
export interface StartedServer {
  /** The runtime: dispatch, stats, shutdown. */
  app: ServerApp;
  /** The node server the http plugin listens on. */
  server: NodeServer;
  port(): number;
  /** Resolves when the listener has a port. */
  listening(): Promise<void>;
  /** Resolves when the chat channel is subscribed (redis connected). */
  subscribed(): Promise<void>;
  /** Pops the notification queue until empty (the tests call it directly). */
  drainNotifications(): Promise<void>;
  /** Closes the listener, drains the in-flight requests, ends the pool. */
  close(): Promise<void>;
}

export type { FrontendMode };

export interface ServerOptions {
  /** Defaults to a pool for `DATABASE_URL`; the server ends it when closed. */
  pool?: import("pg").Pool;
  /** Another redis; default is the compose one (db/pool.ts). */
  redisUrl?: string;
  /** No log lines (tests). */
  quiet?: boolean;
  /**
   * `dev` (Vite inside the server), `dist` (the build), or `none` (the API
   * only, for the tests). Default: `dist` under `NODE_ENV=production`, else
   * `dev`.
   */
  frontend?: FrontendMode;
}

export function startServer(
  port = PORT,
  opts: ServerOptions = {},
): StartedServer {
  const pool = opts.pool ?? createPool();
  const mode: FrontendMode =
    opts.frontend ?? (process.env.NODE_ENV === "production" ? "dist" : "dev");
  const app = createTeamUpApp();

  // The pages plugin loads a page's data through the same pure application,
  // over the same pool — no second API for the render. The page request's
  // cookie rides on every fetch, so the render acts as the user.
  const flow = createFlowFetch(app, routes, pool);
  const cookieOf = (cookies: Record<string, string>): string =>
    Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  const ssrFetch =
    (cookies: Record<string, string>): typeof fetch =>
    (input, init) =>
      flow(input, {
        ...init,
        headers: { ...init?.headers, cookie: cookieOf(cookies) },
      });
  const pages: PagesPlugin = createPagesPlugin({
    mode,
    root: ROOT,
    quiet: opts.quiet,
    document: async ({ template, frontend, path, search, cookies }) =>
      renderDocument(
        template,
        await renderPage((await frontend()) as Frontend, ssrFetch(cookies), {
          at: { path, search },
          inert: ["ws"],
        }),
      ),
  });
  const http = createHttpServerPlugin({ port });
  const ws = createWsServerPlugin({ http, path: "/ws" });
  const redis: RedisPlugin = createRedisPlugin({
    url: opts.redisUrl ?? process.env.REDIS_URL ?? DEFAULT_REDIS_URL,
  });
  const serverApp = createServerApp({
    app,
    routes,
    plugins: [
      createPostgresPlugin({ pool }),
      createCryptoPlugin(),
      redis,
      pages,
      ws,
      http,
    ],
    limits: { requestTimeoutMs: 30_000 },
  });

  // The live wiring: every worker subscribes to the chat channel (a publish
  // on any of them becomes a broadcast on all), and a tick offers the
  // notification queue a drain — the drain chains itself until empty.
  serverApp.dispatch({ id: "chat.subscribe" });
  const tick = setInterval(
    () => serverApp.dispatch({ id: "notify.drain" }),
    NOTIFY_TICK_MS,
  );
  tick.unref?.();

  const node = http.server;
  let stopped: Promise<void> | undefined;
  const stop = (): Promise<void> =>
    (stopped ??= (async () => {
      clearInterval(tick);
      await serverApp.shutdown({ timeoutMs: 5000 }).catch(() => {});
      await pool.end().catch(() => {});
    })());
  // Someone closed the node server under us (the tests do): stop everything.
  node.once("close", () => void stop());

  return {
    app: serverApp,
    server: node,
    port: () => http.port,
    listening: () => http.listening().then(() => {}),
    subscribed: () => redis.ready(),
    drainNotifications: async () => {
      // one pop-insert chain empties the queue (the drain chains itself)
      serverApp.dispatch({ id: "notify.drain" });
      // let the last insert land before the caller looks at the table
      await new Promise((r) => setTimeout(r, 50));
    },
    close: async () => {
      node.closeAllConnections?.();
      if (node.listening)
        await new Promise<void>((resolve) => node.close(() => resolve()));
      await stop();
    },
  };
}

/** The test reseed: the tables, the directory, the demo world. */
export async function reseedDatabase(): Promise<void> {
  const pool = createPool();
  try {
    await resetDatabase(pool);
    const query = <Row>(sql: string, params?: unknown[]) =>
      pool.query(sql, params).then((r) => r.rows as Row[]);
    await seedWorld(query);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const boot = (): void => {
    const started = startServer();
    const shutdown = (signal: string): void => {
      console.log(`\n${signal}: shutting down`);
      void started.close().then(() => process.exit(0));
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    void started.listening().then(() => {
      const mode = process.env.NODE_ENV === "production" ? "dist" : "dev";
      console.log(`team-up (${mode}) on http://localhost:${started.port()}/`);
    });
  };
  // WORKERS=max (or a number) forks that many processes on one port; ws and
  // redis fanout make the workers equivalent. Default: one process.
  const raw = process.env.WORKERS ?? "1";
  const workers: number | "max" = raw === "max" ? "max" : Number(raw) || 1;
  if (workers === "max" || workers > 1) runCluster(boot, { workers });
  else boot();
}
