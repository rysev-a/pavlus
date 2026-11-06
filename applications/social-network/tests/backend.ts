import { once } from "node:events";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { createPool } from "../backend/db/pool.ts";
import { resetDatabase } from "../backend/db/reset.ts";
import { startServer } from "../backend/server.ts";

/** The database the tests use (none: the database tests are skipped). */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

/** Whether the database answers (asked once, at collection time). */
export async function databaseAvailable(): Promise<boolean> {
  if (!TEST_DATABASE_URL) return false;
  const client = new pg.Client({
    connectionString: TEST_DATABASE_URL,
    connectionTimeoutMillis: 1500,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

export interface Backend {
  /** `METHOD url` of every request made. */
  requests: string[];
  /** Relative urls (`/api/users`), sent to this server. */
  fetch: typeof fetch;
  /** The base url, `http://127.0.0.1:port`. */
  url: string;
  pool: pg.Pool;
  /** Back to the seed. */
  reseed(): Promise<void>;
  close(): Promise<void>;
}

/**
 * The real API (`backend/server.ts`, API only) on a free port, over the real
 * Postgres, reseeded. No fakes: what the tests see is what the browser sees.
 */
export async function startBackend(): Promise<Backend> {
  const pool = createPool(TEST_DATABASE_URL);
  const reseed = async (): Promise<void> => {
    try {
      await resetDatabase(pool);
    } catch (e) {
      throw new Error(
        `the tests need Postgres (docker compose up -d): ${String(e)}`,
      );
    }
  };
  await reseed();
  const server = startServer(0, {
    quiet: true,
    frontend: false,
    pool: createPool(TEST_DATABASE_URL),
  });
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const requests: string[] = [];
  const nodeFetch = globalThis.fetch;
  return {
    requests,
    url,
    pool,
    fetch: ((path: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? "GET"} ${path}`);
      return nodeFetch(url + path, init);
    }) as typeof fetch,
    reseed,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((e) => (e ? reject(e) : pool.end().then(() => resolve())));
      }),
  };
}
