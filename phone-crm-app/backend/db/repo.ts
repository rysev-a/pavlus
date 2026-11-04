/**
 * The repository: maps the eleven `Db` tables of the frontend (camelCase rows,
 * arrays inside rows) to the normalized SQL of schema.sql and back. Rows go to
 * Postgres as one JSON parameter per statement (`jsonb_to_recordset`), so a
 * batch is a handful of statements whatever its size.
 */
import {
  TABLES,
  type Db,
  type TableName,
} from "../../../ui-kit/frontend/templates/phone-retail-crm/schema.ts";
import { inTransaction, type Query } from "./query.ts";

export type Row = Record<string, unknown> & { id: number };

type Kind =
  | "int"
  | "text"
  | "float"
  | "money"
  | "bool"
  | "date"
  | "timestamp"
  /** a nullable foreign key that is 0 on the wire */
  | "fk0";

interface Col {
  field: string;
  col: string;
  kind: Kind;
}

type Children = "permissions" | "items";

interface TableDef {
  /** the SQL table */
  sql: string;
  cols: Col[];
  children?: Children;
}

const c = (field: string, kind: Kind, col?: string): Col => ({
  field,
  kind,
  col: col ?? field.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()),
});

export const DEFS: Record<TableName, TableDef> = {
  users: {
    sql: "users",
    cols: [
      c("name", "text"),
      c("email", "text"),
      c("phone", "text"),
      c("roleId", "int"),
      c("status", "text"),
      c("createdAt", "date"),
    ],
  },
  roles: {
    sql: "roles",
    cols: [c("name", "text"), c("description", "text")],
    children: "permissions",
  },
  permissions: {
    sql: "permissions",
    cols: [c("code", "text"), c("description", "text"), c("module", "text")],
  },
  sessions: {
    sql: "sessions",
    cols: [
      c("userId", "int"),
      c("ip", "text"),
      c("device", "text"),
      c("startedAt", "timestamp"),
      c("expiresAt", "timestamp"),
      c("active", "bool"),
    ],
  },
  manufacturers: {
    sql: "manufacturers",
    cols: [c("name", "text"), c("country", "text")],
  },
  models: {
    sql: "models",
    cols: [c("manufacturerId", "int"), c("name", "text"), c("year", "int")],
  },
  products: {
    sql: "products",
    cols: [
      c("modelId", "int"),
      c("sku", "text"),
      c("color", "text"),
      c("price", "money"),
      c("processor", "text"),
      c("ram", "int"),
      c("storage", "int"),
      c("display", "text"),
      c("stock", "int"),
    ],
  },
  shopCategories: {
    sql: "shop_categories",
    cols: [c("name", "text"), c("description", "text")],
  },
  shops: {
    sql: "shops",
    cols: [
      c("name", "text"),
      c("categoryId", "int"),
      c("city", "text"),
      c("address", "text"),
      c("lat", "float"),
      c("lng", "float"),
      c("phone", "text"),
    ],
  },
  orders: {
    sql: "orders",
    cols: [
      c("userId", "int"),
      c("shopId", "int"),
      c("status", "text"),
      c("createdAt", "date"),
      c("total", "money"),
      c("note", "text"),
    ],
    children: "items",
  },
  budget: {
    sql: "budget",
    cols: [
      c("month", "text"),
      c("kind", "text"),
      c("amount", "money"),
      c("shopId", "fk0"),
      c("note", "text"),
    ],
  },
};

export const isTable = (name: string): name is TableName =>
  (TABLES as string[]).includes(name);

/** Parents before children: the order of inserts (deletes go the other way). */
const INSERT_ORDER: TableName[] = [
  "permissions",
  "roles",
  "users",
  "sessions",
  "manufacturers",
  "models",
  "products",
  "shopCategories",
  "shops",
  "orders",
  "budget",
];

const q = (name: string): string => `"${name}"`;

function selectExpr(col: Col): string {
  const t = `t.${col.col}`;
  switch (col.kind) {
    case "money":
      return `${t}::float8`;
    case "date":
      return `to_char(${t}, 'YYYY-MM-DD')`;
    case "timestamp":
      return `to_char(${t}, 'YYYY-MM-DD"T"HH24:MI:SS')`;
    case "fk0":
      return `COALESCE(${t}, 0)`;
    default:
      return t;
  }
}

const CHILD_SELECT: Record<Children, [string, string]> = {
  permissions: [
    "permissionIds",
    `ARRAY(SELECT rp.permission_id FROM role_permissions rp
            WHERE rp.role_id = t.id ORDER BY rp.position)`,
  ],
  items: [
    "items",
    `COALESCE((SELECT json_agg(json_build_object(
                'productId', oi.product_id, 'qty', oi.qty, 'price', oi.price::float8)
              ORDER BY oi.position)
            FROM order_items oi WHERE oi.order_id = t.id), '[]'::json)`,
  ],
};

/** `SELECT ... FROM <table> t` giving the row exactly as the frontend has it. */
function selectSql(table: TableName): string {
  const def = DEFS[table];
  const parts = ["t.id"];
  for (const col of def.cols)
    parts.push(`${selectExpr(col)} AS ${q(col.field)}`);
  if (def.children) {
    const [field, expr] = CHILD_SELECT[def.children];
    parts.push(`${expr} AS ${q(field)}`);
  }
  return `SELECT ${parts.join(", ")} FROM ${def.sql} t`;
}

const RECORD_TYPE: Record<Kind, string> = {
  int: "integer",
  fk0: "integer",
  text: "text",
  date: "text",
  timestamp: "text",
  float: "double precision",
  money: "numeric",
  bool: "boolean",
};

function insertExpr(col: Col): string {
  const x = `x.${q(col.field)}`;
  switch (col.kind) {
    case "date":
      return `${x}::date`;
    case "timestamp":
      return `${x}::timestamp`;
    case "fk0":
      return `NULLIF(${x}, 0)`;
    default:
      return x;
  }
}

// ---------------------------------------------------------------- reads

export async function loadTable(
  query: Query,
  table: TableName,
): Promise<Row[]> {
  return query<Row>(`${selectSql(table)} ORDER BY t.id`);
}

export async function loadTables(
  query: Query,
  tables: readonly TableName[] = TABLES,
): Promise<Partial<Db>> {
  const out: Record<string, Row[]> = {};
  for (const table of tables) out[table] = await loadTable(query, table);
  return out as Partial<Db>;
}

export async function loadAll(query: Query): Promise<Db> {
  return (await loadTables(query)) as Db;
}

export async function getRow(
  query: Query,
  table: TableName,
  id: number,
): Promise<Row | undefined> {
  const rows = await query<Row>(`${selectSql(table)} WHERE t.id = $1`, [id]);
  return rows[0];
}

export interface ListOptions {
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page: number;
  size: number;
}

export const sortableFields = (table: TableName): string[] => [
  "id",
  ...DEFS[table].cols.map((col) => col.field),
];

/** One page of a table: search over the text columns, sort by any scalar field. */
export async function listRows(
  query: Query,
  table: TableName,
  opts: ListOptions,
): Promise<{ rows: Row[]; total: number; page: number; size: number }> {
  const def = DEFS[table];
  const params: unknown[] = [];
  let where = "";
  const search = opts.q?.trim();
  if (search) {
    const haystack = [
      "t.id::text",
      ...def.cols
        .filter((col) => ["text", "date", "timestamp"].includes(col.kind))
        .map((col) => `t.${col.col}::text`),
    ];
    params.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
    where = ` WHERE concat_ws(' ', ${haystack.join(", ")}) ILIKE $1`;
  }
  const sortCol = def.cols.find((col) => col.field === opts.sort);
  const dir = opts.dir === "desc" ? "DESC" : "ASC";
  const orderBy = sortCol
    ? `${sortCol.kind === "text" ? `lower(t.${sortCol.col})` : `t.${sortCol.col}`} ${dir}, t.id`
    : `t.id ${dir}`;
  const [{ total }] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM ${def.sql} t${where}`,
    params,
  );
  const rows = await query<Row>(
    `${selectSql(table)}${where} ORDER BY ${orderBy} LIMIT ${opts.size} OFFSET ${(opts.page - 1) * opts.size}`,
    params,
  );
  return { rows, total, page: opts.page, size: opts.size };
}

// ---------------------------------------------------------------- writes

/** Moves the id sequence past the largest id (explicit ids do not advance it). */
async function syncSequence(query: Query, table: TableName): Promise<void> {
  const sql = DEFS[table].sql;
  await query(
    `SELECT setval(pg_get_serial_sequence('${sql}', 'id'), COALESCE(max(id), 1), max(id) IS NOT NULL) FROM ${sql}`,
  );
}

/** Reserves `n` fresh ids. */
async function nextIds(
  query: Query,
  table: TableName,
  n: number,
): Promise<number[]> {
  const rows = await query<{ id: number }>(
    `SELECT nextval(pg_get_serial_sequence('${DEFS[table].sql}', 'id'))::int AS id FROM generate_series(1, $1::int)`,
    [n],
  );
  return rows.map((r) => r.id);
}

type Input = Record<string, unknown> & { id?: number };

/**
 * Inserts or updates rows by id (rows without an id get a new one). The whole
 * batch is one transaction. Returns the saved rows' ids, in input order.
 */
export async function upsertRows(
  query: Query,
  table: TableName,
  rows: Input[],
): Promise<number[]> {
  if (!rows.length) return [];
  return inTransaction(query, async (tx) => {
    const def = DEFS[table];
    const missing = rows.filter((r) => r.id === undefined);
    const fresh = missing.length
      ? await nextIds(tx, table, missing.length)
      : [];
    let next = 0;
    const withIds = rows.map((r) => ({ ...r, id: r.id ?? fresh[next++] }));
    // one statement cannot touch a row twice: the last of equal ids wins
    const byId = new Map(withIds.map((r) => [r.id as number, r]));
    const unique = [...byId.values()];
    const json = JSON.stringify(unique);
    const record = [
      "id integer",
      ...def.cols.map((col) => `${q(col.field)} ${RECORD_TYPE[col.kind]}`),
    ];
    const names = def.cols.map((col) => col.col);
    await tx(
      `INSERT INTO ${def.sql} (id, ${names.join(", ")})
       OVERRIDING SYSTEM VALUE
       SELECT x.id, ${def.cols.map(insertExpr).join(", ")}
         FROM jsonb_to_recordset($1::jsonb) AS x(${record.join(", ")})
       ON CONFLICT (id) DO UPDATE SET ${names.map((n) => `${n} = EXCLUDED.${n}`).join(", ")}`,
      [json],
    );
    const ids = unique.map((r) => r.id as number);
    if (def.children === "permissions") {
      await tx(`DELETE FROM role_permissions WHERE role_id = ANY($1::int[])`, [
        ids,
      ]);
      await tx(
        `INSERT INTO role_permissions (role_id, permission_id, position)
         SELECT x.id, p.value::int, p.ord::int
           FROM jsonb_to_recordset($1::jsonb) AS x(id integer, "permissionIds" jsonb),
                jsonb_array_elements_text(x."permissionIds") WITH ORDINALITY AS p(value, ord)
         ON CONFLICT DO NOTHING`,
        [json],
      );
    } else if (def.children === "items") {
      await tx(`DELETE FROM order_items WHERE order_id = ANY($1::int[])`, [
        ids,
      ]);
      await tx(
        `INSERT INTO order_items (order_id, position, product_id, qty, price)
         SELECT x.id, i.ord::int, (i.item->>'productId')::int, (i.item->>'qty')::int, (i.item->>'price')::numeric
           FROM jsonb_to_recordset($1::jsonb) AS x(id integer, items jsonb),
                jsonb_array_elements(x.items) WITH ORDINALITY AS i(item, ord)`,
        [json],
      );
    }
    await syncSequence(tx, table);
    return withIds.map((r) => r.id as number);
  });
}

/** Deletes rows by id (children cascade, guarded rows fail with a FK error). Returns how many existed. */
export async function removeRows(
  query: Query,
  table: TableName,
  ids: number[],
): Promise<number> {
  if (!ids.length) return 0;
  const rows = await query<{ id: number }>(
    `DELETE FROM ${DEFS[table].sql} WHERE id = ANY($1::int[]) RETURNING id`,
    [ids],
  );
  return rows.length;
}

/** Clears every table and writes `data`, in one transaction (import and reset). */
export async function replaceAll(
  query: Query,
  data: Partial<Db>,
): Promise<number> {
  return inTransaction(query, async (tx) => {
    for (const table of [...INSERT_ORDER].reverse())
      await tx(`DELETE FROM ${DEFS[table].sql}`);
    let n = 0;
    for (const table of INSERT_ORDER) {
      const rows = (data[table] ?? []) as unknown as Input[];
      await upsertRows(tx, table, rows);
      await syncSequence(tx, table);
      n += rows.length;
    }
    return n;
  });
}

export async function countRows(query: Query): Promise<number> {
  const parts = TABLES.map((t) => `(SELECT count(*) FROM ${DEFS[t].sql})`);
  const [r] = await query<{ n: number }>(
    `SELECT (${parts.join(" + ")})::int AS n`,
  );
  return r.n;
}
