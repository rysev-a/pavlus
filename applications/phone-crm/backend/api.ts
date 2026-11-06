/**
 * The JSON API of the Phone Retail CRM: pure functions over a `query`
 * function. No `http` here, so the handlers are testable without a socket
 * (backend/server.ts is the thin node:http shell around `handleApi`).
 *
 * Row shapes on the wire are the frontend's `Db` rows (schema.ts of the
 * template); the SQL is normalized (db/schema.sql, db/repo.ts maps both ways).
 */
import {
  type Db,
  TABLES,
  type TableName,
} from "../../../framework/ui-kit/frontend/templates/phone-retail-crm/schema.ts";
import { seedDb } from "../../../framework/ui-kit/frontend/templates/phone-retail-crm/seed.ts";
import {
  parseSnapshot,
  snapshotOf,
} from "../../../framework/ui-kit/frontend/templates/phone-retail-crm/snapshot.ts";
import {
  budgetByMonth,
  budgetTotals,
  lastTwelveMonths,
  ordersByMonth,
  statusBreakdown,
  TODAY,
  topShops,
} from "../../../framework/ui-kit/frontend/templates/phone-retail-crm/stats.ts";
import type { Query } from "./db/query.ts";
import {
  countRows,
  getRow,
  isTable,
  listRows,
  loadTables,
  removeRows,
  replaceAll,
  sortableFields,
  upsertRows,
} from "./db/repo.ts";
import { checkRow, checkRows } from "./validate.ts";

export type { Query };

export interface Reply {
  status: number;
  body: unknown;
}

const ok = (body: unknown, status = 200): Reply => ({ status, body });
const error = (status: number, message: string): Reply => ({
  status,
  body: { error: message },
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** What the database says, as a reply (or rethrown when it is a real failure). */
function dbError(e: unknown, what: string): Reply {
  const err = e as { code?: string; detail?: string; constraint?: string };
  switch (err?.code) {
    case "23503": {
      // a foreign key: a missing parent (insert) or a row still in use (delete)
      const used = /is still referenced from table "(\w+)"/.exec(
        err.detail ?? "",
      );
      if (used) return error(409, `${what}: it is still used by ${used[1]}`);
      const parent =
        /Key \((\w+)\)=\((\d+)\) is not present in table "(\w+)"/.exec(
          err.detail ?? "",
        );
      return error(
        409,
        parent
          ? `${what}: ${parent[1]} ${parent[2]} does not exist in ${parent[3]}`
          : `${what}: a referenced row does not exist`,
      );
    }
    case "23505": {
      const key = /Key \((\w+)\)=\(([^)]*)\)/.exec(err.detail ?? "");
      return error(
        409,
        key
          ? `${what}: ${key[1]} "${key[2]}" already exists`
          : `${what}: duplicate value`,
      );
    }
    case "23502":
    case "23514":
      return error(
        400,
        `${what}: ${err.detail ?? `violates ${err.constraint ?? "a constraint"}`}`,
      );
    default:
      if (typeof err?.code === "string" && err.code.startsWith("22"))
        return error(400, `${what}: a value is out of range or malformed`);
      throw e;
  }
}

const METHODS = (allowed: string[], method: string): Reply | null =>
  allowed.includes(method)
    ? null
    : error(405, `${method} is not allowed here (use ${allowed.join(", ")})`);

// ---------------------------------------------------------------- sync

function tableOf(body: unknown): TableName | Reply {
  const name = isObject(body) ? body.table : undefined;
  if (typeof name !== "string") return error(400, '"table" is missing');
  return isTable(name) ? name : error(400, `unknown table "${name}"`);
}

async function sync(
  op: string,
  method: string,
  query: Query,
  body: unknown,
): Promise<Reply> {
  const bad = METHODS(["POST"], method);
  if (bad) return bad;
  const b = isObject(body) ? body : {};
  switch (op) {
    case "load": {
      let tables: TableName[] = TABLES;
      if (b.tables !== undefined) {
        if (!Array.isArray(b.tables))
          return error(400, '"tables" is not an array');
        for (const t of b.tables)
          if (typeof t !== "string" || !isTable(t))
            return error(400, `unknown table ${JSON.stringify(t)}`);
        tables = b.tables as TableName[];
      }
      return ok({ data: await loadTables(query, tables) });
    }
    case "put": {
      const table = tableOf(body);
      if (typeof table !== "string") return table;
      const rows = checkRows(table, b.rows);
      if (!rows.ok) return error(400, rows.error);
      try {
        await upsertRows(query, table, rows.value);
      } catch (e) {
        return dbError(e, `cannot save ${table}`);
      }
      return ok({ saved: rows.value.length });
    }
    case "remove": {
      const table = tableOf(body);
      if (typeof table !== "string") return table;
      const ids = b.ids;
      if (
        !Array.isArray(ids) ||
        !ids.every(
          (i) => Number.isSafeInteger(i) && Math.abs(i as number) < 2 ** 31,
        )
      )
        return error(400, '"ids" is missing or not an array of integers');
      try {
        return ok({ removed: await removeRows(query, table, ids as number[]) });
      } catch (e) {
        return dbError(e, `cannot delete from ${table}`);
      }
    }
    case "replace": {
      if (!isObject(b.data))
        return error(400, '"data" is missing or not an object');
      const clean: Record<string, unknown> = {};
      for (const key of Object.keys(b.data))
        if (!isTable(key)) return error(400, `unknown table "${key}"`);
      for (const table of TABLES) {
        const rows = checkRows(table, b.data[table] ?? []);
        if (!rows.ok) return error(400, rows.error);
        clean[table] = rows.value;
      }
      try {
        return ok({ rows: await replaceAll(query, clean as Partial<Db>) });
      } catch (e) {
        return dbError(e, "cannot replace the data");
      }
    }
    case "reset":
      return ok({ rows: await replaceAll(query, seedDb()) });
    default:
      return error(404, `no route /api/sync/${op}`);
  }
}

// ---------------------------------------------------------------- tables

const intParam = (v: string | null, fallback: number): number | null => {
  if (v === null || v === "") return fallback;
  return /^\d+$/.test(v) ? Number(v) : null;
};

async function list(
  table: TableName,
  query: Query,
  params: URLSearchParams,
): Promise<Reply> {
  const page = intParam(params.get("page"), 1);
  const size = intParam(params.get("size"), 20);
  if (page === null || page < 1)
    return error(400, "page must be a positive integer");
  if (size === null || size < 1 || size > 200)
    return error(400, "size must be from 1 to 200");
  const sort = params.get("sort") || undefined;
  if (sort && !sortableFields(table).includes(sort))
    return error(
      400,
      `cannot sort ${table} by "${sort}" (use ${sortableFields(table).join(", ")})`,
    );
  const dir = params.get("dir") ?? "asc";
  if (dir !== "asc" && dir !== "desc")
    return error(400, 'dir must be "asc" or "desc"');
  return ok(
    await listRows(query, table, {
      q: params.get("q") ?? undefined,
      sort,
      dir,
      page,
      size,
    }),
  );
}

async function tableRoute(
  table: TableName,
  rest: string[],
  method: string,
  query: Query,
  params: URLSearchParams,
  body: unknown,
): Promise<Reply> {
  if (rest.length === 0) {
    const bad = METHODS(["GET", "POST"], method);
    if (bad) return bad;
    if (method === "GET") return list(table, query, params);
    const row = checkRow(table, body, table, false);
    if (!row.ok) return error(400, row.error);
    if (
      row.value.id !== undefined &&
      (await getRow(query, table, row.value.id))
    )
      return error(409, `${table} ${row.value.id} already exists`);
    try {
      const [id] = await upsertRows(query, table, [row.value]);
      return ok(await getRow(query, table, id), 201);
    } catch (e) {
      return dbError(e, `cannot create ${table}`);
    }
  }
  if (
    rest.length !== 1 ||
    !/^\d+$/.test(rest[0]) ||
    Number(rest[0]) >= 2 ** 31 ||
    Number(rest[0]) < 1
  )
    return error(404, `no route /api/${table}/${rest.join("/")}`);
  const id = Number(rest[0]);
  const bad = METHODS(["GET", "PUT", "DELETE"], method);
  if (bad) return bad;
  const existing = await getRow(query, table, id);
  if (!existing) return error(404, `no ${table} ${id}`);
  if (method === "GET") return ok(existing);
  if (method === "DELETE") {
    try {
      await removeRows(query, table, [id]);
      return ok({ removed: 1 });
    } catch (e) {
      return dbError(e, `cannot delete ${table} ${id}`);
    }
  }
  if (isObject(body) && body.id !== undefined && body.id !== id)
    return error(
      400,
      `${table}.id ${JSON.stringify(body.id)} does not match the url (${id})`,
    );
  const row = checkRow(
    table,
    isObject(body) ? { ...body, id } : body,
    table,
    true,
  );
  if (!row.ok) return error(400, row.error);
  try {
    await upsertRows(query, table, [row.value]);
    return ok(await getRow(query, table, id));
  } catch (e) {
    return dbError(e, `cannot save ${table} ${id}`);
  }
}

// ---------------------------------------------------------------- stats, export, import

/** `?today=YYYY-MM-DD` moves the window; the demo's fixed today is the default. */
function todayOf(params: URLSearchParams): string | Reply {
  const today = params.get("today") ?? TODAY;
  return /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(today)
    ? today
    : error(400, "today must be YYYY-MM-DD");
}

async function stats(
  kind: string,
  query: Query,
  params: URLSearchParams,
): Promise<Reply> {
  const today = todayOf(params);
  if (typeof today !== "string") return today;
  const months = lastTwelveMonths(today);
  if (kind === "orders") {
    const { orders = [], shops = [] } = await loadTables(query, [
      "orders",
      "shops",
    ]);
    const window = orders.filter((o) =>
      months.includes(o.createdAt.slice(0, 7)),
    );
    const byMonth = ordersByMonth(orders, months);
    return ok({
      today,
      months: byMonth,
      statuses: statusBreakdown(window),
      topShops: topShops(window, shops, 5),
      totals: {
        orders: byMonth.reduce((s, m) => s + m.count, 0),
        revenue:
          Math.round(byMonth.reduce((s, m) => s + m.revenue, 0) * 100) / 100,
      },
    });
  }
  const { budget = [] } = await loadTables(query, ["budget"]);
  return ok({
    today,
    months: budgetByMonth(budget, months),
    totals: budgetTotals(budget, months),
  });
}

export async function handleApi(
  method: string,
  pathname: string,
  query: Query,
  body: unknown,
  params: URLSearchParams = new URLSearchParams(),
): Promise<Reply> {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0] !== "api" || parts.length < 2)
    return error(404, `no route ${pathname}`);
  const [, head, ...rest] = parts;
  try {
    if (head === "health" && rest.length === 0) {
      const bad = METHODS(["GET"], method);
      if (bad) return bad;
      await query("SELECT 1");
      return ok({ ok: true, db: true });
    }
    if (head === "sync" && rest.length === 1)
      return await sync(rest[0], method, query, body);
    if (
      head === "stats" &&
      rest.length === 1 &&
      (rest[0] === "orders" || rest[0] === "budget")
    ) {
      const bad = METHODS(["GET"], method);
      return bad ?? (await stats(rest[0], query, params));
    }
    if (head === "export" && rest.length === 0) {
      const bad = METHODS(["GET"], method);
      if (bad) return bad;
      const data = (await loadTables(query)) as Db;
      return ok(snapshotOf(data, new Date().toISOString()));
    }
    if (head === "import" && rest.length === 0) {
      const bad = METHODS(["POST"], method);
      if (bad) return bad;
      if (!isObject(body))
        return error(400, "the body must be a Snapshot object");
      const parsed = parseSnapshot(JSON.stringify(body));
      if (!parsed.ok) return error(400, parsed.error);
      try {
        return ok({ rows: await replaceAll(query, parsed.db) });
      } catch (e) {
        return dbError(e, "cannot import");
      }
    }
    if (isTable(head))
      return await tableRoute(head, rest, method, query, params, body);
    return error(404, `no route ${pathname}`);
  } catch (e) {
    if (e instanceof SyntaxError) return error(400, "invalid request");
    throw e;
  }
}

/** Total rows in the database (for the startup log and init). */
export { countRows };
