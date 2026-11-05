/**
 * Route patterns: parsing, matching, ranking, URL building and the
 * type-level extraction of params from a path string.
 *
 * Syntax: `/users/:id` (param), `/users/:id?` (optional param),
 * `/files/*` or `/files/*rest` (wildcard, last segment, may be empty).
 *
 * @module
 */

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type Seg<P extends string> = P extends `${infer H}/${infer T}` ? H | Seg<T> : P;

type OptionalKeys<S> = S extends `:${infer N}?` ? N : never;
type RequiredKeys<S> = S extends `:${infer N}`
  ? N extends `${string}?`
    ? never
    : N
  : never;
type WildKeys<S> = S extends `*${infer N}` ? (N extends "" ? "*" : N) : never;

/** `ParamsOf<"/users/:id/:tab?">` is `{ id: string; tab?: string }`; a wildcard adds `"*"` (or its name). */
export type ParamsOf<P extends string> = string extends P
  ? Record<string, string>
  : Simplify<
      { [K in RequiredKeys<Seg<P>>]: string } & {
        [K in OptionalKeys<Seg<P>>]?: string;
      } & { [K in WildKeys<Seg<P>>]: string }
    >;

export type Params = Record<string, string>;

const STATIC = 5;
const END = 4;
const PARAM = 3;
const OPTIONAL = 2;
const WILD = 1;

export interface Segment {
  kind: number;
  /** Static text (lower-cased unless case sensitive) or the param name. */
  value: string;
  raw: string;
}

export function splitPath(path: string): string[] {
  return path.split("/").filter((s) => s !== "");
}

export function compilePattern(
  pattern: string,
  caseSensitive = false,
): Segment[] {
  const parts = splitPath(pattern);
  return parts.map((raw, i) => {
    if (raw.startsWith(":")) {
      const optional = raw.endsWith("?");
      const name = raw.slice(1, optional ? -1 : undefined);
      if (!name)
        throw new Error(`Maximus router: empty param name in "${pattern}"`);
      return { kind: optional ? OPTIONAL : PARAM, value: name, raw };
    }
    if (raw.startsWith("*")) {
      if (i !== parts.length - 1)
        throw new Error(
          `Maximus router: wildcard must be the last segment in "${pattern}"`,
        );
      return { kind: WILD, value: raw.slice(1) || "*", raw };
    }
    return {
      kind: STATIC,
      value: caseSensitive ? raw : raw.toLowerCase(),
      raw,
    };
  });
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Match compiled segments against a path; returns the params or `null`. */
export function matchSegments(
  segs: readonly Segment[],
  path: string,
  caseSensitive = false,
): Params | null {
  const parts = splitPath(path);
  const params: Params = {};
  const go = (i: number, j: number): boolean => {
    if (i === segs.length) return j === parts.length;
    const s = segs[i]!;
    switch (s.kind) {
      case STATIC:
        return (
          j < parts.length &&
          (caseSensitive ? parts[j] : decode(parts[j]!).toLowerCase()) ===
            s.value &&
          go(i + 1, j + 1)
        );
      case PARAM:
        if (j >= parts.length) return false;
        params[s.value] = decode(parts[j]!);
        if (go(i + 1, j + 1)) return true;
        delete params[s.value];
        return false;
      case OPTIONAL:
        if (j < parts.length) {
          params[s.value] = decode(parts[j]!);
          if (go(i + 1, j + 1)) return true;
          delete params[s.value];
        }
        return go(i + 1, j);
      default:
        params[s.value] = parts.slice(j).map(decode).join("/");
        return true;
    }
  };
  return go(0, 0) ? params : null;
}

/** Negative when `a` is more specific than `b`: static beats dynamic beats optional beats wildcard, segment by segment. */
export function compareSegments(
  a: readonly Segment[],
  b: readonly Segment[],
): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]?.kind ?? END;
    const y = b[i]?.kind ?? END;
    if (x !== y) return y - x;
  }
  return 0;
}

/** Join route pattern pieces: `("/users", ":id")` -> `/users/:id`. */
export function joinPatterns(
  parent: string,
  child: string | undefined,
): string {
  const parts = [...splitPath(parent), ...splitPath(child ?? "")];
  return "/" + parts.join("/");
}

/** Build a path from a pattern and params (values are URI-encoded). */
export function buildPath(
  pattern: string,
  params: Record<string, unknown> = {},
): string {
  const out: string[] = [];
  for (const raw of splitPath(pattern)) {
    if (raw.startsWith(":")) {
      const optional = raw.endsWith("?");
      const name = raw.slice(1, optional ? -1 : undefined);
      const v = params[name];
      if (v == null || v === "") {
        if (optional) continue;
        throw new Error(
          `Maximus router: missing param "${name}" for "${pattern}"`,
        );
      }
      out.push(encodeURIComponent(String(v)));
    } else if (raw.startsWith("*")) {
      const v = params[raw.slice(1) || "*"];
      if (v != null && v !== "")
        out.push(String(v).split("/").map(encodeURIComponent).join("/"));
    } else out.push(raw);
  }
  return "/" + out.join("/");
}

// ------------------------------------------------------------------ query

export type Query = Record<string, string | string[]>;

export function parseQuery(search: string): Query {
  const q: Query = {};
  const sp = new URLSearchParams(search);
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    q[key] = all.length > 1 ? all : all[0]!;
  }
  return q;
}

export function buildSearch(query: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const k of Object.keys(query)) {
    const v = query[k];
    if (v == null || v === false) continue;
    if (Array.isArray(v)) for (const x of v) sp.append(k, String(x));
    else sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? "?" + s : "";
}
