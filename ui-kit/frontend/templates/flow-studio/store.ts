// A small in-memory SQL store for the simulation: the tables of a design, and the
// subset of SQL its `pg.query` nodes use. It is what lets a flow be run against data
// (create a customer, then list them) instead of a canned reply. Pure: the tables
// and a statement in, the new tables and the rows out.
//
//   select <items> from t [where ...] [group by c] [order by c [desc], ...] [limit n] [offset n]
//   insert into t (cols) values (...), (...) [returning ...]
//   update t set c = expr, ... [where ...] [returning ...]
//   delete from t [where ...] [returning ...]
//
// Expressions: numbers, 'text', $1 parameters, columns, null / true / false, now(),
// + - * / ||, coalesce lower upper abs round, count(*) sum avg min max; conditions:
// = != <> < > <= >= like ilike is [not] null [not] in (...), and / or / not, ( ).

export type Row = Record<string, unknown>;

export interface TableDef {
  /** columns that cannot repeat (an insert or update that repeats one fails with 23505) */
  unique: string[];
  rows: Row[];
}

export type Db = Record<string, TableDef>;

export interface SqlError {
  /** the SQLSTATE: 42601 syntax, 42P01 no such table, 23505 unique violation */
  code: string;
  message: string;
  constraint?: string;
}

export interface SqlResult {
  db: Db;
  rows: Row[];
  rowCount: number;
  error?: SqlError;
}

class SqlFail extends Error {
  constructor(
    public code: string,
    message: string,
    public constraint?: string,
  ) {
    super(message);
  }
}

const clone = <T>(v: T): T =>
  v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);

// ---- the tokens ----

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "param"; v: number }
  | { t: "op"; v: string };

function tokenize(sql: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c) || c === ";") {
      i++;
    } else if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (/\d/.test(c)) {
      const m = /^\d+(\.\d+)?/.exec(sql.slice(i))!;
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (c === "'") {
      let s = "";
      i++;
      for (;;) {
        if (i >= sql.length) throw new SqlFail("42601", "unterminated string");
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            s += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += sql[i++];
      }
      out.push({ t: "str", v: s });
    } else if (c === "$" && /\d/.test(sql[i + 1] ?? "")) {
      const m = /^\$(\d+)/.exec(sql.slice(i))!;
      out.push({ t: "param", v: Number(m[1]) });
      i += m[0].length;
    } else if (c === '"') {
      const j = sql.indexOf('"', i + 1);
      if (j < 0) throw new SqlFail("42601", "unterminated identifier");
      out.push({ t: "id", v: sql.slice(i + 1, j) });
      i = j + 1;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][\w]*/.exec(sql.slice(i))!;
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
    } else if (c === ":" && sql[i + 1] === ":") {
      // a cast: skip the type
      i += 2;
      while (i < sql.length && /[\w]/.test(sql[i])) i++;
    } else {
      const two = sql.slice(i, i + 2);
      if (["<=", ">=", "<>", "!=", "||"].includes(two)) {
        out.push({ t: "op", v: two });
        i += 2;
      } else if ("=<>+-*/(),.".includes(c)) {
        out.push({ t: "op", v: c });
        i++;
      } else throw new SqlFail("42601", `unexpected "${c}"`);
    }
  }
  return out;
}

// ---- the parser: expressions compile to functions of an environment ----

interface Env {
  row: Row;
  /** the rows of the group, for the aggregates */
  rows: Row[];
  params: unknown[];
  now: string;
}
type Fn = (e: Env) => unknown;

const AGG = new Set(["count", "sum", "avg", "min", "max"]);

class Parser {
  i = 0;
  hasAgg = false;
  constructor(public toks: Tok[]) {}

  peek(o = 0): Tok | undefined {
    return this.toks[this.i + o];
  }
  kw(word: string, o = 0): boolean {
    const t = this.peek(o);
    return t?.t === "id" && t.v.toLowerCase() === word;
  }
  op(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t?.t === "op" && t.v === v;
  }
  eatKw(word: string): boolean {
    if (this.kw(word)) {
      this.i++;
      return true;
    }
    return false;
  }
  eatOp(v: string): boolean {
    if (this.op(v)) {
      this.i++;
      return true;
    }
    return false;
  }
  needKw(word: string): void {
    if (!this.eatKw(word)) this.fail(`expected ${word}`);
  }
  needOp(v: string): void {
    if (!this.eatOp(v)) this.fail(`expected ${v}`);
  }
  fail(msg: string): never {
    const t = this.peek();
    throw new SqlFail(
      "42601",
      `syntax error: ${msg}${t ? ` near ${JSON.stringify("v" in t ? t.v : "")}` : " at the end"}`,
    );
  }
  ident(): string {
    const t = this.peek();
    if (t?.t !== "id") this.fail("expected a name");
    this.i++;
    let name = (t as { v: string }).v;
    // t.col -> col
    while (this.op(".") && this.peek(1)?.t === "id") {
      this.i++;
      name = (this.peek() as { v: string }).v;
      this.i++;
    }
    return name;
  }

  // ---- expressions ----
  expr(): Fn {
    let left = this.term();
    for (;;) {
      if (this.eatOp("+")) {
        const l = left;
        const r = this.term();
        left = (e) => num(l(e)) + num(r(e));
      } else if (this.eatOp("-")) {
        const l = left;
        const r = this.term();
        left = (e) => num(l(e)) - num(r(e));
      } else if (this.eatOp("||")) {
        const l = left;
        const r = this.term();
        left = (e) => `${l(e) ?? ""}${r(e) ?? ""}`;
      } else return left;
    }
  }
  term(): Fn {
    let left = this.factor();
    for (;;) {
      if (this.eatOp("*")) {
        const l = left;
        const r = this.factor();
        left = (e) => num(l(e)) * num(r(e));
      } else if (this.eatOp("/")) {
        const l = left;
        const r = this.factor();
        left = (e) => num(l(e)) / num(r(e));
      } else return left;
    }
  }
  factor(): Fn {
    const t = this.peek();
    if (!t) this.fail("expected an expression");
    if (this.eatOp("-")) {
      const f = this.factor();
      return (e) => -num(f(e));
    }
    if (this.eatOp("(")) {
      const x = this.expr();
      this.needOp(")");
      return x;
    }
    if (t.t === "num") {
      this.i++;
      return () => t.v;
    }
    if (t.t === "str") {
      this.i++;
      return () => t.v;
    }
    if (t.t === "param") {
      this.i++;
      return (e) => {
        if (t.v < 1 || t.v > e.params.length)
          throw new SqlFail("42P02", `there is no parameter $${t.v}`);
        return e.params[t.v - 1];
      };
    }
    if (t.t === "id") {
      const word = t.v.toLowerCase();
      if (word === "null") {
        this.i++;
        return () => null;
      }
      if (word === "true" || word === "false") {
        this.i++;
        return () => word === "true";
      }
      if (this.op("(", 1)) return this.call();
      const name = this.ident();
      return (e) => e.row[name];
    }
    return this.fail("expected an expression");
  }
  call(): Fn {
    const name = (this.peek() as { v: string }).v.toLowerCase();
    this.i += 2;
    if (AGG.has(name)) {
      this.hasAgg = true;
      let arg: Fn | null = null;
      if (this.eatOp("*")) arg = null;
      else {
        const was = this.hasAgg;
        arg = this.expr();
        this.hasAgg = was;
      }
      this.needOp(")");
      return (e) => {
        const vals: unknown[] = arg
          ? e.rows.map((r) => arg!({ ...e, row: r })).filter((v) => v != null)
          : e.rows;
        switch (name) {
          case "count":
            return vals.length;
          case "sum":
            return vals.length
              ? vals.reduce<number>((a, v) => a + num(v), 0)
              : null;
          case "avg":
            return vals.length
              ? vals.reduce<number>((a, v) => a + num(v), 0) / vals.length
              : null;
          case "min":
            return vals.length
              ? vals.reduce((a, v) => (cmp(v, a) < 0 ? v : a))
              : null;
          default:
            return vals.length
              ? vals.reduce((a, v) => (cmp(v, a) > 0 ? v : a))
              : null;
        }
      };
    }
    const args: Fn[] = [];
    if (!this.op(")"))
      do args.push(this.expr());
      while (this.eatOp(","));
    this.needOp(")");
    switch (name) {
      case "now":
        return (e) => e.now;
      case "coalesce":
        return (e) => {
          for (const a of args) {
            const v = a(e);
            if (v != null) return v;
          }
          return null;
        };
      case "lower":
        return (e) => String(args[0](e) ?? "").toLowerCase();
      case "upper":
        return (e) => String(args[0](e) ?? "").toUpperCase();
      case "abs":
        return (e) => Math.abs(num(args[0](e)));
      case "round":
        return (e) => {
          const k = 10 ** (args[1] ? num(args[1](e)) : 0);
          return Math.round(num(args[0](e)) * k) / k;
        };
      case "length":
        return (e) => String(args[0](e) ?? "").length;
    }
    throw new SqlFail("42883", `function ${name} does not exist`);
  }

  // ---- conditions ----
  cond(): Fn {
    let left = this.and();
    while (this.eatKw("or")) {
      const l = left;
      const r = this.and();
      left = (e) => !!l(e) || !!r(e);
    }
    return left;
  }
  and(): Fn {
    let left = this.not();
    while (this.eatKw("and")) {
      const l = left;
      const r = this.not();
      left = (e) => !!l(e) && !!r(e);
    }
    return left;
  }
  not(): Fn {
    if (this.eatKw("not")) {
      const x = this.not();
      return (e) => !x(e);
    }
    return this.pred();
  }
  pred(): Fn {
    if (this.op("(")) {
      const at = this.i;
      try {
        const x = this.expr();
        if (this.isPredOp()) return this.predRest(x);
      } catch (e) {
        if (!(e instanceof SqlFail)) throw e;
      }
      this.i = at;
      this.needOp("(");
      const c = this.cond();
      this.needOp(")");
      return c;
    }
    return this.predRest(this.expr());
  }
  isPredOp(): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.t === "op")
      return ["=", "!=", "<>", "<", ">", "<=", ">="].includes(t.v);
    return (
      t.t === "id" &&
      ["like", "ilike", "is", "in", "not"].includes(t.v.toLowerCase())
    );
  }
  predRest(left: Fn): Fn {
    const t = this.peek();
    if (
      t?.t === "op" &&
      ["=", "!=", "<>", "<", ">", "<=", ">="].includes(t.v)
    ) {
      this.i++;
      const r = this.expr();
      const op = t.v;
      return (e) => {
        const a = left(e);
        const b = r(e);
        if (a == null || b == null) return false;
        const c = cmp(a, b);
        switch (op) {
          case "=":
            return c === 0;
          case "!=":
          case "<>":
            return c !== 0;
          case "<":
            return c < 0;
          case ">":
            return c > 0;
          case "<=":
            return c <= 0;
          default:
            return c >= 0;
        }
      };
    }
    let negate = false;
    if (this.kw("not")) {
      negate = true;
      this.i++;
    }
    if (this.kw("like") || this.kw("ilike")) {
      const ci = this.kw("ilike");
      this.i++;
      const r = this.expr();
      return (e) => {
        const v = left(e);
        const pat = r(e);
        if (v == null || pat == null) return false;
        const re = new RegExp(
          `^${String(pat)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/%/g, ".*")
            .replace(/_/g, ".")}$`,
          ci ? "i" : "",
        );
        return re.test(String(v)) !== negate;
      };
    }
    if (this.eatKw("in")) {
      this.needOp("(");
      const list: Fn[] = [];
      do list.push(this.expr());
      while (this.eatOp(","));
      this.needOp(")");
      return (e) => {
        const v = left(e);
        return (v != null && list.some((x) => cmp(v, x(e)) === 0)) !== negate;
      };
    }
    if (this.eatKw("is")) {
      const not = this.eatKw("not");
      this.needKw("null");
      return (e) => (left(e) == null) !== not;
    }
    // a bare boolean expression
    if (negate) this.fail("expected like, in or null after not");
    return (e) => !!left(e);
  }
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" || typeof b === "number")
    return Number(a) - Number(b);
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

// ---- select items ----

interface Item {
  name: string;
  fn: Fn | null;
  star: boolean;
}

function items(p: Parser): { list: Item[]; agg: boolean } {
  const list: Item[] = [];
  let agg = false;
  do {
    if (p.eatOp("*")) {
      list.push({ name: "*", fn: null, star: true });
      continue;
    }
    const startTok = p.peek();
    p.hasAgg = false;
    const fn = p.expr();
    agg ||= p.hasAgg;
    let name = "";
    if (p.eatKw("as")) name = p.ident();
    else if (startTok?.t === "id" && !p.op("(", 1)) name = startTok.v;
    else if (startTok?.t === "id") name = startTok.v.toLowerCase();
    else name = `?column?`;
    list.push({ name, fn, star: false });
  } while (p.eatOp(","));
  return { list, agg };
}

function project(list: Item[], env: Env): Row {
  const out: Row = {};
  for (const it of list) {
    if (it.star) Object.assign(out, clone(env.row));
    else out[it.name] = clone(it.fn!(env));
  }
  return out;
}

// ---- the statements ----

function table(db: Db, name: string): TableDef {
  const t = db[name];
  if (!t) throw new SqlFail("42P01", `relation "${name}" does not exist`);
  return t;
}

function checkUnique(t: TableDef, name: string, rows: Row[]): void {
  for (const col of t.unique) {
    const seen = new Set<string>();
    for (const r of rows) {
      const v = r[col];
      if (v == null) continue;
      const k = JSON.stringify(v);
      if (seen.has(k))
        throw new SqlFail(
          "23505",
          `duplicate key value violates unique constraint "${name}_${col}_key"`,
          `${name}_${col}_key`,
        );
      seen.add(k);
    }
  }
}

export interface RunOpts {
  /** the value of now(), an ISO text */
  now?: string;
}

/**
 * Runs one statement. The tables given are not changed: the result has the new ones.
 * A failure is a value (`error`), shaped like the error of the Postgres plugin.
 */
export function runSql(
  db: Db,
  sql: string,
  params: unknown[] = [],
  opts: RunOpts = {},
): SqlResult {
  try {
    return run(db, sql, params, opts.now ?? "2026-02-01T09:00:00.000Z");
  } catch (e) {
    if (e instanceof SqlFail)
      return {
        db,
        rows: [],
        rowCount: 0,
        error: {
          code: e.code,
          message: e.message,
          ...(e.constraint ? { constraint: e.constraint } : {}),
        },
      };
    throw e;
  }
}

function run(db: Db, sql: string, params: unknown[], now: string): SqlResult {
  const p = new Parser(tokenize(sql));
  const env = (row: Row, rows: Row[]): Env => ({ row, rows, params, now });
  const rest = (): void => {
    if (p.peek()) p.fail("unexpected input");
  };

  if (p.eatKw("select")) {
    p.eatKw("distinct");
    const { list, agg } = items(p);
    p.needKw("from");
    const name = p.ident();
    const t = table(db, name);
    let where: Fn | null = null;
    if (p.eatKw("where")) where = p.cond();
    let group: string | null = null;
    if (p.eatKw("group")) {
      p.needKw("by");
      group = p.ident();
    }
    const order: { fn: Fn; desc: boolean }[] = [];
    if (p.eatKw("order")) {
      p.needKw("by");
      do {
        const fn = p.expr();
        const desc = p.eatKw("desc");
        if (!desc) p.eatKw("asc");
        order.push({ fn, desc });
      } while (p.eatOp(","));
    }
    let limit = Infinity;
    let offset = 0;
    if (p.eatKw("limit")) limit = num(p.expr()(env({}, [])));
    if (p.eatKw("offset")) offset = num(p.expr()(env({}, [])));
    rest();
    let rows = t.rows.filter((r) => !where || where(env(r, t.rows)));
    let out: Row[];
    if (agg || group) {
      const groups = new Map<string, Row[]>();
      if (group) {
        for (const r of rows) {
          const k = JSON.stringify(r[group] ?? null);
          groups.set(k, [...(groups.get(k) ?? []), r]);
        }
      } else groups.set("", rows);
      out = [...groups.values()].map((g) => project(list, env(g[0] ?? {}, g)));
      // an aggregate over no rows is still one row
      if (!group && rows.length === 0) out = [project(list, env({}, []))];
    } else {
      if (order.length)
        rows = [...rows].sort((a, b) => {
          for (const o of order) {
            const x = o.fn(env(a, rows));
            const y = o.fn(env(b, rows));
            const c =
              x == null ? (y == null ? 0 : 1) : y == null ? -1 : cmp(x, y);
            if (c) return o.desc && x != null && y != null ? -c : c;
          }
          return 0;
        });
      out = rows.map((r) => project(list, env(r, rows)));
    }
    if (agg || group) {
      // order of groups: by the keys asked for, when the columns are in the result
      if (order.length)
        out.sort((a, b) => {
          for (const o of order) {
            const x = o.fn(env(a, [a]));
            const y = o.fn(env(b, [b]));
            const c =
              x == null ? (y == null ? 0 : 1) : y == null ? -1 : cmp(x, y);
            if (c) return o.desc ? -c : c;
          }
          return 0;
        });
    }
    out = out.slice(offset, offset + limit);
    return { db, rows: out, rowCount: out.length };
  }

  if (p.eatKw("insert")) {
    p.needKw("into");
    const name = p.ident();
    const t = table(db, name);
    p.needOp("(");
    const cols: string[] = [];
    do cols.push(p.ident());
    while (p.eatOp(","));
    p.needOp(")");
    p.needKw("values");
    const rowsFns: Fn[][] = [];
    do {
      p.needOp("(");
      const vals: Fn[] = [];
      do vals.push(p.expr());
      while (p.eatOp(","));
      p.needOp(")");
      if (vals.length !== cols.length)
        throw new SqlFail(
          "42601",
          "INSERT has a different number of columns and values",
        );
      rowsFns.push(vals);
    } while (p.eatOp(","));
    let ret: Item[] | null = null;
    if (p.eatKw("returning")) ret = items(p).list;
    rest();
    const next: Db = { ...db, [name]: { ...t, rows: [...t.rows] } };
    const added: Row[] = [];
    for (const vals of rowsFns) {
      const row: Row = {};
      cols.forEach((c, i) => {
        row[c] = clone(vals[i](env({}, [])));
      });
      if (row.id == null) {
        const max = next[name].rows.reduce(
          (m, r) => Math.max(m, typeof r.id === "number" ? r.id : 0),
          0,
        );
        row.id = max + 1;
      }
      next[name].rows.push(row);
      added.push(row);
    }
    checkUnique(next[name], name, next[name].rows);
    return {
      db: next,
      rows: ret ? added.map((r) => project(ret!, env(r, added))) : [],
      rowCount: added.length,
    };
  }

  if (p.eatKw("update")) {
    const name = p.ident();
    const t = table(db, name);
    p.needKw("set");
    const sets: { col: string; fn: Fn }[] = [];
    do {
      const col = p.ident();
      p.needOp("=");
      sets.push({ col, fn: p.expr() });
    } while (p.eatOp(","));
    let where: Fn | null = null;
    if (p.eatKw("where")) where = p.cond();
    let ret: Item[] | null = null;
    if (p.eatKw("returning")) ret = items(p).list;
    rest();
    const changed: Row[] = [];
    const rows = t.rows.map((r) => {
      if (where && !where(env(r, t.rows))) return r;
      const n: Row = { ...r };
      for (const s of sets) n[s.col] = clone(s.fn(env(r, t.rows)));
      changed.push(n);
      return n;
    });
    const next: Db = { ...db, [name]: { ...t, rows } };
    checkUnique(next[name], name, rows);
    return {
      db: next,
      rows: ret ? changed.map((r) => project(ret!, env(r, changed))) : [],
      rowCount: changed.length,
    };
  }

  if (p.eatKw("delete")) {
    p.needKw("from");
    const name = p.ident();
    const t = table(db, name);
    let where: Fn | null = null;
    if (p.eatKw("where")) where = p.cond();
    let ret: Item[] | null = null;
    if (p.eatKw("returning")) ret = items(p).list;
    rest();
    const gone: Row[] = [];
    const kept = t.rows.filter((r) => {
      if (where && !where(env(r, t.rows))) return true;
      gone.push(r);
      return false;
    });
    return {
      db: { ...db, [name]: { ...t, rows: kept } },
      rows: ret ? gone.map((r) => project(ret!, env(r, gone))) : [],
      rowCount: gone.length,
    };
  }
  return p.fail("expected select, insert, update or delete");
}

/** The tables of a JSON value (the seed of a design), cleaned. */
export function dbFrom(v: unknown): Db {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const out: Db = {};
  for (const [name, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[A-Za-z_]\w*$/.test(name) || typeof raw !== "object" || raw === null)
      continue;
    const t = raw as { unique?: unknown; rows?: unknown };
    out[name] = {
      unique: Array.isArray(t.unique)
        ? t.unique.filter((x): x is string => typeof x === "string")
        : [],
      rows: Array.isArray(t.rows)
        ? t.rows.filter(
            (r): r is Row =>
              typeof r === "object" && r !== null && !Array.isArray(r),
          )
        : [],
    };
  }
  return out;
}
