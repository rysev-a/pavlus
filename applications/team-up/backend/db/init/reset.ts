import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import type { Query } from "./query.ts";

// Plain paths: under jsdom (the frontend tests) the global `URL` is not Node's.
const DIR = dirname(fileURLToPath(import.meta.url));

const FILES = ["schema.sql", "seed.sql"];

/**
 * Drops, creates and seeds the tables — the directory part. The demo members
 * and their world are seeded from JS (main.ts): their passwords are scrypt
 * hashes, computed at init time in the crypto plugin's format.
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
