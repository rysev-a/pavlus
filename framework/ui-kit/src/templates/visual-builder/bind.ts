// Binding: how an element reads the state of the app being built.
//
// Every text field of the inspector is a TEMPLATE: text with `{expression}`
// holes, as in a .pavlus file (`\{` is a literal brace). Fields marked "expr"
// are one bare expression. An expression here is the builder's own language
// (expr.ts): a template reads ready data only (philosophy.md), while a
// binding, a condition or an action value is the logic, so it may use the
// operators and the helper calls below. The scope is `state` (the live state),
// the helpers, and what the event brings (`event`, `row`, `item`, `index`,
// `response`, `error`, `status`, ...).
import { compileExpr } from "./expr.ts";
import { type KeyType, type StateKey } from "./model.ts";

// ---- helpers usable in expressions (the subset has no method calls) ----

const asList = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const field = (row: unknown, f: unknown): unknown =>
  f === undefined || f === ""
    ? row
    : (row as Record<string, unknown> | null)?.[String(f)];
const numOf = (x: unknown): number => {
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
};
const text = (x: unknown): string =>
  x === null || x === undefined
    ? ""
    : typeof x === "object"
      ? JSON.stringify(x)
      : String(x);

export const HELPERS: Record<string, (...a: any[]) => unknown> = {
  contains: (a, b) => text(a).toLowerCase().includes(text(b).toLowerCase()),
  lower: (a) => text(a).toLowerCase(),
  upper: (a) => text(a).toUpperCase(),
  trim: (a) => text(a).trim(),
  len: (a) => (typeof a === "string" ? a.length : asList(a).length),
  str: (a) => text(a),
  num: (a) => numOf(a),
  round: (a, d) => {
    const k = 10 ** numOf(d);
    return Math.round(numOf(a) * k) / k;
  },
  sum: (l, f) => asList(l).reduce<number>((s, r) => s + numOf(field(r, f)), 0),
  avg: (l, f) => {
    const xs = asList(l);
    return xs.length
      ? xs.reduce<number>((s, r) => s + numOf(field(r, f)), 0) / xs.length
      : 0;
  },
  max: (l, f) => Math.max(0, ...asList(l).map((r) => numOf(field(r, f)))),
  min: (l, f) => {
    const xs = asList(l).map((r) => numOf(field(r, f)));
    return xs.length ? Math.min(...xs) : 0;
  },
  count: (l, f, v) =>
    v === undefined
      ? asList(l).length
      : asList(l).filter((r) => field(r, f) === v).length,
  where: (l, f, v) => asList(l).filter((r) => field(r, f) === v),
  pick: (l, f) => asList(l).map((r) => field(r, f)),
  join: (l, sep) =>
    asList(l)
      .map(text)
      .join(sep === undefined ? ", " : text(sep)),
  obj: (...kv) => {
    const o: Record<string, unknown> = {};
    for (let i = 0; i + 1 < kv.length; i += 2) o[text(kv[i])] = kv[i + 1];
    return o;
  },
  at: (l, i) => asList(l)[numOf(i)],
  first: (l) => asList(l)[0],
  last: (l) => asList(l)[asList(l).length - 1],
  sortBy: (l, f) =>
    [...asList(l)].sort((a, b) => {
      const x = field(a, f);
      const y = field(b, f);
      return typeof x === "number" && typeof y === "number"
        ? x - y
        : text(x).localeCompare(text(y));
    }),
};

export type Scope = Record<string, unknown>;

export function scopeOf(
  state: Record<string, unknown>,
  extras: Scope = {},
): Scope {
  return { ...HELPERS, ...extras, state };
}

// ---- expressions ----

export type Result =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

type Compiled = (scope: Scope) => unknown;

/**
 * Expressions come from a file the user may import, so the subset is kept to
 * plain reads: no way to reach `constructor` / `__proto__` and no computed
 * member access.
 */
export function unsafeExpr(src: string): string {
  if (
    /\b(constructor|__proto__|prototype|globalThis|window|document|Function|eval)\b/.test(
      src,
    )
  )
    return "This name is not allowed in an expression";
  if (/[\w)\]]\s*\[/.test(src) || /\?\.\s*\[/.test(src))
    return "Bracket access is not available: use at(list, i) or a path";
  return "";
}

function compile(src: string): Compiled | Error {
  const bad = unsafeExpr(src);
  return bad ? new Error(bad) : compileExpr(src);
}

export function evalExpr(src: string, scope: Scope): Result {
  if (!src.trim()) return { ok: true, value: undefined };
  const c = compile(src);
  if (c instanceof Error) return { ok: false, error: c.message };
  try {
    return { ok: true, value: c(scope) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** "" when the expression parses, else the message. */
export function exprError(src: string): string {
  if (!src.trim()) return "";
  const c = compile(src);
  return c instanceof Error ? c.message : "";
}

export const truthy = (
  src: string,
  scope: Scope,
  whenEmpty = true,
): boolean => {
  if (!src.trim()) return whenEmpty;
  const r = evalExpr(src, scope);
  return r.ok ? Boolean(r.value) : whenEmpty;
};

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** The value of an expression as a list (`[]` for anything else or an error). */
export function listOf(src: string, scope: Scope): unknown[] {
  const r = evalExpr(src, scope);
  return r.ok ? asArray(r.value) : [];
}

// ---- templates: text with {expression} holes ----

export type Part = string | { expr: string };

export function splitTemplate(src: string): Part[] {
  const parts: Part[] = [];
  let lit = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\" && src[i + 1] === "{") {
      lit += "{";
      i += 2;
    } else if (c === "{") {
      let depth = 1;
      let j = i + 1;
      let quote = "";
      while (j < src.length && depth > 0) {
        const d = src[j];
        if (quote) {
          if (d === quote) quote = "";
        } else if (d === '"' || d === "'") quote = d;
        else if (d === "{") depth++;
        else if (d === "}") depth--;
        j++;
      }
      if (depth === 0) {
        if (lit) parts.push(lit);
        lit = "";
        parts.push({ expr: src.slice(i + 1, j - 1) });
        i = j;
      } else {
        lit += c;
        i++;
      }
    } else {
      lit += c;
      i++;
    }
  }
  if (lit) parts.push(lit);
  return parts;
}

export const hasHoles = (src: string): boolean =>
  splitTemplate(src).some((p) => typeof p !== "string");

export const toText = text;

/** Fills the holes. A failing hole shows as `⚠ message` and is also returned. */
export function interpolate(
  src: string,
  scope: Scope,
): { text: string; errors: string[] } {
  const errors: string[] = [];
  const out = splitTemplate(src)
    .map((p) => {
      if (typeof p === "string") return p;
      const r = evalExpr(p.expr, scope);
      if (!r.ok) {
        errors.push(r.error);
        return "⚠";
      }
      return text(r.value);
    })
    .join("");
  return { text: out, errors };
}

export const fill = (src: string, scope: Scope): string =>
  interpolate(src, scope).text;

/** The expression errors of a template (for the inspector). */
export function templateError(src: string): string {
  for (const p of splitTemplate(src))
    if (typeof p !== "string") {
      const e = exprError(p.expr);
      if (e) return e;
    }
  return "";
}

/** The state keys a template or expression reads: `state.user.name` -> `user`. */
export function refsOf(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/(?<![\w.])state\.([A-Za-z_]\w*)/g))
    found.add(m[1]);
  return [...found];
}

// ---- paths into the state ----

export function getPath(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function setPath(
  data: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  if (
    !head ||
    head === "__proto__" ||
    head === "constructor" ||
    head === "prototype"
  )
    return data;
  if (rest.length === 0) return { ...data, [head]: value };
  const child = data[head];
  const base =
    child !== null && typeof child === "object" && !Array.isArray(child)
      ? (child as Record<string, unknown>)
      : {};
  return { ...data, [head]: setPath(base, rest.join("."), value) };
}

// ---- typed keys ----

export function parseInitial(k: StateKey): { value: unknown; error: string } {
  const t = k.initial.trim();
  switch (k.type) {
    case "string":
      return { value: k.initial, error: "" };
    case "number": {
      if (t === "") return { value: 0, error: "" };
      const n = Number(t);
      return Number.isFinite(n)
        ? { value: n, error: "" }
        : { value: 0, error: "Not a number" };
    }
    case "boolean":
      return {
        value: t === "true",
        error:
          t === "true" || t === "false" || t === "" ? "" : "Use true or false",
      };
    case "json":
      if (t === "") return { value: null, error: "" };
      try {
        return { value: JSON.parse(t), error: "" };
      } catch (e) {
        return {
          value: null,
          error: e instanceof Error ? e.message : "Invalid JSON",
        };
      }
  }
}

/** The state at the start: every key with its initial value. */
export function initialData(keys: StateKey[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k.key] = parseInitial(k).value;
  return out;
}

/** What an input writes to a key of this type. */
export function coerce(type: KeyType | undefined, value: unknown): unknown {
  if (type === "number") {
    const n = Number(value);
    return value === "" || !Number.isFinite(n) ? 0 : n;
  }
  if (type === "boolean") return value === true || value === "true";
  if (type === "string") return text(value);
  return value;
}
