import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { debugStats, effect, root, signal } from "../core/mod.ts";
import { errorBoundary, html, lazy, suspense } from "../dom/mod.ts";
import { cleanup, fire, flush, mount, waitFor } from "../testing/mod.ts";
import { createMemoryHistory, createRouter, redirect, route } from "./mod.ts";
import type { AnyRoute, RouterOptions, Scroller } from "./mod.ts";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

const made: Array<() => void> = [];
function make(
  routes: readonly AnyRoute[],
  o: Partial<RouterOptions> & { at?: string[] } = {},
) {
  const { at, ...rest } = o;
  const router = createRouter({
    routes,
    history: createMemoryHistory(at ?? ["/"]),
    viewTransitions: false,
    ...rest,
  });
  made.push(router.dispose);
  return router;
}

afterEach(() => {
  cleanup();
  while (made.length) made.pop()!();
  document.title = "";
  document.head.innerHTML = "";
});

/** Dispatch a click and report whether the app prevented it; then cancel it so jsdom does not try to navigate. */
function clickAndCheck(
  el: Element,
  init: Record<string, unknown> = {},
): boolean {
  let prevented = false;
  const probe = (e: Event): void => {
    prevented = e.defaultPrevented;
    e.preventDefault();
  };
  window.addEventListener("click", probe);
  fire(el, "click", init);
  window.removeEventListener("click", probe);
  return prevented;
}

const page = (text: string) => () => html`<p>${text}</p>`;

describe("signals and navigation", () => {
  it("commits the initial location synchronously when nothing is async", () => {
    const r = make([{ path: "/", component: page("home") }], {
      at: ["/?a=1&b=x&b=y#top"],
    });
    expect(r.path()).toBe("/");
    expect(r.query()).toEqual({ a: "1", b: ["x", "y"] });
    expect(r.hash()).toBe("#top");
  });

  it("navigate/replace/back/forward update path, params, query and hash", async () => {
    const r = make([
      { path: "/", component: page("h") },
      { path: "/users/:id", component: page("u") },
      { path: "/about", component: page("a") },
    ]);
    expect(await r.navigate("/users/42?tab=x#bio")).toBe(true);
    expect(r.path()).toBe("/users/42");
    expect(r.params()).toEqual({ id: "42" });
    expect(r.query()).toEqual({ tab: "x" });
    expect(r.hash()).toBe("#bio");
    expect(r.history.location().path).toBe("/users/42");
    await r.replace("/about");
    expect(r.path()).toBe("/about");
    r.back();
    await flush();
    expect(r.path()).toBe("/");
    r.forward();
    await flush();
    expect(r.path()).toBe("/about");
    r.go(-1);
    await flush();
    expect(r.path()).toBe("/");
  });

  it("is reactive for effects", async () => {
    const r = make([
      { path: "/", component: page("") },
      { path: "/b", component: page("") },
    ]);
    const seen: string[] = [];
    root(() => effect(() => void seen.push(r.path())));
    await r.navigate("/b");
    await flush();
    expect(seen).toEqual(["/", "/b"]);
  });

  it("navigating to the current URL is a no-op; hash-only changes skip loaders", async () => {
    const load = vi.fn(() => 1);
    const r = make([{ path: "/", component: page(""), load }]);
    await r.ready;
    expect(load).toHaveBeenCalledTimes(1);
    expect(await r.navigate("/")).toBe(true);
    await r.navigate("/#sec");
    expect(r.hash()).toBe("#sec");
    expect(load).toHaveBeenCalledTimes(1);
    expect(r.history.location().hash).toBe("#sec");
    await r.navigate("/#sec", { force: true });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("relative targets ?q and #h resolve against the current page", async () => {
    const r = make([{ path: "/p", component: page("") }], { at: ["/p"] });
    await r.navigate("?x=1");
    expect(r.history.location()).toMatchObject({ path: "/p", search: "?x=1" });
    await r.navigate("#h");
    expect(r.history.location()).toMatchObject({ search: "?x=1", hash: "#h" });
  });

  it("setQuery merges and removes keys", async () => {
    const r = make([{ path: "/p", component: page("") }], {
      at: ["/p?a=1&b=2"],
    });
    await r.setQuery({ a: undefined, c: "3" });
    expect(r.query()).toEqual({ b: "2", c: "3" });
    await r.setQuery({ b: ["x", "y"] }, { replace: true });
    expect(r.query()).toEqual({ b: ["x", "y"], c: "3" });
  });

  it("rejects external URLs", async () => {
    const r = make([{ path: "/", component: page("") }]);
    await expect(r.navigate("https://example.com")).rejects.toThrow(/external/);
  });

  it("url() builds typed paths and href() applies the base", () => {
    const r = make([{ path: "/", component: page("") }], { base: "/app" });
    expect(
      r.url("/users/:id", { id: 5 as unknown as string }, { tab: "a" }),
    ).toBe("/users/5?tab=a");
    expect(r.href("/x")).toBe("/app/x");
    expect(r.href("/")).toBe("/app");
    expect(r.href("https://a.b/")).toBe("https://a.b/");
  });
});

describe("matching", () => {
  it("prefers static over dynamic over wildcard and supports optional params", async () => {
    const r = make([
      { path: "*", component: page("wild") },
      { path: "/users/:id", component: page("param") },
      { path: "/users/new", component: page("static") },
      { path: "/docs/:slug?", component: page("docs") },
    ]);
    const matched = async (p: string) => {
      await r.navigate(p);
      return r.matches().at(-1)!.pattern;
    };
    expect(await matched("/users/new")).toBe("/users/new");
    expect(await matched("/users/7")).toBe("/users/:id");
    expect(await matched("/docs")).toBe("/docs/:slug?");
    expect(r.params()).toEqual({});
    expect(await matched("/docs/intro")).toBe("/docs/:slug?");
    expect(r.params()).toEqual({ slug: "intro" });
    expect(await matched("/nope/deep")).toBe("/*");
    expect(r.params()).toEqual({ "*": "nope/deep" });
  });

  it("merges parent and child params for nested routes", async () => {
    const r = make([
      {
        path: "/orgs/:org",
        component: () => r.outlet(),
        children: [{ path: "repos/:repo", component: page("") }],
      },
    ]);
    await r.navigate("/orgs/acme/repos/web");
    expect(r.params()).toEqual({ org: "acme", repo: "web" });
    expect(r.matches().map((m) => m.pattern)).toEqual([
      "/orgs/:org",
      "/orgs/:org/repos/:repo",
    ]);
  });

  it("is case-insensitive by default", async () => {
    const r = make([{ path: "/About", component: page("") }]);
    await r.navigate("/about");
    expect(r.matches().length).toBe(1);
  });

  it("route() infers typed params and the result fits a routes array", () => {
    const r = route({
      path: "/users/:id/:tab?",
      component: (p) => {
        expectTypeOf(p.params()).toEqualTypeOf<{ id: string; tab?: string }>();
        return html`<i>${() => p.params().id}</i>`;
      },
      load: ({ params }) => {
        expectTypeOf(params).toEqualTypeOf<{ id: string; tab?: string }>();
        return params.id.length;
      },
    });
    expect(r.path).toBe("/users/:id/:tab?");
  });

  it("redirect routes", async () => {
    const r = make([
      { path: "/old", redirect: "/new" },
      { path: "/old/:id", redirect: (to) => `/new/${to.params.id}` },
      { path: "/new", component: page("") },
      { path: "/new/:id", component: page("") },
    ]);
    await r.navigate("/old");
    expect(r.path()).toBe("/new");
    await r.navigate("/old/9");
    expect(r.path()).toBe("/new/9");
    r.back();
    await flush();
    expect(r.path()).toBe("/new");
  });

  it("detects redirect loops", async () => {
    const r = make([
      { path: "/", component: page("") },
      { path: "/a", redirect: "/b" },
      { path: "/b", redirect: "/a" },
    ]);
    await expect(r.navigate("/a")).rejects.toThrow(/redirects/);
  });
});

describe("trailing slash, base and 404", () => {
  const routes: AnyRoute[] = [
    { path: "/", component: page("") },
    { path: "/a", component: page("") },
  ];

  it("never (default): canonicalises /a/ to /a in the history entry", async () => {
    const r = make(routes, { at: ["/a/"] });
    expect(r.path()).toBe("/a");
    expect(r.history.location().path).toBe("/a");
    await r.navigate("/a/");
    expect(r.path()).toBe("/a");
  });

  it("always: adds the slash", async () => {
    const r = make(routes, { trailingSlash: "always" });
    await r.navigate("/a");
    expect(r.path()).toBe("/a/");
    expect(r.history.location().path).toBe("/a/");
    expect(r.matches().at(-1)!.pattern).toBe("/a");
  });

  it("ignore: matches both and keeps what was typed", async () => {
    const r = make(routes, { trailingSlash: "ignore" });
    await r.navigate("/a/");
    expect(r.path()).toBe("/a/");
    expect(r.matches().at(-1)!.pattern).toBe("/a");
    await r.navigate("/a");
    expect(r.path()).toBe("/a");
  });

  it("base path is stripped from history locations and added when writing", async () => {
    const r = make(routes, { base: "/app/", at: ["/app/a"] });
    expect(r.path()).toBe("/a");
    await r.navigate("/");
    expect(r.history.location().path).toBe("/app");
    await r.navigate("/a?x=1");
    expect(r.history.location()).toMatchObject({
      path: "/app/a",
      search: "?x=1",
    });
    r.back();
    await flush();
    expect(r.path()).toBe("/");
  });

  it("locations outside the base are not found", () => {
    const r = make(routes, { base: "/app", at: ["/other/a"] });
    expect(r.notFound()).toBe(true);
    expect(r.matches()).toEqual([]);
  });

  it("renders the notFound component for unknown paths", async () => {
    const r = make(routes, { notFound: () => html`<h1>404</h1>` });
    const m = mount(() => html`<main>${r.outlet()}</main>`);
    await r.navigate("/missing");
    await flush();
    expect(r.notFound()).toBe(true);
    expect(m.text()).toBe("404");
    await r.navigate("/a");
    await flush();
    expect(r.notFound()).toBe(false);
  });

  it("a catch-all route acts as a 404 route", async () => {
    const r = make([...routes, { path: "*", component: page("nf") }]);
    const m = mount(() => r.outlet());
    await r.navigate("/zzz");
    await flush();
    expect(m.text()).toBe("nf");
  });
});

describe("outlets and layouts", () => {
  it("renders nested layouts and only swaps the changed level", async () => {
    const layoutBuilt = vi.fn();
    const r = make([
      {
        path: "/users",
        component: () => {
          layoutBuilt();
          return html`<section>
            <h2>Users</h2>
            ${r.outlet()}
          </section>`;
        },
        children: [
          { path: "", component: page("list") },
          {
            path: ":id",
            component: (p) => html`<p>user ${() => p.params().id}</p>`,
          },
        ],
      },
      { path: "/", component: page("home") },
    ]);
    const m = mount(() => html`<div>${r.outlet()}</div>`);
    expect(m.text()).toBe("home");
    await r.navigate("/users");
    await flush();
    expect(m.html()).toBe(
      "<div><section><h2>Users</h2><p>list</p></section></div>",
    );
    await r.navigate("/users/1");
    await flush();
    expect(m.text()).toBe("Usersuser 1");
    expect(layoutBuilt).toHaveBeenCalledTimes(1);
    await r.navigate("/users/2");
    await flush();
    expect(m.text()).toBe("Usersuser 2");
    expect(layoutBuilt).toHaveBeenCalledTimes(1);
    await r.navigate("/");
    await flush();
    expect(m.text()).toBe("home");
  });

  it("keeps the component instance when only params change", async () => {
    const built = vi.fn();
    const r = make(
      [
        {
          path: "/u/:id",
          component: (p) => {
            built();
            return html`<b>${() => p.params().id}</b>`;
          },
        },
      ],
      { at: ["/u/1"] },
    );
    const m = mount(() => r.outlet());
    expect(m.text()).toBe("1");
    await r.navigate("/u/2");
    await flush();
    expect(m.text()).toBe("2");
    expect(built).toHaveBeenCalledTimes(1);
  });

  it("a pathless layout wraps its children; an index child renders at the parent path", async () => {
    const r = make([
      {
        component: () => html`<div class="shell">${r.outlet()}</div>`,
        children: [
          { path: "/", component: page("index") },
          { path: "/x", component: page("x") },
        ],
      },
    ]);
    const m = mount(() => r.outlet());
    expect(m.html()).toBe('<div class="shell"><p>index</p></div>');
    await r.navigate("/x");
    await flush();
    expect(m.html()).toBe('<div class="shell"><p>x</p></div>');
  });

  it("a route without a component passes through to its children", async () => {
    const r = make([
      { path: "/g", children: [{ path: "a", component: page("A") }] },
    ]);
    const m = mount(() => r.outlet());
    await r.navigate("/g/a");
    await flush();
    expect(m.text()).toBe("A");
  });

  it("disposes the old route's effects and owners (leak check)", async () => {
    const tick = signal(0);
    const r = make([
      { path: "/", component: page("") },
      {
        path: "/b",
        component: () => {
          effect(() => void tick());
          return html`<i>${tick}</i>`;
        },
      },
    ]);
    const m = mount(() => r.outlet());
    await flush();
    const before = debugStats();
    await r.navigate("/b");
    await flush();
    await r.navigate("/");
    await flush();
    expect(debugStats().owners).toBe(before.owners);
    expect(debugStats().links).toBe(before.links);
    m.unmount();
  });

  it("works with lazy components and suspense", async () => {
    const d = deferred<{ default: () => Node }>();
    const Lazy = lazy(() => d.promise);
    const r = make([{ path: "/", component: () => Lazy({}) }]);
    const m = mount(() =>
      suspense(
        () => html`<i>wait</i>`,
        () => r.outlet(),
      ),
    );
    expect(m.text()).toBe("wait");
    d.resolve({ default: () => html`<b>loaded</b>` });
    await flush();
    expect(m.text()).toBe("loaded");
  });

  it("errors thrown by a route component reach the error boundary", async () => {
    const r = make([
      { path: "/", component: page("ok") },
      {
        path: "/bad",
        component: () => {
          throw new Error("render failed");
        },
      },
    ]);
    const m = mount(() =>
      errorBoundary(
        (e) => html`<em>${(e as Error).message}</em>`,
        () => r.outlet(),
      ),
    );
    await r.navigate("/bad");
    await flush();
    expect(m.text()).toBe("render failed");
  });

  it("props expose query, data and the router", async () => {
    let seen: unknown;
    const r = make(
      [
        {
          path: "/p",
          load: () => ({ n: 5 }),
          component: (p) => {
            seen = p;
            return html`<i
              >${() => (p.data() as { n: number }).n}-${() => p.query().q}</i
            >`;
          },
        },
      ],
      { at: ["/p?q=z"] },
    );
    const m = mount(() => r.outlet());
    await r.ready;
    await flush();
    expect(m.text()).toBe("5-z");
    expect((seen as { router: unknown }).router).toBe(r);
  });
});

describe("loaders", () => {
  it("runs before render and exposes data", async () => {
    const d = deferred<string>();
    const rendered = vi.fn();
    const r = make([
      { path: "/", component: page("home") },
      {
        path: "/data",
        load: () => d.promise,
        component: (p) => {
          rendered();
          return html`<b>${p.data}</b>`;
        },
      },
    ]);
    const m = mount(() => r.outlet());
    const nav = r.navigate("/data");
    await flush();
    expect(r.navigating()).toBe(true);
    expect(r.path()).toBe("/");
    expect(m.text()).toBe("home");
    expect(rendered).not.toHaveBeenCalled();
    d.resolve("loaded!");
    await nav;
    await flush();
    expect(r.navigating()).toBe(false);
    expect(r.path()).toBe("/data");
    expect(r.data()).toBe("loaded!");
    expect(m.text()).toBe("loaded!");
  });

  it("passes params, query and a signal; parent and child loaders run in parallel", async () => {
    const order: string[] = [];
    const dp = deferred<void>();
    const dc = deferred<void>();
    const ctxs: unknown[] = [];
    const r = make(
      [
        {
          path: "/a/:x",
          component: () => r.outlet(),
          load: async (ctx) => {
            ctxs.push(ctx);
            order.push("parent");
            await dp.promise;
            return "P";
          },
          children: [
            {
              path: "b",
              component: page(""),
              load: async () => {
                order.push("child");
                await dc.promise;
                return "C";
              },
            },
          ],
        },
      ],
      { at: ["/"] },
    );
    void r.navigate("/a/1/b?q=2");
    await flush();
    expect(order).toEqual(["parent", "child"]);
    dp.resolve();
    dc.resolve();
    await waitFor(() => expect(r.path()).toBe("/a/1/b"));
    const ctx = ctxs[0] as {
      params: unknown;
      query: unknown;
      signal: AbortSignal;
    };
    expect(ctx.params).toEqual({ x: "1" });
    expect(ctx.query).toEqual({ q: "2" });
    expect(ctx.signal).toBeInstanceOf(AbortSignal);
    expect(r.data()).toBe("C");
    expect(r.matches().map((m) => m.data)).toEqual(["P", "C"]);
  });

  it("aborts a loader and drops its result when the user navigates elsewhere", async () => {
    const d = deferred<string>();
    let sig!: AbortSignal;
    const r = make([
      { path: "/", component: page("") },
      {
        path: "/slow",
        component: page(""),
        load: ({ signal }) => ((sig = signal), d.promise),
      },
      { path: "/fast", component: page("") },
    ]);
    const slow = r.navigate("/slow");
    await flush();
    const fast = r.navigate("/fast");
    expect(sig.aborted).toBe(true);
    expect(await fast).toBe(true);
    d.resolve("late");
    expect(await slow).toBe(false);
    expect(r.path()).toBe("/fast");
    expect(r.navigating()).toBe(false);
  });

  it("re-runs only loaders whose params changed", async () => {
    const parent = vi.fn(() => "p");
    const child = vi.fn((c: { params: { tab?: string } }) => c.params.tab);
    const r = make(
      [
        {
          path: "/u/:id",
          component: () => r.outlet(),
          load: parent,
          children: [{ path: ":tab", component: page(""), load: child }],
        },
      ],
      { at: ["/u/1/a"] },
    );
    await r.ready;
    expect([parent.mock.calls.length, child.mock.calls.length]).toEqual([1, 1]);
    await r.navigate("/u/1/b");
    expect([parent.mock.calls.length, child.mock.calls.length]).toEqual([1, 2]);
    expect(r.data()).toBe("b");
    await r.navigate("/u/2/b");
    expect([parent.mock.calls.length, child.mock.calls.length]).toEqual([2, 3]);
  });

  it("loader errors commit the route with the error: error render prop or boundary", async () => {
    const r = make([
      { path: "/", component: page("") },
      {
        path: "/e1",
        load: () => Promise.reject(new Error("e1")),
        error: (e, retry) =>
          html`<button @click=${retry}>${(e as Error).message}</button>`,
        component: page("never"),
      },
      {
        path: "/e2",
        load: () => {
          throw new Error("e2");
        },
        component: page("never"),
      },
    ]);
    const m = mount(() =>
      errorBoundary(
        (e) => html`<em>${(e as Error).message}</em>`,
        () => r.outlet(),
      ),
    );
    await r.navigate("/e1");
    await flush();
    expect(m.text()).toBe("e1");
    expect((r.matches().at(-1)!.error as Error).message).toBe("e1");
    await r.navigate("/e2");
    await flush();
    expect(m.text()).toBe("e2");
  });

  it("retry re-runs the loader", async () => {
    let fail = true;
    const r = make(
      [
        {
          path: "/x",
          load: async () => {
            if (fail) throw new Error("down");
            return "up";
          },
          error: (e, retry) => html`<button @click=${retry}>retry</button>`,
          component: (p) => html`<b>${p.data}</b>`,
        },
      ],
      { at: ["/x"] },
    );
    const m = mount(() => r.outlet());
    await r.ready;
    await flush();
    expect(m.text()).toBe("retry");
    fail = false;
    fire(m.query("button"), "click");
    await waitFor(() => expect(m.text()).toBe("up"));
  });

  it("a loader can redirect by throwing redirect()", async () => {
    const r = make([
      { path: "/login", component: page("") },
      {
        path: "/secret",
        component: page(""),
        load: () => {
          throw redirect("/login");
        },
      },
    ]);
    await r.navigate("/secret");
    expect(r.path()).toBe("/login");
  });

  it("prefetch warms loaders once; navigation consumes the result", async () => {
    const load = vi.fn(async () => "warm");
    const r = make([
      { path: "/", component: page("") },
      { path: "/p/:id", component: page(""), load },
    ]);
    await r.prefetch("/p/1");
    await r.prefetch("/p/1");
    expect(load).toHaveBeenCalledTimes(1);
    await r.navigate("/p/1");
    expect(load).toHaveBeenCalledTimes(1);
    expect(r.data()).toBe("warm");
    await r.navigate("/");
    await r.navigate("/p/1");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("prefetched results expire after the ttl and failed prefetches do not leak rejections", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => {
      throw new Error("x");
    });
    const r = make(
      [
        { path: "/", component: page("") },
        { path: "/p", component: page(""), load, error: () => "err" },
      ],
      { prefetchTtl: 100 },
    );
    await r.prefetch("/p");
    vi.setSystemTime(Date.now() + 1000);
    await r.navigate("/p");
    expect(load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("guards", () => {
  it("false cancels, true allows, string redirects", async () => {
    const r = make([
      { path: "/", component: page("") },
      { path: "/no", component: page(""), guard: () => false },
      { path: "/yes", component: page(""), guard: () => true },
      { path: "/go", component: page(""), guard: () => "/yes" },
      { path: "/async", component: page(""), guard: async () => "/yes" },
    ]);
    expect(await r.navigate("/no")).toBe(false);
    expect(r.path()).toBe("/");
    expect(r.history.location().path).toBe("/");
    expect(await r.navigate("/yes")).toBe(true);
    await r.navigate("/go");
    expect(r.path()).toBe("/yes");
    await r.navigate("/");
    await r.navigate("/async");
    expect(r.path()).toBe("/yes");
  });

  it("receives to/from/signal; parent guards run before child guards; global first", async () => {
    const order: string[] = [];
    let ctx!: {
      to: { path: string };
      from: { path: string } | null;
      signal: AbortSignal;
    };
    const r = make(
      [
        { path: "/", component: page("") },
        {
          path: "/p",
          component: () => r.outlet(),
          guard: () => void order.push("parent"),
          children: [
            {
              path: "c",
              component: page(""),
              guard: (c) => {
                ctx = c;
                order.push("child");
              },
            },
          ],
        },
      ],
      { guard: () => void order.push("global") },
    );
    await r.ready;
    order.length = 0;
    await r.navigate("/p/c");
    expect(order).toEqual(["global", "parent", "child"]);
    expect(ctx.to.path).toBe("/p/c");
    expect(ctx.from?.path).toBe("/");
    expect(ctx.signal.aborted).toBe(false);
  });

  it("guards run for the initial navigation and can redirect it", async () => {
    const r = make(
      [
        { path: "/login", component: page("") },
        { path: "/admin", component: page(""), guard: () => "/login" },
      ],
      { at: ["/admin"] },
    );
    await r.ready;
    expect(r.path()).toBe("/login");
    expect(r.history.location().path).toBe("/login");
  });

  it("a guard that throws rejects navigate() and leaves state alone", async () => {
    const r = make([
      { path: "/", component: page("") },
      {
        path: "/x",
        component: page(""),
        guard: () => {
          throw new Error("guard boom");
        },
      },
    ]);
    await expect(r.navigate("/x")).rejects.toThrow("guard boom");
    expect(r.path()).toBe("/");
    expect(r.navigating()).toBe(false);
  });

  it("a newer navigation aborts a pending guard", async () => {
    const d = deferred<boolean>();
    let sig!: AbortSignal;
    const r = make([
      { path: "/", component: page("") },
      {
        path: "/slow",
        component: page(""),
        guard: (c) => ((sig = c.signal), d.promise),
      },
      { path: "/b", component: page("") },
    ]);
    const slow = r.navigate("/slow");
    await r.navigate("/b");
    expect(sig.aborted).toBe(true);
    d.resolve(true);
    expect(await slow).toBe(false);
    expect(r.path()).toBe("/b");
  });

  it("a blocked back navigation restores the previous entry", async () => {
    let allow = true;
    const r = make([
      { path: "/", component: page(""), guard: () => allow },
      { path: "/b", component: page("") },
    ]);
    await r.navigate("/b");
    allow = false;
    r.back();
    await flush();
    expect(r.path()).toBe("/b");
    expect(r.history.location().path).toBe("/b");
  });

  it("errors from history-driven navigations go to onError", async () => {
    const onError = vi.fn();
    let boom = false;
    const r = make(
      [
        {
          path: "/",
          component: page(""),
          guard: () => {
            if (boom) throw new Error("pop");
          },
        },
        { path: "/b", component: page("") },
      ],
      { onError },
    );
    await r.navigate("/b");
    boom = true;
    r.back();
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("links", () => {
  const routes: AnyRoute[] = [
    { path: "/", component: page("home") },
    { path: "/a", component: page("a") },
    { path: "/a/deep", component: page("deep") },
  ];

  it("router.a renders an anchor with href and navigates on plain click", async () => {
    const r = make(routes);
    const m = mount(
      () =>
        html`<nav>${r.a("/a", "to a", { class: "lnk" })}${r.outlet()}</nav>`,
    );
    const a = m.query<HTMLAnchorElement>("a");
    expect(a.getAttribute("href")).toBe("/a");
    expect(a.className).toBe("lnk");
    const e = fire(a, "click", { button: 0 });
    expect(e.defaultPrevented).toBe(true);
    await flush();
    expect(r.path()).toBe("/a");
    expect(m.text()).toBe("to aa");
  });

  it("spread form works in templates and honours base and hash history hrefs", () => {
    const r = make(routes, { base: "/app" });
    const m = mount(() => html`<a ${r.link("/a?x=1")}>x</a>`);
    expect(m.query("a").getAttribute("href")).toBe("/app/a?x=1");
    const hr = createRouter({
      routes,
      history: (() => {
        const h = createMemoryHistory();
        return { ...h, href: (u: string) => "#" + u };
      })(),
    });
    expect(hr.href("/a")).toBe("#/a");
    hr.dispose();
  });

  it.each([
    ["meta key", { metaKey: true }],
    ["ctrl key", { ctrlKey: true }],
    ["shift key", { shiftKey: true }],
    ["alt key", { altKey: true }],
    ["middle button", { button: 1 }],
  ])("lets the browser handle %s clicks", async (_n, init) => {
    const r = make(routes);
    const m = mount(() => r.a("/a", "x"));
    const prevented = clickAndCheck(m.query("a"), init);
    await flush();
    expect(prevented).toBe(false);
    expect(r.path()).toBe("/");
  });

  it("ignores target, download, rel=external and already-prevented clicks", async () => {
    const r = make(routes);
    const m = mount(
      () =>
        html`<div>
          <a id="t" ${r.link("/a")} target="_blank">t</a>
          <a id="d" ${r.link("/a")} download>d</a>
          <a id="e" ${r.link("/a")} rel="noopener external">e</a>
          <a id="s" ${r.link("/a")} target="_self">s</a>
          <a id="p" ${r.link("/a")} @click.prevent=${() => {}}>p</a>
        </div>`,
    );
    for (const id of ["t", "d", "e", "p"]) {
      clickAndCheck(m.query("#" + id));
      await flush();
      expect(r.path(), id).toBe("/");
    }
    fire(m.query("#s"), "click");
    await flush();
    expect(r.path()).toBe("/a");
  });

  it("external URLs get a plain link without handlers", async () => {
    const r = make(routes);
    const m = mount(() => r.a("https://example.com/x", "ext"));
    const a = m.query("a");
    expect(a.getAttribute("href")).toBe("https://example.com/x");
    expect(a.hasAttribute("aria-current")).toBe(false);
    expect(clickAndCheck(a)).toBe(false);
    const m2 = mount(() => r.a("mailto:a@b.c", "mail"));
    expect(m2.query("a").getAttribute("href")).toBe("mailto:a@b.c");
  });

  it("refuses javascript: links", () => {
    const r = make(routes);
    expect(() => mount(() => r.a("javascript:alert(1)", "x"))).toThrow(
      /unsafe URL/,
    );
  });

  it("sets aria-current: page when exact, true for ancestors when not exact", async () => {
    const r = make(routes);
    const m = mount(
      () =>
        html`<div>
          ${r.a("/a", "exact", { id: "ex" })}
          ${r.a("/a", "section", { id: "sec" }, { exact: false })}
          ${r.a("/", "home", { id: "home" }, { exact: false })}
        </div>`,
    );
    const attr = (id: string) => m.query("#" + id).getAttribute("aria-current");
    expect(attr("ex")).toBeNull();
    expect(attr("home")).toBe("page");
    await r.navigate("/a");
    await flush();
    expect(attr("ex")).toBe("page");
    expect(attr("sec")).toBe("page");
    expect(attr("home")).toBeNull();
    await r.navigate("/a/deep");
    await flush();
    expect(attr("ex")).toBeNull();
    expect(attr("sec")).toBe("true");
  });

  it("link options: replace and state", async () => {
    const r = make(routes);
    const m = mount(() =>
      r.a("/a", "x", {}, { replace: true, state: { s: 1 } }),
    );
    fire(m.query("a"), "click");
    await flush();
    expect(r.history.location().state).toEqual({ s: 1 });
    r.back();
    await flush();
    // replaced the only entry: nowhere to go back to
    expect(r.path()).toBe("/a");
  });

  it("prefetches on hover and focus by default, never with none", async () => {
    const load = vi.fn(() => "x");
    const r = make([...routes, { path: "/pf", component: page(""), load }]);
    const m = mount(
      () =>
        html`<div>
          ${r.a("/pf", "h", { id: "h" })}${r.a("/pf", "n", { id: "n" }, { prefetch: "none" })}
        </div>`,
    );
    fire(m.query("#n"), "pointerenter");
    expect(load).not.toHaveBeenCalled();
    m.query("#h").dispatchEvent(new Event("pointerenter"));
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    m.query("#h").dispatchEvent(new Event("focus"));
    await flush();
    expect(load).toHaveBeenCalledTimes(1); // deduped
  });

  it("prefetches when visible via IntersectionObserver and disconnects on dispose", async () => {
    const instances: Array<{
      cb: (e: Array<{ isIntersecting: boolean }>) => void;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    class IO {
      cb: (e: Array<{ isIntersecting: boolean }>) => void;
      disconnect = vi.fn();
      constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void) {
        this.cb = cb;
        instances.push(this);
      }
      observe() {}
    }
    vi.stubGlobal("IntersectionObserver", IO);
    try {
      const load = vi.fn(() => 1);
      const r = make([...routes, { path: "/v", component: page(""), load }]);
      const m = mount(() => r.a("/v", "v", {}, { prefetch: "visible" }));
      expect(load).not.toHaveBeenCalled();
      instances[0]!.cb([{ isIntersecting: false }]);
      expect(load).not.toHaveBeenCalled();
      instances[0]!.cb([{ isIntersecting: true }]);
      await flush();
      expect(load).toHaveBeenCalledTimes(1);
      expect(instances[0]!.disconnect).toHaveBeenCalled();
      m.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("detaches click and prefetch listeners when the view is disposed", async () => {
    const r = make(routes);
    const before = debugStats();
    const m = mount(() => r.a("/a", "x"));
    m.unmount();
    expect(debugStats().owners).toBe(before.owners);
  });

  it("link click errors (e.g. a failing guard) are reported, not thrown", async () => {
    const onError = vi.fn();
    const r = make(
      [
        { path: "/", component: page("") },
        {
          path: "/x",
          component: page(""),
          guard: () => {
            throw new Error("g");
          },
        },
      ],
      { onError },
    );
    const m = mount(() => r.a("/x", "x"));
    fire(m.query("a"), "click");
    await flush();
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("accessibility", () => {
  const routes: AnyRoute[] = [
    {
      path: "/",
      title: "Home",
      component: () => html`<main><h1>Home</h1></main>`,
    },
    {
      path: "/about",
      title: "About us",
      component: () => html`<main id="m"><h1>About</h1></main>`,
    },
    {
      path: "/u/:id",
      title: ({ params }) => `User ${params.id}`,
      component: () => html`<div><h1>U</h1></div>`,
    },
    {
      path: "/notitle",
      component: () => html`<div><h1>Heading only</h1></div>`,
    },
  ];
  const live = () => document.querySelector("[aria-live]");
  const settle = () => new Promise((r) => setTimeout(r, 5));

  it("sets the document title (with template) from route titles", async () => {
    const r = make(routes, { titleTemplate: (t) => `${t} | Site` });
    await r.navigate("/about");
    expect(document.title).toBe("About us | Site");
    await r.navigate("/u/7");
    expect(document.title).toBe("User 7 | Site");
  });

  it("announces the new page in a polite live region (not for the initial load)", async () => {
    const r = make(routes);
    await r.ready;
    expect(live()).toBeNull();
    await r.navigate("/about");
    await settle();
    const region = live()!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.textContent).toBe("About us");
    await r.navigate("/u/3");
    await settle();
    expect(region.textContent).toBe("User 3");
  });

  it("falls back to the first heading when there is no title; custom announce text; disabled", async () => {
    const r = make(routes);
    await r.navigate("/notitle");
    mount(() => r.outlet());
    await r.navigate("/");
    await r.navigate("/notitle");
    await flush();
    await settle();
    expect(live()!.textContent).toBe("Home");
    r.announce("hello");
    await settle();
    expect(live()!.textContent).toBe("hello");

    r.dispose();
    const r2 = make(routes, {
      announce: (title) => `Navigated to ${title}`,
    });
    await r2.navigate("/about");
    await settle();
    expect(live()!.textContent).toBe("Navigated to About us");

    document.body.innerHTML = "";
    const r3 = make(routes, { announce: false });
    await r3.navigate("/about");
    await settle();
    expect(live()).toBeNull();
  });

  it("does not announce query-only or hash-only changes", async () => {
    const r = make(routes);
    await r.navigate("/about");
    await settle();
    const region = live()!;
    region.textContent = "sentinel";
    await r.navigate("/about?x=1");
    await r.navigate("/about?x=1#h");
    await settle();
    expect(region.textContent).toBe("sentinel");
  });

  it("moves focus to main (or h1) after navigation, making it focusable", async () => {
    const r = make(routes);
    const m = mount(() => r.outlet());
    await r.navigate("/about");
    await flush();
    const main = m.query("main");
    expect(document.activeElement).toBe(main);
    expect(main.getAttribute("tabindex")).toBe("-1");
    main.blur();
    expect(main.hasAttribute("tabindex")).toBe(false);
    await r.navigate("/notitle");
    await flush();
    expect(document.activeElement).toBe(m.query("h1"));
  });

  it("honours data-router-focus, a custom selector, and focus: false; not on first load or same-page changes", async () => {
    const r = make(
      [
        { path: "/", component: () => html`<div>x</div>` },
        {
          path: "/f",
          component: () =>
            html`<main>
              <h1>t</h1>
              <div data-router-focus id="c"></div>
            </main>`,
        },
      ],
      {},
    );
    const m = mount(() => r.outlet());
    await r.ready;
    expect(document.activeElement).toBe(document.body);
    await r.navigate("/f");
    await flush();
    expect(document.activeElement).toBe(m.query("#c"));
    (document.activeElement as HTMLElement).blur();
    await r.navigate("/f?q=1");
    await flush();
    expect(document.activeElement).toBe(document.body);

    const r2 = make(
      [
        { path: "/", component: page("") },
        { path: "/g", component: () => html`<main><h1 id="hh">t</h1></main>` },
      ],
      { focus: "#hh" },
    );
    const m2 = mount(() => r2.outlet());
    await r2.navigate("/g");
    await flush();
    expect(document.activeElement).toBe(m2.query("#hh"));

    const r3 = make(
      [
        { path: "/", component: page("") },
        { path: "/g", component: () => html`<main>t</main>` },
      ],
      { focus: false },
    );
    const m3 = mount(() => r3.outlet());
    (document.activeElement as HTMLElement).blur?.();
    await r3.navigate("/g");
    await flush();
    expect(document.activeElement).not.toBe(m3.query("main"));
  });

  it("removes the live region on dispose", async () => {
    const r = make(routes);
    await r.navigate("/about");
    await settle();
    expect(live()).not.toBeNull();
    r.dispose();
    expect(live()).toBeNull();
  });
});

describe("scroll restoration", () => {
  function fakeScroller() {
    let pos = { x: 0, y: 0 };
    const calls: string[] = [];
    const s: Scroller = {
      position: () => pos,
      scrollTo(x, y) {
        pos = { x, y };
        calls.push(`to ${x},${y}`);
      },
      scrollToElement(el) {
        calls.push(`el ${el.id}`);
      },
    };
    return { s, calls, set: (x: number, y: number) => (pos = { x, y }) };
  }
  const routes: AnyRoute[] = [
    { path: "/", component: page("") },
    { path: "/a", component: page("") },
    { path: "/b", component: () => html`<h2 id="sec">s</h2>` },
  ];

  it("scrolls to top on push, restores the saved position on pop", async () => {
    const f = fakeScroller();
    const r = make(routes, { scroll: f.s });
    f.set(0, 300);
    await r.navigate("/a");
    expect(f.calls.at(-1)).toBe("to 0,0");
    f.set(0, 50);
    await r.navigate("/b");
    r.back();
    await flush();
    expect(f.calls.at(-1)).toBe("to 0,50");
    r.back();
    await flush();
    expect(f.calls.at(-1)).toBe("to 0,300");
  });

  it("scrolls to the anchor element for hashes and ignores unknown anchors", async () => {
    const f = fakeScroller();
    const r = make(routes, { scroll: f.s });
    const m = mount(() => r.outlet());
    await r.navigate("/b#sec");
    await flush();
    expect(f.calls.at(-1)).toBe("el sec");
    void m;
    const n = f.calls.length;
    await r.navigate("/b#missing");
    expect(f.calls.length).toBe(n); // unknown anchor: nothing to scroll to
  });

  it("hash-only changes scroll to the anchor without navigating", async () => {
    const f = fakeScroller();
    const r = make(routes, { scroll: f.s, at: ["/b"] });
    mount(() => r.outlet());
    await flush();
    await r.navigate("#sec");
    expect(f.calls.at(-1)).toBe("el sec");
  });

  it("does not scroll for query-only changes, with scroll:false, or when disabled", async () => {
    const f = fakeScroller();
    const r = make(routes, { scroll: f.s });
    await r.navigate("/a");
    f.calls.length = 0;
    await r.navigate("/a?x=1");
    expect(f.calls).toEqual([]);
    await r.navigate("/b", { scroll: false });
    expect(f.calls).toEqual([]);
    const r2 = make(routes, { scroll: false });
    await r2.navigate("/a");
  });
});

describe("view transitions", () => {
  const routes: AnyRoute[] = [
    { path: "/", component: page("a") },
    { path: "/b", component: page("b") },
  ];

  function stubTransitions(reduced: boolean) {
    const start = vi.fn((cb: () => void) => {
      cb();
      return { updateCallbackDone: Promise.resolve() };
    });
    (
      document as unknown as { startViewTransition: unknown }
    ).startViewTransition = start;
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: reduced && q.includes("reduce"),
    }));
    window.matchMedia = (
      globalThis as unknown as { matchMedia: typeof window.matchMedia }
    ).matchMedia;
    return start;
  }
  afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown })
      .startViewTransition;
    vi.unstubAllGlobals();
  });

  it("wraps the DOM update in startViewTransition when available", async () => {
    const start = stubTransitions(false);
    const r = make(routes, { viewTransitions: undefined });
    const m = mount(() => r.outlet());
    await r.navigate("/b");
    await flush();
    expect(start).toHaveBeenCalled();
    expect(m.text()).toBe("b");
    expect(r.path()).toBe("/b");
  });

  it("skips transitions for prefers-reduced-motion and when disabled", async () => {
    const start = stubTransitions(true);
    const r = make(routes, { viewTransitions: undefined });
    await r.navigate("/b");
    expect(start).not.toHaveBeenCalled();
    const r2 = make(routes, { viewTransitions: false });
    stubTransitions(false);
    const start2 = (
      document as unknown as { startViewTransition: ReturnType<typeof vi.fn> }
    ).startViewTransition;
    await r2.navigate("/b");
    expect(start2).not.toHaveBeenCalled();
  });

  it("the first navigation is committed synchronously, outside a view transition (regression: hydration needs the page at once)", () => {
    const start = vi.fn(() => ({
      updateCallbackDone: new Promise<void>(() => {}),
    }));
    (
      document as unknown as { startViewTransition: unknown }
    ).startViewTransition = start;
    const r = make([{ path: "/", component: page("a") }], {
      viewTransitions: undefined,
    });
    expect(start).not.toHaveBeenCalled();
    expect(r.path()).toBe("/");
    expect(mount(() => r.outlet()).text()).toBe("a");
  });

  it("a skipped transition does not leave an unhandled rejection (regression: browsers reject ready/finished)", async () => {
    (
      document as unknown as { startViewTransition: unknown }
    ).startViewTransition = (cb: () => void) => {
      cb();
      const skipped = () => Promise.reject(new Error("Transition was skipped"));
      return {
        updateCallbackDone: Promise.resolve(),
        ready: skipped(),
        finished: skipped(),
      };
    };
    const r = make(routes, { viewTransitions: undefined });
    await r.navigate("/b");
    await flush();
    expect(r.path()).toBe("/b");
  });

  it("a navigation superseded during the transition does not commit", async () => {
    const callbacks: Array<() => void> = [];
    (
      document as unknown as { startViewTransition: unknown }
    ).startViewTransition = (cb: () => void) => {
      callbacks.push(cb);
      return { updateCallbackDone: Promise.resolve().then(() => cb()) };
    };
    const r = make([...routes, { path: "/c", component: page("c") }], {
      viewTransitions: undefined,
    });
    const first = r.navigate("/b");
    void r.navigate("/c");
    await first;
    await flush();
    expect(r.path()).toBe("/c");
  });
});

describe("lifecycle", () => {
  it("dispose stops reacting to history, aborts navigations and is idempotent", async () => {
    const d = deferred<string>();
    let sig!: AbortSignal;
    const h = createMemoryHistory(["/"]);
    const r = createRouter({
      history: h,
      routes: [
        { path: "/", component: page("") },
        {
          path: "/s",
          component: page(""),
          load: ({ signal }) => ((sig = signal), d.promise),
        },
        { path: "/b", component: page("") },
      ],
    });
    h.push("/b");
    const nav = r.navigate("/s");
    await flush();
    r.dispose();
    r.dispose();
    expect(sig.aborted).toBe(true);
    d.resolve("x");
    expect(await nav).toBe(false);
    h.back();
    await flush();
    expect(r.path()).toBe("/");
  });

  it("is disposed with its owner", () => {
    const h = createMemoryHistory(["/"]);
    const dispose = root((d) => {
      createRouter({
        history: h,
        routes: [{ path: "/", component: page("") }],
      });
      return d;
    });
    const spy = vi.fn();
    h.listen(spy);
    dispose();
    h.push("/x");
    h.back();
    // router no longer listens; our spy still does
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("works with the default driver choice (memory without options in jsdom still uses browser)", async () => {
    window.history.replaceState(null, "", "/zzz");
    const r = createRouter({ routes: [{ path: "/zzz", component: page("") }] });
    expect(r.history.kind).toBe("browser");
    expect(r.path()).toBe("/zzz");
    await r.navigate("/zzz?x=1");
    expect(window.location.search).toBe("?x=1");
    r.dispose();
    r.history.destroy();
    window.history.replaceState(null, "", "/");
  });

  it("hash and memory drivers can be requested by name", () => {
    window.history.replaceState(null, "", "/#/q");
    const a = createRouter({
      routes: [{ path: "/q", component: page("") }],
      history: "hash",
    });
    expect(a.history.kind).toBe("hash");
    expect(a.path()).toBe("/q");
    a.dispose();
    a.history.destroy();
    const b = createRouter({ routes: [], history: "memory" });
    expect(b.history.kind).toBe("memory");
    b.dispose();
    window.history.replaceState(null, "", "/");
  });
});
