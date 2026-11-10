export const DEFAULT_REDACT = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "privatekey",
  "creditcard",
  "cardnumber",
  "cvv",
];

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Returns a JSON-safe copy of `value` where every key whose normalised name
 * (lower case, no `-`/`_`) contains one of `redact` has the value replaced.
 */
export function sanitize(
  value: unknown,
  redact: string[],
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (value === undefined) return undefined;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol")
    return String(value);
  const obj = value as object;
  if (obj instanceof Date) return obj.toISOString();
  if (obj instanceof Error)
    return {
      name: obj.name,
      message: obj.message,
      stack: obj.stack,
      ...(sanitize({ ...obj }, redact, depth + 1, seen) as object),
    };
  if (obj instanceof Uint8Array) return `[Binary ${obj.byteLength} bytes]`;
  if (seen.has(obj)) return "[Circular]";
  if (depth >= 8) return "[Depth]";
  seen.add(obj);
  let out: unknown;
  if (Array.isArray(obj))
    out = obj.map((v) => sanitize(v, redact, depth + 1, seen));
  else if (obj instanceof Map)
    out = sanitize(Object.fromEntries(obj), redact, depth, seen);
  else if (obj instanceof Set)
    out = [...obj].map((v) => sanitize(v, redact, depth + 1, seen));
  else {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const nk = norm(k);
      o[k] = redact.some((r) => nk.includes(r))
        ? "[REDACTED]"
        : sanitize(v, redact, depth + 1, seen);
    }
    out = o;
  }
  seen.delete(obj);
  return out;
}
