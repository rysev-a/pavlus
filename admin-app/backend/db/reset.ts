import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

// Plain paths: under jsdom (the frontend tests) the global `URL` is not Node's.
const DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Drops, creates and seeds the tables (schema.sql, then seed.sql): the demo
 * database starts from a clean slate. Used by `npm run db:init` and by the
 * frontend tests, which run against the real API and the real database.
 */
export async function resetDatabase(pool: pg.Pool): Promise<void> {
  for (const name of ["schema.sql", "seed.sql"]) {
    const sql = await readFile(join(DIR, name), "utf8");
    await pool.query(sql);
  }
}
