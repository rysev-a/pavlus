import {
  type Backend,
  createIdbPlugin,
  type Rows,
  type Tables,
} from "../../../framework/ui-kit/frontend/idb.ts";

/**
 * The `idb` plugin of the ui-kit on HTTP: every table lives on the server
 * (`/api/sync/*`, see the contract), and the application keeps asking the same
 * way it asked IndexedDB.
 *
 * Tables in `local` (by default `session`: who is signed in on THIS browser)
 * never leave the browser: they are kept in `localStorage`.
 */
export interface HttpBackendOptions {
  fetch?: typeof fetch;
  /** The prefix of the API, without a trailing slash. */
  base?: string;
  local?: string[];
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
}

export const OFFLINE =
  "The server is offline. Check that the API is running and try again.";

const textOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export function createHttpBackend(opts: HttpBackendOptions = {}): Backend {
  const doFetch = (...a: Parameters<typeof fetch>) =>
    (opts.fetch ?? globalThis.fetch)(...a);
  const base = opts.base ?? "/api";
  const local = new Set(opts.local ?? ["session"]);
  const storage =
    opts.storage === undefined
      ? (globalThis as { localStorage?: Storage }).localStorage
      : opts.storage;
  const keyOf = (db: string, table: string) => `${db}:${table}`;

  const readLocal = (db: string, table: string): Rows => {
    try {
      const raw = storage?.getItem(keyOf(db, table));
      const rows = raw ? JSON.parse(raw) : [];
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };
  const writeLocal = (db: string, table: string, rows: Rows): void => {
    try {
      if (rows.length) storage?.setItem(keyOf(db, table), JSON.stringify(rows));
      else storage?.removeItem(keyOf(db, table));
    } catch {
      // storage blocked: the session just is not remembered
    }
  };
  const idOf = (r: unknown) => (r as { id: number }).id;

  /** Is the server there at all? Tells "offline" from "the server said no". */
  async function offline(): Promise<boolean> {
    try {
      const res = await doFetch(`${base}/health`);
      return !res.ok;
    } catch {
      return true;
    }
  }

  async function call<T>(path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
    } catch (e) {
      throw new Error((await offline()) ? OFFLINE : textOf(e));
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      // not JSON: the status says it
    }
    if (!res.ok) {
      const msg = (data as { error?: string } | null)?.error;
      if (res.status >= 502 && res.status <= 504 && (await offline()))
        throw new Error(OFFLINE);
      throw new Error(msg ?? `the server answered ${res.status}`);
    }
    return data as T;
  }

  return {
    async load(db, tables) {
      const remote = tables.filter((t) => !local.has(t));
      const out: Tables = {};
      if (remote.length) {
        const r = await call<{ data: Tables }>("/sync/load", {
          tables: remote,
        });
        for (const t of remote) out[t] = r.data?.[t] ?? [];
      }
      for (const t of tables) if (local.has(t)) out[t] = readLocal(db, t);
      return out;
    },
    async put(db, table, rows) {
      if (local.has(table)) {
        const byId = new Map(readLocal(db, table).map((r) => [idOf(r), r]));
        for (const r of rows) byId.set(idOf(r), r);
        return writeLocal(db, table, [...byId.values()]);
      }
      if (!rows.length) return;
      await call("/sync/put", { table, rows });
    },
    async remove(db, table, ids) {
      if (local.has(table)) {
        const drop = new Set(ids);
        return writeLocal(
          db,
          table,
          readLocal(db, table).filter((r) => !drop.has(idOf(r))),
        );
      }
      if (!ids.length) return;
      await call("/sync/remove", { table, ids });
    },
    async replaceAll(db, data) {
      const remote: Tables = {};
      for (const [t, rows] of Object.entries(data)) {
        if (local.has(t)) writeLocal(db, t, rows);
        else remote[t] = rows;
      }
      await call("/sync/replace", { data: remote });
    },
  };
}

/** The `idb` plugin over HTTP: same effects, same replies as `createIdbPlugin`. */
export const createHttpIdbPlugin = (opts: HttpBackendOptions = {}) =>
  createIdbPlugin(createHttpBackend(opts));
