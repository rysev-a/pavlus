import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

export interface MigrationStep {
  name: string;
  sql: string;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

/** Reads `*.sql` files of a directory in name order. */
export async function stepsFromDir(dir: string): Promise<MigrationStep[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  return Promise.all(
    files.map(async (f) => ({
      name: f,
      sql: await readFile(join(dir, f), "utf8"),
    })),
  );
}

const LOCK_KEY_1 = 0x70617676; // "pavv"
const LOCK_KEY_2 = 0x6d696772; // "migr"

/**
 * Applies the steps that are not in `schema_migrations` yet, in order, each in
 * its own transaction, under a session advisory lock (so two servers booting
 * together do not race). Already applied names are skipped.
 */
export async function migrate(
  pool: Pool,
  steps: MigrationStep[],
  table = "schema_migrations",
): Promise<MigrateResult> {
  const names = new Set<string>();
  for (const s of steps) {
    if (names.has(s.name))
      throw new Error(`migrate: duplicate step "${s.name}"`);
    names.add(s.name);
  }
  const t = '"' + table.replace(/"/g, '""') + '"';
  const client = await pool.connect();
  const result: MigrateResult = { applied: [], skipped: [] };
  try {
    await client.query("select pg_advisory_lock($1, $2)", [
      LOCK_KEY_1,
      LOCK_KEY_2,
    ]);
    try {
      await client.query(
        `create table if not exists ${t} (name text primary key, applied_at timestamptz not null default now())`,
      );
      const done = new Set<string>(
        (await client.query(`select name from ${t}`)).rows.map(
          (r: { name: string }) => r.name,
        ),
      );
      for (const s of steps) {
        if (done.has(s.name)) {
          result.skipped.push(s.name);
          continue;
        }
        await client.query("begin");
        try {
          await client.query(s.sql);
          await client.query(`insert into ${t} (name) values ($1)`, [s.name]);
          await client.query("commit");
        } catch (e) {
          await client.query("rollback").catch(() => {});
          throw e;
        }
        result.applied.push(s.name);
      }
    } finally {
      await client
        .query("select pg_advisory_unlock($1, $2)", [LOCK_KEY_1, LOCK_KEY_2])
        .catch(() => {});
    }
  } finally {
    client.release();
  }
  return result;
}
