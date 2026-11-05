import { describe, expect, it } from "vitest";
import {
  createTraceBuffer,
  deliver,
  ok,
  fail,
  newRid,
  reply,
  toErrorPayload,
  traceOf,
  defaultTrace,
} from "./ctx.ts";

describe("rid", () => {
  it("is short, url-safe and unique", () => {
    const ids = new Set(Array.from({ length: 5000 }, newRid));
    expect(ids.size).toBe(5000);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });
});

describe("reply / fail", () => {
  const effect = {
    plugin: "pg",
    type: "query",
    replyTo: "got",
    onError: "bad",
    ctx: { rid: "r1", conn: "http" },
  };
  it("copies the effect ctx onto the reply", () => {
    expect(reply(effect, { id: "got", payload: { rows: [] } })).toEqual({
      id: "got",
      payload: { rows: [] },
      ctx: { rid: "r1", conn: "http" },
    });
    expect(reply(effect, { id: "x" }).ctx).toBe(effect.ctx);
  });
  it("fail replies to onError with a normalised error", () => {
    const m = fail(effect, new Error("boom"))!;
    expect(m.id).toBe("bad");
    expect(m.ctx).toBe(effect.ctx);
    expect(m.payload).toMatchObject({ code: "error", message: "boom" });
    expect(
      fail(effect, { code: "23505", message: "dup" })!.payload,
    ).toMatchObject({
      code: "23505",
    });
  });
  it("fail is undefined without onError", () => {
    expect(fail({ ctx: { rid: "r" } }, "x")).toBeUndefined();
  });
  it("fail falls back to a named message when the effect has no onError", () => {
    const e = { ctx: { rid: "r" } };
    const m = fail(e, { code: "ERR", message: "x" }, "pg.error");
    expect(m).toEqual({
      id: "pg.error",
      payload: { code: "ERR", message: "x" },
      ctx: e.ctx,
    });
    expect(fail(effect, "x", "pg.error").id).toBe("bad"); // onError wins
  });
  it("ok answers replyTo, or nothing for fire-and-forget; deliver skips undefined", () => {
    const sent: unknown[] = [];
    deliver((m) => sent.push(m), ok(effect, { n: 1 }));
    deliver((m) => sent.push(m), ok({ ctx: effect.ctx }, 1));
    expect(sent).toEqual([{ id: "got", payload: { n: 1 }, ctx: effect.ctx }]);
  });
  it("toErrorPayload accepts strings and odd values", () => {
    expect(toErrorPayload("no")).toEqual({ code: "error", message: "no" });
    expect(toErrorPayload(42, "n")).toEqual({ code: "n", message: "42" });
  });
});

describe("trace ring buffer", () => {
  it("keeps entries in order and bounds both dimensions", () => {
    const t = createTraceBuffer({ maxRids: 2, maxEntries: 3, now: () => 7 });
    for (const n of ["a", "b", "c", "d"])
      t.add("r1", { kind: "message", name: n });
    expect(t.get("r1").map((e) => e.name)).toEqual(["b", "c", "d"]);
    expect(t.get("r1")[0]!.t).toBe(7);
    t.add("r2", { kind: "effect", name: "x" });
    t.add("r3", { kind: "effect", name: "y" });
    expect(t.size()).toBe(2);
    expect(t.get("r1")).toEqual([]);
    t.delete("r2");
    expect(t.size()).toBe(1);
    t.clear();
    expect(t.size()).toBe(0);
  });
  it("traceOf reads the default buffer", () => {
    defaultTrace.add("zz", { kind: "note", name: "n" });
    expect(traceOf("zz")).toHaveLength(1);
    defaultTrace.delete("zz");
  });
});
