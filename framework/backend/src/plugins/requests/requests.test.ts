import { describe, expect, it } from "vitest";
import {
  applyRequestsEffect,
  createRequestsPlugin,
  requestsEffector as rq,
  type ServerState,
} from "./mod.ts";

const ctx = { rid: "r1", conn: "http" };
const stamp = <T extends object>(e: T) => ({ ...e, ctx });

describe("requests slice", () => {
  it("opens and drops slices", () => {
    const p = createRequestsPlugin();
    p.open("r1");
    p.open("r1");
    expect(p.getState().requests).toEqual({ r1: {} });
    p.drop("r1");
    expect(p.getState().requests).toEqual({});
    p.drop("r1");
  });
  it("shared.remove deletes the key, not just its value", () => {
    let s: ServerState = {
      requests: {},
      shared: { conns: { a: { n: 1 }, b: { n: 2 } } },
    };
    s = applyRequestsEffect(s, rq.sharedRemove("conns.a") as never);
    expect(s.shared).toEqual({ conns: { b: { n: 2 } } });
    expect("a" in (s.shared.conns as object)).toBe(false);
  });
  it("req.set / req.merge write under the rid only", () => {
    let s: ServerState = { requests: { r1: {}, r2: {} }, shared: {} };
    s = applyRequestsEffect(s, stamp(rq.set("user.id", 7)) as never);
    s = applyRequestsEffect(s, stamp(rq.merge({ step: "auth" })) as never);
    expect(s.requests).toEqual({
      r1: { user: { id: 7 }, step: "auth" },
      r2: {},
    });
  });
  it("replaces slices instead of mutating them (the map is updated in place)", () => {
    const s: ServerState = { requests: { r1: { a: 1 } }, shared: {} };
    const before = s.requests.r1;
    const next = applyRequestsEffect(s, stamp(rq.set("a", 2)) as never);
    expect(before).toEqual({ a: 1 });
    expect(next.requests.r1).toEqual({ a: 2 });
    expect(next).not.toBe(s); // the root is new, so onState fires
  });
  it("ignores writes for a rid without a slice", () => {
    const s: ServerState = { requests: {}, shared: {} };
    expect(applyRequestsEffect(s, stamp(rq.set("a", 1)) as never)).toBe(s);
  });
  it("req.clear empties the slice, shared.set writes shared", () => {
    let s: ServerState = { requests: { r1: { a: 1 } }, shared: {} };
    s = applyRequestsEffect(s, stamp(rq.clear()) as never);
    expect(s.requests.r1).toEqual({});
    s = applyRequestsEffect(s, rq.sharedSet("limits.max", 3) as never);
    s = applyRequestsEffect(s, rq.sharedMerge({ x: 1 }, "limits") as never);
    expect(s.shared).toEqual({ limits: { max: 3, x: 1 } });
  });
  it("the plugin applies effects through handle and keeps extra state", () => {
    const p = createRequestsPlugin<ServerState & { n: number }>({ n: 1 });
    p.open("r1");
    p.handle(stamp(rq.set("a", 1)) as never, {} as never);
    expect(p.getState()).toMatchObject({ n: 1, requests: { r1: { a: 1 } } });
    p.handle(
      { plugin: "requests", type: "state.set", path: "n", value: 2 } as never,
      {} as never,
    );
    expect(p.getState().n).toBe(2);
  });
  it("dispatch and done re-dispatch with the effect ctx", () => {
    const p = createRequestsPlugin();
    const seen: unknown[] = [];
    const pc = { dispatch: (m: unknown) => seen.push(m) } as never;
    p.handle(stamp(rq.dispatch({ id: "x", payload: 1 })) as never, pc);
    p.handle(stamp(rq.done()) as never, pc);
    expect(seen).toEqual([
      { id: "x", payload: 1, ctx },
      { id: "request.done", ctx },
    ]);
  });
});
