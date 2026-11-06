import { describe, expect, test } from "vitest";
import { simulate, stepsOf } from "../templates/flow-studio/engine.ts";
import {
  type Model,
  type ModuleDef,
  addEdge,
  addNode,
  blankEdge,
  blankNode,
  findDef,
  parseProject,
  projectText,
} from "../templates/flow-studio/model.ts";
import {
  addInstance,
  addModule,
  addPort,
  canNest,
  crumbs,
  defAt,
  flatten,
  flatId,
  modelAt,
  putAt,
  removeModule,
  removePort,
  scopeValid,
  traceIn,
  updateModule,
  updatePort,
  usesOf,
} from "../templates/flow-studio/modules.ts";
import { Kit, ping } from "./fs-kit.ts";

/** the `pg.query` half of /ping, as a module: `ping.get` in, `ping.found` out */
const lookup = (): ModuleDef => ({
  id: "mod1",
  name: "lookup",
  side: "backend",
  about: "",
  inputs: [
    { id: "p1", name: "ping.get", fields: [], node: "h", via: "", pass: false },
  ],
  outputs: [
    {
      id: "p2",
      name: "ping.found",
      fields: [],
      node: "q",
      via: "",
      pass: false,
    },
  ],
  reads: [],
  writes: [],
  plugins: ["pg"],
  body: "graph",
  source: "",
  held: "",
  stages: [],
  nodes: [
    blankNode("h", "handler", "ping.get", {
      reqSet: { step: "query", who: "{payload.query.who}" },
    }),
    blankNode("q", "effect", "pg.query", { detail: "select 1" }),
  ],
  edges: [blankEdge("ie1", "h", "q", "effect", "pg.query")],
});

/** /ping with the query in a module */
function pingWithModule(): Model {
  const k = new Kit();
  // the library first: an edge to an instance takes the ports from it
  k.m = { ...k.m, modules: [lookup()] };
  k.n("xc", "external", "Client", { plugin: "http" })
    .n("rt", "route", "GET /ping", { detail: "ping.get" })
    .n("m1", "module", "lookup", { ref: "mod1", lane: "app" })
    .n("h2", "handler", "ping.found", {
      reqSet: { step: "answer", n: "{payload.rows.0.n}" },
    })
    .n("ok", "effect", "http.respond", {
      status: 200,
      detail: '{"n":"{req.n}","rid":"{rid}"}',
    })
    .e("xc", "rt", "http.request", {
      payload: "method=GET; path=/ping; query.who=ann",
    })
    .e("rt", "m1")
    .e("m1", "h2", "ping.found", {
      kind: "reply",
      payload: 'rows:array=[{"n":7}]',
    })
    .e("h2", "ok", "http.respond")
    .req("r1", "xc", 0);
  return k.done();
}

const labels = (m: Model) =>
  stepsOf(simulate(m, m.scenario, 1), "r1")
    .map((s) => s.label.replace(/ [\d.]+ms$/, " <ms>"))
    .filter((l) => l !== "request.done");

describe("flatten", () => {
  test("a model without instances is returned as it is", () => {
    const m = ping();
    expect(flatten(m)).toBe(m);
  });

  test("inlines an instance: prefixed ids, the edges move to the ports", () => {
    const f = flatten(pingWithModule());
    expect(f.nodes.map((n) => n.id).sort()).toEqual(
      ["h2", "m1/h", "m1/q", "ok", "rt", "xc"].sort(),
    );
    const into = f.edges.find((e) => e.from === "rt")!;
    expect(into.to).toBe("m1/h");
    const out = f.edges.find((e) => e.to === "h2")!;
    expect(out.from).toBe("m1/q");
    expect(f.edges.find((e) => e.id === "m1/ie1")).toMatchObject({
      from: "m1/h",
      to: "m1/q",
    });
    expect(f.nodes.some((n) => n.kind === "module")).toBe(false);
  });

  test("the flat design plays the same as the one without the module", () => {
    expect(labels(pingWithModule())).toEqual(labels(ping()));
  });

  test("an edge uses the port named by its fromPort / toPort", () => {
    const m = pingWithModule();
    const two: ModuleDef = {
      ...lookup(),
      outputs: [
        ...lookup().outputs,
        {
          id: "p3",
          name: "ping.empty",
          fields: [],
          node: "h",
          via: "",
          pass: false,
        },
      ],
    };
    const edges = m.edges.map((e) =>
      e.from === "m1" ? { ...e, fromPort: "p3" } : e,
    );
    const f = flatten({ ...m, modules: [two], edges });
    expect(f.edges.find((e) => e.to === "h2")!.from).toBe("m1/h");
  });

  test("modules inside modules are inlined, ids nest", () => {
    const inner = lookup();
    const outer: ModuleDef = {
      ...lookup(),
      id: "mod2",
      name: "wrapper",
      inputs: [
        {
          id: "p4",
          name: "ping.get",
          fields: [],
          node: "i",
          via: "",
          pass: false,
        },
      ],
      outputs: [
        {
          id: "p5",
          name: "ping.found",
          fields: [],
          node: "i",
          via: "",
          pass: false,
        },
      ],
      nodes: [blankNode("i", "module", "lookup", { ref: "mod1" })],
      edges: [],
    };
    const m = pingWithModule();
    const f = flatten({
      ...m,
      nodes: m.nodes.map((n) => (n.id === "m1" ? { ...n, ref: "mod2" } : n)),
      modules: [inner, outer],
    });
    // the port of the wrapper is bound to an instance: the edge goes through it
    expect(f.nodes.some((n) => n.id.startsWith("m1/i/"))).toBe(true);
    expect(f.edges.find((e) => e.from === "rt")?.to).toBe("m1/i/h");
  });

  test("a dangling instance and a self reference drop out without a crash", () => {
    const m = pingWithModule();
    const dangling = flatten({
      ...m,
      nodes: m.nodes.map((n) => (n.id === "m1" ? { ...n, ref: "gone" } : n)),
    });
    expect(dangling.nodes.some((n) => n.id.startsWith("m1"))).toBe(false);
    expect(dangling.edges.some((e) => e.from === "rt")).toBe(false);
    const self: ModuleDef = {
      ...lookup(),
      nodes: [
        ...lookup().nodes,
        blankNode("s", "module", "lookup", { ref: "mod1" }),
      ],
    };
    expect(() => flatten({ ...m, modules: [self] })).not.toThrow();
  });
});

describe("scopes", () => {
  const m = pingWithModule();

  test("modelAt shows the body of the module at the path", () => {
    expect(defAt(m, ["m1"])?.id).toBe("mod1");
    expect(modelAt(m, ["m1"]).nodes.map((n) => n.id)).toEqual(["h", "q"]);
    expect(modelAt(m, []).nodes).toBe(m.nodes);
    expect(scopeValid(m, ["nope"])).toBe(false);
  });

  test("putAt writes an edit of the body back into the module", () => {
    const scoped = modelAt(m, ["m1"]);
    const made = addNode(scoped, "effect", "log", { x: 200 });
    const next = putAt(m, ["m1"], made.model);
    expect(findDef(next, "mod1")!.nodes.map((n) => n.id)).toContain(made.id);
    expect(next.nodes).toBe(m.nodes);
    expect(next.seq).toBe(made.model.seq);
    expect(findDef(m, "mod1")!.nodes).toHaveLength(2);
  });

  test("an edge made inside a scope lands in the module", () => {
    const scoped = modelAt(m, ["m1"]);
    const made = addNode(scoped, "effect", "log");
    const edge = addEdge(made.model, "h", made.id)!;
    const next = putAt(m, ["m1"], edge.model);
    expect(findDef(next, "mod1")!.edges).toHaveLength(2);
  });

  test("breadcrumbs name the instances on the way", () => {
    expect(crumbs(m, ["m1"])).toEqual([
      { path: ["m1"], title: "lookup", module: "lookup" },
    ]);
    expect(flatId(["m1"], "q")).toBe("m1/q");
  });
});

describe("a trace seen from a scope", () => {
  const m = pingWithModule();
  const trace = simulate(m, m.scenario, 1)!;
  const flat = simulate(flatten(m), m.scenario, 1);

  test("at the top level an instance box stands for what runs inside", () => {
    const t = traceIn(simulate(flatten(m), m.scenario, 1), [])!;
    const ids = new Set(t.flatMap((s) => [s.from, s.to]));
    expect([...ids].some((i) => i.includes("/"))).toBe(false);
    expect(ids.has("m1")).toBe(true);
    expect(trace).toBeDefined();
  });

  test("inside the scope the prefix is gone", () => {
    const t = traceIn(flat, ["m1"])!;
    const ids = new Set(t.flatMap((s) => [s.from, s.to]));
    expect(ids.has("h")).toBe(true);
    expect(ids.has("q")).toBe(true);
    expect(t.some((s) => s.edge === "ie1")).toBe(true);
  });

  test("a null trace stays null", () => {
    expect(traceIn(null, ["m1"])).toBeNull();
  });
});

describe("the library", () => {
  test("addModule makes a body of one handler with a port each way", () => {
    const r = addModule(ping(), "Rate limit");
    const d = findDef(r.model, r.id)!;
    expect(d.name).toBe("Rate limit");
    expect(d.nodes).toHaveLength(1);
    expect(d.inputs[0]).toMatchObject({
      name: "rate-limit.in",
      node: d.nodes[0].id,
    });
    expect(d.outputs[0].node).toBe(d.nodes[0].id);
    expect(
      new Set([d.id, d.nodes[0].id, d.inputs[0].id, d.outputs[0].id]).size,
    ).toBe(4);
  });

  test("a frontend module is made of a frontend handler", () => {
    const r = addModule(ping(), "Filters", "frontend");
    expect(findDef(r.model, r.id)!.nodes[0].kind).toBe("fe-handler");
  });

  test("an instance goes to the lane of the side of its module", () => {
    const r = addModule(ping(), "Filters", "frontend");
    const i = addInstance(r.model, r.id)!;
    const node = i.model.nodes.find((n) => n.id === i.id)!;
    expect(node).toMatchObject({
      kind: "module",
      ref: r.id,
      lane: "browser",
      title: "Filters",
    });
  });

  test("an edge into an instance takes the first port and its name", () => {
    const m = pingWithModule();
    const e = m.edges.find((x) => x.to === "m1")!;
    expect(e).toMatchObject({ toPort: "p1", msg: "ping.get" });
    const out = m.edges.find((x) => x.from === "m1")!;
    expect(out.fromPort).toBe("p2");
  });

  test("changing the side moves the instances to the other lane", () => {
    const m = updateModule(pingWithModule(), "mod1", { side: "frontend" });
    expect(m.nodes.find((n) => n.id === "m1")!.lane).toBe("browser");
  });

  test("renaming a module renames the instances that carry its name", () => {
    const m = updateModule(pingWithModule(), "mod1", { name: "finder" });
    expect(m.nodes.find((n) => n.id === "m1")!.title).toBe("finder");
  });

  test("ports: add, rename, rebind, remove (the edges fall back)", () => {
    let m = pingWithModule();
    const a = addPort(m, "mod1", "outputs")!;
    m = a.model;
    expect(findDef(m, "mod1")!.outputs).toHaveLength(2);
    m = updatePort(m, "mod1", "outputs", a.id, {
      name: "ping.empty",
      node: "h",
    });
    expect(findDef(m, "mod1")!.outputs[1]).toMatchObject({
      name: "ping.empty",
      node: "h",
    });
    m = removePort(m, "mod1", "outputs", "p2");
    expect(m.edges.find((e) => e.from === "m1")!.fromPort).toBe("");
    expect(findDef(m, "mod1")!.outputs.map((p) => p.id)).toEqual([a.id]);
  });

  test("a module in use cannot be removed", () => {
    const m = pingWithModule();
    expect(usesOf(m, "mod1")).toBe(1);
    expect(removeModule(m, "mod1")).toBe(m);
    const free = addModule(m, "spare");
    expect(removeModule(free.model, free.id).modules).toHaveLength(1);
  });

  test("a module cannot be put inside itself or inside what it contains", () => {
    let m = pingWithModule();
    const b = addModule(m, "outer");
    m = b.model;
    expect(canNest(m, "", "mod1")).toBe(true);
    expect(canNest(m, "mod1", "mod1")).toBe(false);
    expect(canNest(m, b.id, "mod1")).toBe(true);
    // outer contains an instance of mod1; mod1 may not contain outer then
    const inst = addInstance(modelAt(m, []), "mod1")!;
    const outer = findDef(m, b.id)!;
    m = {
      ...m,
      modules: m.modules.map((d) =>
        d.id === outer.id
          ? { ...d, nodes: [...d.nodes, inst.model.nodes.at(-1)!] }
          : d,
      ),
    };
    expect(canNest(m, "mod1", b.id)).toBe(false);
  });
});

describe("saving", () => {
  test("a project with modules survives its own JSON", () => {
    const m = pingWithModule();
    const back = parseProject(projectText(m));
    expect(typeof back).not.toBe("string");
    expect(back).toEqual(m);
  });

  test("an old project without modules reads with an empty library", () => {
    const old = JSON.parse(projectText(ping()));
    delete old.modules;
    const back = parseProject(JSON.stringify(old)) as Model;
    expect(back.modules).toEqual([]);
  });

  test("ports bound to nodes that are not there come back unbound", () => {
    const raw = JSON.parse(projectText(pingWithModule()));
    raw.modules[0].inputs[0].node = "ghost";
    const back = parseProject(JSON.stringify(raw)) as Model;
    expect(back.modules[0].inputs[0].node).toBe("");
  });

  test("the counter stays above the ids inside modules", () => {
    const raw = JSON.parse(projectText(pingWithModule()));
    raw.seq = 0;
    raw.modules[0].nodes[0].id = "n90";
    raw.modules[0].inputs[0].node = "n90";
    raw.modules[0].edges[0].from = "n90";
    const back = parseProject(JSON.stringify(raw)) as Model;
    expect(back.seq).toBeGreaterThanOrEqual(90);
  });
});
