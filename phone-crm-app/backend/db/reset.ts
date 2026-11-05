import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { seedDb } from "../../../ui-kit/frontend/templates/phone-retail-crm/seed.ts";
import { DB_SCHEMA } from "./pool.ts";
import { createQuery } from "./query.ts";
import { replaceAll } from "./repo.ts";

// Plain paths: under jsdom (the frontend tests) the global `URL` is not Node's.
const DIR = dirname(fileURLToPath(import.meta.url));

/** Creates the schema and tables if they are missing (idempotent). */
export async function ensureSchema(pool: pg.Pool): Promise<void> {
  await pool.query(await readFile(join(DIR, "schema.sql"), "utf8"));
}

/** Restores the demo data: what the frontend's `seedDb()` generates. */
export async function seedDatabase(pool: pg.Pool): Promise<number> {
  return replaceAll(createQuery(pool), seedDb());
}

/**
 * Drops the whole `phone_crm` schema, recreates the tables and seeds them
 * with the frontend's `seedDb()`: a clean slate. Used by `npm run db:init`
 * and by the tests.
 */
export async function resetDatabase(pool: pg.Pool): Promise<number> {
  await pool.query(`DROP SCHEMA IF EXISTS ${DB_SCHEMA} CASCADE`);
  await ensureSchema(pool);
  return seedDatabase(pool);
}
