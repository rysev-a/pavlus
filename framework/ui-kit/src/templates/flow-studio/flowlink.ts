// The link between a Flow Studio design and something that talks to it, the Visual
// Builder first: the routes the design offers, and a call that runs one request through
// the design (against the tables, which the caller keeps between calls). The design is
// the backend: what the Visual Builder used to get from hand-written mock routes, it
// gets from the flow. Pure.
import type { Action } from "../visual-builder/model.ts";
import { matchPath, parseUrl } from "../visual-builder/mock.ts";
import { type Trace, outcomes, runFlow } from "./engine.ts";
import {
  type FlowNode,
  type Model,
  type PayloadField,
  inEdges,
  outEdges,
} from "./model.ts";
import { flatten } from "./modules.ts";
import type { Db } from "./store.ts";

/** One route of the design, as the other side sees it. */
export interface FlowRoute {
  /** the id of the route node in the flattened design */
  id: string;
  method: string;
  /** `/customers/:id` */
  path: string;
  /** the message id the route rewrites the request into */
  msg: string;
  /** the fields the design says the browser sends in the body / the query */
  body: PayloadField[];
  query: PayloadField[];
  /** the names of the `:params` */
  params: string[];
  /** the statuses the design answers with (those of its `http.respond` nodes) */
  statuses: number[];
  /** the keys of the JSON a success answers with (read from the node, so no run) */
  keys: string[];
}

const split = (title: string): { method: string; path: string } => {
  const m = /^(\w+)\s+(\S+)/.exec(title.trim());
  return { method: (m?.[1] ?? "GET").toUpperCase(), path: m?.[2] ?? title };
};

/** the `http.respond` nodes a route can reach */
function respondsOf(m: Model, route: FlowNode): FlowNode[] {
  const seen = new Set<string>([route.id]);
  const todo = [route.id];
  const out: FlowNode[] = [];
  while (todo.length) {
    const id = todo.pop()!;
    for (const e of outEdges(m, id)) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      todo.push(e.to);
      const n = m.nodes.find((x) => x.id === e.to);
      if (n?.kind === "effect" && n.title === "http.respond") out.push(n);
    }
  }
  return out;
}

/** the top-level keys of a JSON text with `{refs}` in its strings, [] when it is not one */
function keysOf(detail: string): string[] {
  try {
    const v = JSON.parse(detail);
    return v && typeof v === "object" && !Array.isArray(v)
      ? Object.keys(v)
      : [];
  } catch {
    return [];
  }
}

export function routesOf(source: Model): FlowRoute[] {
  const m = flatten(source);
  return m.nodes
    .filter((n) => n.kind === "route" && !/^WS\b/i.test(n.title))
    .map((n) => {
      const { method, path } = split(n.title);
      const fields = inEdges(m, n.id).flatMap((e) => e.payload);
      const under = (prefix: string): PayloadField[] =>
        fields
          .filter((f) => f.name.startsWith(prefix))
          .map((f) => ({ ...f, name: f.name.slice(prefix.length) }))
          .filter((f, i, all) => all.findIndex((o) => o.name === f.name) === i);
      return {
        id: n.id,
        method,
        path,
        msg: n.detail,
        body: under("body."),
        query: under("query."),
        params: [...path.matchAll(/:(\w+)/g)].map((x) => x[1]),
        statuses: [
          ...new Set(respondsOf(m, n).map((r) => r.status || 200)),
        ].sort((a, b) => a - b),
        keys:
          keysOf(
            respondsOf(m, n).find((r) => (r.status || 200) < 300)?.detail ?? "",
          ) ?? [],
      };
    });
}

/** `/orders/:id` -> `/orders/{state.orderId}`; the query fields follow as `?q={state.q}` */
function urlTemplate(r: FlowRoute): string {
  const resource =
    r.path
      .split("/")
      .filter((s) => s && !s.startsWith(":"))
      .pop() ?? "item";
  const one = resource.replace(/s$/, "");
  const path = r.path.replace(
    /:(\w+)/g,
    (_, p: string) => `{state.${p === "id" ? `${one}Id` : p}}`,
  );
  const query = r.query.map((f) => `${f.name}={state.${f.name}}`).join("&");
  return query ? `${path}?${query}` : path;
}

/**
 * What a Visual Builder HTTP action looks like when it calls a route: the method,
 * the url with the state it reads, the body from the fields the design expects, and
 * a state key for the answer (the key of it when it is one, else the resource).
 */
export function routeAction(r: FlowRoute): Partial<Action> {
  const resource =
    r.path
      .split("/")
      .filter((s) => s && !s.startsWith(":"))
      .pop() ?? "data";
  const single = r.keys.length === 1 ? r.keys[0] : "";
  return {
    method: r.method,
    url: urlTemplate(r),
    body: r.body.length
      ? `obj(${r.body.map((f) => `"${f.name}", state.${f.name}`).join(", ")})`
      : "",
    okKey: single || `${resource}Result`,
    okPath: single,
    errKey: "apiError",
    loadingKey: "loading",
  };
}

export interface FlowCall {
  method: string;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface FlowAnswer {
  status: number;
  data: unknown;
  /** how long the design says the answer took, in ms (virtual) */
  delay: number;
  /** the id of the route that took the call ("" when none did) */
  route: string;
  /** the tables after the call */
  db: Db;
  trace: Trace;
}

/** Runs one request through the design. Never throws: a call no route takes is a 404. */
export function callFlow(source: Model, db: Db, call: FlowCall): FlowAnswer {
  const m = flatten(source);
  const { path, query } = parseUrl(call.url);
  const method = (call.method || "GET").toUpperCase();
  for (const r of routesOf(m)) {
    if (r.method !== method && r.method !== "*") continue;
    const params = matchPath(r.path, path);
    if (!params) continue;
    const data: Record<string, unknown> = {
      method,
      path,
      query,
      params,
      body: call.body ?? {},
      headers: call.headers ?? {},
    };
    const run = runFlow(
      m,
      {
        ...m.scenario,
        requests: [{ rid: "r1", entry: r.id, at: 0, payload: {}, data }],
      },
      1,
      db,
    );
    const reply = run.trace.find(
      (s) =>
        s.type === "effect" &&
        (s.effect as { plugin?: string; type?: string } | null)?.plugin ===
          "http" &&
        (s.effect as { type?: string }).type === "respond",
    );
    if (reply) {
      const fx = reply.effect as { status: number; json: unknown };
      return {
        status: fx.status,
        data: fx.json,
        delay: Math.round(reply.t),
        route: r.id,
        db: run.db,
        trace: run.trace,
      };
    }
    const o = outcomes(run.trace)[0];
    return {
      status: o?.status || 500,
      data: {
        error: `the flow did not answer (${o?.result ?? "no result"})`,
      },
      delay: Math.round(o?.ms ?? 0),
      route: r.id,
      db: run.db,
      trace: run.trace,
    };
  }
  return {
    status: 404,
    data: { error: `No route for ${method} ${path} in the diagram` },
    delay: 0,
    route: "",
    db,
    trace: [],
  };
}
