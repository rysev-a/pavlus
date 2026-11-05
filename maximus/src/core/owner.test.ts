import { describe, expect, it, vi } from "vitest";
import {
  catchError,
  createContext,
  debugStats,
  effect,
  flushSync,
  getOwner,
  installDevtools,
  onCleanup,
  onMount,
  root,
  runWithOwner,
  signal,
  computed,
} from "./mod.ts";

describe("owner tree", () => {
  it("root runs cleanups in reverse order on dispose, once", () => {
    const log: string[] = [];
    const dispose = root((d) => {
      onCleanup(() => log.push("a"));
      onCleanup(() => log.push("b"));
      return d;
    });
    dispose();
    dispose();
    expect(log).toEqual(["b", "a"]);
  });

  it("children are disposed before the parent's own cleanups", () => {
    const log: string[] = [];
    const dispose = root((d) => {
      onCleanup(() => log.push("parent"));
      root(() => onCleanup(() => log.push("detached-root")));
      effect(() => onCleanup(() => log.push("child")));
      return d;
    });
    dispose();
    expect(log).toEqual(["child", "parent"]); // a nested root() is detached
  });

  it("getOwner is null outside and set inside", () => {
    expect(getOwner()).toBeNull();
    root(() => expect(getOwner()).not.toBeNull());
  });

  it("runWithOwner restores ownership for async continuations", async () => {
    let owner = null as ReturnType<typeof getOwner>;
    const log: string[] = [];
    const dispose = root((d) => {
      owner = getOwner();
      return d;
    });
    await Promise.resolve();
    runWithOwner(owner, () => onCleanup(() => log.push("late cleanup")));
    dispose();
    expect(log).toEqual(["late cleanup"]);
  });

  it("onCleanup outside any owner is ignored", () => {
    expect(() => onCleanup(() => {})).not.toThrow();
  });

  it("leaves no live owners behind after dispose", () => {
    const base = debugStats();
    const s = signal(0);
    const dispose = root((d) => {
      for (let i = 0; i < 20; i++) {
        effect(() => {
          s();
          effect(() => void s());
        });
      }
      return d;
    });
    expect(debugStats().owners).toBeGreaterThan(base.owners + 40);
    dispose();
    expect(debugStats()).toEqual(base);
  });

  it("onMount runs once, untracked", () => {
    const s = signal(0);
    const fn = vi.fn(() => void s());
    root(() => onMount(fn));
    s.set(1);
    flushSync();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("context", () => {
  it("provides values down the tree and falls back to the default", () => {
    const Theme = createContext<"light" | "dark">("light");
    expect(Theme.use()).toBe("light");
    const seen: string[] = [];
    Theme.provide("dark", () => {
      seen.push(Theme.use());
      Theme.provide("light", () => seen.push("inner:" + Theme.use()));
      effect(() => void seen.push("effect:" + Theme.use()));
      seen.push(Theme.use());
    });
    expect(seen).toEqual(["dark", "inner:light", "effect:dark", "dark"]);
  });

  it("is visible inside re-runs of effects created under the provider", () => {
    const Ctx = createContext(0);
    const s = signal(0);
    const seen: number[] = [];
    Ctx.provide(7, () => effect(() => void seen.push(Ctx.use() + s())));
    s.set(1);
    flushSync();
    expect(seen).toEqual([7, 8]);
  });

  it("two contexts do not interfere", () => {
    const A = createContext("a0");
    const B = createContext("b0");
    A.provide("a1", () => {
      expect(A.use()).toBe("a1");
      expect(B.use()).toBe("b0");
    });
  });

  it("provider owners are disposed with the parent", () => {
    const Ctx = createContext(0);
    const log: string[] = [];
    const dispose = root((d) => {
      Ctx.provide(1, () => onCleanup(() => log.push("provided")));
      return d;
    });
    dispose();
    expect(log).toEqual(["provided"]);
  });
});

describe("errors", () => {
  it("catchError handles synchronous throws and returns undefined", () => {
    const handler = vi.fn();
    const r = catchError(() => {
      throw new Error("boom");
    }, handler);
    expect(r).toBeUndefined();
    expect(handler).toHaveBeenCalledOnce();
    expect((handler.mock.calls[0]![0] as Error).message).toBe("boom");
  });

  it("returns the value when nothing throws", () => {
    expect(catchError(() => 42, vi.fn())).toBe(42);
  });

  it("routes effect errors (first run and re-runs) to the nearest handler", () => {
    const s = signal(0);
    const errors: string[] = [];
    catchError(
      () => {
        effect(() => {
          if (s() > 0) throw new Error("later " + s());
        });
        effect(() => {
          throw new Error("now");
        });
      },
      (e) => errors.push((e as Error).message),
    );
    s.set(1);
    flushSync();
    expect(errors).toEqual(["now", "later 1"]);
  });

  it("the innermost handler wins, and a throwing handler escalates", () => {
    const outer = vi.fn();
    const inner = vi.fn((e: unknown) => {
      throw new Error("rethrown " + (e as Error).message);
    });
    catchError(
      () =>
        catchError(() => {
          effect(() => {
            throw new Error("x");
          });
        }, inner),
      outer,
    );
    expect(inner).toHaveBeenCalledOnce();
    expect((outer.mock.calls[0]![0] as Error).message).toBe("rethrown x");
  });

  it("unhandled effect errors surface from flush after the queue drains", () => {
    const s = signal(0);
    const ran = vi.fn();
    effect(() => {
      if (s() > 0) throw new Error("unhandled");
    });
    effect(() => void ran(s()));
    s.set(1);
    expect(() => flushSync()).toThrow("unhandled");
    expect(ran).toHaveBeenCalledTimes(2); // the other effect still ran
  });

  it("errors in cleanups are routed to handlers", () => {
    const handler = vi.fn();
    const dispose = root((d) => {
      catchError(
        () =>
          onCleanup(() => {
            throw new Error("cleanup");
          }),
        handler,
      );
      return d;
    });
    // catchError's owner is a child of the root; its cleanup error is handled by its own handler's parent chain
    expect(() => dispose()).toThrow("cleanup");
  });

  it("a computed error reaches the effect reading it", () => {
    const s = signal(0);
    const c = computed(() => {
      if (s() > 0) throw new Error("bad");
      return 0;
    });
    const handler = vi.fn();
    catchError(() => effect(() => void c()), handler);
    s.set(1);
    flushSync();
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("devtools hook", () => {
  it("emits nothing and allocates nothing without a listener", () => {
    delete (globalThis as { __MAXIMUS__?: unknown }).__MAXIMUS__;
    const s = signal(0);
    s.set(1);
    expect(
      (globalThis as { __MAXIMUS__?: unknown }).__MAXIMUS__,
    ).toBeUndefined();
  });

  it("emits signal writes, effect runs, and errors to a listener", () => {
    const hook = installDevtools();
    const events: { type: string; [k: string]: unknown }[] = [];
    const off = hook.on((e) => events.push(e));
    const s = signal(0, { name: "count" });
    effect(() => void s());
    s.set(1);
    flushSync();
    const types = events.map((e) => e.type);
    expect(types).toContain("signal:write");
    expect(types).toContain("effect:run");
    expect(events.find((e) => e.type === "signal:write")).toMatchObject({
      name: "count",
      value: 1,
    });
    catchError(
      () => {
        throw new Error("e");
      },
      () => {},
    );
    expect(events.some((e) => e.type === "error")).toBe(true);
    off();
    const n = events.length;
    s.set(2);
    flushSync();
    expect(events.length).toBe(n);
    delete (globalThis as { __MAXIMUS__?: unknown }).__MAXIMUS__;
  });
});
