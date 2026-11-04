import { expect, test } from "vitest";
import {
  budgetByMonth,
  budgetDashboard,
  budgetTotals,
  costShares,
  lastTwelveMonths,
  ordersByMonth,
  ordersDashboard,
  shopsMap,
  statusBreakdown,
  topShops,
  TODAY,
} from "../templates/phone-retail-crm/stats.ts";
import type {
  BudgetEntry,
  Db,
  Order,
  OrderStatus,
  Shop,
} from "../templates/phone-retail-crm/schema.ts";

// the hand-made data below is built around November 2026
const NOV = "2026-11-04";

const order = (
  id: number,
  shopId: number,
  status: OrderStatus,
  createdAt: string,
  total: number,
): Order => ({
  id,
  userId: 1,
  shopId,
  status,
  createdAt,
  items: [],
  total,
  note: "",
});

const shop = (id: number, name: string, lat: number, lng: number): Shop => ({
  id,
  name,
  categoryId: 1,
  city: `City ${id}`,
  address: `${id} Main St`,
  lat,
  lng,
  phone: "+1 555 0100",
});

const orders: Order[] = [
  order(1, 1, "paid", "2026-11-01", 100),
  order(2, 2, "delivered", "2026-11-02", 300),
  order(3, 1, "cancelled", "2026-11-03", 50),
  order(4, 1, "shipped", "2026-10-15", 200),
  order(5, 2, "refunded", "2026-10-20", 80),
  order(6, 2, "new", "2026-10-21", 40),
  order(7, 1, "paid", "2024-01-01", 999),
];
const shops = [shop(1, "Alpha", 48.1, 11.5), shop(2, "Beta", 52.5, 13.4)];

const entry = (
  id: number,
  month: string,
  kind: BudgetEntry["kind"],
  amount: number,
): BudgetEntry => ({ id, month, kind, amount, shopId: 0, note: "" });

const budget: BudgetEntry[] = [
  entry(1, "2026-11", "income", 1000),
  entry(2, "2026-11", "salary", 300),
  entry(3, "2026-11", "supply", 200),
  entry(4, "2026-11", "delivery", 50),
  entry(5, "2026-10", "income", 500),
  entry(6, "2026-10", "salary", 300),
  entry(7, "2026-10", "supply", 400),
  entry(8, "2026-10", "delivery", 100),
  entry(9, "2024-01", "income", 9999),
];

test("lastTwelveMonths ends with the month of today, oldest first", () => {
  const months = lastTwelveMonths("2026-11-04");
  expect(months).toHaveLength(12);
  expect(months[0]).toBe("2025-12");
  expect(months[11]).toBe("2026-11");
  expect(lastTwelveMonths("2026-03-31")[0]).toBe("2025-04");
  expect(lastTwelveMonths("2026-12-01")[0]).toBe("2026-01");
});

test("ordersByMonth counts all, sums the paid ones and ignores other months", () => {
  const rows = ordersByMonth(orders, lastTwelveMonths(NOV));
  expect(rows).toHaveLength(12);
  expect(rows[11]).toEqual({
    month: "2026-11",
    count: 3,
    revenue: 400,
    cancelled: 1,
    refunded: 0,
  });
  expect(rows[10]).toEqual({
    month: "2026-10",
    count: 3,
    revenue: 200,
    cancelled: 0,
    refunded: 1,
  });
  expect(rows[0].count).toBe(0);
  expect(rows.reduce((a, r) => a + r.count, 0)).toBe(6);
});

test("statusBreakdown lists every status with its share", () => {
  const rows = statusBreakdown(orders);
  expect(rows.map((r) => r.status)).toEqual([
    "new",
    "paid",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
  ]);
  expect(rows.map((r) => r.count)).toEqual([1, 2, 1, 1, 1, 1]);
  expect(rows[1].share).toBe(28.6);
  expect(statusBreakdown([]).every((r) => r.share === 0)).toBe(true);
});

test("topShops ranks the revenue of paid, shipped and delivered orders", () => {
  expect(topShops(orders, shops, 5)).toEqual([
    { shopId: 1, name: "Alpha", city: "City 1", revenue: 1299, orders: 3 },
    { shopId: 2, name: "Beta", city: "City 2", revenue: 300, orders: 1 },
  ]);
  expect(topShops(orders, shops, 1)).toHaveLength(1);
  expect(topShops([], shops, 5)).toEqual([]);
});

test("budgetByMonth: expenses and profit", () => {
  const rows = budgetByMonth(budget, lastTwelveMonths(NOV));
  expect(rows[11]).toEqual({
    month: "2026-11",
    income: 1000,
    salary: 300,
    supply: 200,
    delivery: 50,
    expenses: 550,
    profit: 450,
  });
  expect(rows[10].expenses).toBe(800);
  expect(rows[10].profit).toBe(-300);
  expect(rows[0].profit).toBe(0);
});

test("budgetTotals and costShares", () => {
  const totals = budgetTotals(budget, lastTwelveMonths(NOV));
  expect(totals).toEqual({
    income: 1500,
    salary: 600,
    supply: 600,
    delivery: 150,
    expenses: 1350,
    profit: 150,
  });
  const shares = costShares(totals);
  expect(shares.map((s) => s.pct)).toEqual([44.4, 44.4, 11.1]);
  expect(costShares(budgetTotals([], ["2026-11"])).map((s) => s.pct)).toEqual([
    0, 0, 0,
  ]);
});

test("ordersDashboard builds the props of the sales part", () => {
  const view = ordersDashboard(orders, shops, NOV);
  expect(view.kpis.map((k) => k.id)).toEqual([
    "revenue",
    "orders",
    "avg",
    "lost",
  ]);
  expect(view.kpis[0].value).toBe("$400");
  expect(view.kpis[0].delta).toBe("+100%");
  expect(view.kpis[1].value).toBe("3");
  expect(view.kpis[2].value).toBe("$399.75");
  expect(view.revenue.points).toHaveLength(12);
  expect(view.ordersCols).toHaveLength(12);
  expect(view.statuses).toHaveLength(6);
  expect(view.top[0].text).toBe("$1,299");
  expect(view.top[0].pct).toBe(100);
});

test("budgetDashboard builds the props of the budget part", () => {
  const view = budgetDashboard(budget, NOV);
  expect(view.kpis.map((k) => k.id)).toEqual([
    "income",
    "salary",
    "supply",
    "delivery",
    "profit",
  ]);
  expect(view.kpis[0].value).toBe("$1,500");
  expect(view.kpis[4].value).toBe("$150");
  expect(view.months).toHaveLength(12);
  expect(view.months[10].bars[2].neg).toBe(true);
  expect(view.rows).toHaveLength(12);
  expect(view.rows[10].loss).toBe(true);
  expect(view.rows[11].label).toBe("Nov 2026");
  expect(view.totals.profit).toBe("$150");
  expect(view.shares.map((s) => s.id)).toEqual([
    "salary",
    "supply",
    "delivery",
  ]);
});

test("shopsMap plots the shops and describes the picked one", () => {
  const categories = [{ id: 1, name: "Flagship", description: "" }];
  const view = shopsMap(shops, categories, orders, "2");
  expect(view.points).toHaveLength(2);
  expect(view.points.find((p) => p.id === "2")?.active).toBe(true);
  expect(view.legend.map((l) => l.label)).toEqual(["Flagship"]);
  expect(view.picked?.name).toBe("Beta");
  expect(view.picked?.orders).toBe(3);
  expect(view.picked?.revenue).toBe("$300");
  expect(shopsMap(shops, categories, orders, "").picked).toBeNull();
});

// The real seed, when the data agent has written it.
const seeds = import.meta.glob<{ seedDb: () => Db | Promise<Db> }>(
  "../templates/phone-retail-crm/seed.ts",
);

test("the real seed gives consistent dashboards", async () => {
  const load = Object.values(seeds)[0];
  if (!load) return;
  const db = await (await load()).seedDb();
  const months = lastTwelveMonths(TODAY);
  const statuses = statusBreakdown(db.orders);
  expect(statuses.reduce((a, s) => a + s.count, 0)).toBe(db.orders.length);
  const view = ordersDashboard(db.orders, db.shops, TODAY);
  expect(view.revenue.points).toHaveLength(12);
  expect(view.top.length).toBeLessThanOrEqual(5);
  const totals = budgetTotals(db.budget, months);
  expect(totals.expenses).toBeCloseTo(
    totals.salary + totals.supply + totals.delivery,
    2,
  );
  expect(totals.profit).toBeCloseTo(totals.income - totals.expenses, 2);
  const map = shopsMap(db.shops, db.shopCategories, db.orders, "");
  expect(map.points).toHaveLength(db.shops.length);
  for (const p of map.points) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(100);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(100);
  }
  expect(budgetDashboard(db.budget, TODAY).months).toHaveLength(12);
});
