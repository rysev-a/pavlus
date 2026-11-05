import { describe, expect, it, vi } from "vitest";
import {
  batch,
  computed,
  debugStats,
  effect,
  flushSync,
  signal,
  subscriberCount,
  tick,
  untrack,
  root,
  isSignal,
} from "./mod.ts";

describe("signal", () => {
  it("reads, writes, updates and peeks", () => {
    const s = signal(1);
    expect(s()).toBe(1);
    s.set(2);
    expect(s()).toBe(2);
    s.update((n) => n + 5);
    expect(s.peek()).toBe(7);
    expect(isSignal(s)).toBe(true);
    expect(isSignal(() => 1)).toBe(false);
  });

  it("does not notify on equal writes (Object.is)", () => {
    const s = signal(1);
    const fn = vi.fn();
    effect(() => void fn(s()));
    expect(fn).toHaveBeenCalledTimes(1);
    s.set(1);
    flushSync();
    expect(fn).toHaveBeenCalledTimes(1);
    const n = signal(NaN);
    const g = vi.fn();
    effect(() => void g(n()));
    n.set(NaN);
    flushSync();
    expect(g).toHaveBeenCalledTimes(1);
  });

  it("supports custom equality and equals:false", () => {
    const o = signal({ id: 1 }, { equals: (a, b) => a.id === b.id });
    const fn = vi.fn();
    effect(() => void fn(o()));
    o.set({ id: 1 });
    flushSync();
    expect(fn).toHaveBeenCalledTimes(1);
    o.set({ id: 2 });
    flushSync();
    expect(fn).toHaveBeenCalledTimes(2);

    const always = signal(0, { equals: false });
    const g = vi.fn();
    effect(() => void g(always()));
    always.set(0);
    flushSync();
    expect(g).toHaveBeenCalledTimes(2);
  });
});

describe("computed", () => {
  it("is lazy and cached", () => {
    const a = signal(2);
    const fn = vi.fn(() => a() * 2);
    const d = computed(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(d()).toBe(4);
    expect(d()).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
    a.set(3);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(d()).toBe(6);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(d.peek()).toBe(6);
  });

  it("is glitch-free in a diamond: the join runs once per change and never sees mixed state", () => {
    const a = signal(1);
    const b = computed(() => a() + 1);
    const c = computed(() => a() * 10);
    const seen: string[] = [];
    const join = vi.fn(() => {
      const v = `${b()}:${c()}`;
      seen.push(v);
      return v;
    });
    const d = computed(join);
    const fx = vi.fn();
    effect(() => void fx(d()));
    expect(join).toHaveBeenCalledTimes(1);
    a.set(2);
    flushSync();
    expect(join).toHaveBeenCalledTimes(2);
    expect(fx).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(["2:10", "3:20"]);
  });

  it("stops propagation when a computed result is unchanged", () => {
    const a = signal(1);
    const parity = computed(() => a() % 2);
    const fx = vi.fn();
    effect(() => void fx(parity()));
    a.set(3);
    flushSync();
    expect(fx).toHaveBeenCalledTimes(1);
    a.set(4);
    flushSync();
    expect(fx).toHaveBeenCalledTimes(2);
  });

  it("re-tracks dynamic dependencies", () => {
    const flag = signal(true);
    const x = signal("x");
    const y = signal("y");
    const run = vi.fn();
    const c = computed(() => {
      run();
      return flag() ? x() : y();
    });
    effect(() => void c());
    expect(subscriberCount(x)).toBe(1);
    expect(subscriberCount(y)).toBe(0);
    y.set("y2");
    flushSync();
    expect(run).toHaveBeenCalledTimes(1);
    flag.set(false);
    flushSync();
    expect(c()).toBe("y2");
    expect(subscriberCount(x)).toBe(0);
    expect(subscriberCount(y)).toBe(1);
    x.set("x2");
    flushSync();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("detects circular dependencies with a clear error", () => {
    const a: () => number = computed(() => b() + 1, { name: "a" });
    const b: () => number = computed(() => a() + 1, { name: "b" });
    expect(() => a()).toThrow(/circular dependency/);
  });

  it("caches and rethrows errors, then recovers", () => {
    const s = signal(0);
    const c = computed(() => {
      if (s() === 0) throw new Error("zero");
      return 10 / s();
    });
    expect(() => c()).toThrow("zero");
    expect(() => c()).toThrow("zero");
    s.set(2);
    expect(c()).toBe(5);
  });

  it("forbids writes to signals inside a computed", () => {
    const s = signal(0);
    const c = computed(() => {
      s.set(1);
      return 1;
    });
    expect(() => c()).toThrow(/cannot write/);
  });

  it("allows untracked writes inside a computed", () => {
    const s = signal(0);
    const c = computed(() => untrack(() => (s.set(1), 1)));
    expect(c()).toBe(1);
    expect(s()).toBe(1);
  });
});

describe("effect", () => {
  it("runs immediately, then on change, in a microtask", async () => {
    const s = signal(0);
    const log: number[] = [];
    effect(() => void log.push(s()));
    expect(log).toEqual([0]);
    s.set(1);
    expect(log).toEqual([0]);
    await tick();
    expect(log).toEqual([0, 1]);
  });

  it("coalesces multiple writes into one run", async () => {
    const a = signal(1);
    const b = signal(1);
    const fn = vi.fn();
    effect(() => void fn(a() + b()));
    a.set(2);
    b.set(2);
    await tick();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(4);
  });

  it("batch applies atomically and flushes at the end", () => {
    const a = signal(1);
    const b = signal(1);
    const seen: number[] = [];
    effect(() => void seen.push(a() + b()));
    const result = batch(() => {
      a.set(10);
      b.set(20);
      expect(seen).toEqual([2]);
      return "ok";
    });
    expect(result).toBe("ok");
    expect(seen).toEqual([2, 30]);
  });

  it("nested batches flush once at the outermost end", () => {
    const a = signal(0);
    const fn = vi.fn();
    effect(() => void fn(a()));
    batch(() => {
      batch(() => a.set(1));
      expect(fn).toHaveBeenCalledTimes(1);
      a.set(2);
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(2);
  });

  it("runs the cleanup before each re-run and on stop", () => {
    const s = signal(0);
    const log: string[] = [];
    const stop = effect(() => {
      const v = s();
      log.push(`run${v}`);
      return () => log.push(`clean${v}`);
    });
    s.set(1);
    flushSync();
    stop();
    expect(log).toEqual(["run0", "clean0", "run1", "clean1"]);
    s.set(2);
    flushSync();
    expect(log).toHaveLength(4);
  });

  it("runs effects in creation order (parents before children)", () => {
    const s = signal(0);
    const order: string[] = [];
    effect(() => {
      s();
      order.push("outer");
      effect(() => {
        s();
        order.push("inner");
      });
    });
    order.length = 0;
    s.set(1);
    flushSync();
    // the inner effect of the first run is disposed by the outer re-run and must not run
    expect(order).toEqual(["outer", "inner"]);
  });

  it("disposes nested effects on re-run (no leak)", () => {
    const outer = signal(0);
    const inner = signal(0);
    const base = debugStats();
    const stop = effect(() => {
      outer();
      effect(() => void inner());
    });
    flushSync();
    expect(subscriberCount(inner)).toBe(1);
    for (let i = 1; i <= 5; i++) {
      outer.set(i);
      flushSync();
    }
    expect(subscriberCount(inner)).toBe(1);
    stop();
    expect(subscriberCount(inner)).toBe(0);
    expect(subscriberCount(outer)).toBe(0);
    expect(debugStats()).toEqual(base);
  });

  it("detects effect cycles with a clear error", () => {
    const s = signal(0);
    const stop = effect(() => {
      s.set(s() + 1);
    });
    expect(() => flushSync()).toThrow(/effect cycle/);
    stop();
  });

  it("untrack prevents subscription", () => {
    const a = signal(0);
    const b = signal(0);
    const fn = vi.fn();
    effect(() => {
      a();
      untrack(() => b());
      fn();
    });
    b.set(1);
    flushSync();
    expect(fn).toHaveBeenCalledTimes(1);
    a.set(1);
    flushSync();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("an effect created in a batch defers its first run to the batch end", () => {
    const log: string[] = [];
    batch(() => {
      effect(() => void log.push("fx"));
      log.push("body");
    });
    expect(log).toEqual(["body", "fx"]);
  });

  it("an effect reading a computed that did not change does not re-run", () => {
    const a = signal(1);
    const sign = computed(() => Math.sign(a()));
    const fn = vi.fn();
    effect(() => void fn(sign()));
    a.set(5);
    a.set(9);
    flushSync();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("releases every subscription when a root is disposed", () => {
    const base = debugStats();
    const a = signal(1);
    const c = computed(() => a() * 2);
    let dispose = () => {};
    root((d) => {
      dispose = d;
      for (let i = 0; i < 10; i++) effect(() => void c());
    });
    expect(subscriberCount(c)).toBe(10);
    dispose();
    expect(subscriberCount(c)).toBe(0);
    expect(subscriberCount(a)).toBe(1); // the (global) computed itself still listens
    expect(debugStats().owners).toBe(base.owners + 1); // only the global computed remains
  });
});
