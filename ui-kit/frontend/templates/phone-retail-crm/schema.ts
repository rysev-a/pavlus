/**
 * The data of the Phone Retail CRM: eleven tables, kept in IndexedDB and in
 * the state as plain rows. Ids are numbers, dates are ISO strings
 * (`2026-03-14` or `2026-03-14T09:30:00`), money is a number of dollars.
 */

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  roleId: number;
  status: "active" | "blocked" | "invited";
  /** `YYYY-MM-DD` */
  createdAt: string;
}

export interface Role {
  id: number;
  name: string;
  description: string;
  permissionIds: number[];
}

export interface Permission {
  id: number;
  /** `orders.refund`: module, a dot, an action */
  code: string;
  description: string;
  module: string;
}

export interface Session {
  id: number;
  userId: number;
  ip: string;
  device: string;
  /** `YYYY-MM-DDTHH:MM:SS` */
  startedAt: string;
  expiresAt: string;
  active: boolean;
}

export interface Manufacturer {
  id: number;
  name: string;
  country: string;
}

export interface Model {
  id: number;
  manufacturerId: number;
  name: string;
  year: number;
}

export interface Product {
  id: number;
  modelId: number;
  sku: string;
  color: string;
  price: number;
  processor: string;
  /** GB */
  ram: number;
  /** GB */
  storage: number;
  /** `6.1" OLED 120 Hz` */
  display: string;
  stock: number;
}

export interface ShopCategory {
  id: number;
  name: string;
  description: string;
}

export interface Shop {
  id: number;
  name: string;
  categoryId: number;
  city: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
}

export const ORDER_STATUSES = [
  "new",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  productId: number;
  qty: number;
  /** the unit price at the time of the order */
  price: number;
}

export interface Order {
  id: number;
  userId: number;
  shopId: number;
  status: OrderStatus;
  /** `YYYY-MM-DD` */
  createdAt: string;
  items: OrderItem[];
  /** sum of qty * price, kept on the row */
  total: number;
  note: string;
}

export const BUDGET_KINDS = ["income", "salary", "supply", "delivery"] as const;
export type BudgetKind = (typeof BUDGET_KINDS)[number];

export interface BudgetEntry {
  id: number;
  /** `YYYY-MM` */
  month: string;
  kind: BudgetKind;
  amount: number;
  /** the shop it belongs to, or 0 for the company */
  shopId: number;
  note: string;
}

/** Every table, by name: this is the whole database. */
export interface Db {
  users: User[];
  roles: Role[];
  permissions: Permission[];
  sessions: Session[];
  manufacturers: Manufacturer[];
  models: Model[];
  products: Product[];
  shopCategories: ShopCategory[];
  shops: Shop[];
  orders: Order[];
  budget: BudgetEntry[];
}

export type TableName = keyof Db;

export const TABLES: TableName[] = [
  "users",
  "roles",
  "permissions",
  "sessions",
  "manufacturers",
  "models",
  "products",
  "shopCategories",
  "shops",
  "orders",
  "budget",
];

/** The sizes the brief asks for. */
export const SEED_COUNTS = {
  users: 200,
  roles: 50,
  permissions: 100,
  sessions: 20,
  shopCategories: 5,
  shops: 50,
  orders: 500,
} as const;

export const emptyDb = (): Db => ({
  users: [],
  roles: [],
  permissions: [],
  sessions: [],
  manufacturers: [],
  models: [],
  products: [],
  shopCategories: [],
  shops: [],
  orders: [],
  budget: [],
});

/** What an exported file is: a marker, a version, the tables. */
export interface Snapshot {
  app: "phone-retail-crm";
  version: 1;
  exportedAt: string;
  data: Db;
}
