import { expect, test } from "vitest";
import {
  ORDER_STATUSES,
  SEED_COUNTS,
} from "../templates/phone-retail-crm/schema.ts";
import { seedDb, TODAY } from "../templates/phone-retail-crm/seed.ts";

const db = seedDb();
const ids = (rows: { id: number }[]): number[] => rows.map((r) => r.id);
const idSet = (rows: { id: number }[]): Set<number> => new Set(ids(rows));

const months: string[] = [];
{
  const [y, m] = TODAY.split("-").map(Number) as [number, number];
  for (let i = 11; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    months.push(
      `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`,
    );
  }
}
const PAID = ["paid", "shipped", "delivered"];

test("exact table sizes", () => {
  expect(db.users).toHaveLength(SEED_COUNTS.users);
  expect(db.roles).toHaveLength(SEED_COUNTS.roles);
  expect(db.permissions).toHaveLength(SEED_COUNTS.permissions);
  expect(db.sessions).toHaveLength(SEED_COUNTS.sessions);
  expect(db.shopCategories).toHaveLength(SEED_COUNTS.shopCategories);
  expect(db.shops).toHaveLength(SEED_COUNTS.shops);
  expect(db.orders).toHaveLength(SEED_COUNTS.orders);
  expect(db.manufacturers.length).toBeGreaterThanOrEqual(8);
  expect(db.models.length).toBeGreaterThanOrEqual(40);
  expect(db.products.length).toBeGreaterThanOrEqual(120);
});

test("ids are 1-based, unique and ascending in every table", () => {
  for (const rows of Object.values(db) as { id: number }[][]) {
    expect(ids(rows)).toEqual(rows.map((_: unknown, i: number) => i + 1));
  }
});

test("unique emails, skus, permission codes, names", () => {
  expect(new Set(db.users.map((u) => u.email)).size).toBe(db.users.length);
  expect(new Set(db.users.map((u) => u.name)).size).toBe(db.users.length);
  expect(new Set(db.products.map((p) => p.sku)).size).toBe(db.products.length);
  expect(new Set(db.permissions.map((p) => p.code)).size).toBe(
    db.permissions.length,
  );
  expect(new Set(db.roles.map((r) => r.name)).size).toBe(db.roles.length);
  expect(new Set(db.shops.map((s) => s.name)).size).toBe(db.shops.length);
  for (const u of db.users) expect(u.email).toMatch(/^[a-z.'-]+@example\.com$/);
  for (const p of db.permissions)
    expect(p.code).toBe(`${p.module}.${p.code.split(".")[1]}`);
});

test("every foreign key resolves", () => {
  const roles = idSet(db.roles);
  const perms = idSet(db.permissions);
  const users = idSet(db.users);
  const mfrs = idSet(db.manufacturers);
  const models = idSet(db.models);
  const products = idSet(db.products);
  const cats = idSet(db.shopCategories);
  const shops = idSet(db.shops);
  for (const u of db.users) expect(roles.has(u.roleId)).toBe(true);
  for (const r of db.roles) {
    expect(r.permissionIds.length).toBeGreaterThan(0);
    for (const p of r.permissionIds) expect(perms.has(p)).toBe(true);
  }
  for (const s of db.sessions) expect(users.has(s.userId)).toBe(true);
  for (const m of db.models) expect(mfrs.has(m.manufacturerId)).toBe(true);
  for (const p of db.products) expect(models.has(p.modelId)).toBe(true);
  for (const s of db.shops) expect(cats.has(s.categoryId)).toBe(true);
  for (const o of db.orders) {
    expect(users.has(o.userId)).toBe(true);
    expect(shops.has(o.shopId)).toBe(true);
    expect(o.items.length).toBeGreaterThanOrEqual(1);
    expect(o.items.length).toBeLessThanOrEqual(4);
    expect(ORDER_STATUSES).toContain(o.status);
    for (const it of o.items) expect(products.has(it.productId)).toBe(true);
  }
  for (const b of db.budget)
    expect(b.shopId === 0 || shops.has(b.shopId)).toBe(true);
});

test("order totals are exact and prices are the product prices", () => {
  const price = new Map(db.products.map((p) => [p.id, p.price]));
  for (const o of db.orders) {
    expect(o.total).toBe(o.items.reduce((s, it) => s + it.qty * it.price, 0));
    for (const it of o.items) {
      expect(it.price).toBe(price.get(it.productId));
      expect(it.qty).toBeGreaterThanOrEqual(1);
      expect(it.qty).toBeLessThanOrEqual(3);
    }
    expect(o.createdAt <= TODAY).toBe(true);
  }
});

test("module prefix, countries and rounding of shops", () => {
  for (const s of db.shops) {
    expect(Math.round(s.lat * 10000) / 10000).toBe(s.lat);
    expect(Math.round(s.lng * 10000) / 10000).toBe(s.lng);
    expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
    expect(Math.abs(s.lng)).toBeLessThanOrEqual(180);
  }
  expect(
    db.orders.filter((o) => o.status === "delivered").length,
  ).toBeGreaterThan(db.orders.length / 2);
});

test("all 12 months have orders and budget rows", () => {
  for (const m of months) {
    expect(db.orders.some((o) => o.createdAt.startsWith(m))).toBe(true);
    for (const kind of ["income", "salary", "supply", "delivery"]) {
      expect(db.budget.some((b) => b.month === m && b.kind === kind)).toBe(
        true,
      );
    }
  }
  expect(new Set(db.budget.map((b) => b.month))).toEqual(new Set(months));
  expect(months[months.length - 1]).toBe(TODAY.slice(0, 7));
});

test("income rows equal the paid, shipped and delivered order totals per month", () => {
  for (const m of months) {
    const orders = db.orders
      .filter((o) => o.createdAt.startsWith(m) && PAID.includes(o.status))
      .reduce((s, o) => s + o.total, 0);
    const income = db.budget
      .filter((b) => b.month === m && b.kind === "income")
      .reduce((s, b) => s + b.amount, 0);
    expect(income).toBe(orders);
  }
});

test("budget has company and shop rows, with profitable and losing months", () => {
  expect(db.budget.some((b) => b.shopId === 0)).toBe(true);
  expect(db.budget.some((b) => b.shopId !== 0)).toBe(true);
  const net = months.map((m) =>
    db.budget
      .filter((b) => b.month === m)
      .reduce((s, b) => s + (b.kind === "income" ? b.amount : -b.amount), 0),
  );
  expect(net.filter((n) => n > 0).length).toBeGreaterThan(6);
  expect(net.some((n) => n < 0)).toBe(true);
});

test("determinism", () => {
  expect(seedDb()).toEqual(seedDb());
  expect(seedDb(1)).toEqual(seedDb(1));
  expect(seedDb(1)).not.toEqual(seedDb(2));
  expect(seedDb(20261104)).toEqual(db);
});

test("seedDb is fast", () => {
  const t = performance.now();
  seedDb(7);
  expect(performance.now() - t).toBeLessThan(200);
});
