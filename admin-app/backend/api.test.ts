import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  handleApi,
  type Category,
  type Notification,
  type Order,
  type Payment,
  type Permission,
  type Process,
  type Product,
  type Query,
  type Role,
  type Settings,
  type Task,
  type User,
  type UserDetail,
  type UserSession,
} from "./api.ts";
import { resetDatabase } from "./db/reset.ts";

/** A `query` that records the SQL and answers with canned rows. */
function fakeQuery(
  rows: unknown[],
): Query & { calls: { sql: string; params?: unknown[] }[] } {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const query = (async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return rows;
  }) as Query & { calls: typeof calls };
  query.calls = calls;
  return query;
}

describe("api routing (no server, no database)", () => {
  test("GET /api/users returns the rows of the users query", async () => {
    const users: User[] = [
      { id: 1, name: "Ann", email: "ann@x", role: "admin" },
    ];
    const query = fakeQuery(users);
    expect(await handleApi("GET", "/api/users", query)).toEqual({
      status: 200,
      body: users,
    });
    expect(query.calls[0].sql).toMatch(/FROM users u\s+JOIN roles r/);
  });

  test("GET /api/roles returns roles with their user counts", async () => {
    const roles: Role[] = [
      { id: 1, name: "admin", description: "d", users: 2 },
    ];
    const query = fakeQuery(roles);
    expect(await handleApi("GET", "/api/roles", query)).toEqual({
      status: 200,
      body: roles,
    });
    expect(query.calls[0].sql).toMatch(/count\(u\.id\)::int AS users/);
  });

  test("GET /api/permissions returns permissions with their role names", async () => {
    const permissions: Permission[] = [
      { id: 1, code: "users.read", description: "d", roles: "admin, editor" },
    ];
    const query = fakeQuery(permissions);
    expect(await handleApi("GET", "/api/permissions", query)).toEqual({
      status: 200,
      body: permissions,
    });
    expect(query.calls[0].sql).toMatch(/string_agg\(r\.name/);
  });

  test("GET /api/products returns the catalogue with category names", async () => {
    const products: Product[] = [
      {
        id: 1,
        name: "Keyboard",
        price: "149.00",
        stock: 12,
        category: "Peripherals",
      },
    ];
    const query = fakeQuery(products);
    expect(await handleApi("GET", "/api/products", query)).toEqual({
      status: 200,
      body: products,
    });
    expect(query.calls[0].sql).toMatch(
      /JOIN categories c ON c\.id = p\.category_id/,
    );
  });

  test("GET /api/orders returns orders with their customers, newest first", async () => {
    const orders: Order[] = [
      {
        id: 1,
        customer: "Bob",
        total: "149.00",
        status: "new",
        created: "2026-11-02 10:15",
      },
    ];
    const query = fakeQuery(orders);
    expect(await handleApi("GET", "/api/orders", query)).toEqual({
      status: 200,
      body: orders,
    });
    expect(query.calls[0].sql).toMatch(
      /FROM orders o\s+JOIN users u ON u\.id = o\.user_id\s+ORDER BY o\.created_at DESC/,
    );
  });

  test("GET /api/categories counts the products of each category", async () => {
    const categories: Category[] = [{ id: 1, name: "Audio", products: 5 }];
    const query = fakeQuery(categories);
    expect(await handleApi("GET", "/api/categories", query)).toEqual({
      status: 200,
      body: categories,
    });
    expect(query.calls[0].sql).toMatch(
      /FROM categories c\s+LEFT JOIN products p/,
    );
  });

  test("GET /api/tasks and /api/processes return the system lists", async () => {
    const tasks: Task[] = [
      { id: 1, title: "Backup", status: "run", progress: 40 },
    ];
    const processes: Process[] = [
      {
        id: 1,
        name: "postgres",
        pid: 100,
        cpu: "1.5",
        memory: 64,
        status: "run",
      },
    ];
    const tasksQuery = fakeQuery(tasks);
    expect(await handleApi("GET", "/api/tasks", tasksQuery)).toEqual({
      status: 200,
      body: tasks,
    });
    const processesQuery = fakeQuery(processes);
    expect(await handleApi("GET", "/api/processes", processesQuery)).toEqual({
      status: 200,
      body: processes,
    });
    expect(tasksQuery.calls[0].sql).toMatch(/FROM tasks ORDER BY id/);
    expect(processesQuery.calls[0].sql).toMatch(/FROM processes ORDER BY id/);
  });

  test("GET /api/sessions names the signed-in user", async () => {
    const sessions: UserSession[] = [
      {
        id: 1,
        user: "Ann",
        ip: "203.0.113.10",
        created: "2026-11-02 08:55",
        expires: "2026-11-09 08:55",
      },
    ];
    const query = fakeQuery(sessions);
    expect(await handleApi("GET", "/api/sessions", query)).toEqual({
      status: 200,
      body: sessions,
    });
    expect(query.calls[0].sql).toMatch(/AS "user"/);
  });

  test("GET /api/notifications decides read/new in the backend", async () => {
    const notifications: Notification[] = [
      {
        id: 1,
        title: "Backup finished",
        body: "Done.",
        read: "read",
        created: "2026-11-02 03:15",
      },
    ];
    const query = fakeQuery(notifications);
    expect(await handleApi("GET", "/api/notifications", query)).toEqual({
      status: 200,
      body: notifications,
    });
    expect(query.calls[0].sql).toMatch(/CASE WHEN read/);
  });

  test("GET /api/settings falls back to the light theme", async () => {
    const dark = fakeQuery([{ theme: "dark" }]);
    expect(await handleApi("GET", "/api/settings", dark)).toEqual({
      status: 200,
      body: { theme: "dark" },
    });
    const empty = fakeQuery([]);
    expect(await handleApi("GET", "/api/settings", empty)).toEqual({
      status: 200,
      body: { theme: "light" },
    });
  });

  test("GET /api/users/5 returns one user for the edit form", async () => {
    const user: UserDetail = {
      id: 5,
      name: "Ann",
      email: "ann@x",
      role: "admin",
      role_id: 1,
    };
    const query = fakeQuery([user]);
    expect(await handleApi("GET", "/api/users/5", query)).toEqual({
      status: 200,
      body: user,
    });
    expect(query.calls[0].sql).toMatch(/WHERE u\.id = \$1/);
    expect(query.calls[0].params).toEqual([5]);
  });

  test("GET of an unknown user is a 404", async () => {
    const query = fakeQuery([]);
    expect(await handleApi("GET", "/api/users/99", query)).toMatchObject({
      status: 404,
    });
  });

  test("POST /api/users saves a user and returns it with its role", async () => {
    const saved: UserDetail = {
      id: 7,
      name: "New",
      email: "new@x",
      role: "admin",
      role_id: 1,
    };
    const query = fakeQuery([saved]);
    expect(
      await handleApi("POST", "/api/users", query, {
        name: "New",
        email: "new@x",
        role_id: 1,
      }),
    ).toEqual({ status: 200, body: saved });
    expect(query.calls[0].sql).toMatch(/SELECT id FROM roles WHERE id = \$1/);
    expect(query.calls[1].sql).toMatch(/INSERT INTO users/);
    expect(query.calls[1].params).toEqual(["New", "new@x", 1]);
    expect(query.calls[2].sql).toMatch(/WHERE u\.id = \$1/);
    expect(query.calls[2].params).toEqual([7]);
  });

  test("POST /api/users without a name is a 400 and touches nothing", async () => {
    const query = fakeQuery([]);
    expect(
      await handleApi("POST", "/api/users", query, {
        email: "x@x",
        role_id: 1,
      }),
    ).toMatchObject({ status: 400 });
    expect(query.calls).toEqual([]);
  });

  test("PUT /api/roles/3 updates the role and returns it with its count", async () => {
    const role: Role = { id: 3, name: "qa", description: "", users: 0 };
    const query = fakeQuery([role]);
    expect(
      await handleApi("PUT", "/api/roles/3", query, { name: "qa" }),
    ).toEqual({ status: 200, body: role });
    expect(query.calls[0].sql).toMatch(
      /UPDATE roles SET name = \$1, description = \$2\s+WHERE id = \$3/,
    );
    expect(query.calls[0].params).toEqual(["qa", "", 3]);
    expect(query.calls[1].sql).toMatch(/WHERE r\.id = \$1/);
  });

  test("PUT /api/settings with a bad theme is a 400 and touches nothing", async () => {
    const query = fakeQuery([]);
    expect(
      await handleApi("PUT", "/api/settings", query, { theme: "blue" }),
    ).toMatchObject({ status: 400 });
    expect(query.calls).toEqual([]);
  });

  test("DELETE /api/users/:id removes what references the user first", async () => {
    const query = fakeQuery([{ id: 2 }]);
    expect(await handleApi("DELETE", "/api/users/2", query)).toEqual({
      status: 200,
      body: { deleted: 2 },
    });
    expect(query.calls[0].sql).toMatch(/DELETE FROM sessions WHERE user_id/);
    expect(query.calls[1].sql).toMatch(/DELETE FROM orders WHERE user_id/);
    expect(query.calls[2].sql).toMatch(/DELETE FROM payments WHERE user_id/);
    expect(query.calls[3].sql).toMatch(/DELETE FROM users WHERE id = \$1/);
    expect(query.calls[3].params).toEqual([2]);
  });

  test("DELETE of an unknown user is a 404", async () => {
    const query = fakeQuery([]);
    expect(await handleApi("DELETE", "/api/users/99", query)).toMatchObject({
      status: 404,
    });
    expect(query.calls[3].sql).toMatch(/DELETE FROM users/);
  });

  test("unknown routes are 404, other methods 405, and the database is not touched", async () => {
    const query = fakeQuery([]);
    expect(await handleApi("GET", "/api/nope", query)).toMatchObject({
      status: 404,
    });
    expect(await handleApi("PATCH", "/api/users", query)).toMatchObject({
      status: 405,
    });
    expect(await handleApi("DELETE", "/api/users", query)).toMatchObject({
      status: 405,
    });
    expect(await handleApi("POST", "/api/products", query)).toMatchObject({
      status: 405,
    });
    expect(await handleApi("DELETE", "/api/roles/1", query)).toMatchObject({
      status: 405,
    });
    expect(query.calls).toEqual([]);
  });
});

// Against the real Postgres (compose.yaml), like the frontend tests.
describe("api against Postgres", () => {
  let pool: import("pg").Pool;
  let query: Query;

  beforeAll(async () => {
    const { createPool } = await import("./db/pool.ts");
    pool = createPool();
    query = (sql, params = []) => pool.query(sql, params).then((r) => r.rows);
  });
  afterAll(() => pool.end());

  test("users come with their role name, roles with their user count", async () => {
    const users = (await handleApi("GET", "/api/users", query)).body as User[];
    const roles = (await handleApi("GET", "/api/roles", query)).body as Role[];
    expect(users).toHaveLength(8);
    expect(roles).toHaveLength(3);
    for (const u of users) {
      expect(u).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        email: expect.any(String),
      });
      expect(roles.map((r) => r.name)).toContain(u.role);
    }
    const counted = roles.reduce((n, r) => n + r.users, 0);
    expect(counted).toBe(users.length);
  });

  test("permissions list the roles that hold them", async () => {
    const permissions = (await handleApi("GET", "/api/permissions", query))
      .body as Permission[];
    expect(permissions).toHaveLength(12);
    for (const p of permissions) {
      expect(p).toMatchObject({
        code: expect.any(String),
        description: expect.any(String),
        roles: expect.any(String),
      });
    }
    const admin = permissions.find((p) => p.code === "users.read");
    expect(admin?.roles).toContain("admin");
    expect(admin?.roles).toContain("editor");
    expect(admin?.roles).toContain("viewer");
  });

  test("fifty products across ten categories, and the ten last payments", async () => {
    const products = (await handleApi("GET", "/api/products", query))
      .body as Product[];
    expect(products).toHaveLength(50);
    for (const p of products) {
      expect(p).toMatchObject({
        name: expect.any(String),
        price: expect.any(String),
        stock: expect.any(Number),
        category: expect.any(String),
      });
    }
    const categories = (await handleApi("GET", "/api/categories", query))
      .body as Category[];
    expect(categories).toHaveLength(10);
    const inCategories = categories.reduce((n, c) => n + c.products, 0);
    expect(inCategories).toBe(50);
    const payments = (await handleApi("GET", "/api/payments", query))
      .body as Payment[];
    expect(payments).toHaveLength(10);
    const dates = payments.map((p) => p.paid_at);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const p of payments) {
      expect(p).toMatchObject({ customer: expect.any(String) });
    }
  });

  test("twenty orders placed by the users, the newest first", async () => {
    const orders = (await handleApi("GET", "/api/orders", query))
      .body as Order[];
    expect(orders).toHaveLength(20);
    const users = (await handleApi("GET", "/api/users", query)).body as User[];
    const names = users.map((u) => u.name);
    for (const o of orders) {
      expect(o).toMatchObject({
        customer: expect.any(String),
        total: expect.any(String),
        status: expect.any(String),
        created: expect.any(String),
      });
      expect(names).toContain(o.customer);
    }
  });

  test("thirty tasks and twenty processes for the system pages", async () => {
    const tasks = (await handleApi("GET", "/api/tasks", query)).body as Task[];
    expect(tasks).toHaveLength(30);
    for (const t of tasks) {
      expect(t).toMatchObject({
        title: expect.any(String),
        status: expect.any(String),
      });
      expect(t.progress).toBeGreaterThanOrEqual(0);
      expect(t.progress).toBeLessThanOrEqual(100);
    }
    const processes = (await handleApi("GET", "/api/processes", query))
      .body as Process[];
    expect(processes).toHaveLength(20);
    for (const p of processes) {
      expect(p).toMatchObject({
        name: expect.any(String),
        pid: expect.any(Number),
        cpu: expect.any(String),
        memory: expect.any(Number),
        status: expect.any(String),
      });
    }
  });

  test("sessions and notifications reference real users", async () => {
    const users = (await handleApi("GET", "/api/users", query)).body as User[];
    const names = users.map((u) => u.name);
    const sessions = (await handleApi("GET", "/api/sessions", query))
      .body as UserSession[];
    expect(sessions.length).toBeGreaterThan(0);
    for (const s of sessions) {
      expect(s).toMatchObject({
        user: expect.any(String),
        ip: expect.any(String),
        created: expect.any(String),
        expires: expect.any(String),
      });
      expect(names).toContain(s.user);
    }
    const notifications = (await handleApi("GET", "/api/notifications", query))
      .body as Notification[];
    expect(notifications.length).toBeGreaterThan(0);
    for (const n of notifications) {
      expect(["read", "new"]).toContain(n.read);
    }
  });

  test("the theme round-trips through the settings endpoint", async () => {
    const before = (
      (await handleApi("GET", "/api/settings", query)).body as Settings
    ).theme;
    expect(["light", "dark"]).toContain(before);
    expect(
      await handleApi("PUT", "/api/settings", query, { theme: "dark" }),
    ).toEqual({ status: 200, body: { theme: "dark" } });
    expect(
      (await handleApi("GET", "/api/settings", query)).body as Settings,
    ).toEqual({ theme: "dark" });
    expect(
      await handleApi("PUT", "/api/settings", query, { theme: before }),
    ).toMatchObject({ status: 200 });
  });

  test("a role can be created, fetched and renamed; the seed is back after", async () => {
    const created = await handleApi("POST", "/api/roles", query, {
      name: "qa",
      description: "temporary",
    });
    expect(created.status).toBe(200);
    const role = created.body as Role;
    expect(role).toMatchObject({
      name: "qa",
      description: "temporary",
      users: 0,
    });
    const one = await handleApi("GET", `/api/roles/${role.id}`, query);
    expect((one.body as Role).name).toBe("qa");
    const updated = await handleApi("PUT", `/api/roles/${role.id}`, query, {
      name: "qa2",
    });
    expect(updated.body as Role).toMatchObject({ name: "qa2", users: 0 });
    const roles = (await handleApi("GET", "/api/roles", query)).body as Role[];
    expect(roles.map((r) => r.name)).toContain("qa2");
    await resetDatabase(pool);
  });

  test("a permission can be created, fetched and renamed; the seed is back after", async () => {
    const created = await handleApi("POST", "/api/permissions", query, {
      code: "qa.read",
      description: "temporary",
    });
    expect(created.status).toBe(200);
    const permission = created.body as Permission;
    expect(permission).toMatchObject({ code: "qa.read", roles: "" });
    const one = await handleApi(
      "GET",
      `/api/permissions/${permission.id}`,
      query,
    );
    expect((one.body as Permission).code).toBe("qa.read");
    const updated = await handleApi(
      "PUT",
      `/api/permissions/${permission.id}`,
      query,
      { code: "qa.write" },
    );
    expect(updated.body as Permission).toMatchObject({ code: "qa.write" });
    await resetDatabase(pool);
  });

  test("a user can be created, fetched, moved to another role; the seed is back after", async () => {
    const roles = (await handleApi("GET", "/api/roles", query)).body as Role[];
    const created = await handleApi("POST", "/api/users", query, {
      name: "Temp",
      email: "temp@example.com",
      role_id: roles[0].id,
    });
    expect(created.status).toBe(200);
    const user = created.body as UserDetail;
    expect(user).toMatchObject({
      name: "Temp",
      email: "temp@example.com",
      role: roles[0].name,
      role_id: roles[0].id,
    });
    const one = await handleApi("GET", `/api/users/${user.id}`, query);
    expect((one.body as UserDetail).role_id).toBe(roles[0].id);
    const noRole = await handleApi("POST", "/api/users", query, {
      name: "Nobody",
      email: "nobody@example.com",
      role_id: 9999,
    });
    expect(noRole).toMatchObject({ status: 400 });
    const invalid = await handleApi("POST", "/api/users", query, {
      name: "Half",
    });
    expect(invalid).toMatchObject({ status: 400 });
    const updated = await handleApi("PUT", `/api/users/${user.id}`, query, {
      name: "Temp2",
      email: "temp@example.com",
      role_id: roles[1].id,
    });
    expect((updated.body as UserDetail).role).toBe(roles[1].name);
    await resetDatabase(pool);
  });

  test("a deleted user stays deleted; the seed is back after the test", async () => {
    const before = (await handleApi("GET", "/api/users", query)).body as User[];
    const victim = before[0];
    expect(await handleApi("DELETE", `/api/users/${victim.id}`, query)).toEqual(
      { status: 200, body: { deleted: victim.id } },
    );
    const after = (await handleApi("GET", "/api/users", query)).body as User[];
    expect(after.map((u) => u.id)).not.toContain(victim.id);
    expect(after.length).toBe(before.length - 1);
    expect(
      await handleApi("DELETE", `/api/users/${victim.id}`, query),
    ).toMatchObject({ status: 404 });
    await resetDatabase(pool);
  });
});
