// Turns an `http.respond` effect into status + headers + body. Pure, so the
// fake http plugin in `testing` answers exactly like the real one.
import { createHash } from "node:crypto";
import { serializeCookie, type CookieOptions } from "./cookies.ts";

export interface RespondEffect {
  status?: number;
  headers?: Record<string, string | number | readonly string[]>;
  body?: string | Uint8Array;
  json?: unknown;
  text?: string;
  html?: string;
  /** URL, or `{ url, status }` (default 302). */
  redirect?: string | { url: string; status?: number };
  /** `{ name: value | { value, ...options } }`, or ready-made Set-Cookie strings. */
  cookies?:
    | Record<string, string | ({ value: string } & CookieOptions)>
    | readonly string[];
  /** Attachment file name for `Content-Disposition`. */
  download?: string;
  /** Add an ETag (GET/HEAD 200) and answer 304 on a match. */
  etag?: boolean;
}

export interface NormalizedResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: Buffer | undefined;
}

export interface NormalizeOptions {
  method?: string;
  etag?: boolean;
  ifNoneMatch?: string;
}

const NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const BAD_VALUE = /[\r\n\0]/;

export function checkHeader(name: string, value: string): void {
  if (!NAME.test(name)) throw new Error(`http: invalid header name "${name}"`);
  if (BAD_VALUE.test(value))
    throw new Error(`http: invalid value for header "${name}"`);
}

export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())}`;
}

/** Applies user headers over `into` (lowercased names, validated values). */
export function mergeHeaders(
  into: Record<string, string | string[]>,
  headers: RespondEffect["headers"],
): void {
  for (const [k, v] of Object.entries(headers ?? {})) {
    const name = k.toLowerCase();
    if (Array.isArray(v)) {
      v.forEach((x) => checkHeader(name, String(x)));
      into[name] = v.map(String);
    } else {
      checkHeader(name, String(v));
      into[name] = String(v);
    }
  }
}

function etagMatches(header: string, etag: string): boolean {
  const weak = (s: string) => s.replace(/^W\//, "");
  return header
    .split(",")
    .map((s) => s.trim())
    .some((t) => t === "*" || weak(t) === weak(etag));
}

export function normalizeRespond(
  e: RespondEffect,
  base: Record<string, string | string[]> = {},
  o: NormalizeOptions = {},
): NormalizedResponse {
  const headers: Record<string, string | string[]> = { ...base };
  let status = e.status;
  let body: Buffer | undefined;
  let type: string | undefined;

  if (e.redirect !== undefined) {
    const r = typeof e.redirect === "string" ? { url: e.redirect } : e.redirect;
    checkHeader("location", r.url);
    headers["location"] = r.url;
    status ??= (r as { status?: number }).status ?? 302;
  } else if (e.json !== undefined) {
    body = Buffer.from(JSON.stringify(e.json), "utf8");
    type = "application/json; charset=utf-8";
  } else if (e.html !== undefined) {
    body = Buffer.from(e.html, "utf8");
    type = "text/html; charset=utf-8";
  } else if (e.text !== undefined) {
    body = Buffer.from(e.text, "utf8");
    type = "text/plain; charset=utf-8";
  } else if (e.body !== undefined) {
    if (typeof e.body === "string") {
      body = Buffer.from(e.body, "utf8");
      type = "text/plain; charset=utf-8";
    } else {
      body = Buffer.from(e.body.buffer, e.body.byteOffset, e.body.byteLength);
      type = "application/octet-stream";
    }
  }
  status ??= 200;
  if (!Number.isInteger(status) || status < 200 || status > 599)
    throw new Error(`http: invalid status ${status}`);
  if (type && !("content-type" in headers)) headers["content-type"] = type;
  headers["x-content-type-options"] ??= "nosniff";
  mergeHeaders(headers, e.headers);

  if (e.download !== undefined)
    headers["content-disposition"] = contentDisposition(e.download);

  if (e.cookies) {
    const list: string[] = Array.isArray(e.cookies)
      ? (e.cookies as readonly string[]).map((c) => {
          if (BAD_VALUE.test(c)) throw new Error("http: invalid Set-Cookie");
          return c;
        })
      : Object.entries(e.cookies as Record<string, unknown>).map(([n, v]) =>
          typeof v === "string"
            ? serializeCookie(n, v)
            : (() => {
                const { value, ...rest } = v as {
                  value: string;
                } & CookieOptions;
                return serializeCookie(n, value, rest);
              })(),
        );
    const prev = headers["set-cookie"];
    headers["set-cookie"] = [
      ...(prev === undefined ? [] : Array.isArray(prev) ? prev : [prev]),
      ...list,
    ];
  }

  const bodiless = status === 204 || status === 304;
  if (bodiless) body = undefined;

  const m = (o.method ?? "GET").toUpperCase();
  if (
    (e.etag ?? o.etag) &&
    body &&
    status === 200 &&
    (m === "GET" || m === "HEAD")
  ) {
    const tag = `W/"${body.length.toString(16)}-${createHash("sha1").update(body).digest("base64url").slice(0, 16)}"`;
    headers["etag"] = tag;
    if (o.ifNoneMatch && etagMatches(o.ifNoneMatch, tag)) {
      status = 304;
      body = undefined;
      delete headers["content-type"];
      delete headers["content-disposition"];
    }
  }
  if (status === 204 || status === 304) delete headers["content-length"];
  else headers["content-length"] = String(body?.length ?? 0);
  return { status, headers, body };
}
