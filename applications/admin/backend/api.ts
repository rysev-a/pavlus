/**
 * The JSON API: users and roles, as pure functions over a `query` function.
 * No `http` here, so the handlers run the same on the server (backend/server.ts)
 * and inside the server render (backend/ssr.ts), and are testable without a
 * socket and without Postgres.
 */

import type { Query } from "./db/query.ts";
import { resetDb } from "./db/reset.ts";
export type { Query };

export interface Reply {
  status: number;
  body: unknown;
}

/** One row of the list. `role` is the name; `role_id` feeds the edit form. */
export interface User {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role: string;
}

export interface Role {
  id: number;
  name: string;
  description: string;
  /** How many users have this role. */
  users: number;
}

const ok = (body: unknown): Reply => ({ status: 200, body });
const error = (status: number, message: string): Reply => ({
  status,
  body: { error: message },
});

/** A non-empty string from the request body, or undefined. */
const text = (body: unknown, field: string): string | undefined => {
  const value = (body as Record<string, unknown> | undefined)?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

async function listUsers(query: Query): Promise<Reply> {
  const users = await query<User>(
    `SELECT u.id, u.name, u.email, u.role_id, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      ORDER BY u.id`,
  );
  return ok(users);
}

async function getUser(id: number, query: Query): Promise<Reply> {
  const users = await query<User>(
    `SELECT u.id, u.name, u.email, u.role_id, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1`,
    [id],
  );
  return users.length ? ok(users[0]) : error(404, `no user ${id}`);
}

async function saveUser(
  body: unknown,
  id: number | null,
  query: Query,
): Promise<Reply> {
  const name = text(body, "name");
  const email = text(body, "email");
  const roleId = (body as Record<string, unknown> | undefined)?.role_id;
  if (!name || !email || typeof roleId !== "number")
    return error(400, "a user needs a name, an email and a role_id");
  const roles = await query<Pick<Role, "id">>(
    `SELECT id FROM roles WHERE id = $1`,
    [roleId],
  );
  if (!roles.length) return error(400, `no role ${roleId}`);
  const saved = id
    ? await query<Pick<User, "id">>(
        `UPDATE users SET name = $1, email = $2, role_id = $3
          WHERE id = $4 RETURNING id`,
        [name, email, roleId, id],
      )
    : await query<Pick<User, "id">>(
        `INSERT INTO users (name, email, role_id) VALUES ($1, $2, $3)
         RETURNING id`,
        [name, email, roleId],
      );
  if (!saved.length) return error(404, `no user ${id}`);
  return getUser(saved[0].id, query);
}

/** Deletes one user: its id comes back; a user that is not there is a 404. */
async function deleteUser(id: number, query: Query): Promise<Reply> {
  // What references the user goes first: payments, orders, sessions.
  await query(`DELETE FROM sessions WHERE user_id = $1`, [id]);
  await query(`DELETE FROM orders WHERE user_id = $1`, [id]);
  await query(`DELETE FROM payments WHERE user_id = $1`, [id]);
  const deleted = await query<Pick<User, "id">>(
    `DELETE FROM users WHERE id = $1 RETURNING id`,
    [id],
  );
  return deleted.length
    ? ok({ deleted: deleted[0].id })
    : error(404, `no user ${id}`);
}

async function listRoles(query: Query): Promise<Reply> {
  const roles = await query<Role>(
    `SELECT r.id, r.name, r.description, count(u.id)::int AS users
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.id
      GROUP BY r.id
      ORDER BY r.id`,
  );
  return ok(roles);
}

/** Routes one request. An unknown path is a 404, a wrong method a 405. */
export async function handleApi(
  method: string,
  pathname: string,
  query: Query,
  body?: unknown,
): Promise<Reply> {
  if (method === "GET") {
    if (pathname === "/api/users") return listUsers(query);
    if (pathname === "/api/roles") return listRoles(query);
    const id = /^\/api\/users\/(\d+)$/.exec(pathname);
    if (id) return getUser(Number(id[1]), query);
    return error(404, `no route for ${pathname}`);
  }
  if (method === "POST") {
    if (pathname === "/api/users") return saveUser(body, null, query);
    if (pathname === "/api/reset") {
      // The demo data is rebuilt from scratch: a reset button for the UI.
      await resetDb(query);
      const users = await query<Pick<User, "id">>(
        `SELECT count(*)::int AS id FROM users`,
      );
      return ok({ reset: true, users: users[0]?.id ?? 0 });
    }
  }
  if (method === "PUT") {
    const id = /^\/api\/users\/(\d+)$/.exec(pathname);
    if (id) return saveUser(body, Number(id[1]), query);
  }
  if (method === "DELETE") {
    const id = /^\/api\/users\/(\d+)$/.exec(pathname);
    if (id) return deleteUser(Number(id[1]), query);
  }
  return error(405, `${method} is not allowed`);
}
