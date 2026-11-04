import {
  BUDGET_KINDS,
  ORDER_STATUSES,
  TABLES,
  type Db,
  type Snapshot,
  type TableName,
} from "./schema.ts";

/**
 * Export and import of the whole database as one JSON file. All pure:
 * `parseSnapshot` trusts nothing and says exactly what is wrong.
 */

export function snapshotOf(db: Db, now: string): Snapshot {
  return { app: "phone-retail-crm", version: 1, exportedAt: now, data: db };
}

export const snapshotText = (snapshot: Snapshot): string =>
  JSON.stringify(snapshot, null, 2);

/** The size of a text as a file (UTF-8 bytes). */
export const bytesOf = (text: string): number => new TextEncoder().encode(text).length;

export function dbCounts(db: Db): Record<TableName, number> {
  const out = {} as Record<TableName, number>;
  for (const t of TABLES) out[t] = db[t].length;
  return out;
}

// ---- field specs: one small table per entity ----

type Kind =
  | "string"
  | "number"
  | "int"
  | "boolean"
  | "numbers"
  | "items"
  | readonly string[]; // one of these strings

type Spec = Record<string, Kind>;

const SPECS: Record<TableName, Spec> = {
  users: {
    name: "string",
    email: "string",
    phone: "string",
    roleId: "int",
    status: ["active", "blocked", "invited"],
    createdAt: "string",
  },
  roles: { name: "string", description: "string", permissionIds: "numbers" },
  permissions: { code: "string", description: "string", module: "string" },
  sessions: {
    userId: "int",
    ip: "string",
    device: "string",
    startedAt: "string",
    expiresAt: "string",
    active: "boolean",
  },
  manufacturers: { name: "string", country: "string" },
  models: { manufacturerId: "int", name: "string", year: "int" },
  products: {
    modelId: "int",
    sku: "string",
    color: "string",
    price: "number",
    processor: "string",
    ram: "number",
    storage: "number",
    display: "string",
    stock: "number",
  },
  shopCategories: { name: "string", description: "string" },
  shops: {
    name: "string",
    categoryId: "int",
    city: "string",
    address: "string",
    lat: "number",
    lng: "number",
    phone: "string",
  },
  orders: {
    userId: "int",
    shopId: "int",
    status: ORDER_STATUSES,
    createdAt: "string",
    items: "items",
    total: "number",
    note: "string",
  },
  budget: {
    month: "string",
    kind: BUDGET_KINDS,
    amount: "number",
    shopId: "int",
    note: "string",
  },
};

/** The fields of an order item. */
const ITEM_SPEC: Spec = { productId: "int", qty: "int", price: "number" };

type Row = Record<string, unknown>;

const isObject = (v: unknown): v is Row =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const show = (v: unknown): string => {
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 40 ? s.slice(0, 37) + "..." : s;
};

/** Checks one value against a kind; the error says what was expected. */
function wrong(value: unknown, kind: Kind): string | null {
  if (Array.isArray(kind)) {
    return kind.includes(value as string)
      ? null
      : `${show(value)} is not one of ${kind.join(", ")}`;
  }
  switch (kind) {
    case "string":
      return typeof value === "string" ? null : `${show(value)} is not a string`;
    case "boolean":
      return typeof value === "boolean" ? null : `${show(value)} is not true or false`;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `${show(value)} is not a number`;
    case "int":
      return Number.isInteger(value) ? null : `${show(value)} is not an integer`;
    default:
      return null;
  }
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Copies the fields of the spec out of `row`, checking each; unknown fields are dropped. */
function pick(row: Row, spec: Spec, where: string): Result<Row> {
  const out: Row = {};
  for (const [field, kind] of Object.entries(spec)) {
    const path = `${where}.${field}`;
    if (!(field in row)) return fail(`${path} is missing`);
    const value = row[field];
    if (kind === "numbers") {
      if (!Array.isArray(value)) return fail(`${path} ${show(value)} is not an array`);
      for (let i = 0; i < value.length; i++) {
        if (!Number.isInteger(value[i]))
          return fail(`${path}[${i}] ${show(value[i])} is not an integer`);
      }
      out[field] = [...value];
    } else if (kind === "items") {
      if (!Array.isArray(value)) return fail(`${path} ${show(value)} is not an array`);
      const items: Row[] = [];
      for (let i = 0; i < value.length; i++) {
        const it = value[i];
        if (!isObject(it)) return fail(`${path}[${i}] is not an object`);
        const r = pick(it, ITEM_SPEC, `${path}[${i}]`);
        if (!r.ok) return r;
        items.push(r.value);
      }
      out[field] = items;
    } else {
      const bad = wrong(value, kind);
      if (bad) return fail(`${path} ${bad}`);
      out[field] = value;
    }
  }
  return { ok: true, value: out };
}

export function parseSnapshot(
  text: string,
): { ok: true; db: Db } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return fail(`not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!isObject(json)) return fail("the file is not a JSON object");
  if (json.app !== "phone-retail-crm")
    return fail(`not a Phone Retail CRM export (app is ${show(json.app)})`);
  if (json.version !== 1)
    return fail(`unsupported version ${show(json.version)} (this app reads version 1)`);
  if (!isObject(json.data)) return fail('"data" is missing or not an object');

  const db = {} as Record<TableName, Row[]>;
  for (const table of TABLES) {
    const rows = json.data[table];
    if (rows === undefined) return fail(`table "${table}" is missing`);
    if (!Array.isArray(rows)) return fail(`table "${table}" is not an array`);
    const seen = new Set<number>();
    const clean: Row[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const at = `${table}[${i}]`;
      if (!isObject(row)) return fail(`${at} is not an object`);
      const id = row.id;
      if (!Number.isInteger(id) || (id as number) <= 0)
        return fail(`${at}.id ${show(id)} is not a positive integer`);
      const label = `${table}[${id}]`;
      if (seen.has(id as number)) return fail(`${table}: id ${id} appears twice`);
      seen.add(id as number);
      const r = pick(row, SPECS[table], label);
      if (!r.ok) return r;
      clean.push({ id, ...r.value });
    }
    db[table] = clean;
  }

  // ---- links between tables ----
  const ids = (t: TableName) => new Set(db[t].map((r) => r.id as number));
  const has: Record<TableName, Set<number>> = {} as never;
  for (const t of TABLES) has[t] = ids(t);

  const links: [TableName, string, TableName, boolean?][] = [
    ["users", "roleId", "roles"],
    ["sessions", "userId", "users"],
    ["models", "manufacturerId", "manufacturers"],
    ["products", "modelId", "models"],
    ["shops", "categoryId", "shopCategories"],
    ["orders", "userId", "users"],
    ["orders", "shopId", "shops"],
    ["budget", "shopId", "shops", true], // 0 is the company
  ];
  const one: Record<TableName, string> = {
    users: "user",
    roles: "role",
    permissions: "permission",
    sessions: "session",
    manufacturers: "manufacturer",
    models: "model",
    products: "product",
    shopCategories: "shop category",
    shops: "shop",
    orders: "order",
    budget: "budget entry",
  };
  for (const [table, field, target, zeroOk] of links) {
    for (const row of db[table]) {
      const v = row[field] as number;
      if (zeroOk && v === 0) continue;
      if (!has[target].has(v))
        return fail(
          `${table}[${row.id}].${field} ${v} is not ${/^(?!user)[aeiou]/.test(one[target]) ? "an" : "a"} ${one[target]}`,
        );
    }
  }
  for (const role of db.roles) {
    for (const [i, p] of (role.permissionIds as number[]).entries()) {
      if (!has.permissions.has(p))
        return fail(`roles[${role.id}].permissionIds[${i}] ${p} is not a permission`);
    }
  }
  for (const order of db.orders) {
    const items = order.items as { productId: number; qty: number; price: number }[];
    let sum = 0;
    for (const [i, it] of items.entries()) {
      if (!has.products.has(it.productId))
        return fail(`orders[${order.id}].items[${i}].productId ${it.productId} is not a product`);
      sum += it.qty * it.price;
    }
    // cents, so that 0.1 + 0.2 is 0.3
    if (Math.round(sum * 100) !== Math.round((order.total as number) * 100))
      return fail(
        `orders[${order.id}].total ${order.total} does not match its items (they sum to ${Math.round(sum * 100) / 100})`,
      );
  }
  return { ok: true, db: db as unknown as Db };
}
