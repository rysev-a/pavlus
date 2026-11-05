// Cookies: parsing the Cookie header and serialising Set-Cookie with safe
// defaults (HttpOnly, Secure, SameSite=Lax, Path=/).

export interface CookieOptions {
  /** Seconds. */
  maxAge?: number;
  expires?: Date | number;
  domain?: string;
  /** Default `/`. */
  path?: string;
  /** Default true. */
  secure?: boolean;
  /** Default true. */
  httpOnly?: boolean;
  /** Default `Lax`. `false` leaves the attribute out. `None` forces `Secure`. */
  sameSite?: "Strict" | "Lax" | "None" | false;
  partitioned?: boolean;
}

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const ATTR = /^[^;\r\n\0]*$/;

/** `a=1; b=hello%20world` -> `{ a: "1", b: "hello world" }`. First wins. */
export function parseCookies(
  header: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name || name === "__proto__" || name in out) continue;
    let value = part.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
      value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/** One `Set-Cookie` header value. Throws on names/attributes that could inject headers. */
export function serializeCookie(
  name: string,
  value: string,
  opts: CookieOptions = {},
): string {
  if (!TOKEN.test(name)) throw new Error(`cookie: invalid name "${name}"`);
  let s = `${name}=${encodeURIComponent(value)}`;
  const path = opts.path ?? "/";
  if (!ATTR.test(path)) throw new Error("cookie: invalid path");
  if (opts.domain !== undefined) {
    if (!ATTR.test(opts.domain)) throw new Error("cookie: invalid domain");
    s += `; Domain=${opts.domain}`;
  }
  s += `; Path=${path}`;
  if (opts.maxAge !== undefined) {
    if (!Number.isFinite(opts.maxAge))
      throw new Error("cookie: invalid maxAge");
    s += `; Max-Age=${Math.floor(opts.maxAge)}`;
  }
  if (opts.expires !== undefined) {
    const d = new Date(opts.expires);
    if (Number.isNaN(d.getTime())) throw new Error("cookie: invalid expires");
    s += `; Expires=${d.toUTCString()}`;
  }
  const sameSite = opts.sameSite === undefined ? "Lax" : opts.sameSite;
  if (opts.httpOnly ?? true) s += "; HttpOnly";
  if ((opts.secure ?? true) || sameSite === "None") s += "; Secure";
  if (sameSite) s += `; SameSite=${sameSite}`;
  if (opts.partitioned) s += "; Partitioned";
  return s;
}

/** A `Set-Cookie` that makes the browser forget `name`. */
export function clearCookie(name: string, opts: CookieOptions = {}): string {
  return serializeCookie(name, "", { ...opts, maxAge: 0, expires: 0 });
}
