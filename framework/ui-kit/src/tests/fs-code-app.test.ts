// @vitest-environment jsdom

import type { Effect, Message } from "@pavlus/client";
import { describe, expect, test } from "vitest";
import {
  type FsState,
  initial,
  page,
} from "../templates/flow-studio/flow-studio.ts";
import { findDef, projectText } from "../templates/flow-studio/model.ts";

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
    send(
      id: string,
      payload?: unknown,
      event?: { value?: string; key?: string },
    ) {
      const msg: Message = { id, payload };
      if (event) msg.event = { type: "input", ...event };
      self.state = apply(self.state, page.dispatch(msg, self.state));
      return self;
    },
  };
  return self;
}

const ready = () => sim({ ...initial, ready: true });
const root = (s: ReturnType<typeof sim>) => s.state.hist.present;
const withCode = () => {
  const s = ready().send("newCodeModule", "backend");
  const inst = root(s).nodes.find((n) => n.kind === "module")!;
  s.send("nodeDbl", { id: inst.id });
  return { s, inst, def: () => findDef(root(s), inst.ref)! };
};

describe("a module with code in the editor", () => {
  test("a new code module opens as an editor, not a board", () => {
    const { s, def } = withCode();
    expect(def().body).toBe("code");
    expect(s.state.isCodeBody).toBe(true);
    expect(s.state.code?.source).toContain("emit(");
    expect(s.state.code?.syntax).toBe("");
    expect(s.state.code?.probes[0].lines[0]).toContain("service-1.out");
  });

  test("typing changes the source; the checks follow", () => {
    const { s, def } = withCode();
    s.send("codeEdit", undefined, { value: "return [" });
    expect(def().source).toBe("return [");
    expect(s.state.code?.syntax).not.toBe("");
    expect(s.state.code?.issues.some((i) => i.severity === "error")).toBe(true);
  });

  test("Sync ports adds an output for an effect the code emits", () => {
    const { s, def } = withCode();
    s.send("codeEdit", undefined, {
      value: `return [pg.query("select 1", { replyTo: "x" }), emit("service-1.out")];`,
    });
    expect(s.state.code?.missing).toBe("pg.query");
    s.send("modSync", def().id);
    expect(def().outputs.map((o) => o.name)).toEqual([
      "service-1.out",
      "pg.query",
    ]);
    expect(s.state.code?.missing).toBe("");
  });

  test("the body switches to a graph and back; the code is kept", () => {
    const { s, def } = withCode();
    const source = def().source;
    s.send("f.edit", [`mod:${def().id}`, "body"], { value: "graph" });
    expect(def().body).toBe("graph");
    expect(s.state.isCodeBody).toBe(false);
    s.send("f.edit", [`mod:${def().id}`, "body"], { value: "code" });
    expect(def().source).toBe(source);
  });

  test("code that comes in with an import is held until it is enabled", () => {
    const { s, def } = withCode();
    const text = projectText(root(s));
    const fresh = ready();
    fresh
      .send("sheet", "import")
      .send("importText", undefined, { value: text });
    fresh.send("importApply");
    expect(fresh.state.heldCount).toBe(1);
    const held = findDef(root(fresh), def().id)!;
    expect(held.source).toBe("");
    expect(held.held).toContain("emit(");
    fresh.send("enableCode");
    expect(fresh.state.heldCount).toBe(0);
    expect(findDef(root(fresh), def().id)!.source).toContain("emit(");
  });

  test("held code is not run: the simulation sees an empty body", () => {
    const { s } = withCode();
    const fresh = ready();
    fresh
      .send("sheet", "import")
      .send("importText", undefined, { value: projectText(root(s)) })
      .send("importApply");
    fresh.send("run");
    expect(fresh.state.trace).not.toBeNull();
  });
});
