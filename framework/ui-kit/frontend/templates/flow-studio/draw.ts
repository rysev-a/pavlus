// A small drawing DSL for the built-in demos: nodes by short ids, edges by ids of
// nodes, modules by their bodies. Pure.
import { autoLayout } from "./layout.ts";
import {
  type EdgeKind,
  type FlowEdge,
  type FlowNode,
  type Model,
  type ModulePort,
  type NodeKind,
  type RequestSpec,
  addEdge,
  addNode,
  blankDef,
  blankPort,
  emptyModel,
  fieldsOf,
  newId,
  updateEdge,
} from "./model.ts";
import { addStage } from "./modules.ts";

/** A small drawing DSL: nodes by short ids, edges by ids of nodes. */
export class Draw {
  m: Model;
  constructor(name: string) {
    this.m = { ...emptyModel(), name };
  }
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
      /** the output port (by message id) of a module the edge leaves by */
      out?: string;
      /** the input port (by message id) of a module the edge arrives at */
      into?: string;
    } = {},
  ): this {
    const portOf = (node: string, dir: "outputs" | "inputs", name?: string) => {
      const n = this.m.nodes.find((x) => x.id === node);
      const def = this.m.modules.find((x) => x.id === n?.ref);
      return name ? def?.[dir].find((p) => p.name === name)?.id : undefined;
    };
    const fromPort = portOf(from, "outputs", o.out);
    const toPort = portOf(to, "inputs", o.into);
    const r = addEdge(this.m, from, to, {
      ...(fromPort ? { fromPort } : {}),
      ...(toPort ? { toPort } : {}),
      kind: o.kind,
      msg,
      port: o.port,
      cond: o.cond ?? "",
      latency: o.latency ?? 0,
      payload: o.payload ? fieldsOf(o.payload) : [],
    });
    if (r) this.m = r.model;
    else
      throw new Error(`demo edge ${from} -> ${to} ${msg ?? ""} was not made`);
    return this;
  }
  /** the onError edge of an effect */
  err(from: string, to: string): this {
    return this.e(from, to, undefined, {
      port: "err",
      payload: "code:string=ECONNRESET; message:string=dependency failed",
    });
  }
  conds(c: Record<string, boolean>): this {
    this.m = { ...this.m, conds: c };
    return this;
  }
  requests(r: RequestSpec[]): this {
    this.m = { ...this.m, scenario: { ...this.m.scenario, requests: r } };
    return this;
  }
  done(): Model {
    return autoLayout(this.m);
  }
  /**
   * A module of the library: `draw` draws its body, the ports bind a message id to
   * a node of that body. The ids of the body come from the counter of the project.
   */
  module(
    id: string,
    name: string,
    side: "frontend" | "backend",
    draw: (b: Draw) => void,
    inputs: [string, string][],
    outputs: [string, string, boolean?][],
    plugins: string[] = [],
  ): this {
    const b = new Draw(name);
    b.m = { ...b.m, seq: this.m.seq };
    draw(b);
    let m: Model = { ...this.m, seq: b.m.seq };
    const port = ([msg, node, pass]: [
      string,
      string,
      boolean?,
    ]): ModulePort => {
      const made = newId(m, "p");
      m = made.model;
      return blankPort(made.id, msg, node, { pass: pass === true });
    };
    const ins = inputs.map((i) => port(i));
    const outs = outputs.map((o) => port(o));
    const body = autoLayout(b.m);
    this.m = {
      ...m,
      modules: [
        ...m.modules,
        blankDef(id, name, side, {
          inputs: ins,
          outputs: outs,
          plugins,
          nodes: body.nodes,
          edges: body.edges,
        }),
      ],
    };
    return this;
  }
  /**
   * A module whose body is code. Ports are not bound to nodes: an input is a message
   * id (with the fields of its example payload), an output a port the code emits.
   */
  codeModule(
    id: string,
    name: string,
    side: "frontend" | "backend",
    source: string,
    inputs: { name: string; fields?: string }[],
    outputs: { name: string; pass?: boolean }[],
    plugins: string[] = [],
  ): this {
    let m = this.m;
    const port = (
      name: string,
      patch: Partial<ModulePort> = {},
    ): ModulePort => {
      const made = newId(m, "p");
      m = made.model;
      return blankPort(made.id, name, "", patch);
    };
    const ins = inputs.map((i) =>
      port(i.name, { fields: i.fields ? fieldsOf(i.fields) : [] }),
    );
    const outs = outputs.map((o) => port(o.name, { pass: o.pass === true }));
    this.m = {
      ...m,
      modules: [
        ...m.modules,
        blankDef(id, name, side, {
          body: "code",
          source,
          inputs: ins,
          outputs: outs,
          plugins,
        }),
      ],
    };
    return this;
  }

  /** A pipe of modules of the library, in order. */
  pipe(id: string, name: string, stages: string[]): this {
    let m: Model = {
      ...this.m,
      modules: [
        ...this.m.modules,
        blankDef(id, name, "backend", { body: "pipe" }),
      ],
    };
    for (const stage of stages) m = addStage(m, id, stage);
    this.m = m;
    return this;
  }

  setEdge(id: string, patch: Partial<FlowEdge>): this {
    this.m = updateEdge(this.m, id, patch);
    return this;
  }
}

export const req = (
  rid: string,
  entry: string,
  at: number,
  payload: Record<string, string> = {},
): RequestSpec => ({ rid, entry, at, payload });
