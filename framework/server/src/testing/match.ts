// Structural matching used by `scenario` (and handy in tests): partial objects,
// regexps for strings, predicates, exact arrays.

export type Pattern = unknown;

/** Returns a description of the first mismatch, or `undefined` when it matches. */
export function mismatch(
  actual: unknown,
  pattern: Pattern,
  path = "$",
): string | undefined {
  if (typeof pattern === "function")
    return (pattern as (a: unknown) => unknown)(actual)
      ? undefined
      : `${path}: predicate returned false for ${show(actual)}`;
  if (pattern instanceof RegExp)
    return typeof actual === "string" && pattern.test(actual)
      ? undefined
      : `${path}: ${show(actual)} does not match ${pattern}`;
  if (Array.isArray(pattern)) {
    if (!Array.isArray(actual) || actual.length !== pattern.length)
      return `${path}: expected array of ${pattern.length}, got ${show(actual)}`;
    for (let i = 0; i < pattern.length; i++) {
      const m = mismatch(actual[i], pattern[i], `${path}[${i}]`);
      if (m) return m;
    }
    return undefined;
  }
  if (pattern && typeof pattern === "object") {
    if (!actual || typeof actual !== "object")
      return `${path}: expected object, got ${show(actual)}`;
    if (pattern instanceof Uint8Array || actual instanceof Uint8Array)
      return Buffer.from(pattern as Uint8Array).equals(actual as Uint8Array)
        ? undefined
        : `${path}: bytes differ`;
    for (const [k, v] of Object.entries(pattern)) {
      const m = mismatch(
        (actual as Record<string, unknown>)[k],
        v,
        `${path}.${k}`,
      );
      if (m) return m;
    }
    return undefined;
  }
  return Object.is(actual, pattern)
    ? undefined
    : `${path}: expected ${show(pattern)}, got ${show(actual)}`;
}

export function show(v: unknown): string {
  try {
    return (
      JSON.stringify(v, (_k, x) =>
        x instanceof Uint8Array ? `<${x.length} bytes>` : x,
      ) ?? String(v)
    );
  } catch {
    return String(v);
  }
}

export const matches = (actual: unknown, pattern: Pattern): boolean =>
  mismatch(actual, pattern) === undefined;
