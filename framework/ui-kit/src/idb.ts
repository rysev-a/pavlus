import type { Effect, Plugin } from "@pavlus/client";

/**
 * IndexedDB for the application. The application is pure: it only asks
 * (`idbEffector.load`, `put`, `remove`, `replaceAll`) and gets the answer back
 * as a message. A database is a name; a table is an object store keyed by the
 * `id` of its rows. The storage itself sits behind a `Backend`, so a test can
 * run the plugin on `createMemoryBackend()` and the page on `createIdbBackend()`.
 */

export type Rows = unknown[];
export type Tables = Record<string, Rows>;

/** The reply of `load`. */
export interface Loaded {
  data: Tables;
  /** true when the database has no rows at all */
  empty: boolean;
}

/** The reply of `replaceAll`. */
export interface Replaced {
  rows: number;
}

export type IdbEffect = Effect & { plugin: "idb" } & (
    | {
        type: "load";
        db: string;
        tables: string[];
        onSuccess: string;
        onError: string;
      }
    | { type: "put"; db: string; table: string; rows: Rows; onError?: string }
    | {
        type: "remove";
        db: string;
        table: string;
        ids: number[];
        onError?: string;
      }
    | {
        type: "replaceAll";
        db: string;
        data: Tables;
        onSuccess: string;
        onError: string;
      }
  );

export const idbEffector = {
  /** Reads every table as an array of rows; replies `Loaded` to `onSuccess`. */
  load: (
    db: string,
    tables: string[],
    onSuccess: string,
    onError: string,
  ): IdbEffect => ({
    plugin: "idb",
    type: "load",
    db,
    tables,
    onSuccess,
    onError,
  }),
  /** Upserts rows by `id`; no reply unless it fails (the error text goes to `onError`). */
  put: (
    db: string,
    table: string,
    rows: Rows,
    onError?: string,
  ): IdbEffect => ({
    plugin: "idb",
    type: "put",
    db,
    table,
    rows,
    onError,
  }),
  /** Deletes rows by `id`; no reply unless it fails. */
  remove: (
    db: string,
    table: string,
    ids: number[],
    onError?: string,
  ): IdbEffect => ({
    plugin: "idb",
    type: "remove",
    db,
    table,
    ids,
    onError,
  }),
  /** Clears every table of `data` (and every other table) and writes `data`, in one transaction; replies `Replaced`. */
  replaceAll: (
    db: string,
    data: Tables,
    onSuccess: string,
    onError: string,
  ): IdbEffect => ({
    plugin: "idb",
    type: "replaceAll",
    db,
    data,
    onSuccess,
    onError,
  }),
};

/** Where the rows live. Every method rejects with an `Error` that says what went wrong. */
export interface Backend {
  load(db: string, tables: string[]): Promise<Tables>;
  put(db: string, table: string, rows: Rows): Promise<void>;
  remove(db: string, table: string, ids: number[]): Promise<void>;
  replaceAll(db: string, data: Tables): Promise<void>;
}

const idOf = (row: unknown): number => {
  const id = (row as { id?: unknown } | null)?.id;
  if (typeof id !== "number" || !Number.isFinite(id))
    throw new Error("a row has no numeric id");
  return id;
};

const copy = <T>(value: T): T => structuredClone(value);

/** A backend in memory, for tests (and as a fallback where there is no IndexedDB). */
export function createMemoryBackend(
  initial: Record<string, Tables> = {},
): Backend {
  const dbs = new Map<string, Map<string, Map<number, unknown>>>();
  const tableOf = (db: string, table: string) => {
    let d = dbs.get(db);
    if (!d) dbs.set(db, (d = new Map()));
    let t = d.get(table);
    if (!t) d.set(table, (t = new Map()));
    return t;
  };
  for (const [db, tables] of Object.entries(initial))
    for (const [table, rows] of Object.entries(tables))
      for (const row of rows) tableOf(db, table).set(idOf(row), copy(row));
  return {
    async load(db, tables) {
      const out: Tables = {};
      for (const table of tables)
        out[table] = [...tableOf(db, table).values()].map(copy);
      return out;
    },
    async put(db, table, rows) {
      const ids = rows.map(idOf); // validate before writing: all or nothing
      const t = tableOf(db, table);
      rows.forEach((row, i) => t.set(ids[i], copy(row)));
    },
    async remove(db, table, ids) {
      const t = tableOf(db, table);
      for (const id of ids) t.delete(id);
    },
    async replaceAll(db, data) {
      const checked = Object.entries(data).map(
        ([table, rows]) =>
          [table, rows.map((r) => [idOf(r), copy(r)] as const)] as const,
      );
      const d = dbs.get(db);
      if (d) for (const t of d.values()) t.clear();
      for (const [table, pairs] of checked) {
        const t = tableOf(db, table);
        for (const [id, row] of pairs) t.set(id, row);
      }
    },
  };
}

const wrap = (e: unknown, what: string): Error =>
  new Error(
    `${what}: ${e instanceof Error ? e.message : String(e) || "unknown error"}`,
  );

/** The real IndexedDB of the window. Stores are created on upgrade; a database is opened lazily, once per name. */
export function createIdbBackend(factory?: IDBFactory): Backend {
  const idb = () => {
    const f = factory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!f) throw new Error("IndexedDB is not available");
    return f;
  };
  const opened = new Map<string, IDBDatabase>();
  const locks = new Map<string, Promise<unknown>>();
  /** Everything on one database runs one job at a time: a version bump never meets a live transaction. */
  const exclusive = <T>(name: string, job: () => Promise<T>): Promise<T> => {
    const run = (locks.get(name) ?? Promise.resolve()).then(job, job);
    locks.set(
      name,
      run.catch(() => undefined),
    );
    return run;
  };

  const openAt = (
    name: string,
    version: number | undefined,
    tables: string[],
  ) =>
    new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      let gaveUp = false;
      try {
        req =
          version === undefined ? idb().open(name) : idb().open(name, version);
      } catch (e) {
        reject(wrap(e, `cannot open "${name}"`));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const t of tables)
          if (!db.objectStoreNames.contains(t))
            db.createObjectStore(t, { keyPath: "id" });
      };
      req.onblocked = () => {
        gaveUp = true;
        reject(
          new Error(
            `cannot open "${name}": blocked by another tab that holds an older version`,
          ),
        );
      };
      req.onerror = () => reject(wrap(req.error, `cannot open "${name}"`));
      req.onsuccess = () => {
        // the open was reported as blocked but went through later: nobody wants the connection
        if (gaveUp) req.result.close();
        else resolve(req.result);
      };
    });

  /** The open database with (at least) these stores; a missing store bumps the version. Call under `exclusive`. */
  const ensure = async (
    name: string,
    tables: string[],
  ): Promise<IDBDatabase> => {
    let db = opened.get(name);
    if (!db) {
      db = await openAt(name, undefined, tables);
    }
    if (tables.some((t) => !db!.objectStoreNames.contains(t))) {
      const version = db.version + 1;
      db.close();
      opened.delete(name);
      db = await openAt(name, version, tables);
    }
    const cur = db;
    cur.onversionchange = () => {
      cur.close();
      if (opened.get(name) === cur) opened.delete(name);
    };
    cur.onclose = () => {
      if (opened.get(name) === cur) opened.delete(name);
    };
    opened.set(name, cur);
    return cur;
  };

  /**
   * One transaction over `tables` (or over every store of the database when
   * `tables` is null); resolves once the transaction has committed.
   */
  const run = <T>(
    name: string,
    tables: string[],
    mode: IDBTransactionMode,
    work: (stores: Record<string, IDBObjectStore>, names: string[]) => T,
    every = false,
  ): Promise<T> =>
    exclusive(name, async () => {
      const db = await ensure(name, tables);
      const names = every ? Array.from(db.objectStoreNames) : tables;
      return new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(names, mode);
        } catch (e) {
          reject(wrap(e, `transaction on "${name}" failed`));
          return;
        }
        let result: T;
        try {
          const stores: Record<string, IDBObjectStore> = {};
          for (const t of names) stores[t] = tx.objectStore(t);
          result = work(stores, names);
        } catch (e) {
          try {
            tx.abort();
          } catch {
            // already finished
          }
          reject(wrap(e, `write to "${name}" failed`));
          return;
        }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () =>
          reject(wrap(tx.error, `transaction on "${name}" failed`));
        tx.onabort = () =>
          reject(wrap(tx.error, `transaction on "${name}" was aborted`));
      });
    });

  const asReq = <T>(r: IDBRequest<T>, out: { v?: T }) => {
    r.onsuccess = () => (out.v = r.result);
  };

  return {
    async load(db, tables) {
      const got: Record<string, { v?: unknown[] }> = {};
      await run(db, tables, "readonly", (stores) => {
        for (const t of tables)
          asReq(stores[t].getAll() as IDBRequest<unknown[]>, (got[t] = {}));
      });
      const out: Tables = {};
      for (const t of tables) out[t] = got[t].v ?? [];
      return out;
    },
    async put(db, table, rows) {
      if (!rows.length) return;
      rows.forEach(idOf);
      await run(db, [table], "readwrite", (s) => {
        for (const row of rows) s[table].put(row);
      });
    },
    async remove(db, table, ids) {
      if (!ids.length) return;
      await run(db, [table], "readwrite", (s) => {
        for (const id of ids) s[table].delete(id);
      });
    },
    async replaceAll(db, data) {
      for (const rows of Object.values(data)) rows.forEach(idOf);
      const tables = Object.keys(data);
      if (!tables.length) return;
      // every store the database already has is cleared, not only those of `data`
      await run(
        db,
        tables,
        "readwrite",
        (s, names) => {
          for (const t of names) s[t].clear();
          for (const [t, rows] of Object.entries(data))
            for (const row of rows) s[t].put(row);
        },
        true,
      );
    },
  };
}

const textOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export function createIdbPlugin(
  backend: Backend = createIdbBackend(),
): Plugin<IdbEffect, unknown> {
  // writes to one database run in the order they were asked for
  const tails = new Map<string, Promise<unknown>>();
  const queue = <T>(db: string, job: () => Promise<T>): Promise<T> => {
    const run = (tails.get(db) ?? Promise.resolve()).then(job, job);
    tails.set(
      db,
      run.catch(() => undefined),
    );
    return run;
  };
  return {
    name: "idb",
    handle(effect, ctx) {
      switch (effect.type) {
        case "load":
          queue(effect.db, () => backend.load(effect.db, effect.tables)).then(
            (data) =>
              ctx.dispatch({
                id: effect.onSuccess,
                payload: {
                  data,
                  empty: Object.values(data).every((rows) => rows.length === 0),
                } satisfies Loaded,
              }),
            (e) => ctx.dispatch({ id: effect.onError, payload: textOf(e) }),
          );
          return;
        case "put":
        case "remove": {
          const job =
            effect.type === "put"
              ? () => backend.put(effect.db, effect.table, effect.rows)
              : () => backend.remove(effect.db, effect.table, effect.ids);
          queue(effect.db, job).catch((e) => {
            if (effect.onError)
              ctx.dispatch({ id: effect.onError, payload: textOf(e) });
          });
          return;
        }
        case "replaceAll":
          queue(effect.db, () =>
            backend.replaceAll(effect.db, effect.data),
          ).then(
            () =>
              ctx.dispatch({
                id: effect.onSuccess,
                payload: {
                  rows: Object.values(effect.data).reduce(
                    (n, r) => n + r.length,
                    0,
                  ),
                } satisfies Replaced,
              }),
            (e) => ctx.dispatch({ id: effect.onError, payload: textOf(e) }),
          );
          return;
      }
    },
  };
}
