/**
 * The JSON API, as pure functions over a `query` function: no `http` here,
 * so the handlers are tested without a server and without Postgres.
 */

import type { Query } from "./db/query.ts";
export type { Query };

export interface Reply {
  status: number;
  body: unknown;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface Role {
  id: number;
  name: string;
  description: string;
  /** How many users have this role. */
  users: number;
}

export interface Product {
  id: number;
  name: string;
  /** `numeric(8,2)`: the driver hands it over as a string. */
  price: string;
  stock: number;
}

export interface Payment {
  id: number;
  /** The name of the user who paid, joined in by the backend. */
  customer: string;
  amount: string;
  status: string;
  /** Formatted in the query, so server and browser render the same text. */
  paid_at: string;
}

const ok = (body: unknown): Reply => ({ status: 200, body });
const error = (status: number, message: string): Reply => ({
  status,
  body: { error: message },
});

export async function listUsers(query: Query): Promise<Reply> {
  const users = await query<User>(
    `SELECT u.id, u.name, u.email, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      ORDER BY u.id`,
  );
  return ok(users);
}

export async function listRoles(query: Query): Promise<Reply> {
  const roles = await query<Role>(
    `SELECT r.id, r.name, r.description, count(u.id)::int AS users
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.id
      GROUP BY r.id
      ORDER BY r.id`,
  );
  return ok(roles);
}

export async function listProducts(query: Query): Promise<Reply> {
  const products = await query<Product>(
    `SELECT id, name, price, stock
       FROM products
      ORDER BY id`,
  );
  return ok(products);
}

/** The last ten payments, the newest first. */
export async function listPayments(query: Query): Promise<Reply> {
  const payments = await query<Payment>(
    `SELECT p.id, u.name AS customer, p.amount, p.status,
            to_char(p.paid_at, 'YYYY-MM-DD HH24:MI') AS paid_at
       FROM payments p
       JOIN users u ON u.id = p.user_id
      ORDER BY p.paid_at DESC
      LIMIT 10`,
  );
  return ok(payments);
}

/** Deletes one user: its id comes back; a user that is not there is a 404. */
export async function deleteUser(id: number, query: Query): Promise<Reply> {
  // The payments go first: they would otherwise keep the user referenced.
  await query(`DELETE FROM payments WHERE user_id = $1`, [id]);
  const deleted = await query<Pick<User, "id">>(
    `DELETE FROM users WHERE id = $1 RETURNING id`,
    [id],
  );
  return deleted.length
    ? ok({ deleted: deleted[0].id })
    : error(404, `no user ${id}`);
}

/** Routes one request. An unknown GET path is a 404, a wrong method a 405. */
export async function handleApi(
  method: string,
  pathname: string,
  query: Query,
): Promise<Reply> {
  if (method === "GET") {
    switch (pathname) {
      case "/api/users":
        return listUsers(query);
      case "/api/roles":
        return listRoles(query);
      case "/api/products":
        return listProducts(query);
      case "/api/payments":
        return listPayments(query);
      default:
        return error(404, `no route for ${pathname}`);
    }
  }
  if (method === "DELETE") {
    const user = /^\/api\/users\/(\d+)$/.exec(pathname);
    if (user) return deleteUser(Number(user[1]), query);
  }
  return error(405, `${method} is not allowed`);
}
