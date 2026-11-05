// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  type FsState,
  STORAGE_KEY,
  STEP_MS,
  VIEWS,
  initial,
  page,
  stateOf,
  trees,
  coreFrom,
} from "../templates/flow-studio/flow-studio.ts";
import { DEMOS, loginDemo } from "../templates/flow-studio/demos.ts";
import { meta } from "../templates/flow-studio/meta.ts";
import { allEntries } from "../registry.ts";
import { createLocalPlugin } from "../local.ts";
import {
  addNode,
  emptyModel,
  findEdge,
  findNode,
  parseProject,
  projectText,
} from "../templates/flow-studio/model.ts";
import { layoutOf } from "../templates/flow-studio/layout.ts";
import { projectText as vbText } from "../templates/visual-builder/io.ts";
import { DEMOS as VB } from "../templates/visual-builder/demos.ts";

/** The store plugin's `merge` at the component's root, and nothing else. */
function apply(state: FsState, effects: Effect[]): FsState {
  let s = state;
  for (const e of effects)
    if (e.plugin === "store" && e.type === "merge")
      s = { ...s, ...(e.value as object) };
  return s;
}

interface Sim {
  state: FsState;
  effects: Effect[];
  last: Effect[];
  send(
    id: string,
    payload?: unknown,
    event?: { value?: string; key?: string },
  ): Sim;
}

function sim(state: FsState): Sim {
  const self: Sim = {
    state,
    effects: [],
    last: [],
    send(id, payload, event) {
      const msg: Message = { id, payload };
      if (event)
        msg.event = { type: event.key ? "keydown" : "input", ...event };
      const fx = page.dispatch(msg, self.state);
      self.state = apply(self.state, fx);
      self.effects.push(...fx);
      self.last = fx;
      return self;
    },
  };
  return self;
}

const ready = (): Sim => sim({ ...initial, ready: true });
const model = (s: Sim) => s.state.hist.present;
const kinds = (fx: Effect[]) => fx.map((e) => `${e.plugin}.${e.type}`);
const key = (s: Sim, k: string, ctrl = false) =>
  s.send("key", { key: k, ctrl, shift: false });

describe("the page", () => {
  test("is registered under Special Web Tools", () => {
    expect(meta.title).toBe("Flow Studio");
    expect(meta.group).toBe("Special Web Tools");
    const e = allEntries.find((x) => x.slug === "flow-studio")!;
    expect(e.path).toBe("/templates/flow-studio");
    expect(e.group).toBe("Special Web Tools");
    expect(e.look?.mode).toBe("dark");
  });
  test("opens the login demo, ready to run, on the flow view", () => {
    expect(initial.projectName).toBe("Login with rate limit");
    expect(initial.tab).toBe("flow");
    expect(initial.isFlow).toBe(true);
    expect(initial.runbar.has).toBe(false);
    expect(initial.runbar.runLabel).toBe("Run");
    expect(initial.hist.present.nodes.length).toBeGreaterThan(25);
    expect(initial.summary).toBe("32 nodes · 34 edges · 1 route");
    expect(initial.chips.map((c) => c.id)).toEqual([
      "pg-error",
      "redis-timeout",
      "slow",
      "abort",
      "deadline",
    ]);
    expect(initial.tabs.map((t) => t.label)).toEqual([
      "Flow",
      "Sequence",
      "Catalog",
      "Timeline",
      "Checks",
      "Source",
    ]);
  });
  test("the state is plain data: it survives JSON", () => {
    const back = JSON.parse(JSON.stringify(stateOf(loginDemo())));
    expect(back.hist.present.nodes.length).toBe(32);
  });
});

describe("views", () => {
  test("each tab shows its own panel", () => {
    const s = ready();
    for (const v of VIEWS) {
      s.send("setView", v.id);
      expect(s.state.tab).toBe(v.id);
      const flags = [
        s.state.isFlow,
        s.state.isSequence,
        s.state.isCatalog,
        s.state.isTimeline,
        s.state.isChecks,
        s.state.isSource,
      ];
      expect(flags.filter(Boolean)).toHaveLength(1);
      expect(s.state.tabs.find((t) => t.current)?.id).toBe(v.id);
    }
  });
  test("a select of the views does the same (the tabs collapse on a phone)", () => {
    const s = ready();
    s.send("tabSelect", undefined, { value: "catalog" });
    expect(s.state.tab).toBe("catalog");
  });
  test("catalog, checks and source are worked out only when shown", () => {
    const s = ready();
    expect(s.state.catalog).toEqual([]);
    expect(s.state.source.files).toEqual([]);
    s.send("setView", "catalog");
    expect(s.state.catalog.length).toBeGreaterThan(15);
    s.send("setView", "source");
    expect(s.state.source.files.length).toBeGreaterThanOrEqual(8);
    expect(s.state.source.code).toContain("export const routes");
    s.send("srcTab", "server/app.ts");
    expect(s.state.source.code).toContain("export const app");
    s.send("setView", "checks");
    expect(s.state.checks.summary).toBe("No problems found.");
    expect(s.state.checks.clean).toBe(true);
  });
  test("the timeline simulates once if nothing was run, without starting the player", () => {
    const s = ready();
    s.send("setView", "timeline");
    expect(s.state.trace).not.toBeNull();
    expect(s.state.playing).toBe(false);
    expect(s.state.pos).toBe(-1);
    expect(s.state.tlRids.map((r) => r.rid)).toEqual(["r1", "r2"]);
    s.send("tlRid", "r2");
    expect(s.state.tlRids.find((r) => r.current)?.rid).toBe("r2");
  });
  test("the source copies through the local plugin", () => {
    const s = ready();
    s.send("setView", "source");
    s.send("copyFile");
    expect(s.last.find((e) => e.plugin === "local")).toMatchObject({
      type: "copy",
      onSuccess: "copyDone",
    });
    s.send("copyAll");
    expect((s.last[0] as unknown as { text: string }).text).toContain(
      "// ===== server/main.ts =====",
    );
    s.send("copyDone");
    expect(s.state.message).toBe("Copied to the clipboard");
  });
  test("a problem in the design is listed and can be focused on the canvas", () => {
    const s = ready();
    s.send("delSel");
    // remove the onError edge of the lookup: the checks find it
    const m = model(s);
    const edge = m.edges.find((e) => e.from === "pgu" && e.kind === "error")!;
    s.send("edgeClick", { id: edge.id });
    s.send("delSel");
    s.send("setView", "checks");
    expect(s.state.checks.rows.length).toBeGreaterThan(0);
    expect(s.state.tabs.find((t) => t.id === "checks")!.badge).not.toBe("");
    const i = s.state.checks.rows.findIndex(
      (r) => r.rule === "missing-onerror",
    );
    s.send("focusIssue", i);
    expect(s.state.tab).toBe("flow");
    expect(s.state.sel).toEqual({ kind: "node", id: "pgu" });
    expect(s.state.inspector.title).toBe("pg.query");
    expect(s.state.live).toContain("no onError");
  });
});

describe("the demos", () => {
  test("each opens, replaces the flow (undo brings it back) and can run", () => {
    for (const d of DEMOS) {
      const s = ready();
      s.send("loadDemo", d.id);
      expect(s.state.projectName).toBe(d.title);
      expect(s.state.message).toContain("Press Run");
      expect(s.state.canUndo).toBe(true);
      s.send("run");
      expect(s.state.playing).toBe(true);
      expect(s.state.trace!.length).toBeGreaterThan(20);
      s.send("undo");
      expect(s.state.projectName).toBe("Login with rate limit");
    }
  });
  test("a blank flow", () => {
    const s = ready();
    s.send("loadDemo", "blank");
    expect(model(s).nodes).toEqual([]);
    s.send("run");
    expect(s.state.message).toContain("Nothing to run");
    expect(s.state.playing).toBe(false);
  });
});

describe("the player", () => {
  test("Run simulates, starts the player and announces the first step", () => {
    const s = ready();
    s.send("run");
    expect(s.state.playing).toBe(true);
    expect(s.state.pos).toBe(0);
    expect(s.state.runbar.position).toBe(`1 / ${s.state.trace!.length}`);
    expect(s.last.find((e) => e.plugin === "time")).toMatchObject({
      type: "setInterval",
      replyTo: "tick",
    });
    expect(s.state.live).toMatch(
      /^Step 1 of \d+ at 0 ms\. r1: start click Sign in/,
    );
    expect(s.state.cur.has).toBe(true);
    expect(s.state.cur.rid).toBe("r1");
  });
  test("a tick moves the token along the edge; at the end it lands on the next step", () => {
    const s = ready();
    s.send("run");
    const inc = (50 * 1) / STEP_MS;
    s.send("tick");
    expect(s.state.pos).toBe(0);
    expect(s.state.progress).toBeCloseTo(inc, 5);
    for (let i = 0; i < Math.ceil(STEP_MS / 50); i++) s.send("tick");
    expect(s.state.pos).toBe(1);
    expect(s.state.progress).toBeLessThan(0.2);
  });
  test("speed shortens the dwell of a step", () => {
    const s = ready();
    s.send("run");
    s.send("setSpeed", undefined, { value: "4" });
    expect(s.state.speed).toBe(4);
    for (let i = 0; i < Math.ceil(STEP_MS / 50 / 4) + 1; i++) s.send("tick");
    expect(s.state.pos).toBeGreaterThanOrEqual(1);
    s.send("setSpeed", undefined, { value: "7" });
    expect(s.state.speed).toBe(4);
  });
  test("the player stops at the end of the trace and offers a replay", () => {
    const s = ready();
    s.send("run");
    const n = s.state.trace!.length;
    for (let i = 0; i < 40 * n && s.state.playing; i++) s.send("tick");
    expect(s.state.playing).toBe(false);
    expect(s.state.pos).toBe(n - 1);
    expect(s.state.live).toContain("The run is finished");
    expect(s.state.live).toContain("r1 responded 200");
    expect(s.state.runbar.playLabel).toBe("Replay");
    expect(kinds(s.last)).toContain("time.cancel");
    s.send("play");
    expect(s.state.playing).toBe(true);
    expect(s.state.pos).toBe(0);
  });
  test("Step goes one step, Back goes back, Reset goes to the start", () => {
    const s = ready();
    s.send("step");
    expect(s.state.trace).not.toBeNull();
    expect(s.state.pos).toBe(0);
    expect(s.state.playing).toBe(false);
    s.send("step");
    s.send("step");
    expect(s.state.pos).toBe(2);
    expect(s.state.progress).toBe(1);
    s.send("stepBack");
    expect(s.state.pos).toBe(1);
    s.send("reset");
    expect(s.state.pos).toBe(-1);
    expect(s.state.live).toBe("Reset");
    s.send("stepBack");
    expect(s.state.pos).toBe(-1);
  });
  test("Step while playing pauses; Pause and Play toggle", () => {
    const s = ready();
    s.send("run");
    s.send("step");
    expect(s.state.playing).toBe(false);
    s.send("play");
    expect(s.state.playing).toBe(true);
    s.send("play");
    expect(s.state.playing).toBe(false);
    expect(s.state.live).toBe("Paused");
    s.send("pause");
    expect(s.state.playing).toBe(false);
  });
  test("the last step says so", () => {
    const s = ready();
    s.send("run");
    s.send("seek", s.state.trace!.length - 1);
    s.send("step");
    expect(s.state.live).toBe("That was the last step");
  });
  test("a breakpoint on a node pauses the player when a token reaches it", () => {
    const s = ready();
    s.send("bpToggle", "h2");
    expect(s.state.bpList).toEqual([{ id: "h2", title: "auth.login.counted" }]);
    s.send("run");
    for (let i = 0; i < 4000 && s.state.playing; i++) s.send("tick");
    expect(s.state.playing).toBe(false);
    expect(s.state.live).toContain("Breakpoint at auth.login.counted");
    expect(s.state.trace![s.state.pos].to).toBe("h2");
    // play on: it stops at the next arrival at that node (the second request)
    s.send("play");
    for (let i = 0; i < 4000 && s.state.playing; i++) s.send("tick");
    expect(s.state.trace![s.state.pos].to).toBe("h2");
    expect(s.state.trace![s.state.pos].rid).toBe("r2");
    s.send("bpToggle", "h2");
    expect(s.state.bpList).toEqual([]);
  });
  test("a breakpoint is set on the selected node with B and by the context menu", () => {
    const s = ready();
    s.send("nodeDown", { id: "pgu", x: 0, y: 0 });
    s.send("cvUp");
    key(s, "b");
    expect(s.state.breakpoints.pgu).toBe(true);
    s.send("nodeCtx", { id: "h1" });
    expect(s.state.breakpoints.h1).toBe(true);
    expect(s.state.live).toContain("Breakpoint set on");
  });
  test("every step is announced for a screen reader", () => {
    const s = ready();
    s.send("run");
    s.send("seek", 6);
    expect(s.state.live).toBe(
      `Step 7 of ${s.state.trace!.length} at ${s.state.trace![6].t.toFixed(1).replace(/\.0$/, "")} ms. ${s.state.live.split(". ").slice(1).join(". ")}`,
    );
    expect(s.state.live).toMatch(/r\d: \w+ [\w.]+, .* to .*/);
  });
  test("the debugger shows the payload, the effect, the slice of every request and the shared state", () => {
    const s = ready();
    s.send("run");
    const i = s.state.trace!.findIndex(
      (x) => x.type === "effect" && x.to === "pgu" && x.rid === "r1",
    );
    s.send("seek", i);
    expect(s.state.cur.hasEffect).toBe(true);
    expect(s.state.cur.effect).toContain('"plugin": "pg"');
    expect(s.state.cur.effect).toContain('"rid": "r1"');
    expect(s.state.cur.req).toContain('"step": "lookup"');
    expect(s.state.cur.slices.map((x) => x.rid)).toEqual(["r1", "r2"]);
    expect(s.state.cur.slices.find((x) => x.rid === "r1")!.current).toBe(true);
    expect(s.state.cur.shared).toBe("{}");
    expect(s.state.cur.where).toBe("auth.login.counted to pg.query");
    expect(s.state.stepLog.find((l) => l.current)!.i).toBe(i);
    expect(s.state.outcomes.map((o) => o.rid)).toEqual(["r1", "r2"]);
  });
  test("Run again simulates again; editing the design drops the old trace", () => {
    const s = ready();
    s.send("run");
    s.send("nodeDown", { id: "h1", x: 0, y: 0 });
    s.send("cvUp");
    s.send("delSel");
    expect(s.state.trace).toBeNull();
    expect(s.state.pos).toBe(-1);
    expect(s.state.playing).toBe(false);
    expect(s.state.runbar.runLabel).toBe("Run");
  });
  test("moving a node does not drop the trace", () => {
    const s = ready();
    s.send("run");
    s.send("nodeDown", { id: "h1", x: 100, y: 100 });
    s.send("cvMove", { x: 150, y: 140 });
    s.send("cvUp");
    expect(s.state.trace).not.toBeNull();
  });
  test("reduced motion: the token jumps (progress 1 is drawn) and the flag is on the page", () => {
    const s = ready();
    s.send("gotMotion", { matches: true });
    expect(s.state.reduced).toBe(true);
    s.send("run");
    s.send("tick");
    const flow = trees(coreFrom(s.state)).find((t) => t.target === "#fs-flow")!;
    expect(JSON.stringify(flow.tree)).toContain("fs-token");
    s.send("gotMotion", { matches: false });
    expect(s.state.reduced).toBe(false);
  });
});

describe("fault injection", () => {
  test("a chip toggles a fault of the scenario; the run shows it", () => {
    const s = ready();
    s.send("chip", "redis-timeout");
    expect(s.state.chips.find((c) => c.id === "redis-timeout")!.on).toBe(true);
    expect(s.state.activeFaults.map((f) => f.text)).toEqual([
      "every redis call of the request times out".replace(
        "of the request ",
        "",
      ),
    ]);
    s.send("run");
    expect(s.state.runbar.status).toContain("r1: failed 500");
    s.send("chip", "redis-timeout");
    expect(s.state.activeFaults).toEqual([]);
    expect(s.state.trace).toBeNull();
  });
  test("a client abort cancels the work and the debugger says so", () => {
    const s = ready();
    s.send("chip", "abort");
    s.send("run");
    expect(s.state.runbar.status).toContain("r1: aborted");
    const i = s.state.trace!.findIndex((x) => x.type === "cancel");
    s.send("seek", i);
    expect(s.state.cur.status).toBe("cancelled");
    expect(s.state.cur.note).toContain("cancels it");
    expect(s.state.outcomes[0].text).toContain("cancelled");
  });
  test("a fault on one hop from the inspector", () => {
    const s = ready();
    s.send("nodeDown", { id: "pgu", x: 0, y: 0 });
    s.send("cvUp");
    expect(s.state.inspector.faults.map((f) => f.label)).toEqual([
      "Postgres error (SQLSTATE)",
      "Timeout",
      "Slow (+1.5 s)",
    ]);
    s.send("faultNode", ["pgu", "error"]);
    expect(s.state.inspector.faults[0].on).toBe(true);
    expect(model(s).scenario.faults[0]).toMatchObject({
      target: "pgu",
      code: "40001",
      on: true,
    });
    s.send("run");
    expect(s.state.runbar.status).toContain("failed 500");
  });
  test("an edge into a plugin node offers the faults of its hop", () => {
    const s = ready();
    const e = model(s).edges.find((x) => x.from === "h1" && x.to === "incr")!;
    s.send("edgeClick", { id: e.id });
    expect(s.state.inspector.mode).toBe("edge");
    expect(s.state.inspector.faults.map((f) => f.kind)).toEqual([
      "error",
      "timeout",
      "slow",
    ]);
    s.send("faultNode", ["incr", "timeout"]);
    expect(s.state.inspector.faults.find((f) => f.kind === "timeout")!.on).toBe(
      true,
    );
    s.send("run");
    expect(s.state.runbar.status).toContain("failed 500");
    // an edge into a handler has none
    s.send("edgeClick", {
      id: model(s).edges.find((x) => x.to === "h2" && x.from === "incr")!.id,
    });
    expect(s.state.inspector.faults).toEqual([]);
  });
  test("the scenario panel edits the faults, the requests and the latencies", () => {
    const s = ready();
    s.send("chip", "slow");
    s.send("setSide", "scenario");
    expect(s.state.scenarioV.faults).toHaveLength(1);
    expect(s.state.scenarioV.requests).toHaveLength(2);
    const fault = s.state.scenarioV.faults[0];
    s.send("f.edit", [`fl:${fault.id}`, "ms"], { value: "300" });
    expect(model(s).scenario.faults[0].ms).toBe(300);
    s.send("faultToggle", fault.id);
    expect(model(s).scenario.faults[0].on).toBe(false);
    s.send("faultDel", fault.id);
    expect(model(s).scenario.faults).toEqual([]);
    s.send("f.edit", ["m", "lat:pg"], { value: "50" });
    expect(model(s).latency.pg).toBe(50);
    s.send("f.edit", ["sc:limited", "cond"], { value: "true" });
    expect(model(s).scenario.conds.limited).toBe(true);
    s.send("run");
    expect(s.state.runbar.status).toContain("429");
    s.send("reqAdd");
    expect(model(s).scenario.requests).toHaveLength(3);
    s.send("f.edit", ["rq:2", "rid"], { value: "r9" });
    expect(model(s).scenario.requests[2].rid).toBe("r9");
    s.send("reqDel", 2);
    expect(model(s).scenario.requests).toHaveLength(2);
  });
  test("a concurrent request with its own rid is a request of the scenario", () => {
    const s = ready();
    s.send("reqAdd");
    s.send("run");
    expect(s.state.tlRids.map((r) => r.rid)).toEqual(["r1", "r2", "r3"]);
    expect(s.state.outcomes.map((o) => o.rid)).toEqual(["r1", "r2", "r3"]);
  });
});

describe("editing", () => {
  test("a palette button adds a node, selects it and says so", () => {
    const s = ready();
    const before = model(s).nodes.length;
    s.send("addNodeOf", ["effect", "redis.cmd"]);
    expect(model(s).nodes).toHaveLength(before + 1);
    expect(s.state.sel.kind).toBe("node");
    expect(s.state.inspector.title).toBe("redis.cmd");
    expect(s.state.live).toBe("Added Plugin effect redis.cmd");
    expect(s.last.find((e) => e.plugin === "local")).toMatchObject({
      type: "save",
      key: STORAGE_KEY,
    });
  });
  test("Quick add makes the node and links it from the selection", () => {
    const s = ready();
    s.send("nodeDown", { id: "h6", x: 0, y: 0 });
    s.send("cvUp");
    const edges = model(s).edges.length;
    s.send("quickText", undefined, { value: "pg select 1" });
    expect(s.state.quick.text).toBe("pg select 1");
    s.send("quickAdd");
    const added = model(s).nodes.at(-1)!;
    expect(added).toMatchObject({
      kind: "effect",
      title: "pg.query",
      detail: "select 1",
    });
    expect(model(s).edges).toHaveLength(edges + 1);
    expect(model(s).edges.at(-1)).toMatchObject({
      from: "h6",
      to: added.id,
      kind: "effect",
      msg: "pg.query",
    });
    expect(s.state.quick.text).toBe("");
  });
  test("Quick add by Enter, and a message for what it cannot read", () => {
    const s = ready();
    s.send("quickText", undefined, { value: "POST /orders" });
    s.send("quickKey", undefined, { key: "a" });
    expect(model(s).nodes.some((n) => n.title === "POST /orders")).toBe(false);
    s.send("quickKey", undefined, { key: "Enter", value: "POST /orders" });
    expect(model(s).nodes.at(-1)).toMatchObject({
      kind: "route",
      title: "POST /orders",
      detail: "orders.post",
    });
    s.send("quickAdd", undefined, { value: "???" });
    expect(s.state.quick.error).toContain('I do not know "???"');
    s.send("quickExample", "handler auth.login");
    expect(s.state.quick.text).toBe("handler auth.login");
  });
  test("dragging from a port onto a node links them; the new edge is selected", () => {
    const s = ready();
    const before = model(s).edges.length;
    s.send("portDown", { id: "habort", port: "out", x: 10, y: 10 });
    expect(s.state.drag).toMatchObject({ kind: "link", from: "habort" });
    s.send("cvMove", { x: 300, y: 200 });
    expect((s.state.drag as { x: number }).x).toBe(300);
    s.send("nodeUp", { id: "r500" });
    expect(model(s).edges).toHaveLength(before + 1);
    expect(s.state.sel.kind).toBe("edge");
    expect(s.state.drag).toBeNull();
    expect(s.state.inspector.title).toBe("http.respond");
  });
  test("dropping a link on its own node or on the background cancels it", () => {
    const s = ready();
    const before = model(s).edges.length;
    s.send("portDown", { id: "habort", port: "out", x: 10, y: 10 });
    s.send("nodeUp", { id: "habort" });
    expect(s.state.drag).toBeNull();
    s.send("portDown", { id: "habort", port: "out", x: 10, y: 10 });
    s.send("cvUp");
    expect(s.state.drag).toBeNull();
    expect(model(s).edges).toHaveLength(before);
  });
  test("an error port makes an error edge, a duplicate link is refused", () => {
    const s = ready();
    s.send("portDown", { id: "expire", port: "err", x: 0, y: 0 });
    s.send("nodeUp", { id: "efail" });
    const e = model(s).edges.at(-1)!;
    expect(e).toMatchObject({
      from: "expire",
      to: "efail",
      kind: "error",
      msg: "auth.failed",
    });
    s.send("portDown", { id: "expire", port: "err", x: 0, y: 0 });
    s.send("nodeUp", { id: "efail" });
    expect(s.state.message).toContain("already linked");
  });
  test("the link select of the inspector links the selected node", () => {
    const s = ready();
    s.send("nodeDown", { id: "habort", x: 0, y: 0 });
    s.send("cvUp");
    expect(s.state.connectList.length).toBe(31);
    s.send("connect", undefined, { value: "r500" });
    expect(model(s).edges.at(-1)).toMatchObject({ from: "habort", to: "r500" });
  });
  test("a node is dragged and the move is one undo step", () => {
    const s = ready();
    const n0 = findNode(model(s), "h1")!;
    const p = layoutOf(model(s)).nodes.find((n) => n.id === "h1")!;
    s.send("nodeDown", { id: "h1", x: p.x + 10, y: p.y + 10 });
    s.send("cvMove", { x: p.x + 60, y: p.y + 50 });
    s.send("cvMove", { x: p.x + 90, y: p.y + 60 });
    // nothing is committed until the pointer is released
    expect(findNode(model(s), "h1")!.x).toBe(n0.x);
    s.send("cvUp");
    const n1 = findNode(model(s), "h1")!;
    expect(n1.x).toBe(n0.x + 80);
    expect(n1.y).toBeGreaterThan(n0.y);
    s.send("undo");
    expect(findNode(model(s), "h1")!.x).toBe(n0.x);
    s.send("redo");
    expect(findNode(model(s), "h1")!.x).toBe(n1.x);
  });
  test("a click without a move selects but does not edit", () => {
    const s = ready();
    const h = s.state.hist;
    s.send("nodeDown", { id: "h1", x: 5, y: 5 });
    s.send("cvUp");
    expect(s.state.hist).toBe(h);
    expect(s.state.sel).toEqual({ kind: "node", id: "h1" });
  });
  test("the background pans, the buttons zoom, Fit shows everything, the minimap jumps", () => {
    const s = ready();
    s.send("cvDown", { x: 400, y: 300 });
    s.send("cvMove", { x: 300, y: 280 });
    expect(s.state.vp.x).toBeGreaterThan(0);
    s.send("cvUp");
    expect(s.state.drag).toBeNull();
    const z = s.state.vp.z;
    s.send("zoomIn");
    expect(s.state.vp.z).toBeGreaterThan(z);
    s.send("zoomOut");
    s.send("zoomOut");
    expect(s.state.vp.z).toBeLessThan(z);
    s.send("fit");
    expect(s.state.vp.z).toBeLessThan(0.5);
    expect(s.state.zoomText).toMatch(/^\d+%$/);
    s.send("home");
    expect(s.state.vp).toEqual({ x: 0, y: 0, z: 1 });
    s.send("mmClick", { x: 1500, y: 300 });
    expect(s.state.vp.x).toBeGreaterThan(1000);
  });
  test("auto layout re-places the nodes of every lane in one undo step", () => {
    const s = ready();
    s.send("nodeDown", { id: "h1", x: 0, y: 0 });
    s.send("cvMove", { x: 400, y: 300 });
    s.send("cvUp");
    const moved = findNode(model(s), "h1")!.x;
    s.send("autoLayoutAll");
    expect(findNode(model(s), "h1")!.x).not.toBe(moved);
    s.send("undo");
    expect(findNode(model(s), "h1")!.x).toBe(moved);
  });
  test("the inspector edits through one message and typing is one undo step", () => {
    const s = ready();
    s.send("nodeDown", { id: "r500", x: 0, y: 0 });
    s.send("cvUp");
    expect(s.state.inspector.fields.map((f) => f.name)).toContain("status");
    const past = s.state.hist.past.length;
    for (const v of ["5", "50", "503"])
      s.send("f.edit", ["n:r500", "status"], { value: v });
    expect(findNode(model(s), "r500")!.status).toBe(503);
    expect(s.state.hist.past.length).toBe(past + 1);
    s.send("f.edit", ["n:r500", "detail"], { value: '{"error":"down"}' });
    expect(findNode(model(s), "r500")!.detail).toBe('{"error":"down"}');
  });
  test("an edge is edited: message id, condition, payload fields, rid", () => {
    const s = ready();
    const e = model(s).edges.find(
      (x) => x.from === "incr" && x.kind === "reply",
    )!;
    s.send("edgeClick", { id: e.id });
    expect(s.state.inspector.mode).toBe("edge");
    s.send("f.edit", [`e:${e.id}`, "cond"], { value: "!limited" });
    s.send("f.edit", [`e:${e.id}`, "payload"], {
      value: "count:number=9\nttl:number=60",
    });
    s.send("f.edit", [`e:${e.id}`, "rid"], { value: "no" });
    const after = findEdge(model(s), e.id)!;
    expect(after.cond).toBe("!limited");
    expect(after.payload.map((f) => f.name)).toEqual(["count", "ttl"]);
    expect(after.rid).toBe(false);
    s.send("delSel");
    expect(findEdge(model(s), e.id)).toBeUndefined();
    expect(s.state.sel.kind).toBe("none");
  });
  test("onError is a choice among the handlers", () => {
    const s = ready();
    s.send("nodeDown", { id: "pgu", x: 0, y: 0 });
    s.send("cvUp");
    const f = s.state.inspector.fields.find((x) => x.name === "onError")!;
    expect(f.choices.find((c) => c.selected)?.v).toBe("efail");
    s.send("f.edit", ["n:pgu", "onError"], { value: "" });
    expect(
      model(s).edges.some((x) => x.from === "pgu" && x.kind === "error"),
    ).toBe(false);
  });
  test("Delete removes the selected node with its edges; undo brings it back", () => {
    const s = ready();
    const nodes = model(s).nodes.length;
    s.send("nodeDown", { id: "habort", x: 0, y: 0 });
    s.send("cvUp");
    key(s, "Delete");
    expect(model(s).nodes).toHaveLength(nodes - 1);
    expect(s.state.live).toBe("Deleted http.aborted");
    key(s, "z", true);
    expect(model(s).nodes).toHaveLength(nodes);
    key(s, "y", true);
    expect(model(s).nodes).toHaveLength(nodes - 1);
  });
  test("duplicate", () => {
    const s = ready();
    s.send("nodeDown", { id: "h1", x: 0, y: 0 });
    s.send("cvUp");
    s.send("dupNode");
    expect(model(s).nodes.at(-1)).toMatchObject({
      title: "auth.login",
      kind: "handler",
    });
    expect(s.state.sel).toEqual({
      kind: "node",
      id: model(s).nodes.at(-1)!.id,
    });
  });
  test("the project name", () => {
    const s = ready();
    s.send("setName", undefined, { value: "My flow" });
    expect(s.state.projectName).toBe("My flow");
  });
});

describe("the keyboard", () => {
  test("arrows move the selection between nodes and say what is selected", () => {
    const s = ready();
    key(s, "ArrowRight");
    expect(s.state.sel.kind).toBe("node");
    const first = s.state.sel.id;
    expect(s.state.live).toMatch(
      /^(UI event|Pure handler|Plugin effect|Frontend handler|HTTP route|Error message|State key|External) /,
    );
    key(s, "ArrowRight");
    const second = s.state.sel.id;
    expect(second).not.toBe(first);
    const p = layoutOf(model(s)).nodes;
    expect(p.find((n) => n.id === second)!.x).toBeGreaterThan(
      p.find((n) => n.id === first)!.x,
    );
    key(s, "ArrowLeft");
    expect(s.state.sel.id).toBe(first);
    expect(s.last.find((e) => e.plugin === "time")).toMatchObject({
      type: "setTimeout",
      replyTo: "focusNode",
    });
    s.send("focusNode", second);
    expect(s.last[0]).toMatchObject({
      plugin: "dom",
      type: "focus",
      selector: `#fs-n-${second}`,
    });
  });
  test("Enter focuses the first field of the inspector", () => {
    const s = ready();
    key(s, "ArrowDown");
    key(s, "Enter");
    expect(s.state.side).toBe("inspect");
    expect(s.state.sideOpen).toBe(true);
    expect(s.last.find((e) => e.plugin === "time")).toMatchObject({
      replyTo: "focusField",
    });
    s.send("focusField");
    expect(s.last[0]).toMatchObject({ plugin: "dom", type: "focus" });
    expect((s.last[0] as unknown as { selector: string }).selector).toMatch(
      /^#fs-f-n_/,
    );
  });
  test("Space steps the simulation", () => {
    const s = ready();
    key(s, " ");
    expect(s.state.pos).toBe(0);
    key(s, " ");
    expect(s.state.pos).toBe(1);
    key(s, ",");
    expect(s.state.pos).toBe(0);
    key(s, ".");
    expect(s.state.pos).toBe(1);
  });
  test("R runs, P plays and pauses, + - 0 zoom, Escape clears", () => {
    const s = ready();
    key(s, "r");
    expect(s.state.playing).toBe(true);
    key(s, "p");
    expect(s.state.playing).toBe(false);
    const z = s.state.vp.z;
    key(s, "+");
    expect(s.state.vp.z).toBeGreaterThan(z);
    key(s, "-");
    key(s, "0");
    expect(s.state.vp.z).toBeLessThan(0.5);
    key(s, "ArrowRight");
    key(s, "Escape");
    expect(s.state.sel.kind).toBe("none");
  });
  test("the shortcuts are off while a sheet is open", () => {
    const s = ready();
    s.send("sheet", "demos");
    key(s, " ");
    expect(s.state.trace).toBeNull();
    key(s, "Escape");
    expect(s.state.sheet.open).toBe("");
  });
  test("the arrows do nothing outside the flow view", () => {
    const s = ready();
    s.send("setView", "catalog");
    key(s, "ArrowRight");
    expect(s.state.sel.kind).toBe("none");
  });
});

describe("the files", () => {
  test("every edit is saved in the browser; a saved flow is opened on enter", () => {
    const s = ready();
    s.send("addNodeOf", ["handler", "x.y"]);
    const saved = s.last.find(
      (e) => e.plugin === "local" && e.type === "save",
    ) as unknown as { text: string };
    expect(typeof parseProject(saved.text)).not.toBe("string");
    const fresh = ready();
    fresh.state = { ...fresh.state, ready: false };
    fresh.send("loaded", { text: saved.text });
    expect(fresh.state.ready).toBe(true);
    expect(fresh.state.message).toBe("Opened your saved flow");
    expect(model(fresh).nodes.some((n) => n.title === "x.y")).toBe(true);
  });
  test("nothing saved, or a bad copy, opens the demo", () => {
    for (const text of [null, "{", JSON.stringify({ nodes: [], edges: [] })]) {
      const s = ready();
      s.state = { ...s.state, ready: false };
      s.send("loaded", { text });
      expect(s.state.ready).toBe(true);
      expect(s.state.projectName).toBe("Login with rate limit");
    }
  });
  test("enter asks for the shortcuts of this page only, the saved flow and the motion query", () => {
    const s = ready();
    s.send("enter");
    const keys = s.last.find(
      (e) => e.plugin === "local" && e.type === "keys",
    ) as unknown as { root: string; keys: string[] };
    expect(keys.root).toBe(".fs");
    expect(keys.keys).toContain(" ");
    expect(
      s.last.find((e) => e.plugin === "local" && e.type === "media"),
    ).toMatchObject({ query: "(prefers-reduced-motion: reduce)" });
    expect(
      s.last.find((e) => e.plugin === "local" && e.type === "load"),
    ).toMatchObject({ key: STORAGE_KEY });
    s.send("leave");
    expect(kinds(s.last)).toContain("local.unkeys");
  });
  test("export downloads the JSON, copy puts it on the clipboard", () => {
    const s = ready();
    s.send("exportJson");
    const d = s.last[0] as unknown as {
      type: string;
      name: string;
      text: string;
    };
    expect(d).toMatchObject({
      type: "download",
      name: "login-with-rate-limit.flow.json",
    });
    expect(parseProject(d.text)).toEqual(model(s));
    s.send("copyJson");
    expect(s.last[0]).toMatchObject({ plugin: "local", type: "copy" });
  });
  test("import JSON: replaces the flow, or says what is wrong", () => {
    const s = ready();
    s.send("sheet", "import");
    s.send("importText", undefined, { value: "{" });
    s.send("importApply");
    expect(s.state.sheet.error).toMatch(/Not valid JSON/);
    const other = addNode(emptyModel(), "handler", "imported.one");
    s.send("importText", undefined, {
      value: projectText({ ...other.model, name: "Imported!" }),
    });
    s.send("importApply");
    expect(s.state.projectName).toBe("Imported!");
    expect(s.state.sheet.open).toBe("");
    s.send("undo");
    expect(s.state.projectName).toBe("Login with rate limit");
  });
  test("a picked file fills the import box", () => {
    const s = ready();
    s.send("importFile");
    expect(s.last[0]).toMatchObject({
      plugin: "files",
      type: "pick",
      onSuccess: "importPicked",
    });
    s.send("importPicked", { name: "a.json", text: "hello" });
    expect(s.state.sheet).toMatchObject({ open: "import", text: "hello" });
    s.send("importFailed");
    expect(s.state.sheet.error).toContain("could not be read");
  });
  test("Visual Builder: the frontend of a project fills the Browser lane", () => {
    const s = ready();
    s.send("loadDemo", "blank");
    s.send("sheet", "vb");
    s.send("importText", undefined, {
      value: vbText(VB.find((d) => d.id === "users")!.make()),
    });
    s.send("importApply");
    expect(s.state.message).toMatch(
      /^Imported the Browser lane: \d+ events, \d+ HTTP calls to \d+ routes/,
    );
    expect(
      model(s).nodes.some(
        (n) => n.kind === "route" && n.title === "GET /api/users",
      ),
    ).toBe(true);
    s.send("run");
    expect(s.state.runbar.status).toContain("responded 200");
    // an empty box takes the todo demo of the Visual Builder
    const t = ready();
    t.send("sheet", "vb");
    t.send("vbApply");
    expect(model(t).nodes.some((n) => n.title === "GET /api/todos")).toBe(true);
    t.send("sheet", "vb");
    t.send("importText", undefined, { value: "nope" });
    t.send("vbApply");
    expect(t.state.sheet.error).toMatch(/Not valid JSON/);
  });
});

describe("what is drawn", () => {
  test("the first paint mounts the canvas and the minimap, later ones update them", () => {
    const s = ready();
    s.send("sync");
    const svgFx = s.last.filter((e) => e.plugin === "svg");
    expect(svgFx.map((e) => `${e.type}:${e.target}`)).toEqual([
      "mount:#fs-flow",
      "mount:#fs-minimap",
    ]);
    s.send("zoomIn");
    expect(s.last.filter((e) => e.plugin === "svg").map((e) => e.type)).toEqual(
      ["update", "update"],
    );
    s.send("missFlow");
    expect(s.last.filter((e) => e.plugin === "svg").map((e) => e.type)).toEqual(
      ["mount", "mount"],
    );
  });
  test("each view draws its own svg", () => {
    const s = ready();
    for (const [v, target] of [
      ["sequence", "#fs-seq"],
      ["timeline", "#fs-time"],
    ] as const) {
      s.send("setView", v);
      expect(
        s.last.some((e) => e.plugin === "svg" && e.target === target),
      ).toBe(true);
    }
    s.send("setView", "catalog");
    expect(s.last.some((e) => e.plugin === "svg")).toBe(false);
  });
  test("nothing is drawn before the containers exist", () => {
    const s = sim(initial);
    s.send("zoomIn");
    expect(s.last.some((e) => e.plugin === "svg")).toBe(false);
  });
  test("messages of the svg carry the prefix of the page", () => {
    const s = ready();
    s.send("gotPrefix", "templates-flow-studio.");
    const tree = trees(coreFrom(s.state)).find(
      (t) => t.target === "#fs-flow",
    )!.tree;
    expect(JSON.stringify(tree)).toContain(
      '"id":"templates-flow-studio.nodeDown"',
    );
  });
  test("a node drag is drawn at the pointer before it is committed", () => {
    const s = ready();
    s.send("nodeDown", { id: "h1", x: 0, y: 0 });
    const a = JSON.stringify(trees(coreFrom(s.state))[0].tree);
    s.send("cvMove", { x: 220, y: 90 });
    s.send("cvMove", { x: 240, y: 95 });
    expect(JSON.stringify(trees(coreFrom(s.state))[0].tree)).not.toBe(a);
  });
  test("a narrow screen: the side panel is a sheet that opens and closes", () => {
    const s = ready();
    expect(s.state.sideOpen).toBe(false);
    s.send("toggleSide");
    expect(s.state.sideOpen).toBe(true);
    s.send("setSide", "debug");
    expect(s.state.side).toBe("debug");
    expect(s.state.sideOpen).toBe(true);
  });
});

describe("the shortcuts plugin", () => {
  function setup(root = ".fs") {
    document.body.innerHTML = `<div class="${root.slice(1)}"><button id="b">b</button><input id="i"/><svg><g id="g" tabindex="0"></g></svg></div>`;
    const got: Message[] = [];
    const plugin = createLocalPlugin({ document });
    const ctx = { dispatch: (m: Message) => got.push(m) } as never;
    plugin.handle(
      {
        plugin: "local",
        type: "keys",
        onMessage: "key",
        root,
        keys: [" ", "Enter", "b", "ArrowRight"],
      } as never,
      ctx,
    );
    const press = (
      target: Element,
      k: string,
      init: KeyboardEventInit = {},
    ) => {
      const ev = new KeyboardEvent("keydown", {
        key: k,
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(ev);
      return ev;
    };
    return { got, press, plugin };
  }
  test("sends the wanted keys, and only while its root is on the page", () => {
    const { got, press } = setup();
    const g = document.getElementById("g")!;
    const ev = press(g, " ");
    expect(got).toEqual([
      { id: "key", payload: { key: " ", ctrl: false, shift: false } },
    ]);
    expect(ev.defaultPrevented).toBe(true);
    press(g, "q");
    expect(got).toHaveLength(1);
    document.body.innerHTML = "";
    press(document.body, "b");
    expect(got).toHaveLength(1);
  });
  test("a focused button or link keeps its own Space and Enter; text fields are left alone", () => {
    const { got, press } = setup();
    press(document.getElementById("b")!, " ");
    press(document.getElementById("b")!, "Enter");
    press(document.getElementById("i")!, "b");
    expect(got).toEqual([]);
    press(document.getElementById("b")!, "ArrowRight");
    expect(got).toHaveLength(1);
  });
  test("the Visual Builder keeps its keys (its own root and list)", () => {
    document.body.innerHTML = `<div class="vb"></div>`;
    const got: Message[] = [];
    const plugin = createLocalPlugin({ document });
    plugin.handle(
      { plugin: "local", type: "keys", onMessage: "key" } as never,
      { dispatch: (m: Message) => got.push(m) } as never,
    );
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
    );
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    expect(got.map((m) => (m.payload as { key: string }).key)).toEqual([
      "Delete",
    ]);
  });
  test("a media query is answered", () => {
    const got: Message[] = [];
    window.matchMedia = ((q: string) => ({
      matches: q.includes("reduce"),
    })) as never;
    createLocalPlugin({ document }).handle(
      {
        plugin: "local",
        type: "media",
        query: "(prefers-reduced-motion: reduce)",
        onSuccess: "gotMotion",
      } as never,
      { dispatch: (m: Message) => got.push(m) } as never,
    );
    expect(got).toEqual([{ id: "gotMotion", payload: { matches: true } }]);
  });
});
