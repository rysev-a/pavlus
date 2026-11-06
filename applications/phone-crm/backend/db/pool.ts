import pg from "pg";

export const DEFAULT_DATABASE_URL =
  "postgres://app:app@localhost:5432/phone_crm";

/** The Postgres schema the app lives in (apps never share tables). */
export const DB_SCHEMA = "phone_crm";

/**
 * A connection pool for `DATABASE_URL` (the compose.yaml database when the
 * variable is not set). Every connection has `search_path = phone_crm`, so the
 * SQL names tables without a schema. Connections open lazily.
 */
export function createPool(url?: string): pg.Pool {
  return new pg.Pool({
    connectionString: url ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    max: 10,
    options: `-c search_path=${DB_SCHEMA},public`,
  });
}
