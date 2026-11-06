// Pure routing: `METHOD /path/:param/*` -> a message id + params. No I/O, no
// state; the runtime (or `routed`) calls it while handling `http.request`.
import type { Effect, Message } from "@pavlus/core";

export type RouteTable = Record<string, string>;

export interface RouterOptions {
  /**
   * `ignore` (default): `/a/` is `/a`. `strict`: they are different paths.
   * `redirect`: `/a/` answers 308 to `/a` when `/a` exists (and vice versa).
   */
  trailingSlash?: "ignore" | "strict" | "redirect";
}

export type RouteResult =
  | {
      kind: "match";
      /** The message id the table maps to. */
      id: string;
      params: Record<string, string>;
      method: string;
      pattern: string;
      /** A HEAD request served by the GET route. */
      head?: boolean;
    }
  | { kind: "not_found" }
  | { kind: "method_not_allowed"; allow: string[] }
  /** Automatic OPTIONS answer. */
  | { kind: "options"; allow: string[] }
  | { kind: "redirect"; status: 308; location: string }
  /** The path has a malformed percent escape. */
  | { kind: "bad_request"; reason: string };

export interface Router {
  match(method: string, path: string): RouteResult;
  /** All `[method, pattern, id]`, in table order. */
  readonly routes: readonly (readonly [string, string, string])[];
}

interface Leaf {
  id: string;
  names: string[];
  pattern: string;
}
interface Node {
  statics: Map<string, Node>;
  param?: Node;
  /** Routes ending in `*`: they take the rest of the path. */
  wild?: Map<string, Leaf>;
  leaves: Map<string, Leaf>;
}
const node = (): Node => ({ statics: new Map(), leaves: new Map() });

const splitPath = (p: string): string[] => {
  const parts = p.split("/");
  parts.shift(); // leading empty
  return parts;
};

/** Compiles a route table once; `match` is then allocation-light. */
export function route(table: RouteTable, opts: RouterOptions = {}): Router {
  const policy = opts.trailingSlash ?? "ignore";
  const root = node();
  const routes: [string, string, string][] = [];

  for (const [key, id] of Object.entries(table)) {
    const m = /^([A-Za-z]+)\s+(\/\S*)$/.exec(key.trim());
    if (!m) throw new Error(`routing: bad route "${key}" (want "GET /path")`);
    const method = m[1]!.toUpperCase();
    let pattern = m[2]!;
    if (policy !== "strict" && pattern.length > 1 && pattern.endsWith("/"))
      pattern = pattern.slice(0, -1);
    const segs = splitPath(pattern);
    const names: string[] = [];
    let cur = root;
    let wildcard = false;
    segs.forEach((seg, i) => {
      if (wildcard) throw new Error(`routing: "*" must be last in "${key}"`);
      if (seg === "*") {
        wildcard = true;
        if (i !== segs.length - 1)
          throw new Error(`routing: "*" must be last in "${key}"`);
      } else if (seg.startsWith(":")) {
        if (seg.length < 2) throw new Error(`routing: empty param in "${key}"`);
        names.push(seg.slice(1));
        cur = cur.param ??= node();
      } else {
        let next = cur.statics.get(seg);
        if (!next) cur.statics.set(seg, (next = node()));
        cur = next;
      }
    });
    const leaf: Leaf = { id, names, pattern };
    const bucket = wildcard ? (cur.wild ??= new Map()) : cur.leaves;
    if (bucket.has(method))
      throw new Error(`routing: duplicate route "${method} ${pattern}"`);
    bucket.set(method, leaf);
    routes.push([method, m[2]!, id]);
  }

  /** Candidate nodes in rank order: static > param > wildcard. */
  function* walk(
    n: Node,
    segs: string[],
    i: number,
    values: string[],
  ): Generator<{ methods: Map<string, Leaf>; values: string[] }> {
    if (i === segs.length) {
      if (n.leaves.size) yield { methods: n.leaves, values: [...values] };
      return;
    }
    const seg = segs[i]!;
    const s = n.statics.get(seg);
    if (s) yield* walk(s, segs, i + 1, values);
    if (n.param && seg !== "") {
      values.push(seg);
      yield* walk(n.param, segs, i + 1, values);
      values.pop();
    }
    if (n.wild) {
      const rest = segs.slice(i);
      if (rest.some((x) => x !== ""))
        yield { methods: n.wild, values: [...values, rest.join("/")] };
    }
  }

  function decode(segsRaw: string[]): { segs: string[] } | { error: string } {
    const out: string[] = [];
    for (const s of segsRaw) {
      try {
        out.push(decodeURIComponent(s));
      } catch {
        return { error: "malformed percent-encoding" };
      }
    }
    return { segs: out };
  }

  function lookup(
    method: string,
    path: string,
  ): RouteResult | { allowed: Set<string> } {
    const raw = splitPath(path);
    const dec = decode(raw);
    if ("error" in dec) return { kind: "bad_request", reason: dec.error };
    const allowed = new Set<string>();
    let found: { leaf: Leaf; values: string[]; head: boolean } | undefined;
    // a decoded "/" inside a segment must not split it: walk the decoded parts
    for (const c of walk(root, dec.segs, 0, [])) {
      for (const k of c.methods.keys()) allowed.add(k);
      if (found) continue;
      const direct = c.methods.get(method);
      if (direct) found = { leaf: direct, values: c.values, head: false };
      else if (method === "HEAD" && c.methods.get("GET"))
        found = { leaf: c.methods.get("GET")!, values: c.values, head: true };
    }
    if (found) {
      const params: Record<string, string> = Object.create(null);
      found.leaf.names.forEach((nm, i) => {
        params[nm] = found!.values[i]!;
      });
      const wildcardValue = found.values[found.leaf.names.length];
      if (wildcardValue !== undefined) params["*"] = wildcardValue;
      return {
        kind: "match",
        id: found.leaf.id,
        params: { ...params },
        method: found.head ? "GET" : method,
        pattern: found.leaf.pattern,
        ...(found.head && { head: true }),
      };
    }
    return { allowed };
  }

  const allowList = (s: Set<string>): string[] => {
    const a = new Set(s);
    if (a.has("GET")) a.add("HEAD");
    if (a.size) a.add("OPTIONS");
    return [...a].sort();
  };

  return {
    routes,
    match(methodIn, pathIn) {
      const method = methodIn.toUpperCase();
      let path = pathIn.split("?")[0]!.split("#")[0]!;
      if (!path.startsWith("/")) return { kind: "not_found" };
      const slash = path.length > 1 && path.endsWith("/");
      if (slash && policy !== "strict") {
        const trimmed = path.replace(/\/+$/, "") || "/";
        if (policy === "redirect") {
          const t = lookup(method, trimmed);
          if ("kind" in t && t.kind === "match")
            return { kind: "redirect", status: 308, location: trimmed };
        }
        path = trimmed;
      }
      const r = lookup(method, path);
      if ("kind" in r) return r;
      if (r.allowed.size === 0) return { kind: "not_found" };
      const allow = allowList(r.allowed);
      if (method === "OPTIONS") return { kind: "options", allow };
      return { kind: "method_not_allowed", allow };
    },
  };
}

// ------------------------------------------------------- app integration ---

export interface HttpRequestPayload {
  method: string;
  path: string;
  params?: Record<string, string>;
  [k: string]: unknown;
}

const respond = (e: Record<string, unknown>): Effect => ({
  plugin: "http",
  type: "respond",
  ...e,
});

/**
 * Turns a router verdict into what happens next, purely: either the message
 * the handler should see (route id, `params` filled in), or the effects that
 * answer the request without the application (404, 405, OPTIONS, 308, 400).
 */
export function dispatchRoute(
  router: Router,
  msg: Message,
): { message: Message } | { effects: Effect[] } {
  const p = msg.payload as HttpRequestPayload;
  const r = router.match(p.method, p.path);
  switch (r.kind) {
    case "match":
      return {
        message: {
          ...msg,
          id: r.id,
          payload: { ...p, params: r.params, route: r.pattern },
        },
      };
    case "not_found":
      return {
        effects: [respond({ status: 404, json: { error: "not_found" } })],
      };
    case "method_not_allowed":
      return {
        effects: [
          respond({
            status: 405,
            headers: { allow: r.allow.join(", ") },
            json: { error: "method_not_allowed", allow: r.allow },
          }),
        ],
      };
    case "options":
      return {
        effects: [
          respond({ status: 204, headers: { allow: r.allow.join(", ") } }),
        ],
      };
    case "redirect":
      return {
        effects: [respond({ status: r.status, redirect: r.location })],
      };
    case "bad_request":
      return {
        effects: [
          respond({
            status: 400,
            json: { error: "bad_request", reason: r.reason },
          }),
        ],
      };
  }
}

/**
 * `routed(table)(msg, state)`: for an `http.request` message, the effects
 * that dispatch it to the route's message (via the `requests` plugin, which
 * re-dispatches with the same ctx) or answer 404/405/OPTIONS. Any other
 * message yields `[]`. Pure.
 */
export function toRouter(
  table: RouteTable | Router,
  opts?: RouterOptions,
): Router {
  return typeof (table as Router).match === "function"
    ? (table as Router)
    : route(table as RouteTable, opts);
}

export function routed(
  table: RouteTable | Router,
  opts?: RouterOptions,
): (msg: Message, state?: unknown) => Effect[] {
  const router = toRouter(table, opts);
  return (msg) => {
    if (msg.id !== "http.request") return [];
    const out = dispatchRoute(router, msg);
    if ("effects" in out) return out.effects;
    return [{ plugin: "requests", type: "dispatch", message: out.message }];
  };
}
