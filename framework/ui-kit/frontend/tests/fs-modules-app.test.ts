// @vitest-environment jsdom

import type { Effect, Message } from "@pavlus/frontend";
import { describe, expect, test } from "vitest";
import {
  coreFrom,
  type FsState,
  initial,
  page,
  STORAGE_KEY,
  trees,
  viewModel,
} from "../templates/flow-studio/flow-studio.ts";
import {
  findDef,
  findEdge,
  findNode,
  parseProject,
} from "../templates/flow-studio/model.ts";
import { flatten } from "../templates/flow-studio/modules.ts";

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
    last: [],
    send(id, payload, event) {
      const msg: Message = { id, payload };
      if (event)
        msg.event = { type: event.key ? "keydown" : "input", ...event };
      const fx = page.dispatch(msg, self.state);
      self.state = apply(self.state, fx);
      self.last = fx;
      return self;
    },
  };
  return self;
}

const ready = (): Sim => sim({ ...initial, ready: true });
const withModules = (): Sim => ready().send("loadDemo", "modules");
const root = (s: Sim) => s.state.hist.present;
const key = (s: Sim, k: string) =>
  s.send("key", { key: k, ctrl: false, shift: false });
const board = (s: Sim): string =>
  JSON.stringify(trees(coreFrom(s.state)).find((t) => t.target === "#fs-flow"));

describe("opening a design with modules", () => {
  test("the demo is on the list and opens at the top level", () => {
    const s = withModules();
    expect(s.state.projectName).toBe("Login in modules");
    expect(s.state.scope).toEqual([]);
    expect(s.state.inModule).toBe(false);
    expect(s.state.summary).toContain("2 modules");
    expect(s.state.library.map((l) => l.name)).toEqual([
      "Rate limit",
      "Check credentials",
    ]);
  });

  test("the board draws the module boxes with their pins", () => {
    const b = board(withModules());
    expect(b).toContain("fs-n--module");
    expect(b).toContain("fs-pin");
    expect(b).toContain("login.allowed");
    expect(b).toContain("rate.limited");
  });

  test("the saved copy keeps the modules", () => {
    const s = withModules();
    const saved = s.last.find((e) => e.plugin === "local" && e.type === "save");
    expect(saved).toMatchObject({ key: STORAGE_KEY });
    const back = parseProject(String((saved as { text?: unknown }).text));
    expect(typeof back).not.toBe("string");
    expect(back).toEqual(root(s));
  });
});

describe("opening a module", () => {
  test("a double click opens the body: the board shows its nodes", () => {
    const s = withModules().send("nodeDbl", { id: "mrate" });
    expect(s.state.scope).toEqual(["mrate"]);
    expect(s.state.inModule).toBe(true);
    expect(s.state.moduleTitle).toBe("Rate limit");
    expect(s.state.crumbs.map((c) => c.title)).toEqual(["Rate limit"]);
    expect(viewModel(s.state).nodes.map((n) => n.id)).toContain("h1");
    expect(findNode(s.state.model, "incr")).toBeDefined();
    expect(board(s)).toContain("auth.login.counted");
    expect(board(s)).not.toContain("Check credentials");
  });

  test("with nothing selected the panel shows the interface of the module", () => {
    const s = withModules().send("nodeDbl", { id: "mrate" });
    expect(s.state.inspector.iface?.name).toBe("Rate limit");
    expect(s.state.inspector.iface?.inputs.map((p) => p.title)).toEqual([
      "auth.login",
    ]);
    expect(s.state.inspector.iface?.outputs.map((p) => p.title)).toEqual([
      "login.allowed",
      "rate.limited",
    ]);
  });

  test("Escape leaves it, the breadcrumb goes up", () => {
    const s = withModules().send("nodeDbl", { id: "mrate" });
    key(s, "Escape");
    expect(s.state.scope).toEqual([]);
    s.send("nodeDbl", { id: "mcreds" }).send("goScope", -1);
    expect(s.state.scope).toEqual([]);
  });

  test("O opens the selected instance; Open module is offered for it", () => {
    const s = withModules().send("nodeDown", { id: "mrate", x: 0, y: 0 });
    s.send("nodeUp", { id: "mrate" });
    expect(s.state.canOpen).toBe(true);
    key(s, "o");
    expect(s.state.scope).toEqual(["mrate"]);
    expect(s.state.canOpen).toBe(false);
  });

  test("a handler is not a module: double click only selects it", () => {
    const s = withModules().send("nodeDbl", { id: "h5" });
    expect(s.state.scope).toEqual([]);
    expect(s.state.sel).toEqual({ kind: "node", id: "h5" });
  });
});

describe("editing inside a module", () => {
  test("a node added inside goes into the module, not the top level", () => {
    const s = withModules().send("nodeDbl", { id: "mrate" });
    const before = root(s).nodes.length;
    const bodyBefore = findDef(root(s), "rate")!.nodes.length;
    s.send("addNodeOf", ["effect", "log"]);
    expect(findDef(root(s), "rate")!.nodes.length).toBe(bodyBefore + 1);
    expect(root(s).nodes.length).toBe(before);
    expect(s.state.sel.kind).toBe("node");
  });

  test("an edit of a node of the body changes the module, and Undo takes it back", () => {
    const s = withModules().send("nodeDbl", { id: "mrate" });
    s.send("nodeDown", { id: "r429", x: 0, y: 0 }).send("nodeUp", {
      id: "r429",
    });
    s.send("f.edit", ["n:r429", "status"], { value: "418" });
    expect(findNode(viewModel(s.state), "r429")!.status).toBe(418);
    expect(
      findDef(root(s), "rate")!.nodes.find((n) => n.id === "r429")!.status,
    ).toBe(418);
    s.send("undo");
    expect(
      findDef(root(s), "rate")!.nodes.find((n) => n.id === "r429")!.status,
    ).toBe(429);
  });

  test("deleting a node of the body leaves the top level alone", () => {
    const s = withModules().send("nodeDbl", { id: "mrate" });
    const top = root(s).nodes.length;
    s.send("nodeDown", { id: "log429", x: 0, y: 0 }).send("nodeUp", {
      id: "log429",
    });
    s.send("delSel");
    expect(findDef(root(s), "rate")!.nodes.some((n) => n.id === "log429")).toBe(
      false,
    );
    expect(root(s).nodes.length).toBe(top);
  });

  test("a module that disappears while open puts the board back at the top", () => {
    const s = withModules().send("nodeDbl", { id: "mrate" });
    s.send("undo");
    s.send("undo");
    s.send("loadDemo", "login");
    expect(s.state.scope).toEqual([]);
  });
});

describe("the run, seen from inside", () => {
  test("a Run plays the whole design; inside a module the token is on its nodes", () => {
    const s = withModules().send("nodeDbl", { id: "mrate" }).send("run");
    expect(s.state.trace).not.toBeNull();
    // the trace is that of the flat design
    expect(s.state.trace!.some((x) => x.to === "mrate/incr")).toBe(true);
    // Step until the rate limiter works, the board of the body marks it busy
    let guard = 0;
    while (guard++ < 40 && !board(s).includes("is-busy")) s.send("step");
    expect(board(s)).toContain("is-busy");
  });

  test("at the top level the box stands for what runs inside it", () => {
    const s = withModules().send("run");
    let guard = 0;
    while (guard++ < 40 && !board(s).includes("is-busy")) s.send("step");
    expect(board(s)).toContain("is-busy");
    expect(s.state.cur.where).not.toContain("/");
  });

  test("a fault set inside a module hits the node of the flat design", () => {
    const s = withModules().send("nodeDbl", { id: "mcreds" });
    s.send("faultNode", ["pgu", "error"]);
    const f = root(s).scenario.faults[0];
    expect(f.target).toBe("mcreds/pgu");
    expect(f.on).toBe(true);
    s.send("run");
    const failed = s.state.trace!.some((x) => x.status === "error");
    expect(failed).toBe(true);
  });

  test("a breakpoint inside a module stops the player on that node", () => {
    const s = withModules().send("nodeDbl", { id: "mcreds" });
    s.send("nodeDown", { id: "verify", x: 0, y: 0 }).send("nodeUp", {
      id: "verify",
    });
    s.send("bpToggle");
    expect(s.state.breakpoints["mcreds/verify"]).toBe(true);
    // the box at the top level shows the mark, too
    s.send("goScope", -1);
    expect(board(s)).toContain("has-bp");
  });
});

describe("the library", () => {
  test("a new module comes with an instance, ready to open", () => {
    const s = ready().send("newModule", "backend");
    expect(root(s).modules).toHaveLength(1);
    const inst = root(s).nodes.find((n) => n.kind === "module")!;
    expect(inst.ref).toBe(root(s).modules[0].id);
    expect(s.state.sel).toEqual({ kind: "node", id: inst.id });
    expect(s.state.inspector.iface?.inputs).toHaveLength(1);
    expect(s.state.library[0]).toMatchObject({
      name: "Service 1",
      side: "server",
    });
  });

  test("a browser module sits in the browser lane", () => {
    const s = ready().send("newModule", "frontend");
    const inst = root(s).nodes.find((n) => n.kind === "module")!;
    expect(inst.lane).toBe("browser");
  });

  test("the palette adds more instances of a module", () => {
    const s = withModules().send("addInstanceOf", "rate");
    expect(root(s).nodes.filter((n) => n.ref === "rate")).toHaveLength(2);
  });

  test("a module cannot be put inside itself", () => {
    const s = withModules().send("nodeDbl", { id: "mrate" });
    expect(s.state.library.find((l) => l.id === "rate")!.ok).toBe(false);
    s.send("addInstanceOf", "rate");
    expect(
      findDef(root(s), "rate")!.nodes.some((n) => n.kind === "module"),
    ).toBe(false);
    expect(s.state.message).toContain("cannot contain itself");
  });

  test("the interface: rename, side, ports", () => {
    const s = withModules().send("nodeDown", { id: "mrate", x: 0, y: 0 });
    s.send("nodeUp", { id: "mrate" });
    expect(s.state.inspector.iface?.name).toBe("Rate limit");
    s.send("f.edit", ["mod:rate", "name"], { value: "Limiter" });
    expect(findDef(root(s), "rate")!.name).toBe("Limiter");
    expect(findNode(root(s), "mrate")!.title).toBe("Limiter");
    s.send("modAddPort", ["rate", "inputs"]);
    expect(findDef(root(s), "rate")!.inputs).toHaveLength(2);
    const port = findDef(root(s), "rate")!.inputs[1];
    s.send("f.edit", [`pi:rate:${port.id}`, "name"], { value: "auth.retry" });
    expect(findDef(root(s), "rate")!.inputs[1].name).toBe("auth.retry");
    s.send("modDelPort", ["rate", "inputs", port.id]);
    expect(findDef(root(s), "rate")!.inputs).toHaveLength(1);
  });

  test("a module with instances cannot be deleted; a free one can", () => {
    const s = withModules().send("modDelete", "rate");
    expect(root(s).modules).toHaveLength(2);
    expect(s.state.message).toContain("still has instances");
    s.send("newModule", "backend");
    const spare = root(s).modules.find((d) => d.name.startsWith("Service"))!;
    s.send("delSel");
    s.send("modDelete", spare.id);
    expect(root(s).modules.some((d) => d.id === spare.id)).toBe(false);
  });

  test("a side change moves the instances to the other lane", () => {
    const s = withModules().send("f.edit", ["mod:rate", "side"], {
      value: "frontend",
    });
    expect(findNode(root(s), "mrate")!.lane).toBe("browser");
  });
});

describe("wiring modules", () => {
  test("a link dragged from an output port leaves by that port", () => {
    const s = withModules();
    const def = findDef(root(s), "rate")!;
    const port = def.outputs.find((p) => p.name === "rate.limited")!;
    s.send("portDown", { id: "mrate", port: "out", pid: port.id, x: 0, y: 0 });
    s.send("nodeUp", { id: "log200" });
    const edge = root(s).edges.find(
      (e) => e.from === "mrate" && e.to === "log200",
    )!;
    expect(edge.fromPort).toBe(port.id);
  });

  test("a link dropped on an input pin arrives at that port", () => {
    const s = withModules().send("addInstanceOf", "creds");
    const second = root(s)
      .nodes.filter((n) => n.ref === "creds")
      .at(-1)!;
    const port = findDef(root(s), "creds")!.inputs[0];
    s.send("portDown", { id: "tok", port: "ok", pid: "", x: 0, y: 0 });
    s.send("pinUp", { id: second.id, pid: port.id });
    const edge = root(s).edges.find((e) => e.to === second.id)!;
    expect(edge.toPort).toBe(port.id);
  });

  test("the edge inspector chooses the port", () => {
    const s = withModules();
    const e = root(s).edges.find(
      (x) => x.from === "mrate" && x.to === "ffail",
    )!;
    s.send("edgeClick", { id: e.id });
    const ids = s.state.inspector.fields.map((f) => f.id);
    expect(ids.some((i) => i.includes("fromPort"))).toBe(true);
    const def = findDef(root(s), "rate")!;
    const other = def.outputs.find((p) => p.name === "login.allowed")!;
    s.send("f.edit", [`e:${e.id}`, "fromPort"], { value: other.id });
    expect(findEdge(root(s), e.id)!.fromPort).toBe(other.id);
    // the message is the name the consumer takes, so it stays
    expect(findEdge(root(s), e.id)!.msg).toBe("onLoginFailed");
  });

  test("the message follows the port when it was the name of the port", () => {
    const s = withModules();
    const e = root(s).edges.find(
      (x) => x.from === "mrate" && x.to === "mcreds",
    )!;
    expect(e.msg).toBe("login.allowed");
    const other = findDef(root(s), "rate")!.outputs.find(
      (p) => p.name === "rate.limited",
    )!;
    s.send("edgeClick", { id: e.id });
    s.send("f.edit", [`e:${e.id}`, "fromPort"], { value: other.id });
    expect(findEdge(root(s), e.id)!.msg).toBe("rate.limited");
  });
});

describe("the other views see the flat design", () => {
  test("Checks, Catalog and Source work with modules", () => {
    const s = withModules();
    s.send("setView", "checks");
    expect(s.state.checks.rows.filter((r) => r.severity === "error")).toEqual(
      [],
    );
    s.send("setView", "catalog");
    expect(s.state.catalog.some((r) => r.id === "login.allowed")).toBe(true);
    s.send("setView", "source");
    expect(s.state.source.files.length).toBeGreaterThan(0);
  });

  test("a check inside a module opens the module", () => {
    const s = withModules();
    // break the body: drop the onError edge of the rate limiter's INCR
    s.send("nodeDbl", { id: "mrate" });
    const err = findDef(root(s), "rate")!.edges.find(
      (e) => e.from === "incr" && e.kind === "error",
    )!;
    s.send("edgeClick", { id: err.id }).send("delSel");
    s.send("goScope", -1).send("setView", "checks");
    const i = s.state.checks.rows.findIndex(
      (r) => r.rule === "missing-onerror",
    );
    expect(i).toBeGreaterThanOrEqual(0);
    s.send("focusIssue", s.state.checks.rows[i].i);
    expect(s.state.tab).toBe("flow");
    expect(s.state.scope).toEqual(["mrate"]);
    expect(s.state.sel).toEqual({ kind: "node", id: "incr" });
  });

  test("flatten of the design shows what the engine plays", () => {
    const f = flatten(root(withModules()));
    expect(f.nodes.some((n) => n.kind === "module")).toBe(false);
    expect(f.nodes.some((n) => n.id === "mrate/h1")).toBe(true);
  });
});
