import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  catchError,
  debugStats,
  effect,
  root,
  signal,
  subscriberCount,
} from "../core/mod.ts";
import { errorBoundary, html, suspense } from "../dom/mod.ts";
import { cleanup, flush, mount, waitFor } from "../testing/mod.ts";
import {
  cacheSize,
  clearCache,
  getCached,
  invalidate,
  prefetch,
  resource,
} from "./mod.ts";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(v: T): void;
  reject(e: unknown): void;
}
function deferred<T>(): Deferred<T> {
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
  vi.useRealTimers();
  clearCache();
});

describe("resource basics", () => {
  it("loads, exposes loading/error/value and caches by key", async () => {
    const fetcher = vi.fn(async (id: number) => `user${id}`);
    const id = signal(1);
    let r!: ReturnType<typeof resource<string, number>>;
    const dispose = root((d) => {
      r = resource(() => id(), fetcher, { key: (i) => ["user", i] });
      return d;
    });
    expect(r()).toBeUndefined();
    expect(r.loading()).toBe(true);
    await flush();
    expect(r()).toBe("user1");
    expect(r.loading()).toBe(false);
    expect(r.error()).toBeUndefined();
    id.set(2);
    await flush();
    expect(r()).toBe("user2");
    id.set(1);
    await flush();
    // cached: shown immediately, and (staleTime 0) revalidated in the background
    expect(r()).toBe("user1");
    expect(r.loading()).toBe(false);
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(3);
    dispose();
  });

  it("is reactive in templates", async () => {
    const id = signal(1);
    const m = mount(() => {
      const r = resource(
        () => id(),
        async (i: number) => ({ name: `n${i}` }),
        { suspense: false },
      );
      return html`<p>${() => (r.loading() ? "loading" : r()?.name)}</p>`;
    });
    expect(m.text()).toBe("loading");
    await flush();
    expect(m.text()).toBe("n1");
    id.set(2);
    await flush();
    expect(m.text()).toBe("n2");
  });

  it("disabled sources (false/null/undefined) do not fetch", async () => {
    const fetcher = vi.fn(async (s: string) => s);
    const src = signal<string | undefined>(undefined);
    root(() => {
      const r = resource(src, fetcher);
      expect(r.loading()).toBe(false);
      src.set("a");
      return r;
    });
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent fetches of the same key across resources", async () => {
    const d = deferred<string>();
    const fetcher = vi.fn(() => d.promise);
    root(() => {
      const a = resource(() => 1, fetcher, { key: () => ["shared"] });
      const b = resource(() => 1, fetcher, { key: () => ["shared"] });
      d.promise.then(() => {});
      return [a, b];
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    d.resolve("x");
    await flush();
  });

  it("resources with the same key stay in sync", async () => {
    const [a, b] = root(() => {
      const a = resource(() => 1, async () => "v", { key: () => ["k"] });
      const b = resource(() => 1, async () => "v", { key: () => ["k"] });
      return [a, b] as const;
    });
    await flush();
    expect(b()).toBe("v");
    a.mutate("changed");
    expect(b()).toBe("changed");
  });

  it("uses private entries when no key is given", async () => {
    const fetcher = vi.fn(async () => "x");
    root(() => {
      resource(() => 1, fetcher);
      resource(() => 1, fetcher);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await flush();
  });

  it("initialValue is returned without changing loading()", async () => {
    root(() => {
      const r = resource(() => 1, async () => "real", { initialValue: "init" });
      expect(r()).toBe("init");
      expect(r.loading()).toBe(true);
      return r;
    });
    await flush();
  });

  it("a fetcher that throws synchronously becomes error()", async () => {
    const r = root(() =>
      resource(
        () => 1,
        () => {
          throw new Error("sync");
        },
      ),
    );
    await flush();
    expect((r.error() as Error).message).toBe("sync");
    expect(r.loading()).toBe(false);
  });
});

describe("staleTime / cacheTime / stale-while-revalidate", () => {
  it("does not refetch while fresh, refetches when stale", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => Date.now());
    const mk = () =>
      root((d) => {
        const r = resource(() => 1, fetcher, {
          key: () => ["fresh"],
          staleTime: 1000,
        });
        return { r, d };
      });
    const a = mk();
    await vi.advanceTimersByTimeAsync(0);
    a.d();
    const b = mk();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(b.r()).toBeDefined();
    b.d();
    vi.setSystemTime(Date.now() + 2000);
    const c = mk();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(c.r.loading()).toBe(false); // stale data shown during revalidation
    expect(c.r.fetching()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    c.d();
  });

  it("evicts unused entries after cacheTime and keeps used ones", async () => {
    vi.useFakeTimers();
    const dispose = root((d) => {
      resource(() => 1, async () => 1, { key: () => ["gc"], cacheTime: 100 });
      return d;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(cacheSize()).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(cacheSize()).toBe(1); // still subscribed
    dispose();
    await vi.advanceTimersByTimeAsync(99);
    expect(cacheSize()).toBe(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(cacheSize()).toBe(0);
  });

  it("resubscribing before cacheTime cancels eviction", async () => {
    vi.useFakeTimers();
    const mk = () =>
      root((d) => {
        resource(() => 1, async () => 1, {
          key: () => ["gc2"],
          cacheTime: 100,
          staleTime: 10_000,
        });
        return d;
      });
    const d1 = mk();
    await vi.advanceTimersByTimeAsync(0);
    d1();
    await vi.advanceTimersByTimeAsync(50);
    const d2 = mk();
    await vi.advanceTimersByTimeAsync(500);
    expect(getCached(["gc2"])).toBe(1);
    d2();
  });

  it("cacheTime 0 drops the entry as soon as nobody uses it", async () => {
    const dispose = root((d) => {
      resource(() => 1, async () => 1, { key: () => ["zero"], cacheTime: 0 });
      return d;
    });
    await flush();
    expect(cacheSize()).toBe(1);
    dispose();
    expect(cacheSize()).toBe(0);
  });

  it("keeps data and reports the error when background revalidation fails", async () => {
    let fail = false;
    const r = root(() =>
      resource(
        () => 1,
        async () => {
          if (fail) throw new Error("boom");
          return "ok";
        },
        { key: () => ["swr-err"] },
      ),
    );
    await flush();
    fail = true;
    await r.refetch();
    expect(r()).toBe("ok");
    expect((r.error() as Error).message).toBe("boom");
    fail = false;
    await r.refetch();
    expect(r.error()).toBeUndefined();
  });
});

describe("cancellation", () => {
  it("aborts the in-flight fetch when the source changes", async () => {
    const signals: AbortSignal[] = [];
    const id = signal(1);
    root(() =>
      resource(
        () => id(),
        (_i: number, { signal }) => {
          signals.push(signal);
          return new Promise<string>(() => {});
        },
        { key: (i) => ["abort", i] },
      ),
    );
    expect(signals[0]!.aborted).toBe(false);
    id.set(2);
    await flush();
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });

  it("aborts when the owner is disposed and never writes late results", async () => {
    const d = deferred<string>();
    let sig!: AbortSignal;
    const dispose = root((dispose) => {
      resource(
        () => 1,
        (_s: number, { signal }) => ((sig = signal), d.promise),
        { key: () => ["owner-abort"] },
      );
      return dispose;
    });
    dispose();
    expect(sig.aborted).toBe(true);
    d.resolve("late");
    await flush();
    expect(getCached(["owner-abort"])).toBeUndefined();
  });

  it("ignores the result of a superseded fetch for the same key", async () => {
    const ds = [deferred<string>(), deferred<string>()];
    let n = 0;
    const r = root(() =>
      resource(
        () => 1,
        () => ds[n++]!.promise,
        { key: () => ["race"] },
      ),
    );
    const second = r.refetch();
    ds[1]!.resolve("new");
    await second;
    ds[0]!.resolve("old");
    await flush();
    expect(r()).toBe("new");
  });

  it("does not abort while another resource still uses the entry", async () => {
    const d = deferred<string>();
    let sig!: AbortSignal;
    const fetcher = (_s: number, c: { signal: AbortSignal }) => (
      (sig = c.signal),
      d.promise
    );
    const [, disposeB] = [
      root((a) => (resource(() => 1, fetcher, { key: () => ["multi"] }), a)),
      root((b) => (resource(() => 1, fetcher, { key: () => ["multi"] }), b)),
    ];
    disposeB();
    expect(sig.aborted).toBe(false);
  });

  it("releases every subscription (leak check)", async () => {
    const before = debugStats();
    const id = signal(1);
    const dispose = root((d) => {
      resource(() => id(), async (i: number) => i, { key: (i) => ["leak", i] });
      return d;
    });
    await flush();
    expect(subscriberCount(id)).toBe(1);
    dispose();
    expect(subscriberCount(id)).toBe(0);
    expect(debugStats()).toEqual(before);
  });
});

describe("refetch / mutate / latest", () => {
  it("refetch re-runs the fetcher and resolves with the data", async () => {
    let n = 0;
    const r = root(() =>
      resource(() => 1, async () => ++n, { key: () => ["refetch"], staleTime: 1e9 }),
    );
    await flush();
    expect(await r.refetch()).toBe(2);
    expect(r()).toBe(2);
  });

  it("refetch of a disabled resource resolves undefined", async () => {
    const r = root(() => resource(() => null, async () => 1));
    expect(await r.refetch()).toBeUndefined();
  });

  it("mutate sets data (value or updater), aborts the fetch, and rolls back", async () => {
    const d = deferred<number>();
    let sig!: AbortSignal;
    const r = root(() =>
      resource(
        () => 1,
        (_s: number, c: { signal: AbortSignal }) => ((sig = c.signal), d.promise),
        { key: () => ["mut"] },
      ),
    );
    const undo = r.mutate(5);
    expect(sig.aborted).toBe(true);
    expect(r()).toBe(5);
    const undo2 = r.mutate((p) => (p ?? 0) + 1);
    expect(r()).toBe(6);
    undo2();
    expect(r()).toBe(5);
    undo();
    expect(r()).toBeUndefined();
    d.resolve(1);
  });

  it("rollback does nothing when newer data arrived", async () => {
    const r = root(() =>
      resource(() => 1, async () => 1, { key: () => ["rb"], staleTime: 1e9 }),
    );
    await flush();
    const undo = r.mutate(10);
    r.mutate(20);
    undo();
    expect(r()).toBe(20);
  });

  it("latest keeps the previous value while the next source loads", async () => {
    const id = signal(1);
    const d = deferred<string>();
    const r = root(() =>
      resource(
        () => id(),
        (i: number) => (i === 1 ? Promise.resolve("one") : d.promise),
        { key: (i) => ["latest", i] },
      ),
    );
    await flush();
    id.set(2);
    await flush();
    expect(r()).toBeUndefined();
    expect(r.latest()).toBe("one");
    d.resolve("two");
    await flush();
    expect(r.latest()).toBe("two");
    expect(r()).toBe("two");
  });
});

describe("errors", () => {
  it("exposes the error, clears it on success, and calls onError", async () => {
    const onError = vi.fn();
    let fail = true;
    const r = root(() =>
      resource(
        () => 1,
        async () => {
          if (fail) throw new Error("nope");
          return "fine";
        },
        { onError, key: () => ["err"] },
      ),
    );
    await flush();
    expect((r.error() as Error).message).toBe("nope");
    expect(r.loading()).toBe(false);
    expect(r()).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    fail = false;
    await r.refetch();
    expect(r.error()).toBeUndefined();
    expect(r()).toBe("fine");
  });

  it("errored entries are retried when a resource subscribes again", async () => {
    let fail = true;
    const fetcher = vi.fn(async () => {
      if (fail) throw new Error("x");
      return 1;
    });
    const mk = () =>
      root((d) => {
        const r = resource(() => 1, fetcher, {
          key: () => ["retry"],
          staleTime: 1e9,
        });
        return { r, d };
      });
    const a = mk();
    await flush();
    a.d();
    fail = false;
    const b = mk();
    await flush();
    expect(b.r()).toBe(1);
    b.d();
  });

  it("throwOnError reaches the nearest errorBoundary", async () => {
    const m = mount(() =>
      errorBoundary(
        (e) => html`<p>caught ${String((e as Error).message)}</p>`,
        () => {
          resource(
            () => 1,
            async () => {
              throw new Error("bad");
            },
            { throwOnError: true, suspense: false },
          );
          return html`<i>view</i>`;
        },
      ),
    );
    expect(m.text()).toBe("view");
    await waitFor(() => expect(m.text()).toBe("caught bad"));
  });

  it("without throwOnError an error stays out of boundaries", async () => {
    const onErr = vi.fn();
    catchError(() => {
      root(() =>
        resource(
          () => 1,
          async () => {
            throw new Error("quiet");
          },
        ),
      );
    }, onErr);
    await flush();
    expect(onErr).not.toHaveBeenCalled();
  });
});

describe("suspense integration", () => {
  it("shows the fallback while loading without data, then the content", async () => {
    const d = deferred<string>();
    const m = mount(() =>
      suspense(
        () => html`<i>wait</i>`,
        () => {
          const r = resource(() => 1, () => d.promise, { key: () => ["sus"] });
          return html`<b>${() => r()}</b>`;
        },
      ),
    );
    expect(m.html()).toContain("<i>wait</i>");
    d.resolve("ready");
    await flush();
    expect(m.html()).toContain("<b>ready</b>");
    expect(m.html()).not.toContain("wait");
  });

  it("does not show the fallback again for background revalidation", async () => {
    let n = 0;
    let rr!: { refetch(): Promise<unknown> };
    const m = mount(() =>
      suspense(
        () => html`<i>wait</i>`,
        () => {
          const r = resource(() => 1, async () => ++n, { key: () => ["sus2"] });
          rr = r;
          return html`<b>${() => r()}</b>`;
        },
      ),
    );
    await flush();
    expect(m.text()).toBe("1");
    await rr.refetch();
    await flush();
    expect(m.html()).not.toContain("wait");
    expect(m.text()).toBe("2");
  });

  it("registers a new key's load and releases it when aborted by another change", async () => {
    const id = signal(1);
    const m = mount(() =>
      suspense(
        () => html`<i>wait</i>`,
        () => {
          const r = resource(
            () => id(),
            (i: number) => (i === 3 ? Promise.resolve("three") : new Promise<string>(() => {})),
            { key: (i) => ["sus3", i] },
          );
          return html`<b>${() => r()}</b>`;
        },
      ),
    );
    expect(m.html()).toContain("wait");
    id.set(2);
    id.set(3);
    await flush();
    expect(m.html()).toContain("<b>three</b>");
  });

  it("suspense: false opts out", async () => {
    const m = mount(() =>
      suspense(
        () => html`<i>wait</i>`,
        () => {
          const r = resource(() => 1, () => new Promise<string>(() => {}), {
            suspense: false,
          });
          return html`<b>${() => (r.loading() ? "loading" : "x")}</b>`;
        },
      ),
    );
    await flush();
    expect(m.html()).toContain("<b>loading</b>");
    expect(m.html()).not.toContain("wait");
  });
});

describe("prefetch / invalidate", () => {
  it("prefetch fills the cache and a later resource uses it", async () => {
    const fetcher = vi.fn(async () => "warm");
    await prefetch(["pf"], fetcher, { staleTime: 1e9 });
    expect(getCached(["pf"])).toBe("warm");
    const r = root(() =>
      resource(() => 1, fetcher, { key: () => ["pf"], staleTime: 1e9 }),
    );
    expect(r()).toBe("warm");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("prefetch dedupes with an in-flight fetch and survives having no subscribers", async () => {
    const d = deferred<string>();
    const fetcher = vi.fn(() => d.promise);
    const p1 = prefetch(["pf2"], fetcher);
    const p2 = prefetch(["pf2"], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const r = root((dispose) => {
      const r = resource(() => 1, fetcher, { key: () => ["pf2"] });
      dispose();
      return r;
    });
    d.resolve("done");
    await Promise.all([p1, p2]);
    expect(getCached(["pf2"])).toBe("done");
    expect(r).toBeDefined();
  });

  it("prefetch swallows errors", async () => {
    await expect(
      prefetch(["pf3"], async () => {
        throw new Error("x");
      }),
    ).resolves.toBeUndefined();
  });

  it("invalidate refetches live entries by key prefix and only those", async () => {
    let a = 0;
    let b = 0;
    const [ra, rb] = root(() => {
      const ra = resource(() => 1, async () => ++a, {
        key: () => ["user", 1],
        staleTime: 1e9,
      });
      const rb = resource(() => 1, async () => ++b, {
        key: () => ["post", 1],
        staleTime: 1e9,
      });
      return [ra, rb] as const;
    });
    await flush();
    await invalidate(["user"]);
    expect(ra()).toBe(2);
    expect(rb()).toBe(1);
    await invalidate();
    expect(rb()).toBe(2);
  });

  it("invalidate marks unused entries stale so the next use refetches", async () => {
    let n = 0;
    const mk = () =>
      root((d) => {
        const r = resource(() => 1, async () => ++n, {
          key: () => ["idle", 1],
          staleTime: 1e9,
        });
        return { r, d };
      });
    const a = mk();
    await flush();
    a.d();
    await invalidate(["idle"]);
    const b = mk();
    await flush();
    expect(b.r()).toBe(2);
    b.d();
  });

  it("key elements are compared structurally", async () => {
    let n = 0;
    root(() => {
      resource(() => 1, async () => ++n, {
        key: () => ["q", { a: 1, b: 2 }],
        staleTime: 1e9,
      });
    });
    await flush();
    await invalidate(["q", { b: 2, a: 1 }]);
    expect(n).toBe(2);
  });

  it("refetches nothing and resolves when no entry matches", async () => {
    await expect(invalidate(["nothing"])).resolves.toBeUndefined();
  });
});

describe("effects over resources", () => {
  it("effects track data()", async () => {
    const seen: Array<string | undefined> = [];
    root(() => {
      const r = resource(() => 1, async () => "v");
      effect(() => void seen.push(r()));
    });
    await flush();
    expect(seen).toEqual([undefined, "v"]);
  });
});
