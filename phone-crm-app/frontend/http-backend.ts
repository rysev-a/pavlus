// The `idb` plugin of the ui-kit, with the database on the server: the same
// effects (`load`, `put`, `remove`, `replaceAll`) and the same replies as
// createIdbPlugin, only the `Backend` talks to /api/sync/* (see CONTRACT).
import type { Plugin } from "@service-laboratory/pavlus";
import {
  type Backend,
  createIdbPlugin,
  type IdbEffect,
  type Rows,
  type Tables,
} from "../../ui-kit/frontend/idb.ts";

type Fetch = typeof fetch;

export interface HttpBackendOptions {
  /** Defaults to "/api". */
  base?: string;
  /** Defaults to the global `fetch`. */
  fetch?: Fetch;
}

export const OFFLINE = "The server is offline: cannot reach the API";

export function createHttpBackend(opts: HttpBackendOptions = {}): Backend {
  const base = (opts.base ?? "/api").replace(/\/+$/, "");
  const doFetch: Fetch = (...a) => (opts.fetch ?? globalThis.fetch)(...a);

  /** A health check tells "server offline" from "server said no". */
  const offline = async (): Promise<boolean> => {
    try {
      const r = await doFetch(`${base}/health`);
      return !r.ok;
    } catch {
      return true;
    }
  };

  async function call<T>(path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
    } catch (e) {
      throw new Error(
        (await offline())
          ? OFFLINE
          : `request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // not JSON (a proxy error page): reported by status below
    }
    if (!res.ok) {
      const msg = (json as { error?: unknown } | null)?.error;
      if (res.status >= 502 && (await offline())) throw new Error(OFFLINE);
      throw new Error(
        typeof msg === "string" ? msg : `the server answered ${res.status}`,
      );
    }
    return json as T;
  }

  return {
    async load(_db: string, tables: string[]): Promise<Tables> {
      const r = await call<{ data?: Tables }>("/sync/load", { tables });
      if (!r || typeof r.data !== "object" || r.data === null)
        throw new Error("the server sent no data");
      const out: Tables = {};
      for (const t of tables) out[t] = r.data[t] ?? [];
      return out;
    },
    async put(_db: string, table: string, rows: Rows): Promise<void> {
      if (!rows.length) return;
      await call("/sync/put", { table, rows });
    },
    async remove(_db: string, table: string, ids: number[]): Promise<void> {
      if (!ids.length) return;
      await call("/sync/remove", { table, ids });
    },
    async replaceAll(_db: string, data: Tables): Promise<void> {
      await call("/sync/replace", { data });
    },
  };
}

/** The plugin the app installs in place of `createIdbPlugin()`. */
export function createHttpBackendPlugin(
  opts?: HttpBackendOptions,
): Plugin<IdbEffect, unknown> {
  return createIdbPlugin(createHttpBackend(opts));
}
