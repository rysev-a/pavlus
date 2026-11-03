import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createPool } from "../../backend/db/pool.ts";
import { resetDatabase } from "../../backend/db/reset.ts";
import { startServer } from "../../backend/server.ts";

export interface Backend {
  /** `METHOD url` of every request the frontend made. */
  requests: string[];
  /** The frontend's relative urls (`/api/users`), sent to this server. */
  fetch: typeof fetch;
  /** Back to the seed (`backend/db/seed.sql`). */
  reseed(): Promise<void>;
  close(): Promise<void>;
}

/**
 * The real API (`backend/server.ts`, API only) on a free port, over the real
 * Postgres (`compose.yaml`), reseeded. No fakes: what the tests see is what
 * the browser sees.
 */
export async function startBackend(): Promise<Backend> {
  const reseed = async (): Promise<void> => {
    const pool = createPool();
    try {
      await resetDatabase(pool);
    } catch (e) {
      throw new Error(
        `the frontend tests need Postgres (docker compose up -d): ${String(e)}`,
      );
    } finally {
      await pool.end();
    }
  };
  await reseed();
  const server = startServer(0, { quiet: true, frontend: "none" });
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const requests: string[] = [];
  const nodeFetch = globalThis.fetch;
  return {
    requests,
    fetch: ((url: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? "GET"} ${url}`);
      return nodeFetch(base + url, init);
    }) as typeof fetch,
    reseed,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((e) => (e ? reject(e) : resolve()));
      }),
  };
}
