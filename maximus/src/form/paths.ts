/**
 * Path helpers: `"address.city"`, `"tags.0"` and `"tags[0].name"` address a
 * value inside the form data; updates are immutable (copy along the path).
 *
 * @module
 */

export type Segment = string | number;

const cache = new Map<string, Segment[]>();

/** `"a.b[2].c"` -> `["a", "b", 2, "c"]`. Digit-only segments are indexes. */
export function parsePath(path: string): Segment[] {
  let segs = cache.get(path);
  if (segs === undefined) {
    segs =
      path === ""
        ? []
        : path
            .replace(/\[(\w+)\]/g, ".$1")
            .split(".")
            .filter((s) => s !== "")
            .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
    if (cache.size > 2000) cache.clear();
    cache.set(path, segs);
  }
  return segs;
}

export function joinPath(segs: readonly Segment[]): string {
  return segs.join(".");
}

/** Canonical form of a path (`tags[0]` -> `tags.0`). */
export function normalizePath(path: string): string {
  return joinPath(parsePath(path));
}

export function getAt(obj: unknown, segs: readonly Segment[]): unknown {
  let cur = obj;
  for (const s of segs) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[s];
  }
  return cur;
}

/** A copy of `obj` with `value` at `segs`; containers along the path are copied, everything else is shared. */
export function setAt<T>(obj: T, segs: readonly Segment[], value: unknown): T {
  if (segs.length === 0) return value as T;
  const [head, ...rest] = segs as [Segment, ...Segment[]];
  const base =
    obj !== null && typeof obj === "object"
      ? obj
      : typeof head === "number"
        ? []
        : {};
  const child = (base as Record<string | number, unknown>)[head];
  const next = setAt(child, rest, value);
  if (Array.isArray(base)) {
    const copy = base.slice();
    copy[head as number] = next;
    return copy as T;
  }
  return { ...(base as object), [head]: next } as T;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  )
    return false;
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const proto = Object.getPrototypeOf(a) as unknown;
  if (
    proto !== Object.getPrototypeOf(b) ||
    (proto !== Object.prototype && proto !== Array.prototype && proto !== null)
  )
    return false; // File, Blob, class instances: identity only
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka)
    if (
      !deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      )
    )
      return false;
  return true;
}

/** `tags.0.name` -> `tags.*.name` (validators registered for a reactive path apply to every index). */
export function toPattern(path: string): string {
  return joinPath(
    parsePath(path).map((s) => (typeof s === "number" ? "*" : s)),
  );
}

/** All concrete paths in `data` that match a `*` pattern. */
export function expandPattern(pattern: string, data: unknown): string[] {
  const segs = pattern.split(".");
  let level: Array<{ path: Segment[]; value: unknown }> = [
    { path: [], value: data },
  ];
  for (const seg of segs) {
    const next: typeof level = [];
    for (const { path, value } of level) {
      if (seg === "*") {
        if (Array.isArray(value))
          value.forEach((v, i) => next.push({ path: [...path, i], value: v }));
        else if (value !== null && typeof value === "object")
          for (const k of Object.keys(value))
            next.push({
              path: [...path, k],
              value: (value as Record<string, unknown>)[k],
            });
      } else {
        const key: Segment = /^\d+$/.test(seg) ? Number(seg) : seg;
        next.push({
          path: [...path, key],
          value:
            value !== null && typeof value === "object"
              ? (value as Record<string | number, unknown>)[key]
              : undefined,
        });
      }
    }
    level = next;
  }
  return level.map((l) => joinPath(l.path));
}
