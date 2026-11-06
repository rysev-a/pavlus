import { createPool } from "../backend/db/pool.ts";
import { resetDatabase } from "../backend/db/reset.ts";
import { startServer, type StartedServer } from "../backend/server.ts";

export interface Backend {
  /** `METHOD url` of every request the app made. */
  requests: string[];
  /** The app's relative urls (`/api/users`), sent to this server. */
  fetch: typeof fetch;
  /** Back to the seed (`backend/db/seed.sql`). */
  reseed(): Promise<void>;
  close(): Promise<void>;
}

/**
 * The real API (backend/server.ts on @pavlus/backend, API only) on a free
 * port, over the real Postgres (`compose.yaml`), reseeded. No fakes: what the
 * tests see is what the browser sees.
 */
export async function startBackend(): Promise<Backend> {
  const reseed = async (): Promise<void> => {
    const pool = createPool();
    try {
      await resetDatabase(pool);
    } catch (e) {
      throw new Error(
        `the tests need Postgres (docker compose up -d): ${String(e)}`,
      );
    } finally {
      await pool.end();
    }
  };
  await reseed();
  const started: StartedServer = startServer(0, {
    quiet: true,
    frontend: "none",
  });
  await started.listening();
  const base = `http://127.0.0.1:${started.port()}`;
  const requests: string[] = [];
  const nodeFetch = globalThis.fetch;
  return {
    requests,
    fetch: ((url: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? "GET"} ${url}`);
      return nodeFetch(base + url, init);
    }) as typeof fetch,
    reseed,
    close: () => started.close(),
  };
}
