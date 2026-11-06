/**
 * Request validation: checks a row against the frontend's `Db` row shape and
 * says which field is wrong. (The foreign keys and CHECKs of the database are
 * the second line: they answer 409 and 400.)
 */
import {
  BUDGET_KINDS,
  ORDER_STATUSES,
  type TableName,
} from "../../../framework/ui-kit/frontend/templates/phone-retail-crm/schema.ts";

type Kind =
  | "string"
  | "number"
  | "int"
  | "uint"
  | "boolean"
  | "numbers"
  | "items"
  | "date"
  | "timestamp"
  | "month"
  | "fk0"
  | readonly string[];

const SPECS: Record<TableName, Record<string, Kind>> = {
  users: {
    name: "string",
    email: "string",
    phone: "string",
    roleId: "int",
    status: ["active", "blocked", "invited"],
    createdAt: "date",
  },
  roles: { name: "string", description: "string", permissionIds: "numbers" },
  permissions: { code: "string", description: "string", module: "string" },
  sessions: {
    userId: "int",
    ip: "string",
    device: "string",
    startedAt: "timestamp",
    expiresAt: "timestamp",
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
    ram: "uint",
    storage: "uint",
    display: "string",
    stock: "uint",
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
    createdAt: "date",
    items: "items",
    total: "number",
    note: "string",
  },
  budget: {
    month: "month",
    kind: BUDGET_KINDS,
    amount: "number",
    shopId: "fk0",
    note: "string",
  },
};

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const show = (v: unknown): string => {
  const s = JSON.stringify(v);
  return s === undefined
    ? String(v)
    : s.length > 40
      ? s.slice(0, 37) + "..."
      : s;
};

const PATTERNS = {
  date: /^\d{4}-\d{2}-\d{2}$/,
  timestamp: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
  month: /^\d{4}-(0[1-9]|1[0-2])$/,
};

/** Why `value` does not fit `kind`, or null. */
function wrong(value: unknown, kind: Kind): string | null {
  if (Array.isArray(kind))
    return kind.includes(value as string)
      ? null
      : `${show(value)} is not one of ${kind.join(", ")}`;
  switch (kind) {
    case "string":
      return typeof value === "string"
        ? null
        : `${show(value)} is not a string`;
    case "boolean":
      return typeof value === "boolean"
        ? null
        : `${show(value)} is not true or false`;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `${show(value)} is not a number`;
    case "int":
      return Number.isSafeInteger(value) && Math.abs(value as number) < 2 ** 31
        ? null
        : `${show(value)} is not an integer`;
    case "uint":
      return Number.isSafeInteger(value) &&
        (value as number) >= 0 &&
        (value as number) < 2 ** 31
        ? null
        : `${show(value)} is not a whole number from 0`;
    case "fk0":
      return Number.isSafeInteger(value) &&
        (value as number) >= 0 &&
        (value as number) < 2 ** 31
        ? null
        : `${show(value)} is not an id (or 0)`;
    case "date":
    case "timestamp":
    case "month":
      return typeof value === "string" && PATTERNS[kind].test(value)
        ? null
        : `${show(value)} is not a ${kind === "date" ? "date YYYY-MM-DD" : kind === "month" ? "month YYYY-MM" : "timestamp YYYY-MM-DDTHH:MM:SS"}`;
    default:
      return null;
  }
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
});

/**
 * A clean copy of `row` (unknown fields dropped). `where` names the row in
 * messages (`users[3]`). Without `needId` the id is optional.
 */
export function checkRow(
  table: TableName,
  row: unknown,
  where: string,
  needId: boolean,
): Checked<Obj & { id?: number }> {
  if (!isObject(row)) return fail(`${where} is not an object`);
  const out: Obj & { id?: number } = {};
  if (row.id !== undefined || needId) {
    const id = row.id;
    if (
      !Number.isSafeInteger(id) ||
      (id as number) <= 0 ||
      (id as number) >= 2 ** 31
    )
      return fail(`${where}.id ${show(id)} is not a positive integer`);
    out.id = id as number;
  }
  for (const [field, kind] of Object.entries(SPECS[table])) {
    const path = `${where}.${field}`;
    if (!(field in row)) return fail(`${path} is missing`);
    const value = row[field];
    if (kind === "numbers") {
      if (!Array.isArray(value))
        return fail(`${path} ${show(value)} is not an array`);
      for (let i = 0; i < value.length; i++)
        if (!Number.isSafeInteger(value[i]))
          return fail(`${path}[${i}] ${show(value[i])} is not an integer`);
      out[field] = [...value];
    } else if (kind === "items") {
      if (!Array.isArray(value))
        return fail(`${path} ${show(value)} is not an array`);
      const items: Obj[] = [];
      for (let i = 0; i < value.length; i++) {
        const it = value[i];
        if (!isObject(it)) return fail(`${path}[${i}] is not an object`);
        const item: Obj = {};
        for (const [f, k] of [
          ["productId", "int"],
          ["qty", "int"],
          ["price", "number"],
        ] as const) {
          if (!(f in it)) return fail(`${path}[${i}].${f} is missing`);
          const bad = wrong(it[f], k);
          if (bad) return fail(`${path}[${i}].${f} ${bad}`);
          item[f] = it[f];
        }
        if ((item.qty as number) <= 0)
          return fail(`${path}[${i}].qty ${show(item.qty)} must be at least 1`);
        items.push(item);
      }
      out[field] = items;
    } else {
      const bad = wrong(value, kind);
      if (bad) return fail(`${path} ${bad}`);
      out[field] = value;
    }
  }
  if (table === "orders") {
    const items = out.items as { qty: number; price: number }[];
    const sum = items.reduce((s, it) => s + it.qty * it.price, 0);
    if (Math.round(sum * 100) !== Math.round((out.total as number) * 100))
      return fail(
        `${where}.total ${out.total} does not match its items (they sum to ${Math.round(sum * 100) / 100})`,
      );
  }
  return { ok: true, value: out };
}

/** Checks a batch; ids are required and may not be missing. */
export function checkRows(
  table: TableName,
  rows: unknown,
  needId = true,
): Checked<(Obj & { id?: number })[]> {
  if (!Array.isArray(rows)) return fail('"rows" is missing or not an array');
  const out: (Obj & { id?: number })[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = checkRow(table, rows[i], `${table}[${i}]`, needId);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return { ok: true, value: out };
}
