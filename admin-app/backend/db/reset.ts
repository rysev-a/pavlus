import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import type { Query } from "./query.ts";

// Plain paths: under jsdom (the frontend tests) the global `URL` is not Node's.
const DIR = dirname(fileURLToPath(import.meta.url));

const FILES = ["schema.sql", "seed.sql", "seed-users.sql"];

/**
 * Drops, creates and seeds the tables (schema.sql, then seed.sql — the eight
 * named users and the roles — then seed-users.sql with the generated ones):
 * the demo database starts from a clean slate. Works with any `query`
 * function, so the API route `POST /api/reset` reuses it as-is.
 */
export async function resetDb(query: Query): Promise<void> {
  for (const name of FILES) {
    const sql = await readFile(join(DIR, name), "utf8");
    await query(sql);
  }
}

/** The pool flavour, for `npm run db:init` and the test reseed. */
export function resetDatabase(pool: pg.Pool): Promise<void> {
  return resetDb(<Row>(sql: string, params?: unknown[]) =>
    pool.query(sql, params).then((r) => r.rows as Row[]),
  );
}
