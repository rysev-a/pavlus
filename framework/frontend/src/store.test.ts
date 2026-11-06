import { describe, expect, test } from "vitest";
import {
  applyChange,
  createStorePlugin,
  type StoreChange,
} from "./plugins/store/mod.ts";
import { storeEffector as store } from "./plugins/store/helpers.ts";

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

describe("store update (recipe)", () => {
  interface Cart {
    title: string;
    lines: { id: number; qty: number }[];
  }
  const cart = (): Cart => ({
    title: "cart",
    lines: [
      { id: 1, qty: 1 },
      { id: 2, qty: 2 },
    ],
  });

  test("a recipe mutates a draft; sharing keeps untouched branches", () => {
    const initial = cart();
    const s = createStorePlugin<Cart>(initial);
    s.handle(
      {
        plugin: "store",
        type: "update",
        recipe: ((d: Cart) => {
          d.lines[0]!.qty++;
        }) as never,
      },
      ctx,
    );
    const next = s.getState();
    expect(next.lines[0]!.qty).toBe(2);
    expect(next.lines[1]).toBe(initial.lines[1]);
    expect(next.title).toBe("cart");
  });

  test("a no-op recipe changes nothing and answers nothing", () => {
    const s = createStorePlugin<Cart>(cart());
    const before = s.getState();
    const seen: string[] = [];
    const c = { ...ctx, dispatch: (m: { id: string }) => void seen.push(m.id) };
    s.handle(
      {
        plugin: "store",
        type: "update",
        recipe: ((d: Cart) => {
          d.lines.length;
        }) as never,
        onSuccess: "done",
      },
      c,
    );
    expect(s.getState()).toBe(before);
    expect(seen).toEqual([]);
  });

  test("undo restores the covered branch", () => {
    const s = createStorePlugin<Cart>(cart());
    s.handle(
      {
        plugin: "store",
        type: "update",
        recipe: ((d: Cart) => {
          d.lines[0]!.qty = 9;
          d.lines[0]!.id = 7;
        }) as never,
      },
      ctx,
    );
    expect(s.getState().lines[0]).toEqual({ id: 7, qty: 9 });
    expect(s.history[0]!.restoreEffect).toEqual({
      plugin: "store",
      type: "set",
      path: "lines.0",
      value: { id: 1, qty: 1 },
    });
    s.handle({ plugin: "store", type: "undo" }, ctx);
    expect(s.getState()).toEqual(cart());
  });

  test("onSuccess sees { prev, next }", () => {
    const s = createStorePlugin<Cart>(cart());
    let payload: unknown;
    const c = {
      ...ctx,
      dispatch: (m: { id: string; payload: unknown }) => {
        if (m.id === "saved") payload = m.payload;
      },
    };
    s.handle(
      {
        plugin: "store",
        type: "update",
        recipe: ((d: Cart) => {
          d.title = "new";
        }) as never,
        onSuccess: "saved",
      },
      c,
    );
    const p = payload as { prev: Cart; next: Cart };
    expect(p.prev.title).toBe("cart");
    expect(p.next.title).toBe("new");
    expect(p.next.lines).toBe(p.prev.lines);
  });

  test("the storeEffector.update helper builds the effect", () => {
    const s = createStorePlugin<Cart>(cart());
    s.handle(
      store.update<Cart>((d) => {
        d.title = "helper";
        d.lines[1]!.qty = 5;
      }),
      ctx,
    );
    const next = s.getState();
    expect(next.title).toBe("helper");
    expect(next.lines[1]!.qty).toBe(5);
    // one entry in history however many fields the recipe touched;
    // disjoint branches (title + lines) restore the whole state
    expect(s.history.length).toBe(1);
    expect(s.history[0]!.restoreEffect.path).toBe("");
  });
});
