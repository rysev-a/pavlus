import { describe, expect, test } from "vitest";
import {
  checkCode,
  codeTemplate,
  missingOutputs,
  probe,
  runCode,
  syntaxError,
} from "../templates/flow-studio/code.ts";
import {
  outcomes,
  simulate,
  stepsOf,
} from "../templates/flow-studio/engine.ts";
import {
  type Model,
  type ModuleDef,
  addEdge,
  addNode,
  blankDef,
  blankPort,
  emptyModel,
  fieldsOf,
} from "../templates/flow-studio/model.ts";
import { flatten } from "../templates/flow-studio/modules.ts";

const msg = (id: string, payload: unknown = {}) => ({
  id,
  payload,
  ctx: { rid: "r1" },
});
const state = () => ({ requests: { r1: {} }, shared: {}, client: {} });

describe("runCode", () => {
  test("records the effects as data, in the shape of the server builders", () => {
    const r = runCode(
      `return [
        pg.query("select 1 where id = $1", { replyTo: "found", onError: "failed" }, [msg.payload.id]),
        redis.incr("hits:" + msg.payload.id),
        redis.set("k", "v", { ex: 60 }),
        http.json({ ok: true }, 201),
        log.info("hello"),
        emit("next", { a: 1 }),
      ];`,
      msg("x", { id: 7 }),
      state(),
    );
    if (!("effects" in r)) throw new Error(r.error);
    expect(r.effects.map((e) => e.port)).toEqual([
      "pg.query",
      "redis.cmd",
      "redis.cmd",
      "http.respond",
      "log",
      "next",
    ]);
    expect(r.effects[0]).toMatchObject({
      args: { sql: "select 1 where id = $1", params: [7] },
      replyTo: "found",
      onError: "failed",
    });
    expect(r.effects[1].args).toEqual({ args: ["INCR", "hits:7"] });
    expect(r.effects[2].args).toEqual({ args: ["SET", "k", "v", "EX", "60"] });
    expect(r.effects[3].args).toEqual({ status: 201, json: { ok: true } });
    expect(r.effects[4].args).toEqual({ msg: "info hello" });
    expect(r.effects[5].args).toEqual({ payload: { a: 1 } });
  });

  test("changes of state leave by no port", () => {
    const r = runCode(
      `return [rq.merge({ a: 1 }), rq.set("b", 2)];`,
      msg("x"),
      state(),
    );
    if (!("effects" in r)) throw new Error(r.error);
    expect(r.effects.map((e) => e.port)).toEqual(["", ""]);
  });

  test("the message and the state are the arguments", () => {
    const r = runCode(
      `return [emit("seen", { id: msg.id, rid: msg.ctx.rid, mine: state.requests[msg.ctx.rid].k })];`,
      msg("in"),
      { requests: { r1: { k: 5 } }, shared: {}, client: {} },
    );
    if (!("effects" in r)) throw new Error(r.error);
    expect(r.effects[0].args.payload).toEqual({ id: "in", rid: "r1", mine: 5 });
  });

  test("a failure comes back as a value: syntax, a throw, a wrong result", () => {
    expect(runCode("return [", msg("x"), state())).toMatchObject({
      error: expect.stringContaining("syntax error"),
    });
    expect(runCode("throw new Error('boom')", msg("x"), state())).toEqual({
      error: "boom",
    });
    expect(runCode("return 5", msg("x"), state())).toMatchObject({
      error: expect.stringContaining("array of effects"),
    });
    expect(runCode("return [{ port: 'x' }]", msg("x"), state())).toMatchObject({
      error: expect.stringContaining("not an effect"),
    });
    expect(runCode("", msg("x"), state())).toEqual({ effects: [] });
  });

  test("syntaxError tells the message", () => {
    expect(syntaxError("return [];")).toBe("");
    expect(syntaxError("return [")).not.toBe("");
  });
});

/** /hello: route -> code module <-> pg.query, the answer by http.respond */
const SOURCE = `
switch (msg.id) {
  case "hello.get":
    return [
      rq.merge({ who: msg.payload.query.who }),
      pg.query("select n from t where who = $1", { replyTo: "hello.found", onError: "hello.failed" }, [msg.payload.query.who]),
    ];
  case "hello.found":
    return [http.json({ n: msg.payload.rows[0].n, who: state.requests[msg.ctx.rid].who }, 200)];
  case "hello.failed":
    return [http.json({ error: "unavailable" }, 503)];
}
return [];
`;

const helloDef = (source = SOURCE): ModuleDef =>
  blankDef("mod1", "hello", "backend", {
    body: "code",
    source,
    inputs: [
      blankPort("p1", "hello.get", "", {
        fields: fieldsOf("query.who:string=ann"),
      }),
      blankPort("p2", "hello.found", "", {
        fields: fieldsOf('rows:array=[{"n":7}]'),
      }),
      blankPort("p3", "hello.failed"),
    ],
    outputs: [blankPort("p4", "pg.query"), blankPort("p5", "http.respond")],
  });

function hello(source = SOURCE, wire = true): Model {
  let m: Model = { ...emptyModel(), modules: [helloDef(source)] };
  const n = (
    id: string,
    kind: Parameters<typeof addNode>[1],
    title: string,
    patch = {},
  ) => {
    m = addNode(m, kind, title, { id, x: 0, ...patch }).model;
  };
  const e = (
    from: string,
    to: string,
    o: Parameters<typeof addEdge>[3] = {},
  ) => {
    const r = addEdge(m, from, to, o);
    if (!r) throw new Error(`${from} -> ${to}`);
    m = r.model;
  };
  n("xc", "external", "Client", { plugin: "http" });
  n("rt", "route", "GET /hello", { detail: "hello.get" });
  n("M", "module", "hello", { ref: "mod1", lane: "app" });
  n("q", "effect", "pg.query", { detail: "ignored: the code says the sql" });
  n("r", "effect", "http.respond", { status: 200, detail: '{"ignored":true}' });
  e("xc", "rt", {
    msg: "http.request",
    payload: fieldsOf("method=GET; path=/hello; query.who=ann"),
  });
  e("rt", "M", { toPort: "p1" });
  if (wire) {
    e("M", "q", { kind: "effect", fromPort: "p4" });
    e("q", "M", {
      kind: "reply",
      msg: "hello.found",
      toPort: "p2",
      payload: fieldsOf('rows:array=[{"n":7}]'),
    });
    e("q", "M", { port: "err", msg: "hello.failed", toPort: "p3" });
    e("M", "r", { kind: "effect", fromPort: "p5" });
  }
  m = {
    ...m,
    scenario: {
      ...m.scenario,
      requests: [{ rid: "r1", entry: "xc", at: 0, payload: {} }],
    },
  };
  return m;
}

describe("a module with code, in the simulation", () => {
  test("flattens to one node that carries the code", () => {
    const f = flatten(hello());
    const node = f.nodes.find((x) => x.id === "M")!;
    expect(node.kind).toBe("handler");
    expect(node.code?.source).toBe(SOURCE);
    expect(f.nodes.some((x) => x.id.startsWith("M/"))).toBe(false);
    expect(f.edges.find((x) => x.from === "rt")!.to).toBe("M");
  });

  test("the code decides the effects: the sql, the state, the response", () => {
    const m = hello();
    const t = simulate(m, m.scenario, 1);
    expect(outcomes(t).map((o) => `${o.result}:${o.status}`)).toEqual([
      "responded:200",
    ]);
    const steps = stepsOf(t, "r1");
    const query = steps.find((s) => s.to === "q" && s.type === "effect")!;
    expect(query.effect).toMatchObject({
      plugin: "pg",
      type: "query",
      sql: "select n from t where who = $1",
      params: ["ann"],
      replyTo: "hello.found",
    });
    const respond = steps.find((s) => s.to === "r" && s.type === "effect")!;
    expect(respond.effect).toMatchObject({
      plugin: "http",
      status: 200,
      json: { n: 7, who: "ann" },
    });
  });

  test("the step of the module shows what the code returned and the state it left", () => {
    const m = hello();
    const steps = stepsOf(simulate(m, m.scenario, 1), "r1");
    const first = steps.find((s) => s.to === "M")!;
    expect(first.effect).toMatchObject({
      module: "hello",
      input: "hello.get",
      returned: [{ port: "pg.query", sql: "select n from t where who = $1" }],
    });
    expect(first.req).toMatchObject({ who: "ann" });
    const second = steps.filter((s) => s.to === "M")[1];
    expect(second.effect).toMatchObject({ input: "hello.found" });
  });

  test("a fault on the effect node reaches the code as its error message", () => {
    const m = hello();
    const t = simulate(
      m,
      {
        ...m.scenario,
        faults: [
          {
            id: "f1",
            kind: "error",
            target: "q",
            rid: "",
            code: "",
            ms: 0,
            on: true,
          },
        ],
      },
      1,
    );
    expect(outcomes(t).map((o) => `${o.result}:${o.status}`)).toEqual([
      "failed:503",
    ]);
  });

  test("an effect with no edge on its port is dropped, and says so", () => {
    const m = hello(SOURCE, false);
    const t = simulate(m, m.scenario, 1);
    const dropped = stepsOf(t, "r1").find((s) => s.type === "drop")!;
    expect(dropped.note).toContain("no edge leaves that port");
    expect(dropped.label).toBe("pg.query");
  });

  test("code that throws answers 500 from the runtime and says why", () => {
    const m = hello(`throw new Error("no good")`);
    const t = simulate(m, m.scenario, 1);
    expect(outcomes(t).map((o) => `${o.result}:${o.status}`)).toEqual([
      "failed:500",
    ]);
    const bad = stepsOf(t, "r1").find((s) => s.status === "error")!;
    expect(bad.note).toContain("no good");
  });

  test("the same seed gives the same trace", () => {
    const m = hello();
    expect(JSON.stringify(simulate(m, m.scenario, 3))).toBe(
      JSON.stringify(simulate(m, m.scenario, 3)),
    );
  });
});

describe("probing and the port checks", () => {
  test("probe runs the code once per input port with its example", () => {
    const p = probe(helloDef());
    expect(p.map((x) => x.input.name)).toEqual([
      "hello.get",
      "hello.found",
      "hello.failed",
    ]);
    const first = p[0].result;
    if (!("effects" in first)) throw new Error(first.error);
    expect(first.effects.map((e) => e.port).filter(Boolean)).toEqual([
      "pg.query",
    ]);
  });

  test("a clean module has no issues", () => {
    expect(checkCode(helloDef())).toEqual([]);
  });

  test("an effect with no output port is a warning; Sync lists it", () => {
    const d = helloDef();
    const noOut = { ...d, outputs: [d.outputs[0]] };
    const i = checkCode(noOut);
    expect(i.map((x) => x.rule)).toContain("code-port-missing");
    expect(missingOutputs(noOut)).toEqual(["http.respond"]);
  });

  test("an output the examples never reach is a note", () => {
    const d = helloDef();
    const extra = {
      ...d,
      outputs: [...d.outputs, blankPort("p9", "hello.never")],
    };
    expect(checkCode(extra).map((x) => x.rule)).toEqual(["code-port-silent"]);
  });

  test("a body that does not parse, or throws on an example, is an error", () => {
    expect(checkCode(helloDef("return ["))[0]).toMatchObject({
      rule: "code-error",
      severity: "error",
    });
    const thrown = checkCode(helloDef("throw new Error('x')"));
    expect(thrown.filter((x) => x.rule === "code-error")).toHaveLength(3);
    expect(thrown.some((x) => x.severity === "warn")).toBe(false);
  });

  test("a graph module has no code issues", () => {
    expect(checkCode({ ...helloDef(), body: "graph" })).toEqual([]);
  });

  test("the template runs, and emits the output port", () => {
    const d = blankDef("m", "x", "backend", {
      body: "code",
      source: codeTemplate("x.in", "x.out"),
      inputs: [blankPort("p1", "x.in")],
      outputs: [blankPort("p2", "x.out")],
    });
    expect(checkCode(d)).toEqual([]);
  });
});
