import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createPool } from "../backend/db/pool.ts";
import { createQuery, type Query } from "../backend/db/query.ts";
import { resetDatabase } from "../backend/db/reset.ts";
import { startServer } from "../backend/server.ts";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

/** Whether a Postgres answers (the tests are skipped without one). */
export async function databaseAvailable(): Promise<boolean> {
  if (!TEST_DATABASE_URL) return false;
  const pool = createPool(TEST_DATABASE_URL);
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

export interface Backend {
  query: Query;
  /** `METHOD url` of every request. */
  requests: string[];
  /** Relative urls (`/api/orders`) sent to the real server. */
  fetch: typeof fetch;
  /** Back to the seed. */
  reseed(): Promise<void>;
  close(): Promise<void>;
}

/** The real API server on a free port, over the real Postgres, freshly seeded. */
export async function startBackend(): Promise<Backend> {
  const pool = createPool(TEST_DATABASE_URL);
  await resetDatabase(pool);
  const server = startServer(0, {
    quiet: true,
    pool: createPool(TEST_DATABASE_URL),
  });
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const requests: string[] = [];
  const nodeFetch = globalThis.fetch;
  return {
    query: createQuery(pool),
    requests,
    fetch: ((url: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? "GET"} ${url}`);
      return nodeFetch(base + url, init);
    }) as typeof fetch,
    reseed: async () => {
      await resetDatabase(pool);
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((e) => (e ? reject(e) : resolve()));
      });
      await pool.end();
    },
  };
}
