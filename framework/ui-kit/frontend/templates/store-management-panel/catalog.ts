import { money, share, type Tone } from "../../blocks/admin-shell/shell.ts";
import {
  type Column as BarColumn,
  columns,
} from "../../blocks/bar-chart/chart.ts";
import {
  action,
  type ColumnDef,
  number,
  pill,
  type Row,
  rowOf,
  type Sort,
  sortBy,
  strong,
  text,
} from "../../blocks/data-grid/grid.ts";
import { item, type Item } from "../../blocks/progress-list/items.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import {
  listAction,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";

export const usd = (n: number): string => money(n, "$", 0);
export const usdc = (n: number): string => money(n, "$", 2);

// ---- products -----------------------------------------------------------------

export type ProductStatus = "active" | "draft" | "archived";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  /** At or below this, the product is low. */
  reorder: number;
  status: ProductStatus;
}

export const CATEGORIES = ["Apparel", "Accessories", "Footwear", "Home"];

const p = (
  id: string,
  sku: string,
  name: string,
  category: string,
  price: number,
  stock: number,
  reorder: number,
  status: ProductStatus = "active",
): Product => ({ id, sku, name, category, price, stock, reorder, status });

export const PRODUCTS: Product[] = [
  p("p1", "LS-0042", "Linen shirt", "Apparel", 48, 36, 10),
  p("p2", "DJ-0110", "Denim jacket", "Apparel", 120, 8, 10),
  p("p3", "CS-0207", "Canvas sneakers", "Footwear", 65, 52, 15),
  p("p4", "LB-0311", "Leather belt", "Accessories", 35, 0, 12),
  p("p5", "WS-0124", "Wool scarf", "Accessories", 42, 24, 10),
  p("p6", "MS-0150", "Merino sweater", "Apparel", 95, 14, 8),
  p("p7", "CT-0001", "Cotton tee", "Apparel", 22, 140, 40),
  p("p8", "ST-0415", "Silk tie", "Accessories", 38, 9, 10),
  p("p9", "TB-0502", "Tote bag", "Accessories", 28, 61, 20),
  p("p10", "CM-0610", "Ceramic mug", "Home", 14, 88, 30),
  p("p11", "SC-0623", "Scented candle", "Home", 19, 6, 15),
  p("p12", "TH-0701", "Throw blanket", "Home", 79, 17, 8),
  p("p13", "DL-0718", "Desk lamp", "Home", 54, 11, 6),
  p("p14", "NB-0802", "Notebook set", "Home", 16, 73, 25, "draft"),
  p("p15", "OT-0009", "Old season tote", "Accessories", 10, 4, 0, "archived"),
];

export const productName = (list: Product[], id: string): string =>
  list.find((x) => x.id === id)?.name ?? id;

export type StockLevel = "ok" | "low" | "out";

/** Pure: how a product's stock is doing. */
export function levelOf(x: Product): StockLevel {
  if (x.stock <= 0) return "out";
  return x.stock <= x.reorder ? "low" : "ok";
}

const LEVEL_TONE: Record<StockLevel, Tone> = {
  ok: "success",
  low: "warning",
  out: "destructive",
};
const LEVEL_LABEL: Record<StockLevel, string> = {
  ok: "In stock",
  low: "Low",
  out: "Out of stock",
};

/** Active products that are low or out (archived and draft ones are not alerts). */
export const alerts = (list: Product[]): Product[] =>
  list.filter((x) => x.status === "active" && levelOf(x) !== "ok");

/** Pure: how many units a restock brings: twice the reorder level, at least 10. */
export const restockQty = (x: Product): number => Math.max(10, x.reorder * 2);

export function restock(list: Product[], id: string): Product[] {
  return list.map((x) =>
    x.id === id ? { ...x, stock: x.stock + restockQty(x) } : x,
  );
}

export function restockAll(list: Product[]): Product[] {
  const need = new Set(alerts(list).map((x) => x.id));
  return list.map((x) =>
    need.has(x.id) ? { ...x, stock: x.stock + restockQty(x) } : x,
  );
}

export const PRODUCT_FILTERS: [string, string][] = [
  ["all", "All"],
  ["active", "Active"],
  ["draft", "Draft"],
  ["archived", "Archived"],
];

export const PRODUCT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Product", sortable: true },
  { key: "category", label: "Category", sortable: true },
  { key: "price", label: "Price", sortable: true, align: "right" },
  { key: "stock", label: "Stock", sortable: true, align: "right" },
  { key: "status", label: "Status", sortable: true },
];

const productValue = (x: Product, key: string): string | number =>
  key === "price"
    ? x.price
    : key === "stock"
      ? x.stock
      : key === "status"
        ? x.status
        : key === "category"
          ? x.category
          : x.name;

export function productRows(
  list: Product[],
  filter: string,
  query: string,
  sort: Sort | null,
): Row[] {
  const q = query.trim().toLowerCase();
  const shown = list
    .filter((x) => filter === "all" || x.status === filter)
    .filter(
      (x) =>
        !q ||
        x.name.toLowerCase().includes(q) ||
        x.sku.toLowerCase().includes(q) ||
        x.category.toLowerCase().includes(q),
    );
  return sortBy(shown, sort, productValue).map((x) => {
    const level = levelOf(x);
    return rowOf(
      PRODUCT_COLUMNS,
      x.id,
      {
        name: strong(x.name, x.sku),
        category: text(x.category),
        price: number(usdc(x.price)),
        stock:
          level === "ok"
            ? number(x.stock)
            : pill(`${x.stock} · ${LEVEL_LABEL[level]}`, LEVEL_TONE[level]),
        status: pill(
          x.status,
          x.status === "active"
            ? "success"
            : x.status === "draft"
              ? "info"
              : "muted",
        ),
      },
      [action("edit", "Edit")],
    );
  });
}

export function productFooter(list: Product[], filter: string): string {
  const shown = list.filter((x) => filter === "all" || x.status === filter);
  return `${shown.length} of ${list.length} products`;
}

// ---- orders -----------------------------------------------------------------

export type OrderStatus =
  | "new"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface OrderLine {
  product: string;
  qty: number;
}

export interface Order {
  id: string;
  number: string;
  customer: string;
  placed: string;
  lines: OrderLine[];
  status: OrderStatus;
}

const o = (
  n: number,
  customer: string,
  placed: string,
  lines: [string, number][],
  status: OrderStatus,
): Order => ({
  id: `o${n}`,
  number: `#${n}`,
  customer,
  placed,
  lines: lines.map(([product, qty]) => ({ product, qty })),
  status,
});

export const ORDERS: Order[] = [
  o(
    1052,
    "Ann Lee",
    "Today, 09:12",
    [
      ["p1", 2],
      ["p9", 1],
    ],
    "new",
  ),
  o(1051, "Jon Park", "Today, 08:40", [["p2", 1]], "new"),
  o(
    1050,
    "Eva Stone",
    "Today, 08:05",
    [
      ["p10", 4],
      ["p11", 2],
    ],
    "new",
  ),
  o(
    1049,
    "Max Roy",
    "Yesterday",
    [
      ["p3", 1],
      ["p5", 1],
    ],
    "packed",
  ),
  o(1048, "Lia Chen", "Yesterday", [["p6", 1]], "packed"),
  o(1047, "Tom Reed", "Yesterday", [["p7", 6]], "shipped"),
  o(
    1046,
    "Ivy Nash",
    "Mon",
    [
      ["p12", 1],
      ["p10", 2],
    ],
    "shipped",
  ),
  o(1045, "Gus Lane", "Mon", [["p13", 1]], "shipped"),
  o(
    1044,
    "Amy Cole",
    "Sun",
    [
      ["p1", 1],
      ["p8", 1],
    ],
    "delivered",
  ),
  o(1043, "Ben Ito", "Sun", [["p9", 3]], "delivered"),
  o(1042, "Cara Webb", "Sat", [["p3", 2]], "delivered"),
  o(1041, "Dan Fox", "Sat", [["p4", 1]], "cancelled"),
];

export const ORDER_FLOW: OrderStatus[] = [
  "new",
  "packed",
  "shipped",
  "delivered",
];

export const STATUS_TONE: Record<OrderStatus, Tone> = {
  new: "info",
  packed: "warning",
  shipped: "default",
  delivered: "success",
  cancelled: "muted",
};

export const STEP_LABEL: Record<string, string> = {
  new: "Pack",
  packed: "Ship",
  shipped: "Mark delivered",
};

/** Pure: the next status in the flow (the last one and a cancelled order stay). */
export function nextStatus(s: OrderStatus): OrderStatus {
  const i = ORDER_FLOW.indexOf(s);
  return i < 0 || i === ORDER_FLOW.length - 1 ? s : ORDER_FLOW[i + 1];
}

export function orderTotal(order: Order, products: Product[]): number {
  return order.lines.reduce(
    (n, l) =>
      n + l.qty * (products.find((x) => x.id === l.product)?.price ?? 0),
    0,
  );
}

export const unitsOf = (order: Order): number =>
  order.lines.reduce((n, l) => n + l.qty, 0);

/** Pure: what is missing to pack an order (product name and how many short). */
export function shortages(
  order: Order,
  products: Product[],
): { name: string; short: number }[] {
  return order.lines
    .map((l) => {
      const x = products.find((q) => q.id === l.product);
      return { name: x?.name ?? l.product, short: l.qty - (x?.stock ?? 0) };
    })
    .filter((s) => s.short > 0);
}

export interface Moved {
  orders: Order[];
  products: Product[];
  /** The products that were short; when not empty nothing moved. */
  short: { name: string; short: number }[];
}

/**
 * Pure: one step forward for an order. Packing takes the units out of the
 * warehouse; if one product is short, the order stays where it is.
 */
export function advanceOrder(
  orders: Order[],
  products: Product[],
  id: string,
): Moved {
  const order = orders.find((x) => x.id === id);
  if (!order || nextStatus(order.status) === order.status) {
    return { orders, products, short: [] };
  }
  const short = order.status === "new" ? shortages(order, products) : [];
  if (short.length > 0) return { orders, products, short };
  const taken =
    order.status === "new"
      ? products.map((x) => {
          const line = order.lines.find((l) => l.product === x.id);
          return line ? { ...x, stock: x.stock - line.qty } : x;
        })
      : products;
  return {
    orders: orders.map((x) =>
      x.id === id ? { ...x, status: nextStatus(x.status) } : x,
    ),
    products: taken,
    short: [],
  };
}

/** Pure: cancel a new order. A packed order cannot be cancelled here. */
export function cancelOrder(orders: Order[], id: string): Order[] {
  return orders.map((x) =>
    x.id === id && x.status === "new" ? { ...x, status: "cancelled" } : x,
  );
}

export const ORDER_FILTERS: [string, string][] = [
  ["all", "All"],
  ["new", "New"],
  ["packed", "Packed"],
  ["shipped", "Shipped"],
  ["delivered", "Delivered"],
];

export const ORDER_COLUMNS: ColumnDef[] = [
  { key: "number", label: "Order", sortable: true },
  { key: "customer", label: "Customer", sortable: true },
  { key: "units", label: "Items", align: "right" },
  { key: "total", label: "Total", sortable: true, align: "right" },
  { key: "status", label: "Status" },
];

export function orderRows(
  orders: Order[],
  products: Product[],
  filter: string,
  query: string,
  sort: Sort | null,
): Row[] {
  const q = query.trim().toLowerCase();
  const shown = orders
    .filter((x) => filter === "all" || x.status === filter)
    .filter(
      (x) => !q || x.customer.toLowerCase().includes(q) || x.number.includes(q),
    );
  const value = (x: Order, key: string): string | number =>
    key === "total"
      ? orderTotal(x, products)
      : key === "customer"
        ? x.customer
        : Number(x.number.slice(1));
  return sortBy(shown, sort, value).map((x) => {
    const step = STEP_LABEL[x.status];
    return rowOf(
      ORDER_COLUMNS,
      x.id,
      {
        number: strong(x.number, x.placed),
        customer: text(x.customer),
        units: number(unitsOf(x)),
        total: number(usdc(orderTotal(x, products))),
        status: pill(x.status, STATUS_TONE[x.status]),
      },
      [
        ...(step ? [action("advance", step, { variant: "default" })] : []),
        ...(x.status === "new"
          ? [action("cancel", "Cancel", { variant: "ghost" })]
          : []),
      ],
    );
  });
}

export function orderFooter(
  orders: Order[],
  products: Product[],
  filter: string,
): string {
  const shown = orders.filter((x) => filter === "all" || x.status === filter);
  return `${shown.length} orders · ${usdc(shown.reduce((n, x) => n + orderTotal(x, products), 0))}`;
}

// ---- warehouse --------------------------------------------------------------

export const WAREHOUSE_FILTERS: [string, string][] = [
  ["all", "All"],
  ["low", "Low"],
  ["out", "Out of stock"],
  ["ok", "In stock"],
];

export const warehousePasses = (x: Product, id: string): boolean =>
  x.status === "active" && levelOf(x) === id;

/** Pure: a product as a row of the warehouse list. */
export function stockRow(x: Product): StatusRow {
  const level = levelOf(x);
  const cap = Math.max(x.reorder * 3, x.stock, 1);
  const pct = share(x.stock, cap);
  return statusRow(x.id, x.name, LEVEL_LABEL[level], LEVEL_TONE[level], {
    sub: `${x.sku} · ${x.category}`,
    facts: [
      { label: "In stock", value: String(x.stock) },
      { label: "Reorder at", value: String(x.reorder) },
    ],
    meters: [
      {
        label: "Stock level",
        pct,
        text: `${x.stock} units`,
        tone:
          level === "ok"
            ? "success"
            : level === "low"
              ? "warning"
              : "destructive",
      },
    ],
    actions:
      x.status === "archived"
        ? []
        : [
            listAction("restock", `Restock +${restockQty(x)}`, {
              icon: "k-ai-arrow-down",
              variant: level === "ok" ? "outline" : "default",
            }),
          ],
  });
}

export function warehouseRows(list: Product[], filter: string): StatusRow[] {
  return list
    .filter((x) => x.status !== "archived")
    .filter((x) => filter === "all" || warehousePasses(x, filter))
    .sort((a, b) => levelRank(a) - levelRank(b) || a.stock - b.stock)
    .map(stockRow);
}

const levelRank = (x: Product): number =>
  levelOf(x) === "out" ? 0 : levelOf(x) === "low" ? 1 : 2;

export function warehouseCards(list: Product[]): Card[] {
  const active = list.filter((x) => x.status !== "archived");
  const low = alerts(list);
  return [
    card("skus", "Products", String(active.length), {
      icon: "k-ai-tag",
      tone: "info",
      hint: "in the catalog",
    }),
    card(
      "units",
      "Units in stock",
      String(active.reduce((n, x) => n + x.stock, 0)),
      {
        icon: "k-ai-warehouse",
        tone: "default",
        series: active.slice(0, 8).map((x) => x.stock),
      },
    ),
    card(
      "low",
      "Low stock",
      String(low.filter((x) => levelOf(x) === "low").length),
      {
        icon: "k-ai-alert",
        tone: "warning",
        hint: "at or below the reorder level",
      },
    ),
    card(
      "out",
      "Out of stock",
      String(low.filter((x) => levelOf(x) === "out").length),
      { icon: "k-ai-alert", tone: "destructive", hint: "cannot be sold" },
    ),
  ];
}

// ---- dashboard --------------------------------------------------------------

export const SALES = [1840, 2310, 1980, 2760, 3120, 3680, 2950];
export const SALES_DAYS = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"];

export function salesBars(): BarColumn[] {
  return columns(
    SALES.map((v, i) => ({
      id: SALES_DAYS[i],
      label: SALES_DAYS[i],
      value: v,
      show: true,
      tone: i === SALES.length - 1 ? "info" : "default",
    })),
    undefined,
  ).map((c) => ({
    ...c,
    value: c.value ? `${(Number(c.value) / 1000).toFixed(1)}k` : "",
  }));
}

export function statusItems(orders: Order[]): Item[] {
  const live = orders.filter((x) => x.status !== "cancelled");
  return ORDER_FLOW.map((s) =>
    item(
      s,
      s[0].toUpperCase() + s.slice(1),
      live.filter((x) => x.status === s).length,
      Math.max(1, live.length),
      {
        tone: STATUS_TONE[s],
        text: `${live.filter((x) => x.status === s).length} orders`,
      },
    ),
  );
}

export function dashboardCards(orders: Order[], products: Product[]): Card[] {
  const live = orders.filter((x) => x.status !== "cancelled");
  const revenue = live.reduce((n, x) => n + orderTotal(x, products), 0);
  const fresh = orders.filter((x) => x.status === "new").length;
  return [
    card("revenue", "Revenue", usd(revenue), {
      icon: "k-ai-dollar",
      tone: "success",
      delta: "+8.4%",
      trend: "up",
      hint: "vs last week",
      series: SALES,
    }),
    card("orders", "Orders", String(live.length), {
      icon: "k-ai-cart",
      tone: "info",
      delta: "+3",
      trend: "up",
      hint: `${fresh} to pack`,
    }),
    card(
      "aov",
      "Average order",
      usd(live.length ? Math.round(revenue / live.length) : 0),
      { icon: "k-ai-receipt", tone: "default", hint: "per order" },
    ),
    card("low", "Stock alerts", String(alerts(products).length), {
      icon: "k-ai-alert",
      tone: alerts(products).length ? "warning" : "success",
      hint: "need a restock",
    }),
  ];
}

/** The few products that most need a restock, for the dashboard. */
export function topAlerts(list: Product[]): StatusRow[] {
  return alerts(list)
    .sort((a, b) => levelRank(a) - levelRank(b) || a.stock - b.stock)
    .slice(0, 4)
    .map(stockRow);
}
