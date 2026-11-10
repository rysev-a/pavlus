// Test support for the end-to-end tests: a throwaway Postgres schema, a
// throwaway redis-server, and any number of server instances (the same app,
// the same database, the same Redis) listening on ephemeral ports.
import {
  request,
  startTestRedis,
  type TestRedis,
} from "../../src/testing/mod.ts";
import type { LogRecord } from "../../src/mod.ts";
import pg from "pg";
import { redisServerBinary } from "../../src/plugins/redis/testserver.ts";
import { buildServer, type ServerOptions, type TodoServer } from "./server.ts";

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://admin@127.0.0.1:54329/postgres";

export async function stackAvailable(): Promise<boolean> {
  if (!redisServerBinary()) return false;
  const c = new pg.Client({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 1500,
  });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    c.on("error", () => {});
    return false;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls until `cond()` is truthy; throws with `what` after `ms`. */
export async function waitFor(
  cond: () => unknown | Promise<unknown>,
  what: string,
  ms = 5000,
): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    if (await cond()) return;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

export interface Instance extends TodoServer {
  port: number;
  /** Real-socket request helper bound to this instance. */
  api(
    method: string,
    path: string,
    o?: { body?: unknown; token?: string; headers?: Record<string, string> },
  ): ReturnType<typeof request>;
}

export interface Stack {
  redis: TestRedis;
  schema: string;
  admin: pg.Pool;
  /** Every structured log record of every instance. */
  logs: LogRecord[];
  start(o?: Partial<ServerOptions>): Promise<Instance>;
  stop(): Promise<void>;
}

export async function startStack(): Promise<Stack> {
  const schema = "todo_e2e_" + Math.random().toString(36).slice(2, 10);
  const admin = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  await admin.query(`create schema ${schema}`);
  const redis = await startTestRedis();
  const logs: LogRecord[] = [];
  const instances: Instance[] = [];

  async function start(o: Partial<ServerOptions> = {}): Promise<Instance> {
    const s = buildServer({
      databaseUrl: DATABASE_URL,
      redisUrl: redis.url,
      port: 0,
      host: "127.0.0.1",
      scryptN: 1024,
      config: { rateLimit: { limit: 100_000, windowSec: 60 } },
      ...o,
      pgConfig: { options: `-c search_path=${schema}`, ...o.pgConfig },
      log: {
        level: "debug",
        sink: (_line, record) => void logs.push(record),
        ...o.log,
      },
    });
    const { port } = await s.http.listening();
    const inst: Instance = {
      ...s,
      port,
      api: (method, path, a = {}) =>
        request(
          { port },
          {
            method,
            path,
            body: a.body,
            headers: {
              ...(a.token && { authorization: `Bearer ${a.token}` }),
              ...a.headers,
            },
          },
        ),
    };
    instances.push(inst);
    s.boot();
    await waitFor(
      async () => (await inst.api("GET", "/readyz")).status === 200,
      "readyz",
    );
    return inst;
  }

  return {
    redis,
    schema,
    admin,
    logs,
    start,
    async stop() {
      for (const i of instances) {
        await i.server.shutdown({ timeoutMs: 2000 });
        await i.pg.close();
      }
      await redis.stop();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    },
  };
}

/** signup + login; returns the session token. */
export async function signupAndLogin(
  inst: Instance,
  email: string,
  password = "correct horse battery",
): Promise<{ token: string; id: number }> {
  const up = await inst.api("POST", "/signup", { body: { email, password } });
  if (up.status !== 201) throw new Error(`signup ${up.status} ${up.text}`);
  const login = await inst.api("POST", "/login", { body: { email, password } });
  if (login.status !== 200)
    throw new Error(`login ${login.status} ${login.text}`);
  const j = login.json as { token: string; user: { id: number } };
  return { token: j.token, id: j.user.id };
}
