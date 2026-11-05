import { randomBytes } from "node:crypto";
import type { Plugin, PluginContext } from "@service-laboratory/pavlus";
import pg from "pg";
import {
  type Cancellable,
  type EffectCtx,
  type Dispatch,
  deliver,
  fail,
  ok,
  ridOf,
} from "../../ctx.ts";
import {
  type MigrateResult,
  type MigrationStep,
  migrate,
  stepsFromDir,
} from "./migrate.ts";

export { pgEffector } from "./helpers.ts";
export type { PgEffector } from "./helpers.ts";
export { sql } from "./sql.ts";
export type { SqlQuery, SqlTag } from "./sql.ts";
export type { MigrateResult, MigrationStep } from "./migrate.ts";

type Base = {
  plugin: "pg";
  ctx?: EffectCtx;
  replyTo?: string;
  onError?: string;
};

export type PgEffect =
  /** Replies `{rows, rowCount, fields}`. With `tx` it runs inside that transaction. */
  | (Base & {
      type: "query";
      sql: string;
      params?: unknown[];
      tx?: string;
      timeoutMs?: number;
    })
  /** Leases a client from the pool; replies `{tx}`. */
  | (Base & {
      type: "tx.begin";
      isolation?: "read committed" | "repeatable read" | "serializable";
      readOnly?: boolean;
    })
  | (Base & { type: "tx.commit"; tx: string })
  | (Base & { type: "tx.rollback"; tx: string })
  /** Replies `{applied, skipped}`. */
  | (Base & {
      type: "migrate";
      dir?: string;
      steps?: MigrationStep[];
      table?: string;
    });

export type PgErrorPayload = {
  code: string;
  message: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
  schema?: string;
};

export interface PgQueryReply {
  rows: Record<string, unknown>[];
  rowCount: number | null;
  fields: { name: string; dataTypeID: number }[];
}

export interface PgPluginOptions {
  pool?: pg.Pool;
  url?: string;
  /** Extra pg.PoolConfig when `url` is used (max, options: "-c search_path=..." ...). */
  config?: pg.PoolConfig;
  /** Default per-query timeout (ms); ctx.deadline and effect.timeoutMs can only shorten it. */
  defaultTimeoutMs?: number;
  now?: () => number;
}

export interface PgMetrics {
  total: number;
  idle: number;
  waiting: number;
  queries: number;
  errors: number;
  timeouts: number;
  cancelled: number;
  txOpen: number;
  txBegun: number;
  txCommitted: number;
  txRolledBack: number;
}

export interface PgPlugin extends Plugin<PgEffect, any>, Cancellable {
  readonly pool: pg.Pool;
  metrics(): PgMetrics;
  /** Resolves when everything leased has been returned and the pool is closed (only closes a pool the plugin created). */
  close(): Promise<void>;
}

interface Tx {
  id: string;
  client: pg.PoolClient;
  rid?: string;
  pid: number;
  running: number;
  finished: boolean;
}

interface Running {
  pid: number;
  cancelled: boolean;
  /** Set once the query is on a connection. */
  cancel: () => void;
}

export function toPgError(e: unknown): PgErrorPayload {
  const x = e as Record<string, unknown> & Error;
  const out: PgErrorPayload = {
    code: typeof x?.code === "string" ? x.code : "ERROR",
    message: x?.message ?? String(e),
  };
  for (const k of [
    "detail",
    "constraint",
    "table",
    "column",
    "schema",
  ] as const)
    if (typeof x?.[k] === "string") out[k] = x[k] as string;
  return out;
}

export function createPostgresPlugin(opts: PgPluginOptions): PgPlugin {
  if (!opts.pool && !opts.url)
    throw new Error("createPostgresPlugin: `pool` or `url` is required");
  const ownsPool = !opts.pool;
  const pool =
    opts.pool ?? new pg.Pool({ connectionString: opts.url, ...opts.config });
  const now = opts.now ?? Date.now;
  // a pool without an error listener crashes the process on idle-client errors
  const onPoolError = () => {};
  pool.on("error", onPoolError);

  const txs = new Map<string, Tx>();
  const running = new Map<string, Set<Running>>();
  const stats = {
    queries: 0,
    errors: 0,
    timeouts: 0,
    cancelled: 0,
    txBegun: 0,
    txCommitted: 0,
    txRolledBack: 0,
  };
  let disposed = false;

  const trackRunning = (rid: string | undefined, r: Running) => {
    if (!rid) return () => {};
    let s = running.get(rid);
    if (!s) running.set(rid, (s = new Set()));
    s.add(r);
    return () => {
      s!.delete(r);
      if (s!.size === 0) running.delete(rid);
    };
  };

  /** Asks the server to cancel the backend; uses a second pooled connection. */
  async function cancelBackend(pid: number): Promise<void> {
    try {
      await pool.query("select pg_cancel_backend($1)", [pid]);
    } catch {
      /* the pool may be closing */
    }
  }

  function effectiveTimeout(effect: {
    timeoutMs?: number;
    ctx?: EffectCtx;
  }): number | undefined {
    let ms = effect.timeoutMs ?? opts.defaultTimeoutMs;
    const deadline = effect.ctx?.deadline;
    if (typeof deadline === "number") {
      const left = deadline - now();
      ms = ms === undefined ? left : Math.min(ms, left);
    }
    return ms;
  }

  async function runQuery(
    effect: Extract<PgEffect, { type: "query" }>,
    dispatch: Dispatch,
  ): Promise<void> {
    const rid = ridOf(effect);
    const state: Running = { pid: 0, cancelled: false, cancel: () => {} };
    const untrack = trackRunning(rid, state);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let client: pg.PoolClient | undefined;
    let tx: Tx | undefined;
    stats.queries++;
    try {
      const timeout = effectiveTimeout(effect);
      if (timeout !== undefined && timeout <= 0) {
        stats.timeouts++;
        throw Object.assign(new Error("request deadline exceeded"), {
          code: "57014",
        });
      }
      if (effect.tx !== undefined) {
        tx = txs.get(effect.tx);
        if (!tx || tx.finished)
          throw Object.assign(
            new Error(`unknown or finished transaction ${effect.tx}`),
            { code: "PAVLUS_NO_TX" },
          );
        client = tx.client;
        state.pid = tx.pid;
        tx.running++;
      } else {
        client = await pool.connect();
        // the connection's backend pid
        state.pid = (client as unknown as { processID: number }).processID;
      }
      if (state.cancelled) return;
      state.cancel = () => void cancelBackend(state.pid);
      if (timeout !== undefined) {
        timer = setTimeout(() => {
          timedOut = true;
          void cancelBackend(state.pid);
        }, timeout);
      }
      const res = await client.query({
        text: effect.sql,
        values: effect.params ?? [],
      });
      if (state.cancelled || disposed) return;
      const payload: PgQueryReply = {
        rows: res.rows,
        rowCount: res.rowCount,
        fields: (res.fields ?? []).map((f) => ({
          name: f.name,
          dataTypeID: f.dataTypeID,
        })),
      };
      deliver(dispatch, ok(effect, payload));
    } catch (e) {
      if (state.cancelled || disposed) return;
      stats.errors++;
      const err = toPgError(e);
      if (timedOut) {
        stats.timeouts++;
        err.code = "57014";
        err.message = "statement timeout";
      }
      deliver(dispatch, fail(effect, err, "pg.error"));
    } finally {
      if (timer) clearTimeout(timer);
      untrack();
      if (tx) tx.running--;
      else if (client) client.release();
    }
  }

  async function finishTx(tx: Tx, how: "commit" | "rollback"): Promise<void> {
    if (tx.finished) return;
    tx.finished = true;
    txs.delete(tx.id);
    // a still running statement must not hold up the rollback
    if (tx.running > 0) await cancelBackend(tx.pid);
    let broken = false;
    try {
      await tx.client.query(how === "commit" ? "commit" : "rollback");
      if (how === "commit") stats.txCommitted++;
      else stats.txRolledBack++;
    } catch (e) {
      broken = true;
      if (how === "rollback") stats.txRolledBack++;
      throw e;
    } finally {
      tx.client.release(broken ? true : undefined);
    }
  }

  async function beginTx(
    effect: Extract<PgEffect, { type: "tx.begin" }>,
    dispatch: Dispatch,
  ): Promise<void> {
    let client: pg.PoolClient | undefined;
    try {
      client = await pool.connect();
      const iso = effect.isolation
        ? ` isolation level ${effect.isolation}`
        : "";
      const ro = effect.readOnly ? " read only" : "";
      await client.query(`begin${iso}${ro}`);
      const rid = ridOf(effect);
      const tx: Tx = {
        id: "tx_" + randomBytes(8).toString("hex"),
        client,
        pid: (client as unknown as { processID: number }).processID,
        running: 0,
        finished: false,
      };
      if (rid !== undefined) tx.rid = rid;
      if (disposed) throw new Error("plugin disposed");
      txs.set(tx.id, tx);
      stats.txBegun++;
      deliver(dispatch, ok(effect, { tx: tx.id }));
    } catch (e) {
      client?.release(true);
      stats.errors++;
      deliver(dispatch, fail(effect, toPgError(e), "pg.error"));
    }
  }

  async function endTx(
    effect: Extract<PgEffect, { type: "tx.commit" | "tx.rollback" }>,
    dispatch: Dispatch,
  ): Promise<void> {
    const tx = txs.get(effect.tx);
    if (!tx) {
      if (effect.type === "tx.commit")
        deliver(
          dispatch,
          fail(
            effect,
            {
              code: "PAVLUS_NO_TX",
              message: `unknown or finished transaction ${effect.tx}`,
            },
            "pg.error",
          ),
        );
      else deliver(dispatch, ok(effect, { tx: effect.tx }));
      return;
    }
    try {
      await finishTx(tx, effect.type === "tx.commit" ? "commit" : "rollback");
      deliver(dispatch, ok(effect, { tx: effect.tx }));
    } catch (e) {
      stats.errors++;
      deliver(dispatch, fail(effect, toPgError(e), "pg.error"));
    }
  }

  async function runMigrate(
    effect: Extract<PgEffect, { type: "migrate" }>,
    dispatch: Dispatch,
  ): Promise<void> {
    try {
      const steps =
        effect.steps ??
        (effect.dir ? await stepsFromDir(effect.dir) : undefined);
      if (!steps) throw new Error("pg.migrate needs `dir` or `steps`");
      const res: MigrateResult = await migrate(pool, steps, effect.table);
      deliver(dispatch, ok(effect, res));
    } catch (e) {
      stats.errors++;
      deliver(dispatch, fail(effect, toPgError(e), "pg.error"));
    }
  }

  return {
    name: "pg",
    pool,
    handle(effect: PgEffect, pc: PluginContext) {
      if (disposed) return;
      switch (effect.type) {
        case "query":
          return void runQuery(effect, pc.dispatch);
        case "tx.begin":
          return void beginTx(effect, pc.dispatch);
        case "tx.commit":
        case "tx.rollback":
          return void endTx(effect, pc.dispatch);
        case "migrate":
          return void runMigrate(effect, pc.dispatch);
      }
    },
    /** Rolls back and releases the open transactions of `rid` and cancels its running queries. */
    cancel(rid) {
      for (const r of [...(running.get(rid) ?? [])]) {
        r.cancelled = true;
        stats.cancelled++;
        r.cancel();
      }
      for (const tx of [...txs.values()]) {
        if (tx.rid === rid) {
          stats.cancelled++;
          finishTx(tx, "rollback").catch(() => {});
        }
      }
    },
    metrics() {
      return {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        txOpen: txs.size,
        ...stats,
      };
    },
    async close() {
      this.dispose?.();
      if (ownsPool) await pool.end();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const tx of [...txs.values()])
        finishTx(tx, "rollback").catch(() => {});
      pool.off("error", onPoolError);
      pool.on("error", () => {});
    },
  };
}
