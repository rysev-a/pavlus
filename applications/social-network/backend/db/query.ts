import type pg from "pg";

/**
 * The one thing the API needs from the database. `transaction` runs `fn`
 * with a query function bound to one connection: BEGIN, then COMMIT, or
 * ROLLBACK when `fn` throws.
 */
export interface Query {
  <Row>(sql: string, params?: unknown[]): Promise<Row[]>;
  transaction<T>(fn: (q: Query) => Promise<T>): Promise<T>;
}

/** A `Query` over a pool (or, inside a transaction, over one client). */
export function createQuery(pool: pg.Pool): Query {
  const bind = (target: pg.Pool | pg.PoolClient, tx: boolean): Query => {
    const q = (<Row>(sql: string, params: unknown[] = []) =>
      target.query(sql, params).then((r) => r.rows as Row[])) as Query;
    q.transaction = async (fn) => {
      // A nested call just joins the transaction that is open.
      if (tx) return fn(q);
      const client = await (target as pg.Pool).connect();
      try {
        await client.query("BEGIN");
        const result = await fn(bind(client, true));
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    };
    return q;
  };
  return bind(pool, false);
}
