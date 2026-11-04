import pg from "pg";

export const DEFAULT_DATABASE_URL = "postgres://app:app@localhost:5432/orbit";
/** The Postgres schema every table of Orbit lives in. */
export const SCHEMA = "orbit";

/**
 * A connection pool for `DATABASE_URL` (the compose.yaml database when the
 * variable is not set). Every connection searches the `orbit` schema first, so
 * Orbit never collides with another app in the same database.
 */
export function createPool(url?: string): pg.Pool {
  return new pg.Pool({
    connectionString:
      url ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    max: 10,
    options: `-c search_path=${SCHEMA},public`,
  });
}
