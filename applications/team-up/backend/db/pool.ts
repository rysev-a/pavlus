import pg from "pg";

export const DEFAULT_DATABASE_URL =
  "postgres://teamup:teamup@localhost:5434/team_up";
export const DEFAULT_REDIS_URL = "redis://localhost:6380";

/** A pool for `DATABASE_URL` (the compose database when not set). */
export function createPool(): pg.Pool {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    max: 10,
  });
}
