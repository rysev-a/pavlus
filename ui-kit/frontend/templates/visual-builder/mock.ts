// The mock server: routes (method + path -> status + JSON + delay) that answer
// instead of the network, because the site is static. Pure.
import type { MockRoute } from "./model.ts";

export interface MockResponse {
  status: number;
  data: unknown;
  delay: number;
  /** the route that answered ("" for the 404 of an unknown path) */
  route: string;
}

export interface Parsed {
  path: string;
  query: Record<string, string>;
}

/** `https://x.test/api/users?q=a` -> `/api/users` + `{ q: "a" }` */
export function parseUrl(url: string): Parsed {
  const noOrigin = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
  const [pathPart, queryPart = ""] = noOrigin.split("?");
  const query: Record<string, string> = {};
  for (const pair of queryPart.split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    try {
      query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
    } catch {
      query[k] = v;
    }
  }
  const path = ("/" + pathPart.replace(/^\/+/, "")).replace(/(.)\/+$/, "$1");
  return { path, query };
}

/** Matches `/api/users/:id` or `/api/*` against a path; the params, or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = parseUrl(pattern).path.split("/").filter(Boolean);
  const a = path.split("/").filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "*") return params;
    if (i >= a.length) return null;
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return p.length === a.length ? params : null;
}

function fillTokens(v: unknown, params: Record<string, string>, query: Record<string, string>): unknown {
  if (typeof v === "string") {
    const m = /^\$(param|query):(\w+)$/.exec(v);
    if (!m) return v;
    const raw = (m[1] === "param" ? params : query)[m[2]] ?? "";
    return raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
  }
  if (Array.isArray(v)) return v.map((x) => fillTokens(x, params, query));
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, fillTokens(x, params, query)]),
    );
  return v;
}

export function routeMock(routes: MockRoute[], method: string, url: string): MockResponse {
  const { path, query } = parseUrl(url);
  const m = method.toUpperCase() || "GET";
  for (const r of routes) {
    if (r.method.toUpperCase() !== m && r.method !== "*") continue;
    const params = matchPath(r.path, path);
    if (!params) continue;
    let data: unknown = null;
    try {
      data = r.body.trim() ? fillTokens(JSON.parse(r.body), params, query) : null;
    } catch {
      return { status: 500, data: { error: `Mock route ${r.path} has invalid JSON` }, delay: r.delay, route: r.id };
    }
    return { status: r.status, data, delay: r.delay, route: r.id };
  }
  return { status: 404, data: { error: `No mock route for ${m} ${path}` }, delay: 0, route: "" };
}

export const isOk = (status: number): boolean => status >= 200 && status < 300;
