// The database of a design as Postgres sees it: a schema made from the tables the
// simulation runs on (their columns, read off the rows), the rows as a seed, and the
// module that creates the tables and fills the empty ones when the server starts.
// What the simulation does with `db`, a real server does with these files. Pure.
import type { Db, Row } from "./store.ts";

type Col = { name: string; type: string; notNull: boolean };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** The Postgres type that holds every value a column has in the rows. */
function typeOf(name: string, values: unknown[]): string {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (present.length === 0) return "text";
  const kinds = new Set(
    present.map((v) =>
      Array.isArray(v) || typeof v === "object"
        ? "json"
        : typeof v === "number"
          ? Number.isInteger(v)
            ? "int"
            : "float"
          : typeof v,
    ),
  );
  if (kinds.size === 1) {
    const k = [...kinds][0];
    if (k === "json") return "jsonb";
    if (k === "boolean") return "boolean";
    if (k === "int") return name === "id" ? "serial" : "integer";
    if (k === "float") return "double precision";
    if (k === "string")
      return present.every((v) => ISO.test(String(v))) ? "timestamptz" : "text";
  }
  // integers and decimals in one column: a decimal column
  if ([...kinds].every((k) => k === "int" || k === "float"))
    return "double precision";
  return "text";
}

function columnsOf(rows: Row[], unique: string[]): Col[] {
  const names: string[] = [];
  for (const r of rows)
    for (const k of Object.keys(r)) if (!names.includes(k)) names.push(k);
  return names.map((name) => ({
    name,
    type: typeOf(
      name,
      rows.map((r) => r[name]),
    ),
    notNull: unique.includes(name) || name === "id",
  }));
}

const q = (s: string): string => `"${s.replace(/"/g, '""')}"`;

/** `create table if not exists` for each table of the design */
export function schemaSql(db: Db): string {
  const out: string[] = [
    "-- The tables of the design, made from the rows the simulation starts with.",
    "-- It runs when the server starts (server/db.ts) and changes nothing that is there.",
    "",
  ];
  for (const [name, t] of Object.entries(db)) {
    const cols = columnsOf(t.rows, t.unique);
    const lines = cols.map((c) => {
      const pk = c.name === "id" && c.type === "serial" ? " primary key" : "";
      const nn = c.notNull && !pk ? " not null" : "";
      return `  ${q(c.name)} ${c.type}${pk}${nn}`;
    });
    for (const u of t.unique.filter((x) => x !== "id"))
      lines.push(`  constraint ${q(`${name}_${u}_key`)} unique (${q(u)})`);
    out.push(
      `create table if not exists ${q(name)} (\n${lines.join(",\n")}\n);`,
      "",
    );
  }
  return out.join("\n");
}

/** `server/seed.ts`: the starting rows, to put in the tables that are empty */
export function seedModule(db: Db): string {
  const tables = Object.entries(db).map(
    ([name, t]) =>
      `  ${JSON.stringify(name)}: ${JSON.stringify(t.rows, null, 2).replace(/\n/g, "\n  ")},`,
  );
  return `// The rows the tables start with: the ones of the design, for a server that starts
// on an empty database (server/db.ts puts them in the tables that are empty).
export const seed: Record<string, Record<string, unknown>[]> = {
${tables.join("\n")}
};
`;
}

/** `server/db.ts`: creates the tables and seeds the empty ones; run before the server listens */
export function dbModule(db: Db): string {
  const withId = Object.entries(db)
    .filter(([, t]) => t.rows.some((r) => typeof r.id === "number"))
    .map(([n]) => n);
  return `// Before the server listens: create the tables, and put the starting rows in the
// ones that are empty. Everything after that goes through the pg plugin.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { seed } from "./seed.ts";

const here = dirname(fileURLToPath(import.meta.url));
const SERIAL = ${JSON.stringify(withId)};

const ident = (s: string): string => '"' + s.replace(/"/g, '""') + '"';
const asParam = (v: unknown): unknown =>
  v !== null && typeof v === "object" ? JSON.stringify(v) : v;

export async function ensureDatabase(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(join(here, "schema.sql"), "utf8"));
    for (const [table, rows] of Object.entries(seed)) {
      const have = await client.query(\`select count(*)::int as n from \${ident(table)}\`);
      if (have.rows[0].n > 0) continue;
      for (const row of rows) {
        const cols = Object.keys(row);
        await client.query(
          \`insert into \${ident(table)} (\${cols.map(ident).join(", ")}) values (\${cols.map((_, i) => "$" + (i + 1)).join(", ")})\`,
          cols.map((c) => asParam(row[c])),
        );
      }
      // the rows came with their ids: the next one continues after them
      if (SERIAL.includes(table))
        await client.query(
          \`select setval(pg_get_serial_sequence('\${table}', 'id'), coalesce((select max(id) from \${ident(table)}), 1))\`,
        );
    }
  } finally {
    await client.end();
  }
}
`;
}
