import { describe, expect, test } from "vitest";
import {
  applyChange,
  createStorePlugin,
  type StoreChange,
} from "./plugins/store/mod.ts";

const ctx = {
  dispatch() {},
  getState: () => undefined as never,
  dispatchEffect() {},
};

describe("store", () => {
  test("restoreEffect brings back the previous value (task.md 3.2)", () => {
    const s = createStorePlugin({
      user: { email: "test@test.com" } as unknown,
    });
    s.handle({ plugin: "store", type: "set", path: "user", value: null }, ctx);
    expect(s.getState()).toEqual({ user: null });
    expect(s.history[0].restoreEffect).toEqual({
      plugin: "store",
      type: "set",
      path: "user",
      value: { email: "test@test.com" },
    });
  });

  test("undo and restoreTo", () => {
    let t = 0;
    const s = createStorePlugin({ n: 0 }, { now: () => ++t });
    for (let i = 1; i <= 4; i++)
      s.handle({ plugin: "store", type: "set", path: "n", value: i }, ctx);
    s.handle({ plugin: "store", type: "undo" }, ctx);
    expect(s.getState().n).toBe(3);
    s.handle({ plugin: "store", type: "restoreTo", timestamp: 1 }, ctx);
    expect(s.getState().n).toBe(1);
  });

  test("structural sharing keeps untouched branches identical", () => {
    const a = { x: { y: 1 }, z: { w: 2 } };
    const b = applyChange(a, {
      plugin: "store",
      type: "set",
      path: "x.y",
      value: 5,
    }) as typeof a;
    expect(b.z).toBe(a.z);
    expect(b.x).not.toBe(a.x);
    expect(
      applyChange(a, { plugin: "store", type: "set", path: "x.y", value: 1 }),
    ).toBe(a);
  });

  test("property: reverting all history returns to the initial state", () => {
    let seed = 99;
    const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const paths = ["a", "a.b", "a.c", "d", "d.0", "e.f.g"];
    for (let run = 0; run < 200; run++) {
      const initial = { a: { b: 1 }, d: [1, 2, 3] } as Record<string, unknown>;
      const s = createStorePlugin<Record<string, unknown>>(initial);
      const n = 1 + Math.floor(r() * 10);
      for (let i = 0; i < n; i++) {
        const path = paths[Math.floor(r() * paths.length)];
        const kind = r();
        const c: StoreChange =
          kind < 0.5
            ? { plugin: "store", type: "set", path, value: Math.floor(r() * 5) }
            : kind < 0.75
              ? { plugin: "store", type: "remove", path }
              : {
                  plugin: "store",
                  type: "merge",
                  path,
                  value: { k: Math.floor(r() * 5) },
                };
        s.handle(c, ctx);
      }
      s.handle({ plugin: "store", type: "undo", steps: 1000 }, ctx);
      expect(s.getState(), `run ${run}`).toEqual(initial);
    }
  });
});
