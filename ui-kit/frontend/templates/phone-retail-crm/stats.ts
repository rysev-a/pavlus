/**
 * The numbers behind the three dashboards of the Phone Retail CRM. Pure: no
 * DOM, no `Date` (today is a parameter, the demo's today is `TODAY`), no state.
 * Two layers: the maths (`ordersByMonth`, `budgetTotals`...) and the view
 * builders (`ordersDashboard`, `budgetDashboard`, `shopsMap`) that return the
 * props of the parts `orders-dashboard.pavlus`, `budget-dashboard.pavlus` and
 * `shops-map.pavlus`.
 */
import { money, type Tone } from "../../blocks/admin-shell/shell.ts";
import { type Area, areaChart, short } from "../../blocks/area-chart/area.ts";
import { type Column, columns } from "../../blocks/bar-chart/chart.ts";
import { type GeoPlot, geoPlot } from "../../blocks/geo-plot/geo.ts";
import {
  type LegendItem,
  type MoneyMonth,
  moneyBars,
  noLoss,
} from "../../blocks/money-bars/bars.ts";
import { type Item, item } from "../../blocks/progress-list/items.ts";
import { type Card, card, change } from "../../blocks/stat-cards/cards.ts";
import {
  type BudgetEntry,
  type BudgetKind,
  type Order,
  ORDER_STATUSES,
  type OrderStatus,
  type Shop,
  type ShopCategory,
} from "./schema.ts";

/** The fixed "today" of the demo (no clock in a pure function). */
export const TODAY = "2026-10-31";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Orders in these statuses brought money in. */
const PAID: ReadonlySet<OrderStatus> = new Set([
  "paid",
  "shipped",
  "delivered",
]);

const r = (n: number): number => Math.round(n * 100) / 100;
const usd0 = (v: number): string => money(v, "$", 0);

/** `2026-11` -> `Nov`. */
export const monthName = (month: string): string =>
  MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;

/** `2026-11` -> `Nov 2026`. */
export const monthTitle = (month: string): string =>
  `${monthName(month)} ${month.slice(0, 4)}`;

/** The twelve months (`YYYY-MM`), oldest first, ending with the month of `today`. */
export function lastTwelveMonths(today: string): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const out: string[] = [];
  for (let back = 11; back >= 0; back--) {
    const index = year * 12 + (month - 1) - back;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    out.push(`${y}-${m < 10 ? "0" : ""}${m}`);
  }
  return out;
}

// ---------------------------------------------------------------- orders

export interface MonthOrders {
  month: string;
  /** every order created in the month */
  count: number;
  /** the total of the paid, shipped and delivered orders */
  revenue: number;
  cancelled: number;
  refunded: number;
}

export function ordersByMonth(
  orders: Order[],
  months: string[],
): MonthOrders[] {
  const rows = new Map<string, MonthOrders>(
    months.map((month) => [
      month,
      { month, count: 0, revenue: 0, cancelled: 0, refunded: 0 },
    ]),
  );
  for (const order of orders) {
    const row = rows.get(order.createdAt.slice(0, 7));
    if (!row) continue;
    row.count += 1;
    if (PAID.has(order.status)) row.revenue = r(row.revenue + order.total);
    if (order.status === "cancelled") row.cancelled += 1;
    if (order.status === "refunded") row.refunded += 1;
  }
  return months.map((month) => rows.get(month) as MonthOrders);
}

export interface StatusRow {
  status: OrderStatus;
  count: number;
  /** percent of all orders, one decimal */
  share: number;
}

/** Every status in the schema's order (also the empty ones). */
export function statusBreakdown(orders: Order[]): StatusRow[] {
  const total = orders.length;
  return ORDER_STATUSES.map((status) => {
    const count = orders.filter((o) => o.status === status).length;
    return {
      status,
      count,
      share: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
    };
  });
}

export interface ShopRevenue {
  shopId: number;
  name: string;
  city: string;
  revenue: number;
  orders: number;
}

/** The `n` shops with the most revenue (paid, shipped, delivered), biggest first; ties by name. */
export function topShops(
  orders: Order[],
  shops: Shop[],
  n: number,
): ShopRevenue[] {
  const rows = new Map<number, ShopRevenue>(
    shops.map((s) => [
      s.id,
      { shopId: s.id, name: s.name, city: s.city, revenue: 0, orders: 0 },
    ]),
  );
  for (const order of orders) {
    const row = rows.get(order.shopId);
    if (!row || !PAID.has(order.status)) continue;
    row.revenue = r(row.revenue + order.total);
    row.orders += 1;
  }
  return [...rows.values()]
    .filter((row) => row.orders > 0)
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name))
    .slice(0, n);
}

// ---------------------------------------------------------------- budget

export interface MonthBudget {
  month: string;
  income: number;
  salary: number;
  supply: number;
  delivery: number;
  /** salary + supply + delivery */
  expenses: number;
  /** income - expenses (may be negative) */
  profit: number;
}

const finish = (row: Omit<MonthBudget, "expenses" | "profit">): MonthBudget => {
  const expenses = r(row.salary + row.supply + row.delivery);
  return { ...row, expenses, profit: r(row.income - expenses) };
};

export function budgetByMonth(
  budget: BudgetEntry[],
  months: string[],
): MonthBudget[] {
  const sums = new Map<string, Record<BudgetKind, number>>(
    months.map((m) => [m, { income: 0, salary: 0, supply: 0, delivery: 0 }]),
  );
  for (const entry of budget) {
    const sum = sums.get(entry.month);
    if (sum) sum[entry.kind] = r(sum[entry.kind] + entry.amount);
  }
  return months.map((month) =>
    finish({ month, ...(sums.get(month) as Record<BudgetKind, number>) }),
  );
}

export type BudgetTotals = Omit<MonthBudget, "month">;

/** The sums of `budgetByMonth` over the months. */
export function budgetTotals(
  budget: BudgetEntry[],
  months: string[],
): BudgetTotals {
  const total = { income: 0, salary: 0, supply: 0, delivery: 0 };
  for (const row of budgetByMonth(budget, months)) {
    total.income = r(total.income + row.income);
    total.salary = r(total.salary + row.salary);
    total.supply = r(total.supply + row.supply);
    total.delivery = r(total.delivery + row.delivery);
  }
  const { income, salary, supply, delivery } = total;
  const { expenses, profit } = finish({ month: "", ...total });
  return { income, salary, supply, delivery, expenses, profit };
}

export interface CostShare {
  kind: "salary" | "supply" | "delivery";
  amount: number;
  /** percent of the expenses, one decimal (0 without expenses) */
  pct: number;
}

export function costShares(totals: BudgetTotals): CostShare[] {
  const kinds = ["salary", "supply", "delivery"] as const;
  return kinds.map((kind) => ({
    kind,
    amount: totals[kind],
    pct:
      totals.expenses <= 0
        ? 0
        : Math.round((totals[kind] / totals.expenses) * 1000) / 10,
  }));
}

// ----------------------------------------------------------------- views

const STATUS_TONE: Record<OrderStatus, Tone> = {
  new: "muted",
  paid: "info",
  shipped: "warning",
  delivered: "success",
  cancelled: "destructive",
  refunded: "destructive",
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export interface OrdersDashboardProps {
  kpis: Card[];
  revenue: Area;
  ordersCols: Column[];
  statuses: Item[];
  top: Item[];
}

/** The props of `orders-dashboard.pavlus`. */
export function ordersDashboard(
  orders: Order[],
  shops: Shop[],
  today: string = TODAY,
): OrdersDashboardProps {
  const months = lastTwelveMonths(today);
  const rows = ordersByMonth(orders, months);
  const cur = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const revenueSeries = rows.map((x) => x.revenue);
  const countSeries = rows.map((x) => x.count);
  const yearRevenue = r(revenueSeries.reduce((a, b) => a + b, 0));
  const yearCount = countSeries.reduce((a, b) => a + b, 0);
  const paidCount = orders.filter((o) => PAID.has(o.status)).length;
  const paidRevenue = r(
    orders.filter((o) => PAID.has(o.status)).reduce((a, o) => a + o.total, 0),
  );
  const avg = paidCount === 0 ? 0 : r(paidRevenue / paidCount);
  const lost = orders.filter(
    (o) => o.status === "cancelled" || o.status === "refunded",
  ).length;
  const lostPct =
    orders.length === 0 ? 0 : Math.round((lost / orders.length) * 1000) / 10;
  const revChange = change(cur.revenue, prev.revenue);
  const cntChange = change(cur.count, prev.count);
  const kpis = [
    card("revenue", "Revenue, this month", usd0(cur.revenue), {
      ...revChange,
      hint: `${usd0(yearRevenue)} in 12 months`,
      icon: "k-ai-dollar",
      tone: "success",
      series: revenueSeries,
    }),
    card("orders", "Orders, this month", String(cur.count), {
      ...cntChange,
      hint: `${yearCount} in 12 months`,
      icon: "k-ai-cart",
      tone: "info",
      series: countSeries,
    }),
    card("avg", "Average order", money(avg), {
      hint: `${paidCount} paid orders`,
      icon: "k-ai-receipt",
    }),
    card("lost", "Cancelled or refunded", `${lostPct}%`, {
      hint: `${lost} of ${orders.length} orders`,
      icon: "k-ai-alert",
      tone: lostPct >= 15 ? "destructive" : "warning",
    }),
  ];
  const revenue = areaChart(
    rows.map((x) => ({
      id: x.month,
      label: monthName(x.month),
      value: x.revenue,
    })),
    { format: (v) => short(v, "$") },
  );
  const ordersCols = columns(
    rows.map((x) => ({
      id: x.month,
      label: monthName(x.month),
      value: x.count,
      show: true,
      tone: "info" as Tone,
    })),
  );
  const breakdown = statusBreakdown(orders);
  const statuses = breakdown.map((s) =>
    item(s.status, cap(s.status), s.count, orders.length, {
      tone: STATUS_TONE[s.status],
      text: `${s.count} (${s.share}%)`,
    }),
  );
  const best = topShops(orders, shops, 5);
  const topMax = best.length > 0 ? best[0].revenue : 0;
  const top = best.map((s) =>
    item(`shop${s.shopId}`, s.name, s.revenue, topMax, {
      tone: "default",
      text: usd0(s.revenue),
      sub: `${s.city}, ${s.orders} orders`,
    }),
  );
  return { kpis, revenue, ordersCols, statuses, top };
}

export interface BudgetRowView {
  id: string;
  label: string;
  income: string;
  salary: string;
  supply: string;
  delivery: string;
  expenses: string;
  profit: string;
  loss: boolean;
}

export interface BudgetDashboardProps {
  kpis: Card[];
  months: MoneyMonth[];
  /** true when no month lost money (the chart drops its lower half) */
  flat: boolean;
  legend: LegendItem[];
  shares: Item[];
  rows: BudgetRowView[];
  /** the totals row of the table */
  totals: BudgetRowView;
}

const KIND_LABEL = {
  salary: "Salaries",
  supply: "Shop supply",
  delivery: "Delivery",
};
const KIND_TONE: Record<string, Tone> = {
  salary: "info",
  supply: "warning",
  delivery: "default",
};

const rowView = (
  id: string,
  label: string,
  b: BudgetTotals,
): BudgetRowView => ({
  id,
  label,
  income: usd0(b.income),
  salary: usd0(b.salary),
  supply: usd0(b.supply),
  delivery: usd0(b.delivery),
  expenses: usd0(b.expenses),
  profit: usd0(b.profit),
  loss: b.profit < 0,
});

/** The props of `budget-dashboard.pavlus`. */
export function budgetDashboard(
  budget: BudgetEntry[],
  today: string = TODAY,
): BudgetDashboardProps {
  const monthsList = lastTwelveMonths(today);
  const rows = budgetByMonth(budget, monthsList);
  const totals = budgetTotals(budget, monthsList);
  const cur = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const series = (key: keyof Omit<MonthBudget, "month">): number[] =>
    rows.map((x) => Math.max(0, x[key]));
  const kpi = (
    id: string,
    label: string,
    key: keyof Omit<MonthBudget, "month">,
    icon: string,
    tone: Card["tone"],
    inverse = false,
  ): Card => {
    const c = change(cur[key], prev[key]);
    // for costs a rise is bad: the arrow keeps its direction, the hint says so
    return card(id, label, usd0(totals[key]), {
      ...c,
      trend:
        inverse && c.trend !== "flat"
          ? c.trend === "up"
            ? "down"
            : "up"
          : c.trend,
      hint: `${usd0(cur[key])} this month`,
      icon,
      tone,
      series: series(key),
    });
  };
  const kpis = [
    kpi("income", "Income, 12 months", "income", "k-ai-dollar", "success"),
    kpi("salary", "Salaries, 12 months", "salary", "k-ai-users", "info", true),
    kpi(
      "supply",
      "Shop supply, 12 months",
      "supply",
      "k-ai-box",
      "warning",
      true,
    ),
    kpi(
      "delivery",
      "Delivery, 12 months",
      "delivery",
      "k-ai-truck",
      "default",
      true,
    ),
    kpi(
      "profit",
      "Profit, 12 months",
      "profit",
      "k-ai-chart",
      totals.profit < 0 ? "destructive" : "success",
    ),
  ];
  const months = moneyBars(
    rows.map((x) => ({
      id: x.month,
      label: monthName(x.month),
      values: [
        { id: "income", value: x.income, tone: "success" as Tone },
        { id: "expenses", value: x.expenses, tone: "warning" as Tone },
        { id: "profit", value: x.profit, tone: "default" as Tone },
      ],
    })),
    usd0,
  );
  const legend: LegendItem[] = [
    { id: "income", label: "Income", tone: "success" },
    { id: "expenses", label: "Expenses", tone: "warning" },
    { id: "profit", label: "Profit", tone: "default" },
  ];
  const shares = costShares(totals).map((s) =>
    item(s.kind, KIND_LABEL[s.kind], s.pct, 100, {
      tone: KIND_TONE[s.kind],
      text: `${usd0(s.amount)} (${s.pct}%)`,
    }),
  );
  return {
    kpis,
    months,
    flat: noLoss(months),
    legend,
    shares,
    rows: rows.map((x) => rowView(x.month, monthTitle(x.month), x)),
    totals: rowView("total", "12 months", totals),
  };
}

export interface PickedShop {
  id: string;
  name: string;
  category: string;
  city: string;
  address: string;
  phone: string;
  coords: string;
  orders: number;
  revenue: string;
}

export interface ShopsMapProps {
  points: GeoPlot["points"];
  legend: GeoPlot["legend"];
  ticks: GeoPlot["ticks"];
  /** the picked shop, or null */
  picked: PickedShop | null;
  /** how many shops are plotted */
  count: number;
}

const CATEGORY_TONES: Tone[] = [
  "default",
  "success",
  "warning",
  "destructive",
  "info",
];

/** The props of `shops-map.pavlus`; `pickedId` is a shop id as text, or "". */
export function shopsMap(
  shops: Shop[],
  categories: ShopCategory[],
  orders: Order[],
  pickedId: string,
): ShopsMapProps {
  const toneOf = new Map<number, Tone>(
    categories.map((c, i) => [c.id, CATEGORY_TONES[i % CATEGORY_TONES.length]]),
  );
  const nameOf = new Map<number, string>(categories.map((c) => [c.id, c.name]));
  const plot = geoPlot(
    shops.map((s) => ({
      id: String(s.id),
      label: s.name,
      sub: s.city,
      lat: s.lat,
      lng: s.lng,
      tone: toneOf.get(s.categoryId) ?? "muted",
    })),
    pickedId || null,
    categories.map((c, i) => ({
      tone: CATEGORY_TONES[i % CATEGORY_TONES.length],
      label: c.name,
    })),
  );
  const shop = shops.find((s) => String(s.id) === pickedId);
  let picked: PickedShop | null = null;
  if (shop) {
    const own = orders.filter((o) => o.shopId === shop.id);
    const paid = own.filter((o) => PAID.has(o.status));
    picked = {
      id: String(shop.id),
      name: shop.name,
      category: nameOf.get(shop.categoryId) ?? "",
      city: shop.city,
      address: shop.address,
      phone: shop.phone,
      coords: `${shop.lat}, ${shop.lng}`,
      orders: own.length,
      revenue: usd0(paid.reduce((a, o) => a + o.total, 0)),
    };
  }
  return {
    points: plot.points,
    legend: plot.legend,
    ticks: plot.ticks,
    picked,
    count: shops.length,
  };
}
