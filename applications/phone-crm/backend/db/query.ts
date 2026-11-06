import type pg from "pg";

/**
 * The one thing the API needs from the database: run SQL, get rows. A query
 * made by `createQuery` can also run a function inside one transaction
 * (BEGIN ... COMMIT, ROLLBACK when it throws); a plain function without
 * `transaction` (a test double) just runs the function against itself.
 */
export interface Query {
  <Row>(sql: string, params?: unknown[]): Promise<Row[]>;
  transaction?<T>(fn: (q: Query) => Promise<T>): Promise<T>;
}

export function createQuery(pool: pg.Pool): Query {
  const query: Query = (sql, params = []) =>
    pool.query(sql, params).then((r) => r.rows);
  query.transaction = async <T>(fn: (q: Query) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    const inner: Query = (sql, params = []) =>
      client.query(sql, params).then((r) => r.rows);
    try {
      await client.query("BEGIN");
      const result = await fn(inner);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  };
  return query;
}

/** Runs `fn` in one transaction when the query supports it. */
export const inTransaction = <T>(
  query: Query,
  fn: (q: Query) => Promise<T>,
): Promise<T> => (query.transaction ? query.transaction(fn) : fn(query));
