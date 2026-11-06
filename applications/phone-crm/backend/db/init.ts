/**
 * Creates the tables and seeds them: `npm run db:init`. Safe to run again; it
 * starts from a clean slate every time (this is a demo database).
 */
import { createPool } from "./pool.ts";
import { resetDatabase } from "./reset.ts";

const pool = createPool();
try {
  const rows = await resetDatabase(pool);
  console.log(`database ready: ${rows} rows seeded (schema phone_crm)`);
} finally {
  await pool.end();
}
