// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  type FsState,
  initial,
  page,
} from "../templates/flow-studio/flow-studio.ts";
import {
  outcomes,
  simulate,
  stepsOf,
} from "../templates/flow-studio/engine.ts";
import { lint } from "../templates/flow-studio/lint.ts";
import {
  type Model,
  addEdge,
  addNode,
  blankDef,
  blankPort,
  emptyModel,
  findDef,
  fieldsOf,
} from "../templates/flow-studio/model.ts";
import {
  addInstance,
  addPipe,
  addStage,
  canNest,
  flatten,
  moveStage,
  removeStage,
  syncPipe,
} from "../templates/flow-studio/modules.ts";

/** guard: lets a message through unless `payload.deny` is set */
const guard = blankDef("guard", "Guard", "backend", {
  body: "code",
  source: `
if (msg.payload.deny) return [http.json({ error: "denied" }, 403)];
return [emit("guard.ok", msg.payload)];`,
  inputs: [
    blankPort("g1", "req.in", "", { fields: fieldsOf("deny:boolean=false") }),
  ],
  outputs: [
    blankPort("g2", "guard.ok", "", { pass: true }),
    blankPort("g3", "http.respond"),
  ],
});
/** answer: the handler at the end of the chain */
const answer = blankDef("answer", "Answer", "backend", {
  body: "code",
  source: `return [rq.merge({ seen: true }), http.json({ ok: msg.payload.deny === false }, 200)];`,
  inputs: [
    blankPort("a1", "guard.ok", "", { fields: fieldsOf("deny:boolean=false") }),
  ],
  outputs: [blankPort("a2", "http.respond")],
});

function library(): Model {
  return { ...emptyModel(), modules: [guard, answer] };
}

function pipeModel(): { m: Model; pipe: string } {
  let m = library();
  const made = addPipe(m, "Route pipe");
  m = made.model;
  m = addStage(m, made.id, "guard");
  m = addStage(m, made.id, "answer");
  return { m, pipe: made.id };
}

/** xc -> route -> pipe -> http.respond effect, the 403 and the 200 each by its own */
function wired(deny: boolean): Model {
  let { m, pipe } = pipeModel();
  const def = findDef(m, pipe)!;
  const inst = addInstance(m, pipe, { id: "P", x: 0 })!;
  m = inst.model;
  const add = (
    kind: Parameters<typeof addNode>[1],
    id: string,
    title: string,
    patch = {},
  ) => {
    m = addNode(m, kind, title, { id, x: 0, ...patch }).model;
  };
  add("external", "xc", "Client", { plugin: "http" });
  add("route", "rt", "POST /x", { detail: "req.in" });
  add("effect", "r403", "http.respond", { status: 403, detail: "{}" });
  add("effect", "r200", "http.respond", { status: 200, detail: "{}" });
  const edge = (
    from: string,
    to: string,
    o: Parameters<typeof addEdge>[3] = {},
  ) => {
    const r = addEdge(m, from, to, o);
    if (!r) throw new Error(`${from}->${to}`);
    m = r.model;
  };
  edge("xc", "rt", {
    msg: "http.request",
    payload: fieldsOf(`method=POST; path=/x; deny:boolean=${deny}`),
  });
  edge("rt", "P");
  const outs = def.outputs;
  const guardOut = outs.find((p) => p.via === "g3")!;
  const answerOut = outs.find((p) => p.via === "a2")!;
  edge("P", "r403", { kind: "effect", fromPort: guardOut.id });
  edge("P", "r200", { kind: "effect", fromPort: answerOut.id });
  return {
    ...m,
    scenario: {
      ...m.scenario,
      requests: [{ rid: "r1", entry: "xc", at: 0, payload: {} }],
    },
  };
}

describe("a pipe", () => {
  test("is a chain: the instances in a row, the pass output feeds the next input", () => {
    const { m, pipe } = pipeModel();
    const d = findDef(m, pipe)!;
    expect(d.body).toBe("pipe");
    expect(d.stages).toHaveLength(2);
    expect(d.nodes.map((n) => n.title)).toEqual(["Guard", "Answer"]);
    expect(d.edges).toHaveLength(1);
    expect(d.edges[0]).toMatchObject({
      from: d.stages[0],
      to: d.stages[1],
      fromPort: "g2",
      toPort: "a1",
      msg: "guard.ok",
    });
  });

  test("its ports: the inputs of the first stage, the outputs that do not pass on", () => {
    const { m, pipe } = pipeModel();
    const d = findDef(m, pipe)!;
    expect(d.inputs.map((p) => p.name)).toEqual(["req.in"]);
    expect(d.inputs[0].via).toBe("g1");
    expect(d.outputs.map((p) => p.name)).toEqual([
      "http.respond",
      "http.respond",
    ]);
    expect(d.outputs.every((p) => p.via !== "" && p.node !== "")).toBe(true);
  });

  test("a message goes through the stages: the guard lets it by, the answer responds", () => {
    const m = wired(false);
    const t = simulate(m, m.scenario, 1);
    expect(outcomes(t).map((o) => `${o.result}:${o.status}`)).toEqual([
      "responded:200",
    ]);
    const respond = stepsOf(t, "r1").find(
      (s) => s.type === "effect" && s.to === "r200",
    )!;
    expect(respond.effect).toMatchObject({ json: { ok: true } });
  });

  test("a refusal leaves the pipe by its own port and the later stages never run", () => {
    const m = wired(true);
    const t = simulate(m, m.scenario, 1);
    expect(outcomes(t).map((o) => `${o.result}:${o.status}`)).toEqual([
      "responded:403",
    ]);
    const answerNode = `P/${findDef(m, m.nodes.find((n) => n.id === "P")!.ref)!.stages[1]}`;
    expect(stepsOf(t, "r1").some((s) => s.to === answerNode)).toBe(false);
  });

  test("flattens through the stages to the code nodes", () => {
    const f = flatten(wired(false));
    expect(f.nodes.filter((n) => n.code).length).toBe(2);
    expect(f.edges.find((e) => e.from === "rt")!.to).toMatch(/^P\//);
  });

  test("reordering and removing rebuild the chain; the ports of a stage keep their ids", () => {
    const { m, pipe } = pipeModel();
    const before = findDef(m, pipe)!.outputs.map((p) => p.id);
    const moved = moveStage(m, pipe, 0, 1);
    const d = findDef(moved, pipe)!;
    expect(d.nodes.map((n) => n.title)).toEqual(["Answer", "Guard"]);
    // answer has no pass output now first: the chain ends at it
    expect(d.edges).toHaveLength(0);
    expect(d.outputs.map((p) => p.id).sort()).toEqual(
      [...before, "out:" + d.stages[1] + ":g2"].sort(),
    );
    const removed = removeStage(moved, pipe, 0);
    expect(findDef(removed, pipe)!.stages).toHaveLength(1);
    expect(moveStage(m, pipe, 0, -1)).toBe(m);
  });

  test("syncPipe is idempotent", () => {
    const { m, pipe } = pipeModel();
    expect(findDef(syncPipe(m, pipe), pipe)).toEqual(findDef(m, pipe));
  });

  test("a pipe cannot be a stage of itself", () => {
    const { m, pipe } = pipeModel();
    expect(canNest(m, pipe, pipe)).toBe(false);
    expect(addStage(m, pipe, pipe)).toBe(m);
  });

  test("the checks: an empty pipe, a stage after which nothing continues", () => {
    const empty = addPipe(library(), "Empty").model;
    expect(lint(empty).some((i) => i.rule === "pipe-empty")).toBe(true);
    const { m, pipe } = pipeModel();
    expect(lint(m).some((i) => i.rule === "pipe-broken")).toBe(false);
    const broken = moveStage(m, pipe, 0, 1);
    expect(lint(broken).some((i) => i.rule === "pipe-broken")).toBe(true);
  });
});

function apply(state: FsState, effects: Effect[]): FsState {
  let s = state;
  for (const e of effects)
    if (e.plugin === "store" && e.type === "merge")
      s = { ...s, ...(e.value as object) };
  return s;
}
function sim(state: FsState) {
  const self = {
    state,
    send(id: string, payload?: unknown, event?: { value?: string }) {
      const msg: Message = { id, payload };
      if (event) msg.event = { type: "change", ...event };
      self.state = apply(self.state, page.dispatch(msg, self.state));
      return self;
    },
  };
  return self;
}

describe("a pipe in the editor", () => {
  test("new pipe, open it, add, move and remove stages", () => {
    const s = sim({ ...initial, ready: true });
    // two modules to use as stages
    s.send("newCodeModule", "backend").send("newCodeModule", "backend");
    const mods = s.state.hist.present.modules;
    s.send("newPipe", "backend");
    const inst = s.state.hist.present.nodes.find(
      (n) =>
        n.kind === "module" &&
        findDef(s.state.hist.present, n.ref)?.body === "pipe",
    )!;
    s.send("nodeDbl", { id: inst.id });
    expect(s.state.pipe?.stages).toEqual([]);
    expect(s.state.pipe?.options.map((o) => o.id)).toEqual(
      mods.map((d) => d.id),
    );
    s.send("pipeAdd", undefined, { value: mods[0].id }).send(
      "pipeAdd",
      undefined,
      { value: mods[1].id },
    );
    expect(s.state.pipe?.stages.map((x) => x.module)).toEqual([
      mods[0].name,
      mods[1].name,
    ]);
    s.send("pipeMove", [0, 1]);
    expect(s.state.pipe?.stages.map((x) => x.module)).toEqual([
      mods[1].name,
      mods[0].name,
    ]);
    s.send("pipeDel", 0);
    expect(s.state.pipe?.stages).toHaveLength(1);
    // the pipe cannot be offered to itself
    expect(s.state.pipe?.options.some((o) => o.name.startsWith("Pipe"))).toBe(
      false,
    );
  });

  test("deleting a stage node on the board rebuilds the chain", () => {
    const s = sim({ ...initial, ready: true });
    s.send("newCodeModule", "backend");
    const mod = s.state.hist.present.modules[0];
    s.send("newPipe", "backend");
    const inst = s.state.hist.present.nodes.find(
      (n) => n.kind === "module" && n.ref !== mod.id,
    )!;
    s.send("nodeDbl", { id: inst.id }).send("pipeAdd", undefined, {
      value: mod.id,
    });
    const stage = s.state.pipe!.stages[0].k;
    s.send("nodeDown", { id: stage, x: 0, y: 0 })
      .send("nodeUp", { id: stage })
      .send("delSel");
    expect(s.state.pipe?.stages).toEqual([]);
  });
});
