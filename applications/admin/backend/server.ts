/**
 * The admin-app server, on @pavlus/backend: the application is a pure function
 * (app.ts — the same one the server render runs in-process), and everything
 * that touches the world is a plugin.
 *
 * - `pg`    — the Postgres pool; db effects of the app run here.
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
  createFlowFetch,
  createHttpServerPlugin,
  createPagesPlugin,
  createPostgresPlugin,
  createServerApp,
  type FrontendMode,
  type PagesPlugin,
  runCluster,
  type ServerApp,
} from "@pavlus/backend";
import type { Frontend } from "@pavlus/backend/ssr";
import { renderDocument, renderPage } from "@pavlus/backend/ssr";
import { createAdminApp } from "./app.ts";
import { resetStatements } from "./db/init/reset.ts";
import { createPool } from "./db/pool.ts";
import { routes } from "./routes.ts";

const PORT = Number(process.env.PORT ?? 3000);
// Plain paths: under jsdom (the tests) the global `URL` is not Node's.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** What `startServer` gives back: the runtime, the listener, a clean stop. */
export interface StartedServer {
  /** The runtime: dispatch, stats, shutdown. */
  app: ServerApp;
  /** The node server the http plugin listens on. */
  server: NodeServer;
  port(): number;
  /** Resolves when the listener has a port. */
  listening(): Promise<void>;
  /** Closes the listener, drains the in-flight requests, ends the pool. */
  close(): Promise<void>;
}

export type { FrontendMode };

export interface ServerOptions {
  /** Defaults to a pool for `DATABASE_URL`; the server ends it when closed. */
  pool?: import("pg").Pool;
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
  const app = createAdminApp(resetStatements());

  // The pages plugin loads a page's data through the same pure application,
  // over the same pool — no second API for the render. The document itself is
  // the app's server render (ssr.ts): everything that needs @pavlus/frontend
  // stays in the app; the plugin only serves.
  const ssrFetch = createFlowFetch(app, routes, pool);
  const pages: PagesPlugin = createPagesPlugin({
    mode,
    root: ROOT,
    quiet: opts.quiet,
    document: async ({ template, frontend, path, search }) =>
      renderDocument(
        template,
        await renderPage((await frontend()) as Frontend, ssrFetch, {
          at: { path, search },
        }),
      ),
  });
  const http = createHttpServerPlugin({ port });
  const serverApp = createServerApp({
    app,
    routes,
    plugins: [createPostgresPlugin({ pool }), pages, http],
    limits: { requestTimeoutMs: 30_000 },
  });

  const node = http.server;
  let stopped: Promise<void> | undefined;
  const stop = (): Promise<void> =>
    (stopped ??= (async () => {
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
    close: async () => {
      node.closeAllConnections?.();
      if (node.listening)
        await new Promise<void>((resolve) => node.close(() => resolve()));
      await stop();
    },
  };
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
      console.log(`admin-app (${mode}) on http://localhost:${started.port()}/`);
    });
  };
  // WORKERS=max (or a number) forks that many processes on one port. Default:
  // one process — every worker runs its own Vite in dev, so cluster is for
  // production (dist) deployments.
  const raw = process.env.WORKERS ?? "1";
  const workers: number | "max" = raw === "max" ? "max" : Number(raw) || 1;
  if (workers === "max" || workers > 1) runCluster(boot, { workers });
  else boot();
}
