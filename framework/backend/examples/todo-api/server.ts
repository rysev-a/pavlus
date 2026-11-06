// Wires the plugins around the pure app. `main.ts` calls this with values from
// the environment; the end-to-end tests call it with a throwaway schema, an
// ephemeral port and a log sink they can read.
import {
  createCryptoPlugin,
  createHttpServerPlugin,
  createLogPlugin,
  createPostgresPlugin,
  createRedisPlugin,
  createServerApp,
  createWsServerPlugin,
  newRid,
  type LogPluginOptions,
} from "../../src/mod.ts";
import { app } from "./app.ts";
import { defaultConfig, type AppState, type Config } from "./kit.ts";
import { routeTable } from "./routes.ts";

export interface ServerOptions {
  databaseUrl: string;
  redisUrl: string;
  port?: number;
  host?: string;
  config?: Partial<Config>;
  /** Hops of X-Forwarded-For to trust for the client IP (rate limiting). */
  trustProxy?: boolean | number;
  requestTimeoutMs?: number;
  /** pg.PoolConfig extras, e.g. `{ max: 20, options: "-c search_path=x" }`. */
  pgConfig?: Record<string, unknown>;
  /** Lower scrypt cost in tests. */
  scryptN?: number;
  log?: LogPluginOptions;
}

export function buildServer(o: ServerOptions) {
  const http = createHttpServerPlugin({
    port: o.port ?? 3000,
    host: o.host,
    trustProxy: o.trustProxy ?? false,
    limits: { requestTimeoutMs: o.requestTimeoutMs ?? 10_000 },
  });
  const wsPlugin = createWsServerPlugin({ http });
  const pg = createPostgresPlugin({
    url: o.databaseUrl,
    config: { max: 10, ...o.pgConfig },
    defaultTimeoutMs: 10_000,
  });
  const redis = createRedisPlugin({ url: o.redisUrl });
  const crypto = createCryptoPlugin(o.scryptN ? { N: o.scryptN } : {});
  const log = createLogPlugin(o.log);

  const server = createServerApp<AppState>({
    app,
    // stop() runs in reverse order (the listener first), dispose too (the
    // database last, the logger after everything)
    plugins: [log, crypto, pg, redis, wsPlugin, http],
    state: { config: { ...defaultConfig, ...o.config } },
    routes: routeTable,
    limits: { requestTimeoutMs: o.requestTimeoutMs ?? 10_000 },
  });

  /** Runs migrations; ready (`/readyz` 200) once the `app.ready` flow is done. */
  const boot = () =>
    server.dispatch({ id: "app.boot", ctx: { rid: newRid(), conn: "job" } });
  /** Stop being ready and end streams, ahead of `server.shutdown()`. */
  const drain = () =>
    server.dispatch({ id: "app.drain", ctx: { rid: newRid(), conn: "job" } });

  return { server, http, ws: wsPlugin, pg, redis, crypto, log, boot, drain };
}

export type TodoServer = ReturnType<typeof buildServer>;
