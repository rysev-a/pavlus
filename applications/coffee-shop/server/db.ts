// Before the server listens: create the tables, and put the starting rows in the
// ones that are empty. Everything after that goes through the pg plugin.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { seed } from "./seed.ts";

const here = dirname(fileURLToPath(import.meta.url));
const SERIAL = ["customers", "products", "orders"];

const ident = (s: string): string => '"' + s.replace(/"/g, '""') + '"';
const asParam = (v: unknown): unknown =>
  v !== null && typeof v === "object" ? JSON.stringify(v) : v;

export async function ensureDatabase(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(join(here, "schema.sql"), "utf8"));
    for (const [table, rows] of Object.entries(seed)) {
      const have = await client.query(
        `select count(*)::int as n from ${ident(table)}`,
      );
      if (have.rows[0].n > 0) continue;
      for (const row of rows) {
        const cols = Object.keys(row);
        await client.query(
          `insert into ${ident(table)} (${cols.map(ident).join(", ")}) values (${cols.map((_, i) => "$" + (i + 1)).join(", ")})`,
          cols.map((c) => asParam(row[c])),
        );
      }
      // the rows came with their ids: the next one continues after them
      if (SERIAL.includes(table))
        await client.query(
          `select setval(pg_get_serial_sequence('${table}', 'id'), coalesce((select max(id) from ${ident(table)}), 1))`,
        );
    }
  } finally {
    await client.end();
  }
}
