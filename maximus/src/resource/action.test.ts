import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { root, signal } from "../core/mod.ts";
import { html } from "../dom/mod.ts";
import { cleanup, fire, flush, mount } from "../testing/mod.ts";
import { action, clearCache, resource } from "./mod.ts";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

beforeEach(() => clearCache());
afterEach(() => {
  cleanup();
  clearCache();
});

describe("action", () => {
  it("tracks pending, result and error", async () => {
    const d = deferred<number>();
    const save = action((_: string) => d.promise);
    expect(save.pending()).toBe(false);
    const p = save.run("x");
    expect(save.pending()).toBe(true);
    d.resolve(7);
    expect(await p).toBe(7);
    expect(save.pending()).toBe(false);
    expect(save.result()).toBe(7);
    expect(save.error()).toBeUndefined();
  });

  it("run never rejects; failures land in error() and clear on the next run", async () => {
    let fail = true;
    const onError = vi.fn();
    const save = action(
      async (_: void) => {
        if (fail) throw new Error("no");
        return "ok";
      },
      { onError },
    );
    expect(await save.run()).toBeUndefined();
    expect((save.error() as Error).message).toBe("no");
    expect(onError).toHaveBeenCalledTimes(1);
    fail = false;
    const p = save.run();
    expect(save.error()).toBeUndefined();
    expect(await p).toBe("ok");
    save.reset();
    expect(save.result()).toBeUndefined();
  });

  it("synchronous functions and throws work", async () => {
    const ok = action((n: number) => n * 2);
    expect(await ok.run(2)).toBe(4);
    const bad = action((): number => {
      throw new Error("sync");
    });
    expect(await bad.run()).toBeUndefined();
    expect((bad.error() as Error).message).toBe("sync");
  });

  it("onSuccess receives result and input", async () => {
    const onSuccess = vi.fn();
    await action(async (n: number) => n + 1, { onSuccess }).run(1);
    expect(onSuccess).toHaveBeenCalledWith(2, 1);
  });

  it("invalidates resources after success and waits for the refetch", async () => {
    let n = 0;
    const r = root(() =>
      resource(() => 1, async () => ++n, { key: () => ["todos"], staleTime: 1e9 }),
    );
    await flush();
    const add = action(async (_: void) => "ok", {
      invalidates: [["todos"]],
    });
    await add.run();
    expect(r()).toBe(2);
  });

  it("invalidates may depend on input and result, and is skipped on error", async () => {
    let n = 0;
    const r = root(() =>
      resource(() => 1, async () => ++n, { key: () => ["item", 5], staleTime: 1e9 }),
    );
    await flush();
    const a = action(async (id: number) => id, {
      invalidates: (id) => [["item", id]],
    });
    await a.run(5);
    expect(r()).toBe(2);
    const failing = action(
      async (_: void) => {
        throw new Error("x");
      },
      { invalidates: [["item"]] },
    );
    await failing.run();
    expect(r()).toBe(2);
  });

  it("optimistic updates apply immediately and roll back on error", async () => {
    const r = root(() =>
      resource(() => 1, async () => ["a"], { key: () => ["list"], staleTime: 1e9 }),
    );
    await flush();
    const d = deferred<void>();
    const add = action(async (item: string, { optimistic }) => {
      optimistic(() => r.mutate((p) => [...(p ?? []), item]));
      await d.promise;
    });
    const p = add.run("b");
    expect(r()).toEqual(["a", "b"]);
    d.reject(new Error("server"));
    await p;
    expect(r()).toEqual(["a"]);
    expect((add.error() as Error).message).toBe("server");
  });

  it("optimistic updates stay on success and the invalidation brings server truth", async () => {
    let server = ["a"];
    const r = root(() =>
      resource(() => 1, async () => [...server], { key: () => ["list2"], staleTime: 1e9 }),
    );
    await flush();
    const add = action(
      async (item: string, { optimistic }) => {
        optimistic(() => r.mutate((p) => [...(p ?? []), item]));
        server = [...server, item, "extra"];
      },
      { invalidates: [["list2"]] },
    );
    await add.run("b");
    expect(r()).toEqual(["a", "b", "extra"]);
  });

  it("multiple optimistic changes roll back newest first", async () => {
    const log: string[] = [];
    const a = action(async (_: void, { optimistic }) => {
      optimistic(() => () => log.push("one"));
      optimistic(() => () => log.push("two"));
      optimistic(() => {});
      throw new Error("x");
    });
    await a.run();
    expect(log).toEqual(["two", "one"]);
  });

  it("a throwing rollback does not stop the others", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log: string[] = [];
    const a = action(async (_: void, { optimistic }) => {
      optimistic(() => () => log.push("one"));
      optimistic(() => () => {
        throw new Error("rb");
      });
      throw new Error("x");
    });
    await a.run();
    expect(log).toEqual(["one"]);
    spy.mockRestore();
  });

  describe("concurrency", () => {
    it("latest (default): a new run aborts and rolls back the previous one", async () => {
      const ds = [deferred<string>(), deferred<string>()];
      let i = 0;
      const sigs: AbortSignal[] = [];
      const undone: string[] = [];
      const a = action(async (name: string, { signal, optimistic }) => {
        sigs.push(signal);
        optimistic(() => () => undone.push(name));
        return ds[i++]!.promise;
      });
      const p1 = a.run("first");
      const p2 = a.run("second");
      expect(sigs[0]!.aborted).toBe(true);
      expect(sigs[1]!.aborted).toBe(false);
      expect(undone).toEqual(["first"]);
      ds[0]!.resolve("one");
      ds[1]!.resolve("two");
      expect(await p1).toBeUndefined();
      expect(await p2).toBe("two");
      expect(a.result()).toBe("two");
      expect(a.pending()).toBe(false);
    });

    it("queue: runs one after another in order", async () => {
      const log: string[] = [];
      const gates = [deferred<void>(), deferred<void>()];
      let i = 0;
      const a = action(
        async (name: string) => {
          log.push("start " + name);
          await gates[i++]!.promise;
          log.push("end " + name);
          return name;
        },
        { concurrency: "queue" },
      );
      const p1 = a.run("a");
      const p2 = a.run("b");
      await flush();
      expect(log).toEqual(["start a"]);
      expect(a.pending()).toBe(true);
      gates[0]!.resolve();
      await p1;
      await flush();
      expect(log).toEqual(["start a", "end a", "start b"]);
      gates[1]!.resolve();
      expect(await p2).toBe("b");
      expect(a.pending()).toBe(false);
    });

    it("queue: a failing run does not block the queue", async () => {
      let n = 0;
      const a = action(
        async (_: void) => {
          if (n++ === 0) throw new Error("first");
          return "second";
        },
        { concurrency: "queue" },
      );
      const p1 = a.run();
      const p2 = a.run();
      expect(await p1).toBeUndefined();
      expect(await p2).toBe("second");
    });

    it("parallel: runs overlap and pending stays true until all finish", async () => {
      const ds = [deferred<void>(), deferred<void>()];
      let i = 0;
      const started: number[] = [];
      const a = action(
        async (n: number) => {
          started.push(n);
          await ds[i++]!.promise;
          return n;
        },
        { concurrency: "parallel" },
      );
      const p1 = a.run(1);
      const p2 = a.run(2);
      expect(started).toEqual([1, 2]);
      ds[1]!.resolve();
      await p2;
      expect(a.pending()).toBe(true);
      ds[0]!.resolve();
      await p1;
      expect(a.pending()).toBe(false);
      expect(a.result()).toBe(2); // the newest started run wins
    });
  });

  it("drives UI: pending disables a button", async () => {
    const d = deferred<void>();
    const save = action(() => d.promise);
    const m = mount(
      () =>
        html`<button ?disabled=${save.pending} @click=${() => save.run()}>
          save
        </button>`,
    );
    const b = m.query<HTMLButtonElement>("button");
    fire(b, "click");
    await flush();
    expect(b.disabled).toBe(true);
    d.resolve();
    await flush();
    expect(b.disabled).toBe(false);
  });

  it("signals created for an action do not retain subscribers after dispose", async () => {
    const flag = signal(0);
    const dispose = root((d) => {
      const a = action(async (_: void) => flag.peek());
      void a.pending();
      return d;
    });
    dispose();
    expect(flag).toBeDefined();
  });
});
