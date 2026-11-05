// A tiny drawing kit for the Flow Studio tests (not a test itself).
import {
  type EdgeKind,
  type FlowEdge,
  type FlowNode,
  type Model,
  type NodeKind,
  addEdge,
  addNode,
  emptyModel,
  fieldsOf,
} from "../templates/flow-studio/model.ts";
import { autoLayout } from "../templates/flow-studio/layout.ts";

export class Kit {
  m: Model = emptyModel();
  n(
    id: string,
    kind: NodeKind,
    title: string,
    patch: Partial<FlowNode> = {},
  ): this {
    this.m = addNode(this.m, kind, title, { ...patch, id, x: 0 }).model;
    return this;
  }
  e(
    from: string,
    to: string,
    msg?: string,
    o: {
      kind?: EdgeKind;
      cond?: string;
      payload?: string;
      port?: "out" | "ok" | "err";
      latency?: number;
    } = {},
  ): this {
    const r = addEdge(this.m, from, to, {
      kind: o.kind,
      msg,
      port: o.port,
      cond: o.cond ?? "",
      latency: o.latency ?? 0,
      payload: o.payload ? fieldsOf(o.payload) : [],
    });
    if (!r) throw new Error(`edge ${from} -> ${to} not made`);
    this.m = r.model;
    return this;
  }
  err(
    from: string,
    to: string,
    payload = "code:string=E; message:string=boom",
  ): this {
    return this.e(from, to, undefined, { port: "err", payload });
  }
  conds(c: Record<string, boolean>): this {
    this.m = { ...this.m, conds: c };
    return this;
  }
  req(
    rid: string,
    entry: string,
    at = 0,
    payload: Record<string, string> = {},
  ): this {
    this.m = {
      ...this.m,
      scenario: {
        ...this.m.scenario,
        requests: [...this.m.scenario.requests, { rid, entry, at, payload }],
      },
    };
    return this;
  }
  done(): Model {
    return autoLayout(this.m);
  }
}

export const edgeOf = (m: Model, from: string, to: string): FlowEdge =>
  m.edges.find((e) => e.from === from && e.to === to)!;

/**
 * GET /ping: client -> route -> handler -> pg.query -> reply -> handler -> respond,
 * with an onError path to a 500. Small enough to read, big enough to test with.
 */
export function ping(): Model {
  return new Kit()
    .n("xc", "external", "Client", { plugin: "http" })
    .n("rt", "route", "GET /ping", { detail: "ping.get" })
    .n("h1", "handler", "ping.get", {
      reqSet: { step: "query", who: "{payload.query.who}" },
    })
    .n("pg", "effect", "pg.query", { detail: "select 1" })
    .n("h2", "handler", "ping.found", {
      reqSet: { step: "answer", n: "{payload.rows.0.n}" },
    })
    .n("ok", "effect", "http.respond", {
      status: 200,
      detail: '{"n":"{req.n}","rid":"{rid}"}',
    })
    .n("bad", "error", "ping.failed", { reqSet: { step: "failed" } })
    .n("r500", "effect", "http.respond", {
      status: 500,
      detail: '{"error":"x"}',
    })
    .e("xc", "rt", "http.request", {
      payload: "method=GET; path=/ping; query.who=ann",
    })
    .e("rt", "h1", "ping.get")
    .e("h1", "pg", "pg.query")
    .e("pg", "h2", "ping.found", { payload: 'rows:array=[{"n":7}]' })
    .err("pg", "bad")
    .e("h2", "ok", "http.respond")
    .e("bad", "r500", "http.respond")
    .req("r1", "xc", 0)
    .done();
}
