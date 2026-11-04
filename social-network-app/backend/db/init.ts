/**
 * Creates the schema and seeds it: `npm run db:init`. Safe to run again; it
 * starts from a clean slate every time (this is a demo database).
 */
import { createPool } from "./pool.ts";
import { resetDatabase } from "./reset.ts";

const pool = createPool();
try {
  const started = Date.now();
  const rows = await resetDatabase(pool);
  console.log(`database ready: ${rows} rows in ${Date.now() - started} ms`);
} finally {
  await pool.end();
}
