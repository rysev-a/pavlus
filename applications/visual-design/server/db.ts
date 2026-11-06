// Before the server listens: make sure the tables are there. Everything after
// that goes through the pg plugin.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));

export async function ensureDatabase(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(join(here, "schema.sql"), "utf8"));
  } finally {
    await client.end();
  }
}
