// Modules of a Flow Studio project: a module is a named piece of the design with an
// interface (ports, the state it touches, the plugins it needs) and a body of its
// own. An instance of it is a node of kind `module`. This file is pure model code:
//
// - `flatten` inlines every instance, so the engine, the checks, the catalog and
//   the code generator keep working on one flat graph;
// - the scope helpers (`modelAt`, `putAt`) show the body of a module as a model of
//   its own, so the whole editor edits a module the way it edits the top level;
// - the interface operations add, rename and rewire ports.
import { codeTemplate, missingOutputs } from "./code.ts";
import type { Step, Trace } from "./engine.ts";
import {
  type FlowEdge,
  type FlowNode,
  type Model,
  type ModuleDef,
  type ModulePort,
  type PayloadField,
  addNode,
  blankDef,
  blankEdge,
  blankNode,
  blankPort,
  defOf,
  findDef,
  newId,
  slugify,
} from "./model.ts";

/** the separator in the id of an inlined node: `auth/n3` is `n3` of instance `auth` */
export const SEP = "/";
/** instances inside instances stop being inlined at this depth (a cycle guard) */
export const MAX_DEPTH = 8;

// ---- flattening ----

interface Graph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

interface Expanded extends Graph {
  /**
   * The id (in the flattened graph) of the node a port of node `id` stands at:
   * `id` itself for a plain node or a module with code, the node a port is bound
   * to for an inlined instance (through the nested instances, by `via`).
   */
  at(id: string, dir: "in" | "out", portId: string, msg: string): string | null;
}

const hasModules = (nodes: FlowNode[]): boolean =>
  nodes.some((n) => n.kind === "module");

function expand(
  nodes: FlowNode[],
  edges: FlowEdge[],
  mods: Map<string, ModuleDef>,
  depth: number,
): Expanded {
  const outNodes: FlowNode[] = [];
  const outEdges: FlowEdge[] = [];
  const inst = new Map<string, { def: ModuleDef; graph: Expanded | null }>();
  for (const n of nodes) {
    if (n.kind !== "module") {
      outNodes.push(n);
      continue;
    }
    const def = mods.get(n.ref);
    if (!def || depth >= MAX_DEPTH) continue;
    if (def.body === "code") {
      // a module with code stays one node: the engine runs the code in it
      outNodes.push(
        blankNode(
          n.id,
          def.side === "frontend" ? "fe-handler" : "handler",
          n.title,
          {
            x: n.x,
            y: n.y,
            detail: def.about,
            note: n.note,
            code: {
              source: def.source,
              side: def.side,
              inputs: def.inputs,
              outputs: def.outputs,
            },
          },
        ),
      );
      inst.set(n.id, { def, graph: null });
      continue;
    }
    const graph = expand(def.nodes, def.edges, mods, depth + 1);
    inst.set(n.id, { def, graph });
    for (const x of graph.nodes)
      outNodes.push({ ...x, id: `${n.id}${SEP}${x.id}` });
    for (const e of graph.edges)
      outEdges.push({
        ...e,
        id: `${n.id}${SEP}${e.id}`,
        from: `${n.id}${SEP}${e.from}`,
        to: `${n.id}${SEP}${e.to}`,
      });
  }
  const at: Expanded["at"] = (id, dir, portId, msg) => {
    const hit = inst.get(id);
    if (!hit)
      return nodes.some((n) => n.id === id && n.kind !== "module") ? id : null;
    if (!hit.graph) return id;
    const ports = dir === "in" ? hit.def.inputs : hit.def.outputs;
    const port =
      ports.find((p) => p.id === portId) ??
      ports.find((p) => p.name === msg) ??
      ports[0];
    if (!port || !port.node) return null;
    const inner = hit.graph.at(port.node, dir, port.via, msg);
    return inner === null ? null : `${id}${SEP}${inner}`;
  };
  for (const e of edges) {
    const from = at(e.from, "out", e.fromPort, e.msg);
    const to = at(e.to, "in", e.toPort, e.msg);
    if (from && to) outEdges.push({ ...e, from, to });
  }
  return { nodes: outNodes, edges: outEdges, at };
}

/**
 * The model with every module instance inlined. Without instances it is the model
 * itself. The ids of inlined nodes and edges are `instance/inner`, so a trace of
 * the flat model can be mapped back to the boxes of the board.
 */
export function flatten(m: Model): Model {
  if (!hasModules(m.nodes)) return m;
  const mods = new Map(m.modules.map((d) => [d.id, d]));
  const g = expand(m.nodes, m.edges, mods, 0);
  return { ...m, nodes: g.nodes, edges: g.edges };
}

// ---- scopes: the body of a module as a model ----

/** The module a path of instance ids leads to, one instance per level. */
export function defAt(m: Model, path: string[]): ModuleDef | undefined {
  let graph: Graph = m;
  let def: ModuleDef | undefined;
  for (const id of path) {
    const n = graph.nodes.find((x) => x.id === id);
    def = n ? defOf(m, n) : undefined;
    if (!def) return undefined;
    graph = def;
  }
  return def;
}

/** Does the path lead somewhere? (A module can be deleted while it is open.) */
export const scopeValid = (m: Model, path: string[]): boolean =>
  path.length === 0 || defAt(m, path) !== undefined;

/** The model whose nodes and edges are the body of the module at `path`. */
export function modelAt(m: Model, path: string[]): Model {
  const def = defAt(m, path);
  return def ? { ...m, nodes: def.nodes, edges: def.edges } : m;
}

/**
 * The inverse of `modelAt`: `scoped` is the edited view of the body at `path`;
 * its nodes and edges go back into the module, everything else (the library, the
 * counter, the scenario) is taken as the editor left it.
 */
export function putAt(m: Model, path: string[], scoped: Model): Model {
  const def = defAt(m, path);
  if (!def) return scoped;
  return {
    ...scoped,
    nodes: m.nodes,
    edges: m.edges,
    modules: scoped.modules.map((d) =>
      d.id === def.id ? { ...d, nodes: scoped.nodes, edges: scoped.edges } : d,
    ),
  };
}

/** The id a node of the scope `path` has in the flattened model. */
export const flatId = (path: string[], id: string): string =>
  [...path, id].join(SEP);

/**
 * A flat id seen from a scope: "" when it is outside the scope, the id of the
 * instance box when it is deeper, the plain id when it is a node of the scope.
 */
export function localId(path: string[], id: string): string {
  const prefix = path.length ? `${path.join(SEP)}${SEP}` : "";
  let rest = id;
  if (prefix) {
    if (!id.startsWith(prefix)) return "";
    rest = id.slice(prefix.length);
  }
  const cut = rest.indexOf(SEP);
  return cut < 0 ? rest : rest.slice(0, cut);
}

/** Where a flat id lives: the scope to open, and the id there. */
export function locate(id: string): { path: string[]; id: string } {
  const parts = id.split(SEP);
  return { path: parts.slice(0, -1), id: parts[parts.length - 1] ?? id };
}

/** The names of the instances on the way down to a scope, for the breadcrumb. */
export function crumbs(
  m: Model,
  path: string[],
): { path: string[]; title: string; module: string }[] {
  const out: { path: string[]; title: string; module: string }[] = [];
  let graph: Graph = m;
  path.forEach((id, i) => {
    const n = graph.nodes.find((x) => x.id === id);
    const def = n ? defOf(m, n) : undefined;
    out.push({
      path: path.slice(0, i + 1),
      title: n?.title ?? id,
      module: def?.name ?? "",
    });
    if (def) graph = def;
  });
  return out;
}

/**
 * A trace of the flat model, seen from a scope: ids inside the scope lose its
 * prefix, ids deeper down collapse to the instance box they are inside, ids
 * outside the scope are left as they are (the board has no such node).
 */
export function traceIn(trace: Trace | null, path: string[]): Trace | null {
  if (!trace) return trace;
  const prefix = path.length ? `${path.join(SEP)}${SEP}` : "";
  const map = (id: string): string => {
    if (!id) return id;
    if (prefix) {
      if (!id.startsWith(prefix)) return id;
      id = id.slice(prefix.length);
    }
    const cut = id.indexOf(SEP);
    return cut < 0 ? id : id.slice(0, cut);
  };
  // an edge inside a deeper instance has no line on this board
  const mapEdge = (id: string): string => {
    if (!id || /^(cancel|abort|timeout|abortmsg):/.test(id)) return id;
    if (prefix && !id.startsWith(prefix)) return id;
    const rest = prefix ? id.slice(prefix.length) : id;
    return rest.includes(SEP) ? "" : rest;
  };
  if (!prefix && !trace.some((s) => hasSep(s))) return trace;
  return trace.map(
    (s): Step => ({
      ...s,
      from: map(s.from),
      to: map(s.to),
      edge: mapEdge(s.edge),
      inflight: [...new Set(s.inflight.map(map))],
    }),
  );
}

const hasSep = (s: Step): boolean =>
  s.from.includes(SEP) ||
  s.to.includes(SEP) ||
  s.edge.includes(SEP) ||
  s.inflight.some((i) => i.includes(SEP));

// ---- the library ----

/** The ports of a module by the node they are bound to: for the badges on the board. */
export function badgesOf(
  def: ModuleDef | undefined,
): Record<string, { ins: string[]; outs: string[] }> {
  const out: Record<string, { ins: string[]; outs: string[] }> = {};
  if (!def) return out;
  const at = (id: string) => (out[id] ??= { ins: [], outs: [] });
  for (const p of def.inputs) if (p.node) at(p.node).ins.push(p.name);
  for (const p of def.outputs) if (p.node) at(p.node).outs.push(p.name);
  return out;
}

/** Every instance of a module, at any depth: where it is used. */
export function usesOf(m: Model, defId: string): number {
  let n = 0;
  const graphs: Graph[] = [m, ...m.modules];
  for (const g of graphs)
    for (const x of g.nodes) if (x.kind === "module" && x.ref === defId) n++;
  return n;
}

/** The modules a module has instances of, directly. */
const childrenOf = (d: ModuleDef): string[] => [
  ...new Set(d.nodes.filter((n) => n.kind === "module").map((n) => n.ref)),
];

/** May `inner` be instantiated inside `host` (host = "" is the top level)? */
export function canNest(m: Model, host: string, inner: string): boolean {
  if (!host) return !!findDef(m, inner);
  const seen = new Set<string>();
  const reaches = (from: string): boolean => {
    if (from === host) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    const d = findDef(m, from);
    return !!d && childrenOf(d).some(reaches);
  };
  return !!findDef(m, inner) && !reaches(inner);
}

const portOf = (
  m: Model,
  name: string,
  node: string,
  fields: PayloadField[] = [],
): { model: Model; port: ModulePort } => {
  const made = newId(m, "p");
  return {
    model: made.model,
    port: blankPort(made.id, name, node, { fields }),
  };
};

/**
 * A new module with a body of one handler, an input port and an output port bound
 * to it: the smallest thing that can be wired and then opened and filled in.
 */
export function addModule(
  m: Model,
  name: string,
  side: ModuleDef["side"] = "backend",
  body: ModuleDef["body"] = "graph",
): { model: Model; id: string } {
  const slug = slugify(name || "module");
  if (body === "code") {
    const id = newId(m, "mod");
    const inp = portOf(id.model, `${slug}.in`, "");
    const out = portOf(inp.model, `${slug}.out`, "");
    const def = blankDef(id.id, name || "module", side, {
      body: "code",
      source: codeTemplate(`${slug}.in`, `${slug}.out`),
      inputs: [inp.port],
      outputs: [out.port],
    });
    return {
      model: { ...out.model, modules: [...out.model.modules, def] },
      id: id.id,
    };
  }
  const id = newId(m, "mod");
  let model = id.model;
  const nid = newId(model, "n");
  model = nid.model;
  const handler = blankNode(nid.id, "handler", `${slug}.run`, {
    detail: "the body of the module",
    x: 40,
    y: 16,
  });
  const inp = portOf(model, `${slug}.in`, handler.id);
  const out = portOf(inp.model, `${slug}.out`, handler.id);
  const def: ModuleDef = blankDef(id.id, name || "module", side, {
    inputs: [inp.port],
    outputs: [out.port],
    nodes: [side === "frontend" ? { ...handler, kind: "fe-handler" } : handler],
  });
  return {
    model: { ...out.model, modules: [...out.model.modules, def] },
    id: id.id,
  };
}

/** Changes a module. A new side moves its instances to the lane of that side. */
export function updateModule(
  m: Model,
  id: string,
  patch: Partial<Omit<ModuleDef, "id" | "nodes" | "edges">>,
): Model {
  const old = findDef(m, id);
  if (!old) return m;
  const next = { ...old, ...patch };
  const lane = next.side === "frontend" ? "browser" : "app";
  const fix = (n: FlowNode): FlowNode =>
    n.kind === "module" && n.ref === id
      ? {
          ...n,
          lane,
          title: n.title === old.name ? next.name : n.title,
        }
      : n;
  return {
    ...m,
    nodes: m.nodes.map(fix),
    modules: m.modules.map((d) =>
      d.id === id ? next : { ...d, nodes: d.nodes.map(fix) },
    ),
  };
}

/**
 * Switches the body of a module. A module that becomes code starts from the
 * template when it has no code yet; one that becomes a graph keeps its nodes.
 */
export function setBody(m: Model, id: string, body: ModuleDef["body"]): Model {
  const d = findDef(m, id);
  if (!d || d.body === body) return m;
  const slug = slugify(d.name);
  const source =
    body === "code" && d.source.trim() === ""
      ? codeTemplate(
          d.inputs[0]?.name ?? `${slug}.in`,
          d.outputs[0]?.name ?? `${slug}.out`,
        )
      : d.source;
  const next = {
    ...m,
    modules: m.modules.map((x) => (x.id === id ? { ...x, body, source } : x)),
  };
  return body === "pipe" ? syncPipe(next, id) : next;
}

/** Adds an output port for each effect the code emits for its examples and no port has. */
export function syncPorts(m: Model, id: string): Model {
  const d = findDef(m, id);
  if (!d || d.body !== "code") return m;
  let model = m;
  const added: ModulePort[] = [];
  for (const name of missingOutputs(d, m.plugins)) {
    const p = portOf(model, name, "");
    model = p.model;
    added.push(p.port);
  }
  if (added.length === 0) return m;
  return {
    ...model,
    modules: model.modules.map((x) =>
      x.id === id ? { ...x, outputs: [...x.outputs, ...added] } : x,
    ),
  };
}

/**
 * Code that arrives with an import is not run: it is held (moved out of `source`)
 * until the person enables it, because running it is running a stranger's script.
 */
export const holdCode = (m: Model): Model => ({
  ...m,
  modules: m.modules.map((d) =>
    d.body === "code" && d.source.trim() !== ""
      ? { ...d, held: d.source, source: "" }
      : d,
  ),
});

export const releaseCode = (m: Model): Model => ({
  ...m,
  modules: m.modules.map((d) =>
    d.held !== "" ? { ...d, source: d.held, held: "" } : d,
  ),
});

export const heldCount = (m: Model): number =>
  m.modules.filter((d) => d.held !== "").length;

// ---- pipes: a chain of modules, the middleware of a route ----

/** the distance between two stages of a pipe on its board */
const STAGE_DX = 236;

/**
 * Rebuilds the generated parts of a pipe from its stages: the instances in a row,
 * an edge from the pass-through output of each stage to the input of the next, and
 * the ports of the pipe itself: the inputs of the first stage, and every output that
 * does not pass the message on (a short circuit) or that ends the chain. The ids of
 * the generated edges and ports follow from the stage and the inner port, so the
 * edges that were drawn to the pipe keep their ports when a stage is added.
 */
export function syncPipe(m: Model, id: string): Model {
  const d = findDef(m, id);
  if (!d || d.body !== "pipe") return m;
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const kept = d.stages.filter((s) => byId.get(s)?.kind === "module");
  const fresh = d.nodes
    .filter((n) => n.kind === "module" && !kept.includes(n.id))
    .map((n) => n.id);
  const stages = [...kept, ...fresh];
  const nodes = stages.map((sid, i) => ({
    ...byId.get(sid)!,
    x: 8 + i * STAGE_DX,
    y: 16,
  }));
  const defs = stages.map((sid) => findDef(m, byId.get(sid)!.ref));
  const edges: FlowEdge[] = [];
  const inputs: ModulePort[] = [];
  const outputs: ModulePort[] = [];
  stages.forEach((sid, i) => {
    const sd = defs[i];
    if (!sd) return;
    if (i === 0)
      for (const p of sd.inputs)
        inputs.push(
          blankPort(`in:${sid}:${p.id}`, p.name, sid, {
            fields: p.fields,
            via: p.id,
          }),
        );
    const next = defs[i + 1]?.inputs[0];
    for (const p of sd.outputs) {
      if (p.pass && next)
        edges.push(
          blankEdge(
            `pipe:${sid}:${p.id}`,
            sid,
            stages[i + 1],
            "request",
            next.name,
            {
              fromPort: p.id,
              toPort: next.id,
            },
          ),
        );
      else
        outputs.push(
          blankPort(`out:${sid}:${p.id}`, p.name, sid, {
            fields: p.fields,
            via: p.id,
            pass: p.pass,
          }),
        );
    }
  });
  return {
    ...m,
    modules: m.modules.map((x) =>
      x.id === id ? { ...x, stages, nodes, edges, inputs, outputs } : x,
    ),
  };
}

/** A new pipe: an empty chain. */
export function addPipe(
  m: Model,
  name: string,
  side: ModuleDef["side"] = "backend",
): { model: Model; id: string } {
  const id = newId(m, "mod");
  const def = blankDef(id.id, name, side, { body: "pipe" });
  return {
    model: { ...id.model, modules: [...id.model.modules, def] },
    id: id.id,
  };
}

/** Appends a stage: an instance of `stage` at the end of the chain. */
export function addStage(m: Model, pipe: string, stage: string): Model {
  const d = findDef(m, pipe);
  const sd = findDef(m, stage);
  if (!d || d.body !== "pipe" || !sd || !canNest(m, pipe, stage)) return m;
  const made = newId(m, "n");
  const node = blankNode(made.id, "module", sd.name, {
    ref: sd.id,
    lane: sd.side === "frontend" ? "browser" : "app",
  });
  return syncPipe(
    {
      ...made.model,
      modules: made.model.modules.map((x) =>
        x.id === pipe
          ? { ...x, nodes: [...x.nodes, node], stages: [...x.stages, node.id] }
          : x,
      ),
    },
    pipe,
  );
}

/** Moves the stage at `i` one place up (-1) or down (+1) the chain. */
export function moveStage(
  m: Model,
  pipe: string,
  i: number,
  dir: -1 | 1,
): Model {
  const d = findDef(m, pipe);
  const j = i + dir;
  if (
    !d ||
    d.body !== "pipe" ||
    i < 0 ||
    j < 0 ||
    i >= d.stages.length ||
    j >= d.stages.length
  )
    return m;
  const stages = d.stages.slice();
  [stages[i], stages[j]] = [stages[j], stages[i]];
  return syncPipe(
    {
      ...m,
      modules: m.modules.map((x) => (x.id === pipe ? { ...x, stages } : x)),
    },
    pipe,
  );
}

export function removeStage(m: Model, pipe: string, i: number): Model {
  const d = findDef(m, pipe);
  if (!d || d.body !== "pipe" || !d.stages[i]) return m;
  const gone = d.stages[i];
  return syncPipe(
    {
      ...m,
      modules: m.modules.map((x) =>
        x.id === pipe
          ? {
              ...x,
              stages: x.stages.filter((s) => s !== gone),
              nodes: x.nodes.filter((n) => n.id !== gone),
            }
          : x,
      ),
    },
    pipe,
  );
}

/** Removes a module from the library; refused while it has instances. */
export function removeModule(m: Model, id: string): Model {
  if (usesOf(m, id) > 0) return m;
  return { ...m, modules: m.modules.filter((d) => d.id !== id) };
}

/** Adds an instance of a module to the graph of `m` (the top level or a scope). */
export function addInstance(
  m: Model,
  defId: string,
  patch: Partial<FlowNode> = {},
): { model: Model; id: string } | null {
  const def = findDef(m, defId);
  if (!def) return null;
  return addNode(m, "module", def.name, {
    ref: def.id,
    lane: def.side === "frontend" ? "browser" : "app",
    ...patch,
  });
}

export type Dir = "inputs" | "outputs";

const ports = (d: ModuleDef, dir: Dir): ModulePort[] => d[dir];
const withPorts = (d: ModuleDef, dir: Dir, list: ModulePort[]): ModuleDef => ({
  ...d,
  [dir]: list,
});

/** A new port, bound to the first node of the body that is not bound yet. */
export function addPort(
  m: Model,
  defId: string,
  dir: Dir,
): { model: Model; id: string } | null {
  const def = findDef(m, defId);
  if (!def) return null;
  const used = new Set(ports(def, dir).map((p) => p.node));
  const node = def.nodes.find((n) => !used.has(n.id)) ?? def.nodes[0];
  const base = slugify(def.name);
  const taken = new Set(ports(def, dir).map((p) => p.name));
  let name = `${base}.${dir === "inputs" ? "in" : "out"}`;
  for (let i = 2; taken.has(name); i++)
    name = `${base}.${dir === "inputs" ? "in" : "out"}${i}`;
  const made = portOf(m, name, node?.id ?? "");
  return {
    model: {
      ...made.model,
      modules: made.model.modules.map((d) =>
        d.id === defId ? withPorts(d, dir, [...ports(d, dir), made.port]) : d,
      ),
    },
    id: made.port.id,
  };
}

export function updatePort(
  m: Model,
  defId: string,
  dir: Dir,
  portId: string,
  patch: Partial<Omit<ModulePort, "id">>,
): Model {
  return {
    ...m,
    modules: m.modules.map((d) =>
      d.id === defId
        ? withPorts(
            d,
            dir,
            ports(d, dir).map((p) =>
              p.id === portId ? { ...p, ...patch } : p,
            ),
          )
        : d,
    ),
  };
}

/** Removes a port; the edges that used it fall back to the first port left. */
export function removePort(
  m: Model,
  defId: string,
  dir: Dir,
  portId: string,
): Model {
  const key = dir === "inputs" ? "toPort" : "fromPort";
  const fix = (e: FlowEdge): FlowEdge =>
    e[key] === portId ? { ...e, [key]: "" } : e;
  return {
    ...m,
    edges: m.edges.map(fix),
    modules: m.modules.map((d) => {
      const g = { ...d, edges: d.edges.map(fix) };
      return d.id === defId
        ? withPorts(
            g,
            dir,
            ports(d, dir).filter((p) => p.id !== portId),
          )
        : g;
    }),
  };
}

/** The instances of a module in the graph of `m` (not deeper). */
export const instancesIn = (m: Model, defId: string): FlowNode[] =>
  m.nodes.filter((n) => n.kind === "module" && n.ref === defId);

/** Is this a node that can hold a port? Instances are not inlined, so no. */
export const bindable = (n: FlowNode): boolean => n.kind !== "module";
