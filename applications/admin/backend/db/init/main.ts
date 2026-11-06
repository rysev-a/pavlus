/**
 * Creates the tables and seeds them: `npm run db:init`. Safe to run again; it
 * starts from a clean slate every time (this is a demo database).
 */
import { createPool } from "../pool.ts";
import { resetDatabase } from "./reset.ts";

const pool = createPool();
try {
  await resetDatabase(pool);
  const { rows } = await pool.query<{
    users: number;
    roles: number;
    permissions: number;
    categories: number;
    products: number;
    payments: number;
    orders: number;
    tasks: number;
    processes: number;
  }>(
    `SELECT (SELECT count(*) FROM users)::int AS users,
            (SELECT count(*) FROM roles)::int AS roles,
            (SELECT count(*) FROM permissions)::int AS permissions,
            (SELECT count(*) FROM categories)::int AS categories,
            (SELECT count(*) FROM products)::int AS products,
            (SELECT count(*) FROM payments)::int AS payments,
            (SELECT count(*) FROM orders)::int AS orders,
            (SELECT count(*) FROM tasks)::int AS tasks,
            (SELECT count(*) FROM processes)::int AS processes`,
  );
  const c = rows[0];
  console.log(
    `database ready: ${c.users} users, ${c.roles} roles, ${c.permissions} permissions, ` +
      `${c.categories} categories, ${c.products} products, ${c.payments} payments, ` +
      `${c.orders} orders, ${c.tasks} tasks, ${c.processes} processes`,
  );
} finally {
  await pool.end();
}
