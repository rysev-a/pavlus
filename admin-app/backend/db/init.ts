/**
 * Creates the tables and seeds them: `npm run db:init`. Safe to run again; it
 * starts from a clean slate every time (this is a demo database).
 */
import { createPool } from "./pool.ts";
import { resetDatabase } from "./reset.ts";

const pool = createPool();
try {
  await resetDatabase(pool);
  const { rows } = await pool.query<{
    users: number;
    roles: number;
    products: number;
    payments: number;
  }>(
    `SELECT (SELECT count(*) FROM users)::int AS users,
            (SELECT count(*) FROM roles)::int AS roles,
            (SELECT count(*) FROM products)::int AS products,
            (SELECT count(*) FROM payments)::int AS payments`,
  );
  console.log(
    `database ready: ${rows[0].users} users, ${rows[0].roles} roles, ${rows[0].products} products, ${rows[0].payments} payments`,
  );
} finally {
  await pool.end();
}
