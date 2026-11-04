import pg from "pg";

export const DEFAULT_DATABASE_URL =
  "postgres://admin:admin@localhost:5432/admin_app";

/**
 * A connection pool for `DATABASE_URL` (the compose.yaml database when the
 * variable is not set). Connections are opened lazily on the first query.
 */
export function createPool(): pg.Pool {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    max: 10,
  });
}
