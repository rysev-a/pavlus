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

/** One user with its role's id: what the edit form fills in. */
export interface UserDetail extends User {
  role_id: number;
}

export interface Role {
  id: number;
  name: string;
  description: string;
  /** How many users have this role. */
  users: number;
}

export interface Permission {
  id: number;
  code: string;
  description: string;
  /** The names of the roles that hold it, comma-joined by the backend. */
  roles: string;
}

export interface Product {
  id: number;
  name: string;
  /** `numeric(8,2)`: the driver hands it over as a string. */
  price: string;
  stock: number;
  /** The category's name, joined in by the backend. */
  category: string;
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

export interface Category {
  id: number;
  name: string;
  /** How many products are in it. */
  products: number;
}

export interface Order {
  id: number;
  /** The name of the user who placed it. */
  customer: string;
  total: string;
  status: string;
  /** Formatted in the query, so server and browser render the same text. */
  created: string;
}

export interface Task {
  id: number;
  title: string;
  status: string;
  progress: number;
}

export interface Process {
  id: number;
  name: string;
  pid: number;
  /** `numeric(4,1)`: a string. */
  cpu: string;
  /** Megabytes. */
  memory: number;
  status: string;
}

export interface UserSession {
  id: number;
  user: string;
  ip: string;
  created: string;
  expires: string;
}

export interface Notification {
  id: number;
  title: string;
  body: string;
  /** "read" or "new", decided by the backend. */
  read: string;
  created: string;
}

export interface Settings {
  theme: "light" | "dark";
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
    `SELECT u.id, u.name, u.email, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      ORDER BY u.id`,
  );
  return ok(users);
}

async function getUser(id: number, query: Query): Promise<Reply> {
  const users = await query<UserDetail>(
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

async function getRole(id: number, query: Query): Promise<Reply> {
  const roles = await query<Role>(
    `SELECT r.id, r.name, r.description, count(u.id)::int AS users
       FROM roles r
       LEFT JOIN users u ON u.role_id = r.id
      WHERE r.id = $1
      GROUP BY r.id`,
    [id],
  );
  return roles.length ? ok(roles[0]) : error(404, `no role ${id}`);
}

async function saveRole(
  body: unknown,
  id: number | null,
  query: Query,
): Promise<Reply> {
  const name = text(body, "name");
  if (!name) return error(400, "a role needs a name");
  const description = text(body, "description") ?? "";
  const saved = id
    ? await query<Pick<Role, "id">>(
        `UPDATE roles SET name = $1, description = $2
          WHERE id = $3 RETURNING id`,
        [name, description, id],
      )
    : await query<Pick<Role, "id">>(
        `INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING id`,
        [name, description],
      );
  if (!saved.length) return error(404, `no role ${id}`);
  return getRole(saved[0].id, query);
}

async function listPermissions(query: Query): Promise<Reply> {
  const permissions = await query<Permission>(
    `SELECT p.id, p.code, p.description,
            coalesce(string_agg(r.name, ', ' ORDER BY r.name), '') AS roles
       FROM permissions p
       LEFT JOIN role_permissions rp ON rp.permission_id = p.id
       LEFT JOIN roles r ON r.id = rp.role_id
      GROUP BY p.id
      ORDER BY p.id`,
  );
  return ok(permissions);
}

async function getPermission(id: number, query: Query): Promise<Reply> {
  const permissions = await query<Permission>(
    `SELECT p.id, p.code, p.description,
            coalesce(string_agg(r.name, ', ' ORDER BY r.name), '') AS roles
       FROM permissions p
       LEFT JOIN role_permissions rp ON rp.permission_id = p.id
       LEFT JOIN roles r ON r.id = rp.role_id
      WHERE p.id = $1
      GROUP BY p.id`,
    [id],
  );
  return permissions.length
    ? ok(permissions[0])
    : error(404, `no permission ${id}`);
}

async function savePermission(
  body: unknown,
  id: number | null,
  query: Query,
): Promise<Reply> {
  const code = text(body, "code");
  if (!code) return error(400, "a permission needs a code");
  const description = text(body, "description") ?? "";
  const saved = id
    ? await query<Pick<Permission, "id">>(
        `UPDATE permissions SET code = $1, description = $2
          WHERE id = $3 RETURNING id`,
        [code, description, id],
      )
    : await query<Pick<Permission, "id">>(
        `INSERT INTO permissions (code, description) VALUES ($1, $2)
         RETURNING id`,
        [code, description],
      );
  if (!saved.length) return error(404, `no permission ${id}`);
  return getPermission(saved[0].id, query);
}

async function listProducts(query: Query): Promise<Reply> {
  const products = await query<Product>(
    `SELECT p.id, p.name, p.price, p.stock, c.name AS category
       FROM products p
       JOIN categories c ON c.id = p.category_id
      ORDER BY p.id`,
  );
  return ok(products);
}

async function listCategories(query: Query): Promise<Reply> {
  const categories = await query<Category>(
    `SELECT c.id, c.name, count(p.id)::int AS products
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.id`,
  );
  return ok(categories);
}

/** The last ten payments, the newest first. */
async function listPayments(query: Query): Promise<Reply> {
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

/** Twenty orders placed by users, the newest first. */
async function listOrders(query: Query): Promise<Reply> {
  const orders = await query<Order>(
    `SELECT o.id, u.name AS customer, o.total, o.status,
            to_char(o.created_at, 'YYYY-MM-DD HH24:MI') AS created
       FROM orders o
       JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC, o.id DESC`,
  );
  return ok(orders);
}

async function listTasks(query: Query): Promise<Reply> {
  const tasks = await query<Task>(
    `SELECT id, title, status, progress FROM tasks ORDER BY id`,
  );
  return ok(tasks);
}

async function listProcesses(query: Query): Promise<Reply> {
  const processes = await query<Process>(
    `SELECT id, name, pid, cpu, memory, status FROM processes ORDER BY id`,
  );
  return ok(processes);
}

async function listSessions(query: Query): Promise<Reply> {
  const sessions = await query<UserSession>(
    `SELECT s.id, u.name AS "user", s.ip,
            to_char(s.created_at, 'YYYY-MM-DD HH24:MI') AS created,
            to_char(s.expires_at, 'YYYY-MM-DD HH24:MI') AS expires
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      ORDER BY s.id`,
  );
  return ok(sessions);
}

async function listNotifications(query: Query): Promise<Reply> {
  const notifications = await query<Notification>(
    `SELECT id, title, body,
            CASE WHEN read THEN 'read' ELSE 'new' END AS read,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created
       FROM notifications
      ORDER BY created_at DESC, id DESC`,
  );
  return ok(notifications);
}

async function getSettings(query: Query): Promise<Reply> {
  const rows = await query<Settings>(`SELECT theme FROM settings WHERE id = 1`);
  return ok({ theme: rows[0]?.theme ?? "light" });
}

async function saveSettings(body: unknown, query: Query): Promise<Reply> {
  const theme = text(body, "theme");
  if (theme !== "light" && theme !== "dark")
    return error(400, "the theme is light or dark");
  const saved = await query<Settings>(
    `INSERT INTO settings (id, theme) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET theme = EXCLUDED.theme
     RETURNING theme`,
    [theme],
  );
  return ok({ theme: saved[0].theme });
}

/** Deletes one user: its id comes back; a user that is not there is a 404. */
export async function deleteUser(id: number, query: Query): Promise<Reply> {
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

const withId = (pathname: string, pattern: RegExp): number | null => {
  const match = pattern.exec(pathname);
  return match ? Number(match[1]) : null;
};

/** Routes one request. An unknown GET path is a 404, a wrong method a 405. */
export async function handleApi(
  method: string,
  pathname: string,
  query: Query,
  body?: unknown,
): Promise<Reply> {
  if (method === "GET") {
    switch (pathname) {
      case "/api/users":
        return listUsers(query);
      case "/api/roles":
        return listRoles(query);
      case "/api/permissions":
        return listPermissions(query);
      case "/api/products":
        return listProducts(query);
      case "/api/categories":
        return listCategories(query);
      case "/api/payments":
        return listPayments(query);
      case "/api/orders":
        return listOrders(query);
      case "/api/tasks":
        return listTasks(query);
      case "/api/processes":
        return listProcesses(query);
      case "/api/sessions":
        return listSessions(query);
      case "/api/notifications":
        return listNotifications(query);
      case "/api/settings":
        return getSettings(query);
    }
    const one = [
      ["/api/users/", getUser],
      ["/api/roles/", getRole],
      ["/api/permissions/", getPermission],
    ] as const;
    for (const [prefix, handler] of one) {
      const id = withId(pathname, new RegExp(`^${prefix}(\\d+)$`));
      if (id !== null) return handler(id, query);
    }
    return error(404, `no route for ${pathname}`);
  }
  if (method === "POST") {
    if (pathname === "/api/users") return saveUser(body, null, query);
    if (pathname === "/api/roles") return saveRole(body, null, query);
    if (pathname === "/api/permissions")
      return savePermission(body, null, query);
    if (pathname === "/api/settings") return saveSettings(body, query);
  }
  if (method === "PUT") {
    if (pathname === "/api/settings") return saveSettings(body, query);
    const userId = withId(pathname, /^\/api\/users\/(\d+)$/);
    if (userId !== null) return saveUser(body, userId, query);
    const roleId = withId(pathname, /^\/api\/roles\/(\d+)$/);
    if (roleId !== null) return saveRole(body, roleId, query);
    const permissionId = withId(pathname, /^\/api\/permissions\/(\d+)$/);
    if (permissionId !== null) return savePermission(body, permissionId, query);
  }
  if (method === "DELETE") {
    const userId = withId(pathname, /^\/api\/users\/(\d+)$/);
    if (userId !== null) return deleteUser(userId, query);
  }
  return error(405, `${method} is not allowed`);
}
