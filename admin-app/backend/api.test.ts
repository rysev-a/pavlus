import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  handleApi,
  type Payment,
  type Product,
  type Query,
  type Role,
  type User,
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

  test("GET /api/products returns the catalogue", async () => {
    const products: Product[] = [
      { id: 1, name: "Keyboard", price: "149.00", stock: 12 },
    ];
    const query = fakeQuery(products);
    expect(await handleApi("GET", "/api/products", query)).toEqual({
      status: 200,
      body: products,
    });
    expect(query.calls[0].sql).toMatch(/FROM products/);
  });

  test("GET /api/payments returns the last payments, newest first", async () => {
    const payments: Payment[] = [
      {
        id: 1,
        customer: "Ann",
        amount: "149.00",
        status: "paid",
        paid_at: "2026-10-30 14:05",
      },
    ];
    const query = fakeQuery(payments);
    expect(await handleApi("GET", "/api/payments", query)).toEqual({
      status: 200,
      body: payments,
    });
    expect(query.calls[0].sql).toMatch(/ORDER BY p\.paid_at DESC\s+LIMIT 10/);
  });

  test("DELETE /api/users/:id deletes that user and reports its id", async () => {
    const query = fakeQuery([{ id: 2 }]);
    expect(await handleApi("DELETE", "/api/users/2", query)).toEqual({
      status: 200,
      body: { deleted: 2 },
    });
    expect(query.calls[0].sql).toMatch(/DELETE FROM payments WHERE user_id/);
    expect(query.calls[1].sql).toMatch(/DELETE FROM users WHERE id = \$1/);
    expect(query.calls[1].params).toEqual([2]);
  });

  test("DELETE of an unknown user is a 404", async () => {
    const query = fakeQuery([]);
    expect(await handleApi("DELETE", "/api/users/99", query)).toMatchObject({
      status: 404,
    });
    expect(query.calls[1].sql).toMatch(/DELETE FROM users/);
  });

  test("unknown routes are 404, other methods 405, and the database is not touched", async () => {
    const query = fakeQuery([]);
    expect(await handleApi("GET", "/api/nope", query)).toMatchObject({
      status: 404,
    });
    expect(await handleApi("POST", "/api/users", query)).toMatchObject({
      status: 405,
    });
    expect(await handleApi("DELETE", "/api/users", query)).toMatchObject({
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
    expect(users.length).toBeGreaterThan(0);
    expect(roles.length).toBeGreaterThan(0);
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

  test("ten products, ten last payments, the newest first", async () => {
    const products = (await handleApi("GET", "/api/products", query))
      .body as Product[];
    expect(products).toHaveLength(10);
    for (const p of products) {
      expect(p).toMatchObject({
        name: expect.any(String),
        price: expect.any(String),
        stock: expect.any(Number),
      });
    }
    const payments = (await handleApi("GET", "/api/payments", query))
      .body as Payment[];
    expect(payments).toHaveLength(10);
    const dates = payments.map((p) => p.paid_at);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const p of payments) {
      expect(p).toMatchObject({ customer: expect.any(String) });
    }
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
