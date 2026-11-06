// `sql` tagged template: values become $n parameters, never text.
// Identifiers go through sql.id(), fragments nest, lists expand.

const BRAND = Symbol.for("pavlus.sql");

export interface SqlQuery {
  sql: string;
  params: unknown[];
  readonly [BRAND]: true;
}

interface Fragment {
  readonly [BRAND]: "fragment";
  build(params: unknown[]): string;
}

const isQuery = (v: unknown): v is SqlQuery =>
  typeof v === "object" && v !== null && (v as any)[BRAND] === true;
const isFragment = (v: unknown): v is Fragment =>
  typeof v === "object" && v !== null && (v as any)[BRAND] === "fragment";

function quoteIdent(name: string): string {
  if (typeof name !== "string" || name === "" || name.includes("\0"))
    throw new Error(`sql.id: invalid identifier ${JSON.stringify(name)}`);
  return '"' + name.replace(/"/g, '""') + '"';
}

function build(
  strings: readonly string[],
  values: readonly unknown[],
  params: unknown[],
): string {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isFragment(v)) out += v.build(params);
    else if (isQuery(v)) out += shift(v, params);
    else {
      params.push(v);
      out += "$" + params.length;
    }
    out += strings[i + 1]!;
  }
  return out;
}

/** Re-numbers the placeholders of a finished query into `params`. */
function shift(q: SqlQuery, params: unknown[]): string {
  const offset = params.length;
  params.push(...q.params);
  return q.sql.replace(/\$(\d+)/g, (_, n) => "$" + (Number(n) + offset));
}

function fragment(fn: (params: unknown[]) => string): Fragment {
  return { [BRAND]: "fragment", build: fn };
}

export interface SqlTag {
  (strings: TemplateStringsArray, ...values: unknown[]): SqlQuery;
  /** A quoted identifier; "schema.table" is quoted part by part. */
  id(name: string): unknown;
  /** `$1, $2, $3` for an array of values (for `IN (...)`; prefer `= ANY(${arr})`). */
  list(values: readonly unknown[]): unknown;
  /** Joins fragments / queries with a separator (a fixed string from your code). */
  join(parts: readonly (SqlQuery | unknown)[], separator?: string): unknown;
  /** Wraps a plain string as a query with no parameters (you vouch for it). */
  unsafe(text: string): SqlQuery;
}

export const sql: SqlTag = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]): SqlQuery => {
    const params: unknown[] = [];
    const text = build(strings, values, params);
    return { sql: text, params, [BRAND]: true };
  },
  {
    id: (name: string) =>
      fragment(() => name.split(".").map(quoteIdent).join(".")),
    list: (values: readonly unknown[]) => {
      if (values.length === 0) throw new Error("sql.list: empty list");
      return fragment((params) =>
        values.map((v) => (params.push(v), "$" + params.length)).join(", "),
      );
    },
    join: (parts: readonly unknown[], separator = ", ") =>
      fragment((params) =>
        parts
          .map((p) => {
            if (isFragment(p)) return p.build(params);
            if (isQuery(p)) return shift(p, params);
            params.push(p);
            return "$" + params.length;
          })
          .join(separator),
      ),
    unsafe: (text: string): SqlQuery => ({
      sql: text,
      params: [],
      [BRAND]: true,
    }),
  },
);

/** Accepts either a built query or a raw string + params. */
export function toQuery(
  q: SqlQuery | string,
  params?: unknown[],
): { sql: string; params: unknown[] } {
  return typeof q === "string"
    ? { sql: q, params: params ?? [] }
    : { sql: q.sql, params: q.params };
}
