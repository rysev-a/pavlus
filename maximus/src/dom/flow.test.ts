import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fire, flush, mount, waitFor } from "../testing/mod.ts";
import {
  catchError,
  computed,
  debugStats,
  effect,
  onCleanup,
  registerPending,
  signal,
  subscriberCount,
  useSuspense,
} from "../core/mod.ts";
import { createContext } from "../core/mod.ts";
import {
  each,
  errorBoundary,
  html,
  lazy,
  match,
  portal,
  show,
  suspense,
} from "./mod.ts";
import { longestIncreasing } from "./flow.ts";

afterEach(cleanup);

describe("show", () => {
  it("toggles branches and only rebuilds when truthiness flips", async () => {
    const n = signal(0);
    const built = vi.fn();
    const m = mount(
      () =>
        html`<div>
          ${show(
            () => n() > 0,
            () => (built(), html`<b>${n}</b>`),
            () => html`<i>none</i>`,
          )}
        </div>`,
    );
    expect(m.html()).toBe("<div><i>none</i></div>");
    n.set(1);
    await flush();
    expect(m.html()).toBe("<div><b>1</b></div>");
    n.set(2);
    await flush();
    expect(m.html()).toBe("<div><b>2</b></div>");
    expect(built).toHaveBeenCalledTimes(1);
    n.set(0);
    await flush();
    expect(m.html()).toBe("<div><i>none</i></div>");
  });

  it("passes an accessor of the truthy value and renders nothing without else", async () => {
    const user = signal<{ name: string } | null>(null);
    const m = mount(
      () => html`<p>${show(user, (u) => html`<b>${() => u().name}</b>`)}</p>`,
    );
    expect(m.html()).toBe("<p></p>");
    user.set({ name: "ann" });
    await flush();
    expect(m.html()).toBe("<p><b>ann</b></p>");
    user.set({ name: "bob" });
    await flush();
    expect(m.html()).toBe("<p><b>bob</b></p>");
  });

  it("disposes the old branch (effects, cleanups)", async () => {
    const on = signal(true);
    const dep = signal(0);
    const log: string[] = [];
    mount(() =>
      show(on, () => {
        effect(() => void dep());
        onCleanup(() => log.push("branch cleanup"));
        return "x";
      }),
    );
    expect(subscriberCount(dep)).toBe(1);
    on.set(false);
    await flush();
    expect(log).toEqual(["branch cleanup"]);
    expect(subscriberCount(dep)).toBe(0);
  });

  it("branch reads do not subscribe the show itself", async () => {
    const flag = signal(true);
    const other = signal(0);
    const built = vi.fn();
    mount(() => show(flag, () => (built(), other(), "x")));
    other.set(1);
    await flush();
    expect(built).toHaveBeenCalledTimes(1);
  });
});

describe("match", () => {
  it("selects by string value with a `_` fallback and re-renders only on branch change", async () => {
    const status = signal<"loading" | "ready" | "failed">("loading");
    const builds = vi.fn();
    const m = mount(
      () =>
        html`<div>
          ${match(status, {
            loading: () => html`<i>…</i>`,
            ready: () => (builds(), html`<b>ok</b>`),
            _: () => "other",
          })}
        </div>`,
    );
    expect(m.html()).toBe("<div><i>…</i></div>");
    status.set("ready");
    await flush();
    expect(m.html()).toBe("<div><b>ok</b></div>");
    status.set("failed");
    await flush();
    expect(m.html()).toBe("<div>other</div>");
    expect(builds).toHaveBeenCalledTimes(1);
  });

  it("works with numbers and booleans and renders nothing when no case matches", async () => {
    const n = signal(1);
    const m = mount(
      () => html`<p>${match(n, { 1: () => "one", 2: () => "two" })}</p>`,
    );
    expect(m.text()).toBe("one");
    n.set(3);
    await flush();
    expect(m.text()).toBe("");
    const flag = signal(true);
    const m2 = mount(
      () =>
        html`<p>${match(flag, { true: () => "yes", false: () => "no" })}</p>`,
    );
    flag.set(false);
    await flush();
    expect(m2.text()).toBe("no");
  });

  it("ignores prototype keys like constructor", () => {
    const m = mount(
      () =>
        html`<p>
          ${match(() => "constructor" as string, { _: () => "fallback" })}
        </p>`,
    );
    expect(m.text()).toBe("fallback");
  });
});

interface Item {
  id: number;
  name: string;
}
const names = (m: { queryAll: (s: string) => Element[] }) =>
  m.queryAll("li").map((l) => l.textContent);

describe("each", () => {
  const view = (items: () => Item[], fallback?: () => string) =>
    html`<ul>
      ${each(
        items,
        (i) => i.id,
        (item, index) => html`<li>${() => index()}:${() => item().name}</li>`,
        fallback,
      )}
    </ul>`;

  it("renders, appends, prepends, removes and reorders", async () => {
    const items = signal<Item[]>([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ]);
    const m = mount(() => view(items));
    expect(names(m)).toEqual(["0:a", "1:b", "2:c"]);
    const els = m.queryAll("li");
    items.set([...items(), { id: 4, name: "d" }]);
    await flush();
    expect(names(m)).toEqual(["0:a", "1:b", "2:c", "3:d"]);
    items.set([{ id: 0, name: "z" }, ...items()]);
    await flush();
    expect(names(m)).toEqual(["0:z", "1:a", "2:b", "3:c", "4:d"]);
    items.set(items().filter((i) => i.id !== 2));
    await flush();
    expect(names(m)).toEqual(["0:z", "1:a", "2:c", "3:d"]);
    items.set([...items()].reverse());
    await flush();
    expect(names(m)).toEqual(["0:d", "1:c", "2:a", "3:z"]);
    // rows are reused, not recreated
    expect(m.queryAll("li").includes(els[0]!)).toBe(true);
    expect(m.queryAll("li").includes(els[2]!)).toBe(true);
  });

  it("clears to empty, shows the fallback, and refills", async () => {
    const items = signal<Item[]>([{ id: 1, name: "a" }]);
    const m = mount(() => view(items, () => "empty!"));
    expect(m.query("ul").textContent).toBe("0:a");
    items.set([]);
    await flush();
    expect(m.query("ul").textContent).toBe("empty!");
    items.set([{ id: 5, name: "e" }]);
    await flush();
    expect(m.query("ul").textContent).toBe("0:e");
  });

  it("renders the fallback initially for an empty list; null/undefined lists are empty", async () => {
    const items = signal<Item[] | null>(null);
    const m = mount(
      () =>
        html`<p>
          ${each(
            () => items(),
            (i) => i.id,
            () => "row",
            () => "none",
          )}
        </p>`,
    );
    expect(m.text()).toBe("none");
    items.set([{ id: 1, name: "x" }]);
    await flush();
    expect(m.text()).toBe("row");
  });

  it("item is a signal: same key with new data updates in place without recreating the row", async () => {
    const items = signal<Item[]>([{ id: 1, name: "a" }]);
    const created = vi.fn();
    const m = mount(
      () =>
        html`<ul>
          ${each(
            items,
            (i) => i.id,
            (item) => (created(), html`<li>${() => item().name}</li>`),
          )}
        </ul>`,
    );
    const li = m.query("li");
    items.set([{ id: 1, name: "A" }]);
    await flush();
    expect(m.query("li")).toBe(li);
    expect(li.textContent).toBe("A");
    expect(created).toHaveBeenCalledTimes(1);
  });

  it("index is a signal that follows moves", async () => {
    const items = signal<Item[]>([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
    const m = mount(() => view(items));
    items.set([items()[1]!, items()[0]!]);
    await flush();
    expect(names(m)).toEqual(["0:b", "1:a"]);
  });

  it("disposes removed rows: effects stop, cleanups run, subscriptions are released", async () => {
    const dep = signal(0);
    const log: number[] = [];
    const items = signal([1, 2, 3]);
    const m = mount(
      () =>
        html`<ul>
          ${each(
            items,
            (i) => i,
            (item) => {
              effect(() => void dep());
              onCleanup(() => log.push(item()));
              return html`<li>${item}</li>`;
            },
          )}
        </ul>`,
    );
    expect(subscriberCount(dep)).toBe(3);
    items.set([1, 3]);
    await flush();
    expect(log).toEqual([2]);
    expect(subscriberCount(dep)).toBe(2);
    items.set([]);
    await flush();
    expect(log.sort()).toEqual([1, 2, 3]);
    expect(subscriberCount(dep)).toBe(0);
    m.unmount();
  });

  it("unmount disposes every row", async () => {
    const base = debugStats();
    const dep = signal(0);
    const items = signal(Array.from({ length: 50 }, (_, i) => i));
    const m = mount(
      () =>
        html`<ul>
          ${each(
            items,
            (i) => i,
            (item) => (
              effect(() => void dep()),
              html`<li class=${() => "c" + dep()}>${item}</li>`
            ),
          )}
        </ul>`,
    );
    expect(subscriberCount(dep)).toBe(100);
    m.unmount();
    expect(subscriberCount(dep)).toBe(0);
    expect(debugStats()).toEqual(base);
  });

  it("rows with fragments, nested dynamic regions and empty output keep their boundaries when moved", async () => {
    const items = signal([1, 2, 3]);
    const flag = signal(true);
    const m = mount(
      () =>
        html`<div>
          ${each(
            items,
            (i) => i,
            (item) =>
              item() === 2
                ? null
                : html`<b>${item}</b>${() => (flag() ? "!" : "?")}<i
                      >${item}</i
                    >`,
          )}
        </div>`,
    );
    const text = () => m.query("div").textContent;
    expect(text()).toBe("1!1" + "3!3");
    items.set([3, 2, 1]);
    await flush();
    expect(text()).toBe("3!3" + "1!1");
    flag.set(false);
    await flush();
    expect(text()).toBe("3?3" + "1?1");
    items.set([1, 2, 3]);
    await flush();
    expect(text()).toBe("1?1" + "3?3");
  });

  it("throws on duplicate keys", async () => {
    expect(() =>
      mount(() =>
        each(
          () => [1, 1],
          (i) => i,
          () => "x",
        ),
      ),
    ).toThrow(/duplicate key 1/);
    const items = signal([1, 2]);
    mount(() =>
      each(
        items,
        (i) => i,
        () => "x",
      ),
    );
    items.set([2, 3, 3, 1]);
    await expect(flush()).rejects.toThrow(/duplicate key 3/);
  });

  it("matches a reference implementation for random shuffles, inserts and removals", async () => {
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const items = signal<number[]>([]);
    const m = mount(
      () =>
        html`<ul>
          ${each(
            items,
            (i) => i,
            (item) => html`<li>${item}</li>`,
          )}
        </ul>`,
    );
    for (let round = 0; round < 60; round++) {
      const pool = Array.from({ length: 30 }, (_, i) => i);
      const next: number[] = [];
      for (const p of pool) if (rnd(3) > 0) next.push(p);
      for (let i = next.length - 1; i > 0; i--) {
        const j = rnd(i + 1);
        [next[i], next[j]] = [next[j]!, next[i]!];
      }
      items.set(next);
      await flush();
      expect(m.queryAll("li").map((l) => Number(l.textContent))).toEqual(next);
    }
  });

  it("uses a minimal number of DOM moves", async () => {
    const items = signal(Array.from({ length: 100 }, (_, i) => i));
    const m = mount(
      () =>
        html`<ul>
          ${each(
            items,
            (i) => i,
            (item) => html`<li>${item}</li>`,
          )}
        </ul>`,
    );
    const ul = m.query("ul");
    const spy = vi.spyOn(ul, "insertBefore");
    const swapped = [...items()];
    [swapped[1], swapped[98]] = [swapped[98]!, swapped[1]!];
    items.set(swapped);
    await flush();
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
    expect(m.queryAll("li").map((l) => Number(l.textContent))).toEqual(swapped);
    spy.mockClear();
    items.set([...swapped.slice(1), swapped[0]!]); // rotate: one move
    await flush();
    expect(spy.mock.calls.length).toBe(1);
    spy.mockClear();
    items.set(items().slice(0, 50)); // removals do not move anything
    await flush();
    expect(spy.mock.calls.length).toBe(0);
  });

  it("an error in a row render is routed to the nearest error boundary", async () => {
    const items = signal([1]);
    const m = mount(() =>
      errorBoundary(
        (e) => html`<p class="err">${(e as Error).message}</p>`,
        () =>
          html`<ul>
            ${each(
              items,
              (i) => i,
              (item) => {
                if (item() === 2) throw new Error("row 2");
                return html`<li>${item}</li>`;
              },
            )}
          </ul>`,
      ),
    );
    items.set([1, 2]);
    await flush();
    expect(m.query(".err").textContent).toBe("row 2");
  });
});

describe("longestIncreasing", () => {
  it("marks a longest increasing subsequence and ignores -1", () => {
    const stay = (s: number[]) =>
      longestIncreasing(s)
        .map((b, i) => (b ? s[i] : null))
        .filter((x) => x !== null);
    expect(stay([0, 1, 2, 3])).toEqual([0, 1, 2, 3]);
    expect(stay([3, 2, 1, 0])).toHaveLength(1);
    expect(stay([2, -1, 0, 1, -1, 3])).toEqual([0, 1, 3]);
    expect(stay([])).toEqual([]);
    expect(stay([-1, -1])).toEqual([]);
    expect(stay([1, 0, 3, 2, 5, 4])).toHaveLength(3);
  });
});

describe("portal", () => {
  it("renders into another element and removes it on dispose", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const label = signal("a");
    const m = mount(
      () =>
        html`<div id="host">
          ${portal(target, () => html`<span>${label}</span>`)}
        </div>`,
    );
    expect(m.query("#host").querySelector("span")).toBeNull();
    expect(target.textContent).toBe("a");
    label.set("b");
    await flush();
    expect(target.textContent).toBe("b");
    m.unmount();
    expect(target.textContent).toBe("");
    expect(subscriberCount(label)).toBe(0);
    target.remove();
  });

  it("accepts a selector and throws for a missing target", () => {
    const t = document.createElement("div");
    t.id = "modal-root";
    document.body.appendChild(t);
    const m = mount(() => portal("#modal-root", () => "hi"));
    expect(t.textContent).toBe("hi");
    m.unmount();
    expect(() => portal("#nope", () => "x")).toThrow(/portal target/);
    t.remove();
  });

  it("events from portaled content work", () => {
    const t = document.createElement("div");
    document.body.appendChild(t);
    const fn = vi.fn();
    const m = mount(() =>
      portal(t, () => html`<button @click=${fn}>x</button>`),
    );
    t.querySelector("button")!.click();
    expect(fn).toHaveBeenCalledOnce();
    m.unmount();
    t.remove();
  });
});

describe("errorBoundary", () => {
  it("shows the fallback for a synchronous render error", () => {
    const m = mount(() =>
      errorBoundary(
        (e) => html`<p class="e">caught: ${(e as Error).message}</p>`,
        () => {
          throw new Error("bad render");
        },
      ),
    );
    expect(m.query(".e").textContent).toBe("caught: bad render");
  });

  it("catches errors in effects and event handlers and resets", async () => {
    const boom = signal(false);
    let attempts = 0;
    const m = mount(() =>
      errorBoundary(
        (err, reset) =>
          html`<div>
            <span class="err">${(err as Error).message}</span
            ><button id="reset" @click=${reset}>retry</button>
          </div>`,
        () => {
          attempts++;
          return html`<p>
            ${() => {
              if (boom()) throw new Error("effect failed");
              return "fine";
            }}
          </p>`;
        },
      ),
    );
    expect(m.text()).toBe("fine");
    boom.set(true);
    await flush();
    expect(m.query(".err").textContent).toBe("effect failed");
    boom.set(false);
    m.query("#reset").click();
    expect(m.text()).toBe("fine");
    expect(attempts).toBe(2);
  });

  it("catches errors thrown by event handlers inside the view", () => {
    const m = mount(() =>
      errorBoundary(
        (e) => html`<i class="e">${(e as Error).message}</i>`,
        () =>
          html`<button
            @click=${() => {
              throw new Error("clicked bad");
            }}
          >
            x
          </button>`,
      ),
    );
    m.query("button").click();
    expect(m.query(".e").textContent).toBe("clicked bad");
  });

  it("disposes the failed view", async () => {
    const dep = signal(0);
    const fail = signal(false);
    mount(() =>
      errorBoundary(
        () => "fallback",
        () => {
          effect(() => void dep());
          return html`<p>
            ${() => {
              if (fail()) throw new Error("x");
              return 1;
            }}
          </p>`;
        },
      ),
    );
    expect(subscriberCount(dep)).toBe(1);
    fail.set(true);
    await flush();
    expect(subscriberCount(dep)).toBe(0);
  });

  it("nested boundaries: the inner one catches; a throwing fallback escalates to the outer", () => {
    const m = mount(() =>
      errorBoundary(
        (e) => html`<b class="outer">${(e as Error).message}</b>`,
        () =>
          errorBoundary(
            () => {
              throw new Error("fallback failed");
            },
            () => {
              throw new Error("inner failed");
            },
          ),
      ),
    );
    expect(m.query(".outer").textContent).toBe("fallback failed");
    const m2 = mount(() =>
      errorBoundary(
        () => "outer",
        () =>
          errorBoundary(
            (e) => html`<u>inner:${(e as Error).message}</u>`,
            () => {
              throw new Error("e");
            },
          ),
      ),
    );
    expect(m2.text()).toBe("inner:e");
  });

  it("an error with no boundary propagates synchronously from mount", () => {
    expect(() =>
      mount(() => {
        throw new Error("nobody catches");
      }),
    ).toThrow("nobody catches");
  });

  it("errors in a component under an outer catchError are routed there", () => {
    const handler = vi.fn();
    catchError(() => {
      effect(() => {
        throw new Error("fx");
      });
    }, handler);
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("suspense", () => {
  it("shows the fallback while a registered promise is pending, then the content", async () => {
    let resolve!: () => void;
    const p = new Promise<void>((r) => (resolve = r));
    const m = mount(() =>
      suspense(
        () => html`<i>loading</i>`,
        () => {
          registerPending(p);
          return html`<b>content</b>`;
        },
      ),
    );
    expect(m.html()).toBe("<i>loading</i>");
    resolve();
    await flush();
    expect(m.html()).toBe("<b>content</b>");
  });

  it("renders content directly when nothing is pending", () => {
    const m = mount(() =>
      suspense(
        () => "fb",
        () => html`<b>c</b>`,
      ),
    );
    expect(m.html()).toBe("<b>c</b>");
  });

  it("the content is created immediately even while the fallback shows, and keeps its state", async () => {
    let resolve!: () => void;
    const p = new Promise<void>((r) => (resolve = r));
    const created = vi.fn();
    const n = signal(0);
    const m = mount(() =>
      suspense(
        () => "loading",
        () => {
          created();
          registerPending(p);
          return html`<b>${n}</b>`;
        },
      ),
    );
    expect(created).toHaveBeenCalledOnce();
    n.set(5);
    resolve();
    await flush();
    expect(m.html()).toBe("<b>5</b>");
    expect(created).toHaveBeenCalledOnce();
  });

  it("can go back to the fallback when a later promise registers (and tracks multiple)", async () => {
    let r1!: () => void;
    let r2!: () => void;
    const p1 = new Promise<void>((r) => (r1 = r));
    const p2 = new Promise<void>((r) => (r2 = r));
    let ctx = useSuspense();
    const m = mount(() =>
      suspense(
        () => "wait",
        () => {
          ctx = useSuspense();
          registerPending(p1);
          registerPending(p2);
          return "done";
        },
      ),
    );
    expect(ctx?.pending()).toBe(2);
    expect(m.text()).toBe("wait");
    r1();
    await flush();
    expect(m.text()).toBe("wait");
    r2();
    await flush();
    expect(m.text()).toBe("done");
    let r3!: () => void;
    ctx!.register(new Promise<void>((r) => (r3 = r)));
    await flush();
    expect(m.text()).toBe("wait");
    r3();
    await flush();
    expect(m.text()).toBe("done");
  });

  it("registerPending is a no-op outside a boundary and returns the promise; nearest boundary wins", async () => {
    const p = Promise.resolve(1);
    expect(registerPending(p)).toBe(p);
    expect(useSuspense()).toBeNull();
    let rInner!: () => void;
    const inner = new Promise<void>((r) => (rInner = r));
    const m = mount(() =>
      suspense(
        () => "outer-wait",
        () =>
          html`<div>
            ${suspense(
              () => "inner-wait",
              () => (registerPending(inner), "inner-done"),
            )}
          </div>`,
      ),
    );
    expect(m.text()).toBe("inner-wait");
    rInner();
    await flush();
    expect(m.text()).toBe("inner-done");
  });

  it("a rejected promise still settles the boundary (the resource reports the error itself)", async () => {
    const p = Promise.reject(new Error("net"));
    p.catch(() => {});
    const m = mount(() =>
      suspense(
        () => "wait",
        () => (registerPending(p), "after"),
      ),
    );
    await flush();
    expect(m.text()).toBe("after");
  });

  it("disposes the fallback when content shows", async () => {
    let resolve!: () => void;
    const p = new Promise<void>((r) => (resolve = r));
    const dep = signal(0);
    mount(() =>
      suspense(
        () => (effect(() => void dep()), "fb"),
        () => (registerPending(p), "c"),
      ),
    );
    expect(subscriberCount(dep)).toBe(1);
    resolve();
    await flush();
    expect(subscriberCount(dep)).toBe(0);
  });
});

describe("lazy", () => {
  it("loads the component, passes props, and integrates with suspense", async () => {
    let load!: (c: (p: { n: number }) => unknown) => void;
    const Lazy = lazy<{ n: number }>(
      () => new Promise((r) => (load = (c) => r({ default: c as never }))),
    );
    const n = signal(1);
    const m = mount(() =>
      suspense(
        () => html`<i>loading</i>`,
        () =>
          Lazy({
            get n() {
              return n();
            },
          }) as Node,
      ),
    );
    expect(m.html()).toBe("<i>loading</i>");
    load((p) => html`<b>n=${() => p.n}</b>`);
    await flush();
    expect(m.html()).toBe("<b>n=1</b>");
    n.set(2);
    await flush();
    expect(m.html()).toBe("<b>n=2</b>");
  });

  it("accepts a module that is the component itself, loads once, and preload() works", async () => {
    const loader = vi.fn(() =>
      Promise.resolve((() => "hello") as (p: object) => string),
    );
    const L = lazy(loader);
    await L.preload();
    const m = mount(() => html`<p>${L({}) as Node}</p>`);
    const m2 = mount(() => html`<p>${L({}) as Node}</p>`);
    await flush();
    expect(m.text()).toBe("hello");
    expect(m2.text()).toBe("hello");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("a failing import surfaces through the error boundary", async () => {
    const L = lazy<object>(() => Promise.reject(new Error("chunk failed")));
    const m = mount(() =>
      errorBoundary(
        (e) => html`<u>${(e as Error).message}</u>`,
        () => L({}) as Node,
      ),
    );
    await waitFor(() => expect(m.text()).toBe("chunk failed"));
  });
});

describe("context across control flow", () => {
  it("reaches components created later by show/each", async () => {
    const Theme = createContext("light");
    const on = signal(false);
    const m = mount(() =>
      Theme.provide(
        "dark",
        () =>
          html`<div>
            ${show(on, () => html`<b>${Theme.use()}</b>`)}${each(
              () => [1],
              (i) => i,
              () => Theme.use(),
            )}
          </div>`,
      ),
    );
    on.set(true);
    await flush();
    expect(m.text()).toBe("darkdark");
  });
});

describe("misc interplay", () => {
  it("a computed list feeding each", async () => {
    const all = signal([1, 2, 3, 4]);
    const evenOnly = signal(true);
    const shown = computed(() =>
      evenOnly() ? all().filter((n) => n % 2 === 0) : all(),
    );
    const m = mount(
      () =>
        html`<ul>
          ${each(
            shown,
            (n) => n,
            (n) => html`<li>${n}</li>`,
          )}
        </ul>`,
    );
    expect(m.queryAll("li").length).toBe(2);
    evenOnly.set(false);
    await flush();
    expect(m.queryAll("li").length).toBe(4);
    fire(m.query("ul"), "click");
  });
});
