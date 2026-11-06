import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { seedDb } from "../../../../framework/ui-kit/frontend/templates/orbit-social/seed.ts";
import { createQuery, type Query } from "./query.ts";
import type { Row } from "./repo.ts";
import { replaceAll, TABLE_NAMES } from "./repo.ts";

// Plain paths: under jsdom (the frontend tests) the global `URL` is not Node's.
const DIR = dirname(fileURLToPath(import.meta.url));

/** Restores the demo data (the frontend's `seedDb()`); returns the row count. */
export async function seedDatabase(run: Query): Promise<number> {
  const db = seedDb() as unknown as Record<string, Row[]>;
  return replaceAll(
    run,
    Object.fromEntries(TABLE_NAMES.map((t) => [t, db[t]])),
  );
}

/**
 * Drops, creates and seeds the `orbit` schema (schema.sql, then the seed): the
 * demo database starts from a clean slate. Used by `npm run db:init` and by
 * the tests, which run against the real API and the real database.
 */
export async function resetDatabase(pool: pg.Pool): Promise<number> {
  await pool.query(await readFile(join(DIR, "schema.sql"), "utf8"));
  return seedDatabase(createQuery(pool));
}

/** Creates and seeds the schema only when it is not there yet. */
export async function ensureDatabase(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query(
    `SELECT to_regclass('orbit.users') AS users`,
  );
  if (!rows[0].users) await resetDatabase(pool);
}
