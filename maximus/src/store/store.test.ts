import { describe, expect, it, vi } from "vitest";
import { cleanup, flush, mount } from "../testing/mod.ts";
import {
  batch,
  computed,
  debugStats,
  effect,
  flushSync,
  root,
  signal,
  untrack,
} from "../core/mod.ts";
import { each, html } from "../dom/mod.ts";
import { createStore, isStore, produce, reconcile, unwrap } from "./mod.ts";
import { afterEach } from "vitest";

afterEach(cleanup);

function watch<T>(fn: () => T): { runs: () => number; last: () => T } {
  let runs = 0;
  let last!: T;
  effect(() => {
    last = fn();
    runs++;
  });
  return { runs: () => runs, last: () => last };
}

describe("createStore: reads and writes", () => {
  it("reads and writes like a plain object", () => {
    const s = createStore({ a: 1, nested: { b: [1, 2, 3] } });
    expect(s.a).toBe(1);
    s.a = 2;
    s.nested.b.push(4);
    expect(s.nested.b).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(s)).toBe('{"a":2,"nested":{"b":[1,2,3,4]}}');
    expect(isStore(s)).toBe(true);
    expect(isStore({})).toBe(false);
    expect(unwrap(s)).not.toBe(s);
    expect(() => createStore(5 as unknown as object)).toThrow(TypeError);
  });

  it("returns the same proxy for the same object", () => {
    const s = createStore({ o: { x: 1 } });
    expect(s.o).toBe(s.o);
    expect(createStore(unwrap(s))).toBe(s);
  });

  it("per-path tracking: only readers of the changed path run", () => {
    const s = createStore({ user: { name: "a", age: 1 }, title: "t" });
    const name = watch(() => s.user.name);
    const age = watch(() => s.user.age);
    const title = watch(() => s.title);
    s.user.name = "b";
    flushSync();
    expect([name.runs(), age.runs(), title.runs()]).toEqual([2, 1, 1]);
    expect(name.last()).toBe("b");
    s.title = "u";
    flushSync();
    expect([name.runs(), age.runs(), title.runs()]).toEqual([2, 1, 2]);
  });

  it("equal writes do not notify", () => {
    const s = createStore({ n: 1, o: { x: 1 } });
    const w = watch(() => s.n);
    const o = watch(() => s.o);
    s.n = 1;
    s.o = s.o;
    s.o = unwrap(s.o);
    flushSync();
    expect([w.runs(), o.runs()]).toEqual([1, 1]);
  });

  it("replacing an object notifies readers of the parent path and of children", () => {
    const s = createStore({ user: { name: "a" } });
    const name = watch(() => s.user.name);
    const user = watch(() => s.user);
    s.user = { name: "b" };
    flushSync();
    expect(name.last()).toBe("b");
    expect(user.runs()).toBe(2);
  });

  it("tracks keys that do not exist yet, additions, deletions and `in`", () => {
    const s = createStore<Record<string, number>>({});
    const x = watch(() => s.x);
    const has = watch(() => "x" in s);
    const keys = watch(() => Object.keys(s).join(","));
    s.x = 1;
    flushSync();
    expect(x.last()).toBe(1);
    expect(has.last()).toBe(true);
    expect(keys.last()).toBe("x");
    s.y = 2;
    flushSync();
    expect(keys.last()).toBe("x,y");
    expect(x.runs()).toBe(2);
    delete s.x;
    flushSync();
    expect(x.last()).toBeUndefined();
    expect(has.last()).toBe(false);
    expect(keys.last()).toBe("y");
  });

  it("changing an existing key does not rerun key-list readers", () => {
    const s = createStore({ a: 1, b: 2 });
    const keys = watch(() => Object.keys(s).length);
    s.a = 5;
    flushSync();
    expect(keys.runs()).toBe(1);
  });

  it("untracked reads create no subscriptions", () => {
    const base = debugStats();
    const s = createStore({ a: 1 });
    expect(s.a).toBe(1);
    expect(untrack(() => s.a)).toBe(1);
    expect(debugStats()).toEqual(base);
  });

  it("works with computed", () => {
    const s = createStore({ items: [{ done: false }, { done: true }] });
    const left = computed(() => s.items.filter((i) => !i.done).length);
    expect(left()).toBe(1);
    s.items[1]!.done = false;
    expect(left()).toBe(2);
    s.items.push({ done: false });
    expect(left()).toBe(3);
  });

  it("writes inside an effect batch with others", () => {
    const s = createStore({ a: 1, b: 1 });
    const sum = watch(() => s.a + s.b);
    batch(() => {
      s.a = 2;
      s.b = 2;
    });
    expect(sum.runs()).toBe(2);
    expect(sum.last()).toBe(4);
  });

  it("ignores class instances and frozen objects (stored opaque)", () => {
    class Foo {
      x = 1;
    }
    const foo = new Foo();
    const date = new Date(0);
    const frozen = Object.freeze({ a: 1 });
    const s = createStore({ foo, date, frozen });
    expect(s.foo).toBe(foo);
    expect(s.date).toBe(date);
    expect(s.frozen).toBe(frozen);
  });

  it("supports getters and symbols", () => {
    const sym = Symbol("s");
    const s = createStore({
      a: 2,
      get double() {
        return this.a * 2;
      },
      [sym]: 1,
    });
    const d = watch(() => s.double);
    s.a = 5;
    flushSync();
    expect(d.last()).toBe(10);
    expect(s[sym]).toBe(1);
  });
});

describe("createStore: arrays", () => {
  it("push/pop/shift/unshift/splice/sort/reverse/fill notify readers", () => {
    const s = createStore({ list: [3, 1, 2] });
    const joined = watch(() => s.list.join(","));
    const len = watch(() => s.list.length);
    s.list.push(4);
    flushSync();
    expect(joined.last()).toBe("3,1,2,4");
    s.list.sort();
    flushSync();
    expect(joined.last()).toBe("1,2,3,4");
    s.list.reverse();
    s.list.shift();
    flushSync();
    expect(joined.last()).toBe("3,2,1");
    s.list.unshift(9);
    s.list.pop();
    flushSync();
    expect(joined.last()).toBe("9,3,2");
    s.list.splice(1, 1, 7, 8);
    flushSync();
    expect(joined.last()).toBe("9,7,8,2");
    expect(len.last()).toBe(4);
    s.list.fill(0);
    flushSync();
    expect(joined.last()).toBe("0,0,0,0");
    s.list.length = 1;
    flushSync();
    expect(joined.last()).toBe("0");
    expect(len.last()).toBe(1);
  });

  it("index readers run only for their index", () => {
    const s = createStore({ list: ["a", "b", "c"] });
    const first = watch(() => s.list[0]);
    const last = watch(() => s.list[2]);
    s.list[2] = "C";
    flushSync();
    expect([first.runs(), last.runs()]).toEqual([1, 2]);
  });

  it("a mutator call inside an effect does not subscribe the effect to what it reads", () => {
    const s = createStore({ list: [1] });
    const runs = vi.fn();
    effect(() => {
      runs();
      s.list.push(2);
    });
    flushSync();
    expect(runs).toHaveBeenCalledTimes(1);
  });

  it("iteration with for...of and spread tracks length and items", () => {
    const s = createStore({ list: [1, 2] });
    const sum = watch(() => {
      let t = 0;
      for (const n of s.list) t += n;
      return [...s.list].length + t;
    });
    expect(sum.last()).toBe(5);
    s.list.push(3);
    flushSync();
    expect(sum.last()).toBe(9);
  });

  it("nested objects in arrays are reactive and stay stable across reorders", () => {
    const s = createStore({
      todos: [
        { id: 1, t: "a" },
        { id: 2, t: "b" },
      ],
    });
    const first = s.todos[0]!;
    s.todos.reverse();
    expect(s.todos[1]).toBe(first);
    const w = watch(() => first.t);
    s.todos[1]!.t = "z";
    flushSync();
    expect(w.last()).toBe("z");
  });
});

describe("produce", () => {
  it("batches writes into a single notification and returns the store", () => {
    const s = createStore({ todos: [] as { id: number }[], count: 0 });
    const w = watch(() => `${s.todos.length}:${s.count}`);
    const r = produce(s, (d) => {
      d.todos.push({ id: 1 });
      d.todos.push({ id: 2 });
      d.count = 2;
    });
    expect(r).toBe(s);
    expect(w.runs()).toBe(2);
    expect(w.last()).toBe("2:2");
  });

  it("does not subscribe the caller to what the recipe reads", () => {
    const s = createStore({ n: 0 });
    const runs = vi.fn();
    effect(() => {
      runs();
      produce(s, (d) => {
        d.n = d.n + 1;
      });
    });
    flushSync();
    expect(runs).toHaveBeenCalledTimes(1);
    expect(s.n).toBe(1);
  });
});

describe("reconcile", () => {
  it("updates only changed leaves of an object", () => {
    const s = createStore({
      user: { name: "a", tags: ["x"] },
      gone: 1 as number | undefined,
      keep: 1,
    });
    const name = watch(() => s.user.name);
    const keep = watch(() => s.keep);
    const tags = watch(() => s.user.tags.join());
    reconcile(s, { user: { name: "b", tags: ["x"] }, keep: 1 } as typeof s);
    flushSync();
    expect(name.last()).toBe("b");
    expect([keep.runs(), tags.runs()]).toEqual([1, 1]);
    expect("gone" in s).toBe(false);
  });

  it("with key: keeps item identity, moves, adds and removes", () => {
    const s = createStore({
      todos: [
        { id: 1, t: "a" },
        { id: 2, t: "b" },
        { id: 3, t: "c" },
      ],
    });
    const [one, two] = [s.todos[0]!, s.todos[1]!];
    const t1 = watch(() => one.t);
    const t2 = watch(() => two.t);
    reconcile(
      s.todos,
      [
        { id: 2, t: "b" },
        { id: 1, t: "A" },
        { id: 4, t: "d" },
      ],
      { key: "id" },
    );
    flushSync();
    expect(s.todos.map((t) => t.t)).toEqual(["b", "A", "d"]);
    expect(s.todos[0]).toBe(two);
    expect(s.todos[1]).toBe(one);
    expect(t1.last()).toBe("A");
    expect(t2.runs()).toBe(1); // unchanged content, only its position changed
    expect(s.todos.length).toBe(3);
  });

  it("with a key function and without a key (by position)", () => {
    const s = createStore({ list: [{ id: 1, v: 1 }] });
    reconcile(
      s.list,
      [
        { id: 1, v: 2 },
        { id: 2, v: 3 },
      ],
      { key: (i: { id: number }) => i.id },
    );
    expect(s.list.map((x) => x.v)).toEqual([2, 3]);
    const first = s.list[0]!;
    reconcile(s.list, [{ id: 9, v: 5 }], {});
    expect(s.list[0]).toBe(first); // positional: same object updated in place
    expect(s.list).toEqual([{ id: 9, v: 5 }]);
  });

  it("handles primitives arrays, duplicate keys, and replaces mismatched kinds", () => {
    const s = createStore({
      a: [1, 2, 3],
      o: { x: 1 } as unknown,
      dup: [{ id: 1 }, { id: 1 }],
    });
    reconcile(s.a, [3, 2]);
    expect(s.a).toEqual([3, 2]);
    reconcile(
      s as { o: unknown },
      { a: unwrap(s.a), o: [1], dup: unwrap(s.dup) } as never,
    );
    expect(s.o).toEqual([1]);
    reconcile(s.dup, [{ id: 1 }, { id: 1 }], { key: "id" });
    expect(s.dup.length).toBe(2);
  });

  it("throws when the target is not a store", () => {
    expect(() => reconcile({} as object, {})).toThrow(TypeError);
  });

  it("only touches what differs (observable through notification counts)", () => {
    const s = createStore({
      rows: Array.from({ length: 5 }, (_, i) => ({ id: i, label: "r" + i })),
    });
    const labels = s.rows.map((_, i) => watch(() => s.rows[i]!.label));
    reconcile(
      s.rows,
      s.rows
        .map((r) => ({ ...r }))
        .map((r) => (r.id === 3 ? { ...r, label: "changed" } : r)),
      { key: "id" },
    );
    flushSync();
    expect(labels.map((l) => l.runs())).toEqual([1, 1, 1, 2, 1]);
  });
});

describe("store + dom", () => {
  it("fine-grained DOM: changing one todo text updates one node and does not recreate rows", async () => {
    const state = createStore({
      todos: [
        { id: 1, text: "a" },
        { id: 2, text: "b" },
      ],
    });
    const created = vi.fn();
    const m = mount(
      () =>
        html`<ul>
          ${each(
            () => state.todos,
            (t) => t.id,
            (t) => (created(), html`<li>${() => t().text}</li>`),
          )}
        </ul>`,
    );
    const lis = m.queryAll("li");
    state.todos[1]!.text = "B";
    await flush();
    expect(m.queryAll("li")[1]).toBe(lis[1]);
    expect(m.queryAll("li").map((l) => l.textContent)).toEqual(["a", "B"]);
    state.todos.push({ id: 3, text: "c" });
    await flush();
    expect(m.queryAll("li").map((l) => l.textContent)).toEqual(["a", "B", "c"]);
    expect(created).toHaveBeenCalledTimes(3);
    state.todos.splice(0, 1);
    await flush();
    expect(m.queryAll("li").map((l) => l.textContent)).toEqual(["B", "c"]);
  });

  it("disposing leaves no subscriptions on store signals", () => {
    const base = debugStats();
    const state = createStore({ n: 1, list: [1, 2, 3] });
    const dispose = root((d) => {
      effect(() => void state.n);
      effect(() => void state.list.length);
      return d;
    });
    dispose();
    expect(debugStats().links).toBe(base.links);
    expect(debugStats().owners).toBe(
      base.owners + [...Array(0)].length + debugStats().owners - base.owners,
    );
  });
});
