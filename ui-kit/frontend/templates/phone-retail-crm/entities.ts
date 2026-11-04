/**
 * What the CRM knows about each table: how its list looks (the columns of the
 * data table), what its create / update form asks (the fields), the defaults
 * of a new row, and what may not be deleted. One generic list and one generic
 * form (blocks/crud-table, blocks/crud-form) serve all of them.
 */
import type { ColumnDef, FilterDef } from "../../blocks/crud-table/table.ts";
import { dollars, type FieldDef } from "../../blocks/crud-form/form.ts";
import type {
  BudgetEntry,
  Db,
  Manufacturer,
  Model,
  Order,
  Permission,
  Product,
  Role,
  Session,
  Shop,
  ShopCategory,
  TableName,
  User,
} from "./schema.ts";
import { BUDGET_KINDS, ORDER_STATUSES } from "./schema.ts";

// ---- lookups ----

const by = <T extends { id: number }>(list: T[], id: number): T | undefined =>
  list.find((x) => x.id === id);

export const userName = (db: Db, id: number): string =>
  by(db.users, id)?.name ?? `user #${id}`;
export const roleName = (db: Db, id: number): string =>
  by(db.roles, id)?.name ?? `role #${id}`;
export const shopName = (db: Db, id: number): string =>
  id === 0 ? "Company" : (by(db.shops, id)?.name ?? `shop #${id}`);
export const categoryName = (db: Db, id: number): string =>
  by(db.shopCategories, id)?.name ?? `category #${id}`;

export function modelName(db: Db, id: number): string {
  const m = by(db.models, id);
  if (!m) return `model #${id}`;
  return `${by(db.manufacturers, m.manufacturerId)?.name ?? "?"} ${m.name}`;
}

/** `Apple iPhone 16 · Black · 8/256 GB` */
export function productLabel(db: Db, p: Product): string {
  return `${modelName(db, p.modelId)} · ${p.color} · ${p.ram}/${p.storage} GB`;
}

const count = (n: number) => ({ kind: "number" as const, text: String(n) });
const num = (n: number) => ({ kind: "number" as const, text: String(n) });
const money = (n: number) => ({ kind: "number" as const, text: dollars(n) });
const mono = (s: string) => ({ kind: "mono" as const, text: s });
const text = (s: string) => ({ kind: "text" as const, text: s });
const strong = (s: string, sub = "") => ({
  kind: "strong" as const,
  text: s,
  sub,
});
const pill = (s: string, tone: string) => ({
  kind: "pill" as const,
  text: s,
  tone,
});

const sorted = (xs: string[]): string[] =>
  [...xs].sort((a, b) => a.localeCompare(b));
const options = <T extends { id: number }>(
  list: T[],
  label: (x: T) => string,
) =>
  list
    .map((x) => ({ value: String(x.id), label: label(x) }))
    .sort((a, b) => a.label.localeCompare(b.label));

// ---- the definitions ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export interface Entity {
  key: TableName;
  /** the id of its screen in the navigation */
  screen: string;
  singular: string;
  plural: string;
  description: string;
  columns: (db: Db) => ColumnDef<Row>[];
  filters: (db: Db) => FilterDef<Row>[];
  fields: FieldDef<Db>[];
  sortKey: string;
  /** the defaults of a new row (without its id) */
  blank: (db: Db) => Record<string, unknown>;
  /** a short name for notices and the delete question */
  label: (row: Row, db: Db) => string;
  /** the row as it is saved (orders keep their total) */
  beforeSave?: (row: Row, db: Db) => Row;
  /** why a row may not be deleted, or "" */
  guardDelete?: (row: Row, db: Db) => string;
  /** rows of other tables to rewrite when a row is deleted */
  cleanup?: (row: Row, db: Db) => { table: TableName; rows: Row[] }[];
}

const used = (n: number, what: string, of: string): string =>
  n > 0 ? `${of} is used by ${n} ${what}${n === 1 ? "" : "s"}` : "";

export const ENTITIES: Entity[] = [
  {
    key: "users",
    screen: "users",
    singular: "user",
    plural: "Users",
    description: "People who sign in: customers and staff.",
    sortKey: "name",
    columns: (db) => [
      {
        key: "name",
        label: "User",
        value: (u: User) => u.name,
        cell: (u: User) => strong(u.name, u.email),
      },
      {
        key: "phone",
        label: "Phone",
        value: (u: User) => u.phone,
        cell: (u: User) => mono(u.phone),
      },
      {
        key: "role",
        label: "Role",
        value: (u: User) => roleName(db, u.roleId),
        cell: (u: User) => pill(roleName(db, u.roleId), "info"),
      },
      {
        key: "status",
        label: "Status",
        value: (u: User) => u.status,
        cell: (u: User) =>
          pill(
            u.status,
            u.status === "active"
              ? "success"
              : u.status === "blocked"
                ? "destructive"
                : "warning",
          ),
      },
      {
        key: "createdAt",
        label: "Joined",
        value: (u: User) => u.createdAt,
        cell: (u: User) => mono(u.createdAt),
      },
    ],
    filters: (db) => [
      {
        key: "status",
        label: "Status",
        options: [
          { value: "", label: "All statuses" },
          ...["active", "blocked", "invited"].map((s) => ({
            value: s,
            label: s,
          })),
        ],
        value: (u: User) => u.status,
      },
      {
        key: "role",
        label: "Role",
        options: [
          { value: "", label: "All roles" },
          ...options(db.roles, (r) => r.name),
        ],
        value: (u: User) => String(u.roleId),
      },
    ],
    fields: [
      {
        key: "name",
        label: "Name",
        kind: "text",
        required: true,
        placeholder: "Ann Stone",
      },
      {
        key: "email",
        label: "Email",
        kind: "email",
        required: true,
        validate: (v, draft, db) => {
          const same = db.users.find(
            (u) => u.email.toLowerCase() === String(v).trim().toLowerCase(),
          );
          return same && String(same.id) !== String(draft.__id ?? "")
            ? "Another user has this email"
            : "";
        },
      },
      {
        key: "phone",
        label: "Phone",
        kind: "text",
        placeholder: "+1 555 0100",
      },
      {
        key: "roleId",
        label: "Role",
        kind: "select",
        numeric: true,
        required: true,
        options: (db) => options(db.roles, (r) => r.name),
      },
      {
        key: "status",
        label: "Status",
        kind: "select",
        required: true,
        options: () =>
          ["active", "blocked", "invited"].map((s) => ({ value: s, label: s })),
      },
      {
        key: "createdAt",
        label: "Joined",
        kind: "date",
        required: true,
        placeholder: "2026-03-14",
      },
    ],
    blank: (db) => ({
      name: "",
      email: "",
      phone: "",
      roleId: db.roles[0]?.id ?? 0,
      status: "invited",
      createdAt: "2026-10-31",
    }),
    label: (u: User) => u.name,
    guardDelete: (u: User, db) =>
      used(db.orders.filter((o) => o.userId === u.id).length, "order", u.name),
    cleanup: (u: User, db) => [
      { table: "sessions", rows: db.sessions.filter((s) => s.userId === u.id) },
    ],
  },
  {
    key: "roles",
    screen: "roles",
    singular: "role",
    plural: "Roles",
    description: "What a user may do: a role is a set of permissions.",
    sortKey: "name",
    columns: (db) => [
      {
        key: "name",
        label: "Role",
        value: (r: Role) => r.name,
        cell: (r: Role) => strong(r.name, r.description),
      },
      {
        key: "perms",
        label: "Permissions",
        align: "right",
        value: (r: Role) => r.permissionIds.length,
        cell: (r: Role) => count(r.permissionIds.length),
      },
      {
        key: "users",
        label: "Users",
        align: "right",
        value: (r: Role) => db.users.filter((u) => u.roleId === r.id).length,
        cell: (r: Role) =>
          count(db.users.filter((u) => u.roleId === r.id).length),
      },
    ],
    filters: () => [],
    fields: [
      {
        key: "name",
        label: "Name",
        kind: "text",
        required: true,
        validate: (v, draft, db) => {
          const same = db.roles.find(
            (r) => r.name.toLowerCase() === String(v).trim().toLowerCase(),
          );
          return same && String(same.id) !== String(draft.__id ?? "")
            ? "Another role has this name"
            : "";
        },
      },
      { key: "description", label: "Description", kind: "textarea", rows: 2 },
      {
        key: "permissionIds",
        label: "Permissions",
        kind: "checks",
        numeric: true,
        options: (db) =>
          db.permissions.map((p) => ({ value: String(p.id), label: p.code })),
      },
    ],
    blank: () => ({ name: "", description: "", permissionIds: [] }),
    label: (r: Role) => r.name,
    guardDelete: (r: Role, db) =>
      used(
        db.users.filter((u) => u.roleId === r.id).length,
        "user",
        `Role “${r.name}”`,
      ),
  },
  {
    key: "permissions",
    screen: "permissions",
    singular: "permission",
    plural: "Permissions",
    description: "One action on one part of the system, like orders.refund.",
    sortKey: "code",
    columns: () => [
      {
        key: "code",
        label: "Permission",
        value: (p: Permission) => p.code,
        cell: (p: Permission) => mono(p.code),
      },
      {
        key: "module",
        label: "Module",
        value: (p: Permission) => p.module,
        cell: (p: Permission) => pill(p.module, "muted"),
      },
      {
        key: "description",
        label: "Description",
        value: (p: Permission) => p.description,
        cell: (p: Permission) => text(p.description),
      },
    ],
    filters: (db) => [
      {
        key: "module",
        label: "Module",
        options: [
          { value: "", label: "All modules" },
          ...sorted([...new Set(db.permissions.map((p) => p.module))]).map(
            (m) => ({ value: m, label: m }),
          ),
        ],
        value: (p: Permission) => p.module,
      },
    ],
    fields: [
      {
        key: "code",
        label: "Code",
        kind: "text",
        required: true,
        placeholder: "orders.refund",
        hint: "module.action",
        validate: (v, draft, db) => {
          if (!/^[a-z]+\.[a-z_]+$/.test(String(v).trim()))
            return "Use the form module.action in lower case";
          const same = db.permissions.find((p) => p.code === String(v).trim());
          return same && String(same.id) !== String(draft.__id ?? "")
            ? "This code exists"
            : "";
        },
      },
      { key: "description", label: "Description", kind: "textarea", rows: 2 },
    ],
    blank: () => ({ code: "", description: "", module: "" }),
    beforeSave: (p: Permission) => ({
      ...p,
      module: p.code.split(".")[0] ?? "",
    }),
    label: (p: Permission) => p.code,
    // a deleted permission leaves every role that had it
    cleanup: (p: Permission, db) => [
      {
        table: "roles",
        rows: db.roles
          .filter((r) => r.permissionIds.includes(p.id))
          .map((r) => ({
            ...r,
            permissionIds: r.permissionIds.filter((x) => x !== p.id),
          })),
      },
    ],
  },
  {
    key: "sessions",
    screen: "sessions",
    singular: "session",
    plural: "Sessions",
    description: "Who is signed in, from where.",
    sortKey: "startedAt",
    columns: (db) => [
      {
        key: "user",
        label: "User",
        value: (s: Session) => userName(db, s.userId),
        cell: (s: Session) => strong(userName(db, s.userId), s.device),
      },
      {
        key: "ip",
        label: "IP",
        value: (s: Session) => s.ip,
        cell: (s: Session) => mono(s.ip),
      },
      {
        key: "startedAt",
        label: "Started",
        value: (s: Session) => s.startedAt,
        cell: (s: Session) => mono(s.startedAt.replace("T", " ")),
      },
      {
        key: "expiresAt",
        label: "Expires",
        value: (s: Session) => s.expiresAt,
        cell: (s: Session) => mono(s.expiresAt.replace("T", " ")),
      },
      {
        key: "active",
        label: "State",
        value: (s: Session) => (s.active ? "active" : "ended"),
        cell: (s: Session) =>
          pill(s.active ? "active" : "ended", s.active ? "success" : "muted"),
      },
    ],
    filters: () => [
      {
        key: "state",
        label: "State",
        options: [
          { value: "", label: "All" },
          { value: "active", label: "active" },
          { value: "ended", label: "ended" },
        ],
        value: (s: Session) => (s.active ? "active" : "ended"),
      },
    ],
    fields: [
      {
        key: "userId",
        label: "User",
        kind: "select",
        numeric: true,
        required: true,
        options: (db) => options(db.users, (u) => `${u.name} (${u.email})`),
      },
      {
        key: "ip",
        label: "IP address",
        kind: "text",
        required: true,
        placeholder: "203.0.113.7",
      },
      {
        key: "device",
        label: "Device",
        kind: "text",
        required: true,
        placeholder: "Chrome on macOS",
      },
      {
        key: "startedAt",
        label: "Started",
        kind: "text",
        required: true,
        placeholder: "2026-10-31T09:30:00",
      },
      {
        key: "expiresAt",
        label: "Expires",
        kind: "text",
        required: true,
        placeholder: "2026-10-31T17:30:00",
      },
      {
        key: "active",
        label: "Active",
        kind: "switch",
        hint: "The session can still be used",
      },
    ],
    blank: (db) => ({
      userId: db.users[0]?.id ?? 0,
      ip: "",
      device: "",
      startedAt: "2026-10-31T09:00:00",
      expiresAt: "2026-10-31T17:00:00",
      active: true,
    }),
    label: (s: Session, db) => `${userName(db, s.userId)} (${s.ip})`,
  },
  {
    key: "manufacturers",
    screen: "manufacturers",
    singular: "manufacturer",
    plural: "Manufacturers",
    description: "The brands the shops sell.",
    sortKey: "name",
    columns: (db) => [
      {
        key: "name",
        label: "Manufacturer",
        value: (m: Manufacturer) => m.name,
        cell: (m: Manufacturer) => strong(m.name),
      },
      {
        key: "country",
        label: "Country",
        value: (m: Manufacturer) => m.country,
        cell: (m: Manufacturer) => text(m.country),
      },
      {
        key: "models",
        label: "Models",
        align: "right",
        value: (m: Manufacturer) =>
          db.models.filter((x) => x.manufacturerId === m.id).length,
        cell: (m: Manufacturer) =>
          count(db.models.filter((x) => x.manufacturerId === m.id).length),
      },
    ],
    filters: () => [],
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "country", label: "Country", kind: "text", required: true },
    ],
    blank: () => ({ name: "", country: "" }),
    label: (m: Manufacturer) => m.name,
    guardDelete: (m: Manufacturer, db) =>
      used(
        db.models.filter((x) => x.manufacturerId === m.id).length,
        "model",
        m.name,
      ),
  },
  {
    key: "models",
    screen: "models",
    singular: "model",
    plural: "Models",
    description:
      "A phone model of a manufacturer; its variants are the products.",
    sortKey: "name",
    columns: (db) => [
      {
        key: "name",
        label: "Model",
        value: (m: Model) => modelName(db, m.id),
        cell: (m: Model) =>
          strong(m.name, by(db.manufacturers, m.manufacturerId)?.name ?? ""),
      },
      {
        key: "manufacturer",
        label: "Manufacturer",
        value: (m: Model) => by(db.manufacturers, m.manufacturerId)?.name ?? "",
        cell: (m: Model) =>
          pill(by(db.manufacturers, m.manufacturerId)?.name ?? "?", "muted"),
      },
      {
        key: "year",
        label: "Year",
        align: "right",
        value: (m: Model) => m.year,
        cell: (m: Model) => num(m.year),
      },
      {
        key: "products",
        label: "Products",
        align: "right",
        value: (m: Model) =>
          db.products.filter((p) => p.modelId === m.id).length,
        cell: (m: Model) =>
          count(db.products.filter((p) => p.modelId === m.id).length),
      },
    ],
    filters: (db) => [
      {
        key: "manufacturer",
        label: "Manufacturer",
        options: [
          { value: "", label: "All manufacturers" },
          ...options(db.manufacturers, (m) => m.name),
        ],
        value: (m: Model) => String(m.manufacturerId),
      },
    ],
    fields: [
      {
        key: "manufacturerId",
        label: "Manufacturer",
        kind: "select",
        numeric: true,
        required: true,
        options: (db) => options(db.manufacturers, (m) => m.name),
      },
      {
        key: "name",
        label: "Name",
        kind: "text",
        required: true,
        placeholder: "iPhone 16",
      },
      {
        key: "year",
        label: "Year",
        kind: "number",
        required: true,
        min: 2000,
        max: 2100,
      },
    ],
    blank: (db) => ({
      manufacturerId: db.manufacturers[0]?.id ?? 0,
      name: "",
      year: 2026,
    }),
    label: (m: Model, db) => modelName(db, m.id),
    guardDelete: (m: Model, db) =>
      used(
        db.products.filter((p) => p.modelId === m.id).length,
        "product",
        modelName(db, m.id),
      ),
  },
  {
    key: "products",
    screen: "products",
    singular: "product",
    plural: "Products",
    description: "A sellable phone: a model with a colour, memory and price.",
    sortKey: "model",
    columns: (db) => [
      {
        key: "sku",
        label: "SKU",
        value: (p: Product) => p.sku,
        cell: (p: Product) => mono(p.sku),
      },
      {
        key: "model",
        label: "Phone",
        value: (p: Product) => modelName(db, p.modelId),
        cell: (p: Product) =>
          strong(modelName(db, p.modelId), `${p.color} · ${p.display}`),
      },
      {
        key: "processor",
        label: "Processor",
        value: (p: Product) => p.processor,
        cell: (p: Product) => text(p.processor),
      },
      {
        key: "memory",
        label: "RAM / storage",
        align: "right",
        value: (p: Product) => p.ram * 10000 + p.storage,
        cell: (p: Product) => text(`${p.ram} / ${p.storage} GB`),
      },
      {
        key: "stock",
        label: "Stock",
        align: "right",
        value: (p: Product) => p.stock,
        cell: (p: Product) =>
          p.stock === 0
            ? pill("out", "destructive")
            : p.stock < 10
              ? pill(String(p.stock), "warning")
              : num(p.stock),
      },
      {
        key: "price",
        label: "Price",
        align: "right",
        value: (p: Product) => p.price,
        cell: (p: Product) => money(p.price),
      },
    ],
    filters: (db) => [
      {
        key: "manufacturer",
        label: "Manufacturer",
        options: [
          { value: "", label: "All manufacturers" },
          ...options(db.manufacturers, (m) => m.name),
        ],
        value: (p: Product) =>
          String(by(db.models, p.modelId)?.manufacturerId ?? 0),
      },
    ],
    fields: [
      {
        key: "modelId",
        label: "Model",
        kind: "select",
        numeric: true,
        required: true,
        options: (db) =>
          db.models
            .map((m) => ({ value: String(m.id), label: modelName(db, m.id) }))
            .sort((a, b) => a.label.localeCompare(b.label)),
      },
      {
        key: "sku",
        label: "SKU",
        kind: "text",
        required: true,
        validate: (v, draft, db) => {
          const same = db.products.find((p) => p.sku === String(v).trim());
          return same && String(same.id) !== String(draft.__id ?? "")
            ? "This SKU exists"
            : "";
        },
      },
      { key: "color", label: "Colour", kind: "text", required: true },
      {
        key: "price",
        label: "Price ($)",
        kind: "number",
        required: true,
        min: 0,
        step: "0.01",
      },
      { key: "processor", label: "Processor", kind: "text", required: true },
      {
        key: "ram",
        label: "RAM (GB)",
        kind: "number",
        required: true,
        min: 1,
        max: 64,
      },
      {
        key: "storage",
        label: "Storage (GB)",
        kind: "number",
        required: true,
        min: 1,
        max: 4096,
      },
      {
        key: "display",
        label: "Display",
        kind: "text",
        required: true,
        placeholder: '6.1" OLED 120 Hz',
      },
      {
        key: "stock",
        label: "In stock",
        kind: "number",
        required: true,
        min: 0,
      },
    ],
    blank: (db) => ({
      modelId: db.models[0]?.id ?? 0,
      sku: "",
      color: "",
      price: 599,
      processor: "",
      ram: 8,
      storage: 128,
      display: "",
      stock: 10,
    }),
    label: (p: Product, db) => productLabel(db, p),
    guardDelete: (p: Product, db) =>
      used(
        db.orders.filter((o) => o.items.some((i) => i.productId === p.id))
          .length,
        "order",
        productLabel(db, p),
      ),
  },
  {
    key: "shopCategories",
    screen: "shopCategories",
    singular: "shop category",
    plural: "Shop categories",
    description: "The kinds of place a shop is in.",
    sortKey: "name",
    columns: (db) => [
      {
        key: "name",
        label: "Category",
        value: (c: ShopCategory) => c.name,
        cell: (c: ShopCategory) => strong(c.name, c.description),
      },
      {
        key: "shops",
        label: "Shops",
        align: "right",
        value: (c: ShopCategory) =>
          db.shops.filter((s) => s.categoryId === c.id).length,
        cell: (c: ShopCategory) =>
          count(db.shops.filter((s) => s.categoryId === c.id).length),
      },
    ],
    filters: () => [],
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      { key: "description", label: "Description", kind: "textarea", rows: 2 },
    ],
    blank: () => ({ name: "", description: "" }),
    label: (c: ShopCategory) => c.name,
    guardDelete: (c: ShopCategory, db) =>
      used(
        db.shops.filter((s) => s.categoryId === c.id).length,
        "shop",
        `Category “${c.name}”`,
      ),
  },
  {
    key: "shops",
    screen: "shops",
    singular: "shop",
    plural: "Shops",
    description: "Where phones are sold, with their position on the map.",
    sortKey: "name",
    columns: (db) => [
      {
        key: "name",
        label: "Shop",
        value: (s: Shop) => s.name,
        cell: (s: Shop) => strong(s.name, s.address),
      },
      {
        key: "city",
        label: "City",
        value: (s: Shop) => s.city,
        cell: (s: Shop) => text(s.city),
      },
      {
        key: "category",
        label: "Category",
        value: (s: Shop) => categoryName(db, s.categoryId),
        cell: (s: Shop) => pill(categoryName(db, s.categoryId), "info"),
      },
      {
        key: "geo",
        label: "Lat, lng",
        value: (s: Shop) => s.lat,
        cell: (s: Shop) => mono(`${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`),
      },
      {
        key: "phone",
        label: "Phone",
        value: (s: Shop) => s.phone,
        cell: (s: Shop) => mono(s.phone),
      },
    ],
    filters: (db) => [
      {
        key: "category",
        label: "Category",
        options: [
          { value: "", label: "All categories" },
          ...options(db.shopCategories, (c) => c.name),
        ],
        value: (s: Shop) => String(s.categoryId),
      },
    ],
    fields: [
      { key: "name", label: "Name", kind: "text", required: true },
      {
        key: "categoryId",
        label: "Category",
        kind: "select",
        numeric: true,
        required: true,
        options: (db) => options(db.shopCategories, (c) => c.name),
      },
      { key: "city", label: "City", kind: "text", required: true },
      { key: "address", label: "Address", kind: "text", required: true },
      {
        key: "lat",
        label: "Latitude",
        kind: "number",
        required: true,
        min: -90,
        max: 90,
        step: "0.0001",
      },
      {
        key: "lng",
        label: "Longitude",
        kind: "number",
        required: true,
        min: -180,
        max: 180,
        step: "0.0001",
      },
      { key: "phone", label: "Phone", kind: "text" },
    ],
    blank: (db) => ({
      name: "",
      categoryId: db.shopCategories[0]?.id ?? 0,
      city: "",
      address: "",
      lat: 0,
      lng: 0,
      phone: "",
    }),
    label: (s: Shop) => s.name,
    guardDelete: (s: Shop, db) =>
      used(db.orders.filter((o) => o.shopId === s.id).length, "order", s.name),
    cleanup: (s: Shop, db) => [
      {
        table: "budget",
        rows: db.budget
          .filter((b) => b.shopId === s.id)
          .map((b) => ({ ...b, shopId: 0 })),
      },
    ],
  },
  {
    key: "orders",
    screen: "orders",
    singular: "order",
    plural: "Orders",
    description: "What a customer bought, where, and how it is going.",
    sortKey: "createdAt",
    columns: (db) => [
      {
        key: "id",
        label: "Order",
        value: (o: Order) => o.id,
        cell: (o: Order) => mono(`#${o.id}`),
      },
      {
        key: "customer",
        label: "Customer",
        value: (o: Order) => userName(db, o.userId),
        cell: (o: Order) =>
          strong(userName(db, o.userId), shopName(db, o.shopId)),
      },
      {
        key: "phones",
        label: "Phones",
        value: (o: Order) =>
          o.items
            .map((i) => by(db.products, i.productId))
            .map((p) => (p ? modelName(db, p.modelId) : ""))
            .join(", "),
        cell: (o: Order) => {
          const names = o.items.map(
            (i) =>
              `${by(db.models, by(db.products, i.productId)?.modelId ?? 0)?.name ?? "?"} ×${i.qty}`,
          );
          return text(
            names.length > 2
              ? `${names.slice(0, 2).join(", ")} +${names.length - 2}`
              : names.join(", "),
          );
        },
      },
      {
        key: "total",
        label: "Total",
        align: "right",
        value: (o: Order) => o.total,
        cell: (o: Order) => money(o.total),
      },
      {
        key: "status",
        label: "Status",
        value: (o: Order) => o.status,
        cell: (o: Order) =>
          pill(
            o.status,
            o.status === "delivered"
              ? "success"
              : o.status === "cancelled" || o.status === "refunded"
                ? "destructive"
                : o.status === "new"
                  ? "warning"
                  : "info",
          ),
      },
      {
        key: "createdAt",
        label: "Date",
        value: (o: Order) => o.createdAt,
        cell: (o: Order) => mono(o.createdAt),
      },
    ],
    filters: (db) => [
      {
        key: "status",
        label: "Status",
        options: [
          { value: "", label: "All statuses" },
          ...ORDER_STATUSES.map((s) => ({ value: s, label: s })),
        ],
        value: (o: Order) => o.status,
      },
      {
        key: "shop",
        label: "Shop",
        options: [
          { value: "", label: "All shops" },
          ...options(db.shops, (s) => s.name),
        ],
        value: (o: Order) => String(o.shopId),
      },
    ],
    fields: [
      {
        key: "userId",
        label: "Customer",
        kind: "select",
        numeric: true,
        required: true,
        options: (db) => options(db.users, (u) => `${u.name} (${u.email})`),
      },
      {
        key: "shopId",
        label: "Shop",
        kind: "select",
        numeric: true,
        required: true,
        options: (db) => options(db.shops, (s) => s.name),
      },
      {
        key: "status",
        label: "Status",
        kind: "select",
        required: true,
        options: () => ORDER_STATUSES.map((s) => ({ value: s, label: s })),
      },
      {
        key: "createdAt",
        label: "Date",
        kind: "date",
        required: true,
        placeholder: "2026-03-14",
      },
      {
        key: "items",
        label: "Phones",
        kind: "lines",
        options: (db) =>
          db.products
            .map((p) => ({
              value: String(p.id),
              label: `${productLabel(db, p)} — ${dollars(p.price)}`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        priceOf: (id, db) => String(by(db.products, Number(id))?.price ?? 0),
      },
      { key: "note", label: "Note", kind: "textarea", rows: 2 },
    ],
    blank: (db) => ({
      userId: db.users[0]?.id ?? 0,
      shopId: db.shops[0]?.id ?? 0,
      status: "new",
      createdAt: "2026-10-31",
      items: [],
      total: 0,
      note: "",
    }),
    beforeSave: (o: Order) => ({
      ...o,
      total:
        Math.round(o.items.reduce((s, i) => s + i.qty * i.price, 0) * 100) /
        100,
    }),
    label: (o: Order) => `order #${o.id}`,
  },
  {
    key: "budget",
    screen: "budgetEntries",
    singular: "budget entry",
    plural: "Budget entries",
    description:
      "Money in and out by month: income, salaries, shop supply and delivery.",
    sortKey: "month",
    columns: (db) => [
      {
        key: "month",
        label: "Month",
        value: (b: BudgetEntry) => b.month,
        cell: (b: BudgetEntry) => mono(b.month),
      },
      {
        key: "kind",
        label: "Kind",
        value: (b: BudgetEntry) => b.kind,
        cell: (b: BudgetEntry) =>
          pill(b.kind, b.kind === "income" ? "success" : "muted"),
      },
      {
        key: "shop",
        label: "Shop",
        value: (b: BudgetEntry) => shopName(db, b.shopId),
        cell: (b: BudgetEntry) => text(shopName(db, b.shopId)),
      },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        value: (b: BudgetEntry) => b.amount,
        cell: (b: BudgetEntry) => money(b.amount),
      },
      {
        key: "note",
        label: "Note",
        value: (b: BudgetEntry) => b.note,
        cell: (b: BudgetEntry) => text(b.note),
      },
    ],
    filters: () => [
      {
        key: "kind",
        label: "Kind",
        options: [
          { value: "", label: "All kinds" },
          ...BUDGET_KINDS.map((k) => ({ value: k, label: k })),
        ],
        value: (b: BudgetEntry) => b.kind,
      },
    ],
    fields: [
      {
        key: "month",
        label: "Month",
        kind: "text",
        required: true,
        placeholder: "2026-10",
        validate: (v) =>
          /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v).trim())
            ? ""
            : "Use the form 2026-10",
      },
      {
        key: "kind",
        label: "Kind",
        kind: "select",
        required: true,
        options: () => BUDGET_KINDS.map((k) => ({ value: k, label: k })),
      },
      {
        key: "shopId",
        label: "Shop",
        kind: "select",
        numeric: true,
        required: true,
        options: (db) => [
          { value: "0", label: "Company" },
          ...options(db.shops, (s) => s.name),
        ],
      },
      {
        key: "amount",
        label: "Amount ($)",
        kind: "number",
        required: true,
        min: 0,
        step: "0.01",
      },
      { key: "note", label: "Note", kind: "textarea", rows: 2 },
    ],
    blank: () => ({
      month: "2026-10",
      kind: "salary",
      shopId: 0,
      amount: 0,
      note: "",
    }),
    label: (b: BudgetEntry) => `${b.kind} ${b.month}`,
  },
];

export const entityOf = (screen: string): Entity | undefined =>
  ENTITIES.find((e) => e.screen === screen);
