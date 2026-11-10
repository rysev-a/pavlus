import { describe, expect, test } from "vitest";
import type { Message } from "../../core/types.ts";
import {
  createServiceWorkerPlugin,
  serviceWorkerEffector as sw,
  workerSource,
} from "./mod.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

/* ---- fakes ---- */

class Emitter {
  private l = new Map<string, Set<(e: any) => void>>();
  addEventListener(t: string, f: (e: any) => void) {
    (this.l.get(t) ?? this.l.set(t, new Set()).get(t)!).add(f);
  }
  removeEventListener(t: string, f: (e: any) => void) {
    this.l.get(t)?.delete(f);
  }
  emit(t: string, e: any = {}) {
    [...(this.l.get(t) ?? [])].forEach((f) => f(e));
  }
  count(t: string) {
    return this.l.get(t)?.size ?? 0;
  }
}

class FakeWorker extends Emitter {
  posted: unknown[] = [];
  state: string;
  constructor(state: string) {
    super();
    this.state = state;
  }
  postMessage(d: unknown) {
    this.posted.push(d);
  }
  setState(s: string) {
    this.state = s;
    this.emit("statechange");
  }
}

class FakeReg extends Emitter {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  active: FakeWorker | null = null;
  shown: [string, unknown][] = [];
  updates = 0;
  unregistered = false;
  scope: string;
  constructor(scope: string) {
    super();
    this.scope = scope;
  }
  async update() {
    this.updates++;
  }
  async unregister() {
    this.unregistered = true;
    return true;
  }
  async showNotification(t: string, o?: unknown) {
    this.shown.push([t, o]);
  }
}

class FakeContainer extends Emitter {
  controller: unknown = null;
  regs = new Map<string, FakeReg>();
  registered: [string, any][] = [];
  failWith: Error | null = null;
  ready: Promise<FakeReg>;
  private resolveReady!: (r: FakeReg) => void;
  constructor() {
    super();
    this.ready = new Promise((r) => (this.resolveReady = r));
  }
  async register(script: string, options?: any) {
    this.registered.push([script, options]);
    if (this.failWith) throw this.failWith;
    const reg = new FakeReg(options?.scope ?? "/");
    reg.installing = new FakeWorker("installing");
    this.regs.set(reg.scope, reg);
    return reg;
  }
  async getRegistration(scope?: string) {
    return scope ? this.regs.get(scope) : [...this.regs.values()][0];
  }
  activate(reg: FakeReg) {
    reg.active = new FakeWorker("activated");
    this.resolveReady(reg);
  }
}

function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: any) => (typeof r === "string" ? r : r.url);
  const open = async (name: string) => {
    const m = stores.get(name) ?? stores.set(name, new Map()).get(name)!;
    return {
      put: async (r: any, res: Response) => void m.set(key(r), res),
      addAll: async (rs: any[]) =>
        rs.forEach((r) => m.set(key(r), new Response("fetched:" + key(r)))),
      add: async (r: any) =>
        void m.set(key(r), new Response("fetched:" + key(r))),
      match: async (r: any, o?: any) => {
        const k = key(r);
        const hit = o?.ignoreSearch
          ? [...m.keys()].find((x) => x.split("?")[0] === k.split("?")[0])
          : k;
        return hit && m.get(hit)?.clone();
      },
      delete: async (r: any) => m.delete(key(r)),
      keys: async () => [...m.keys()].map((url) => ({ url })),
    };
  };
  return {
    stores,
    caches: {
      open,
      delete: async (n: string) => stores.delete(n),
      keys: async () => [...stores.keys()],
    },
  };
}

function setup(over: Record<string, unknown> = {}) {
  const container = new FakeContainer();
  const c = fakeCaches();
  const win = new Emitter();
  const plugin = createServiceWorkerPlugin({
    serviceWorker: container as any,
    caches: c.caches,
    eventTarget: win as any,
    navigator: { onLine: true },
    ...over,
  });
  const out: Message[] = [];
  const ctx = {
    dispatch: (m: Message) => void out.push(m),
    getState: () => ({}),
    dispatchEffect: () => {},
  };
  return {
    plugin,
    container,
    c,
    win,
    out,
    run: (e: any) => plugin.handle(e, ctx),
  };
}

/* ---- tests ---- */

describe("serviceworker effector", () => {
  test("builds minimal effects", () => {
    expect(
      sw.register({ script: "/sw.js", onSuccess: "ok", scope: undefined }),
    ).toEqual({
      plugin: "serviceworker",
      type: "register",
      script: "/sw.js",
      onSuccess: "ok",
    });
    expect(sw.skipWaiting()).toEqual({
      plugin: "serviceworker",
      type: "skipWaiting",
    });
    expect(sw.unobserve("o")).toEqual({
      plugin: "serviceworker",
      type: "unobserve",
      id: "o",
    });
  });
});

describe("registration", () => {
  test("register replies state, passes options, remembers the id", async () => {
    const { run, out, container, plugin } = setup();
    run(
      sw.register({
        id: "main",
        script: "/sw.js",
        scope: "/app/",
        workerType: "module",
        updateViaCache: "none",
        onSuccess: "ok",
      }),
    );
    await flush();
    expect(container.registered).toEqual([
      ["/sw.js", { scope: "/app/", type: "module", updateViaCache: "none" }],
    ]);
    expect(out[0]).toEqual({
      id: "ok",
      payload: {
        phase: "installing",
        installing: true,
        waiting: false,
        active: false,
        redundant: false,
        scope: "/app/",
        updateFound: false,
        controller: false,
      },
    });
    expect(plugin.registrations()).toEqual(["main"]);
  });

  test("register failure -> onError {FAILED}", async () => {
    const { run, out, container } = setup();
    container.failWith = new Error("bad script");
    run(sw.register({ script: "/x.js", onSuccess: "ok", onError: "bad" }));
    await flush();
    expect(out).toEqual([
      { id: "bad", payload: { code: "FAILED", message: "bad script" } },
    ]);
  });

  test("unsupported environment replies UNSUPPORTED for every effect", async () => {
    const { run, out } = setup({
      serviceWorker: undefined,
      caches: undefined,
      Notification: undefined,
    });
    for (const e of [
      sw.register({ script: "/s", onError: "e" }),
      sw.unregister({ onError: "e" }),
      sw.update({ onError: "e" }),
      sw.skipWaiting({ onError: "e" }),
      sw.postMessage({ data: 1, onError: "e" }),
      sw.ready({ onSuccess: "ok", onError: "e" }),
      sw.cachePut({ cache: "c", url: "/a", onError: "e" }),
      sw.cacheMatch({ cache: "c", url: "/a", onSuccess: "ok", onError: "e" }),
      sw.cacheDelete({ cache: "c", onError: "e" }),
      sw.cacheKeys({ onError: "e" }),
      sw.cacheClear({ onError: "e" }),
      sw.notify({ title: "t", onError: "e" }),
      sw.notificationPermission({ onSuccess: "ok", onError: "e" }),
    ])
      run(e);
    run(sw.observe({ id: "o", onChange: "c" })); // silent no-op
    await flush();
    expect(out).toHaveLength(13);
    expect(
      out.every(
        (m) => m.id === "e" && (m.payload as any).code === "UNSUPPORTED",
      ),
    ).toBe(true);
  });

  test("unregister by id, by scope, and when nothing is registered", async () => {
    const { run, out, container } = setup();
    run(sw.unregister({ onSuccess: "u" }));
    await flush();
    expect(out[0]).toEqual({ id: "u", payload: false });
    run(sw.register({ script: "/sw.js", scope: "/a/" }));
    run(sw.register({ id: "b", script: "/sw.js", scope: "/b/" }));
    await flush();
    run(sw.unregister({ scope: "/b/", onSuccess: "u" }));
    await flush();
    expect(out[1]).toEqual({ id: "u", payload: true });
    expect(container.regs.get("/b/")!.unregistered).toBe(true);
    run(sw.unregister({ onSuccess: "u" }));
    await flush();
    expect(container.regs.get("/a/")!.unregistered).toBe(true);
  });

  test("update", async () => {
    const { run, out, container } = setup();
    run(sw.update({ onError: "e" }));
    await flush();
    expect((out[0]!.payload as any).code).toBe("NOT_REGISTERED");
    run(sw.register({ script: "/sw.js" }));
    await flush();
    run(sw.update({ onSuccess: "ok" }));
    await flush();
    expect(container.regs.get("/")!.updates).toBe(1);
    expect(out[1]!.id).toBe("ok");
  });

  test("skipWaiting posts SKIP_WAITING to the waiting worker only", async () => {
    const { run, out, container } = setup();
    run(sw.register({ script: "/sw.js" }));
    await flush();
    const reg = container.regs.get("/")!;
    run(sw.skipWaiting({ onSuccess: "sk" }));
    await flush();
    expect(out.at(-1)).toEqual({ id: "sk", payload: false });
    reg.waiting = new FakeWorker("installed");
    run(sw.skipWaiting({ onSuccess: "sk" }));
    await flush();
    expect(reg.waiting.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(out.at(-1)).toEqual({ id: "sk", payload: true });
  });

  test("postMessage targets and missing worker", async () => {
    const { run, out, container } = setup();
    run(sw.register({ script: "/sw.js" }));
    await flush();
    const reg = container.regs.get("/")!;
    reg.active = new FakeWorker("activated");
    run(sw.postMessage({ data: { a: 1 }, onSuccess: "ok" }));
    run(sw.postMessage({ data: 2, target: "installing" }));
    run(sw.postMessage({ data: 3, target: "waiting", onError: "e" }));
    await flush();
    expect(reg.active.posted).toEqual([{ a: 1 }]);
    expect(reg.installing!.posted).toEqual([2]);
    expect(out.map((m) => m.id)).toEqual(["ok", "e"]);
    expect((out[1]!.payload as any).code).toBe("NOT_REGISTERED");
  });

  test("ready replies when a worker is active", async () => {
    const { run, out, container } = setup();
    run(sw.register({ script: "/sw.js" }));
    await flush();
    run(sw.ready({ onSuccess: "rdy" }));
    await flush();
    const before = out.length;
    container.activate(container.regs.get("/")!);
    await flush();
    expect(out.length).toBe(before + 1);
    expect((out.at(-1)!.payload as any).phase).toBe("installing"); // installing slot still set by fake
    expect((out.at(-1)!.payload as any).active).toBe(true);
  });
});

describe("observe", () => {
  test("streams lifecycle, updatefound, controllerchange and messages", async () => {
    const { run, out, container, plugin } = setup();
    run(sw.register({ script: "/sw.js" }));
    await flush();
    const reg = container.regs.get("/")!;
    out.length = 0;
    run(sw.observe({ id: "o", onChange: "state", onMessage: "msg" }));
    expect(out.map((m) => (m.payload as any).event)).toEqual(["init"]);
    expect((out[0]!.payload as any).phase).toBe("installing");

    reg.installing!.setState("installed");
    reg.waiting = reg.installing;
    reg.installing = null;
    reg.waiting!.setState("installed");
    expect((out.at(-1)!.payload as any).phase).toBe("waiting");

    container.controller = {};
    container.emit("controllerchange");
    expect((out.at(-1)!.payload as any).event).toBe("controllerchange");
    expect((out.at(-1)!.payload as any).controller).toBe(true);

    // an update starts
    reg.installing = new FakeWorker("installing");
    reg.emit("updatefound");
    expect(out.at(-1)!.payload).toMatchObject({
      event: "updatefound",
      updateFound: true,
      phase: "installing",
    });
    reg.installing.setState("installed");
    expect(out.at(-1)!.payload).toMatchObject({
      event: "statechange",
      updateFound: true,
    });

    // redundant: everything gone
    const w = reg.waiting!;
    reg.waiting = null;
    reg.installing = null;
    w.setState("redundant");
    expect(out.at(-1)!.payload).toMatchObject({
      phase: "redundant",
      redundant: true,
    });

    container.emit("message", { data: { type: "HELLO" } });
    expect(out.at(-1)).toEqual({ id: "msg", payload: { type: "HELLO" } });
    expect(plugin.observers()).toEqual(["o"]);
  });

  test("unobserve and replacement detach all listeners", async () => {
    const { run, out, container, plugin } = setup();
    run(sw.register({ script: "/sw.js" }));
    await flush();
    const reg = container.regs.get("/")!;
    run(sw.observe({ id: "o", onChange: "s", onMessage: "m" }));
    run(sw.observe({ id: "o", onChange: "s", onMessage: "m" })); // replace
    expect(container.count("message")).toBe(1);
    expect(container.count("controllerchange")).toBe(1);
    expect(reg.count("updatefound")).toBe(1);
    expect(reg.installing!.count("statechange")).toBe(1);
    run(sw.unobserve("o"));
    expect(container.count("message")).toBe(0);
    expect(reg.count("updatefound")).toBe(0);
    expect(reg.installing!.count("statechange")).toBe(0);
    const n = out.length;
    container.emit("message", { data: 1 });
    expect(out.length).toBe(n);
    expect(plugin.observers()).toEqual([]);
  });

  test("observe before register attaches when the registration appears", async () => {
    const { run, out, container } = setup();
    run(sw.observe({ id: "o", onChange: "s" }));
    await flush();
    expect(out.map((m) => (m.payload as any).phase)).toEqual([]);
    run(sw.register({ script: "/sw.js", onSuccess: "ok" }));
    await flush();
    const states = out
      .filter((m) => m.id === "s")
      .map((m) => (m.payload as any).event);
    expect(states).toEqual(["init"]);
    container.regs.get("/")!.installing!.setState("installed");
    expect(out.at(-1)!.id).toBe("s");
  });

  test("observe finds an already existing registration", async () => {
    const { run, out, container } = setup();
    const reg = new FakeReg("/");
    reg.active = new FakeWorker("activated");
    container.regs.set("/", reg);
    run(sw.observe({ id: "o", onChange: "s" }));
    await flush();
    expect(out[0]!.payload).toMatchObject({ phase: "active", event: "init" });
  });
});

describe("online", () => {
  test("initial value, events, stop, dispose", () => {
    const { run, out, win, plugin } = setup();
    run(sw.online({ id: "n", onChange: "net" }));
    win.emit("offline");
    win.emit("online");
    expect(out.map((m) => m.payload)).toEqual([true, false, true]);
    run(sw.online({ id: "n", onChange: "net" })); // replace, no listener leak
    expect(win.count("online")).toBe(1);
    run(sw.unobserveOnline("n"));
    expect(win.count("offline")).toBe(0);
    run(sw.online({ id: "n", onChange: "net" }));
    expect(plugin.onlineObservers()).toEqual(["n"]);
    plugin.dispose!();
    expect(win.count("online")).toBe(0);
    expect(plugin.onlineObservers()).toEqual([]);
  });

  test("reads navigator.onLine; without an event target reports once", () => {
    const { run, out } = setup({
      navigator: { onLine: false },
      eventTarget: undefined,
    });
    run(sw.online({ id: "n", onChange: "net" }));
    expect(out.map((m) => m.payload)).toEqual([false]);
  });
});

describe("cache", () => {
  test("put response, match, keys, delete, clear", async () => {
    const { run, out, c } = setup();
    run(
      sw.cachePut({
        cache: "app",
        url: "/data.json",
        response: { body: { a: 1 }, status: 201, headers: { "x-k": "v" } },
        onSuccess: "ok",
      }),
    );
    run(
      sw.cachePut({
        cache: "app",
        request: "/index.html",
        response: { body: "<h1>" },
      }),
    );
    await flush();
    expect(out[0]).toEqual({ id: "ok", payload: true });
    run(sw.cacheMatch({ cache: "app", url: "/data.json", onSuccess: "hit" }));
    await flush();
    run(sw.cacheMatch({ cache: "app", url: "/nope", onSuccess: "hit" }));
    await flush();
    expect(out[1]!.payload).toEqual({
      status: 201,
      headers: { "content-type": "application/json", "x-k": "v" },
      body: '{"a":1}',
    });
    expect(out[2]!.payload).toBeNull();

    run(sw.cacheKeys({ cache: "app", onSuccess: "keys" }));
    run(sw.cacheKeys({ onSuccess: "keys" }));
    await flush();
    expect(out[3]!.payload).toEqual(["/data.json", "/index.html"]);
    expect(out[4]!.payload).toEqual(["app"]);

    run(sw.cacheDelete({ cache: "app", url: "/index.html", onSuccess: "del" }));
    await flush();
    expect(out[5]!.payload).toBe(true);
    expect([...c.stores.get("app")!.keys()]).toEqual(["/data.json"]);

    run(sw.cacheClear({ cache: "app", onSuccess: "cl" }));
    await flush();
    expect(out[6]!.payload).toBe(1);
    expect(c.stores.get("app")!.size).toBe(0);

    run(sw.cachePut({ cache: "other", url: "/a", response: { body: "x" } }));
    await flush();
    run(sw.cacheDelete({ cache: "other", onSuccess: "del" }));
    run(sw.cacheClear({ onSuccess: "cl" }));
    await flush();
    expect(c.stores.size).toBe(0);
  });

  test("put without response fetches (cache.add); request spec with headers builds a Request", async () => {
    const seen: any[] = [];
    class R {
      url: string;
      init: any;
      constructor(url: string, init: any) {
        this.url = url;
        this.init = init;
        seen.push(this);
      }
    }
    const { run, c, out } = setup({ Request: R });
    run(sw.cachePut({ cache: "app", url: "/shell.html" }));
    run(
      sw.cachePut({
        cache: "app",
        request: { url: "/api", headers: { a: "b" } },
      }),
    );
    run(sw.cachePut({ cache: "app", onError: "e" })); // no url
    await flush();
    expect([...c.stores.get("app")!.keys()]).toEqual(["/shell.html", "/api"]);
    expect(seen[0].init.headers).toEqual({ a: "b" });
    expect(out.map((m) => m.id)).toEqual(["e"]);
  });

  test("ignoreSearch and cache failures", async () => {
    const { run, out, plugin } = setup();
    run(sw.cachePut({ cache: "a", url: "/x?v=1", response: { body: "x" } }));
    await flush();
    run(sw.cacheMatch({ cache: "a", url: "/x?v=2", onSuccess: "m" }));
    run(
      sw.cacheMatch({
        cache: "a",
        url: "/x?v=2",
        ignoreSearch: true,
        onSuccess: "m",
      }),
    );
    await flush();
    expect(out[0]!.payload).toBeNull();
    expect((out[1]!.payload as any).body).toBe("x");

    const broken = createServiceWorkerPlugin({
      caches: {
        open: async () => {
          throw new Error("quota");
        },
        delete: async () => false,
        keys: async () => [],
      },
    });
    broken.handle(sw.cacheKeys({ cache: "a", onError: "bad" }), {
      dispatch: (m: Message) => out.push(m),
    } as any);
    await flush();
    expect(out.at(-1)).toEqual({
      id: "bad",
      payload: { code: "FAILED", message: "quota" },
    });
    void plugin;
  });
});

describe("notifications", () => {
  test("notify via the registration; permission request", async () => {
    const { run, out, container } = setup({
      Notification: { requestPermission: async () => "granted" },
    });
    run(sw.notify({ title: "t", onError: "e" }));
    await flush();
    expect((out[0]!.payload as any).code).toBe("NOT_REGISTERED");
    run(sw.register({ script: "/sw.js" }));
    await flush();
    run(sw.notify({ title: "Hi", options: { body: "b" }, onSuccess: "ok" }));
    run(sw.notificationPermission({ onSuccess: "perm" }));
    await flush();
    expect(container.regs.get("/")!.shown).toEqual([["Hi", { body: "b" }]]);
    expect(
      out
        .slice(-2)
        .map((m) => m.id)
        .sort(),
    ).toEqual(["ok", "perm"]);
    expect(out.find((m) => m.id === "perm")!.payload).toBe("granted");
  });

  test("permission rejects -> FAILED", async () => {
    const { run, out } = setup({
      Notification: {
        requestPermission: () => Promise.reject(new Error("no")),
      },
    });
    run(sw.notificationPermission({ onSuccess: "p", onError: "e" }));
    await flush();
    expect(out[0]).toEqual({
      id: "e",
      payload: { code: "FAILED", message: "no" },
    });
  });
});

describe("dispose", () => {
  test("drops listeners and ignores late async replies", async () => {
    const { run, out, container, plugin, win } = setup();
    run(sw.register({ script: "/sw.js", onSuccess: "ok" }));
    run(sw.online({ id: "n", onChange: "net" }));
    plugin.dispose!();
    await flush();
    expect(out.map((m) => m.id)).toEqual(["net"]);
    expect(plugin.registrations()).toEqual([]);
    win.emit("offline");
    expect(out).toHaveLength(1);
    expect(container.count("message")).toBe(0);
  });
});

/* ---- generated worker source ---- */

function makeScope(source: string, fetchImpl: (req: any) => Promise<Response>) {
  const c = fakeCaches();
  const handlers: Record<string, ((e: any) => void)[]> = {};
  const posted: any[] = [];
  const clients = [
    { id: "a", postMessage: (d: any) => posted.push(["a", d]) },
    { id: "b", postMessage: (d: any) => posted.push(["b", d]) },
  ];
  const state = { skipped: false, claimed: false };
  const scope: any = {
    addEventListener: (t: string, f: any) => (handlers[t] ??= []).push(f),
    skipWaiting: () => void (state.skipped = true),
    clients: {
      claim: async () => void (state.claimed = true),
      matchAll: async () => clients,
    },
  };
  const matchAll = async (r: any) => {
    const url = typeof r === "string" ? r : r.url;
    for (const m of c.stores.values())
      if (m.has(url)) return m.get(url)!.clone();
    return undefined;
  };
  const caches = { ...c.caches, match: matchAll };
  new Function("self", "caches", "fetch", "Response", source)(
    scope,
    caches,
    fetchImpl,
    Response,
  );
  const fire = async (type: string, extra: object = {}) => {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    const ev = {
      ...extra,
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
      respondWith: (p: Promise<Response>) =>
        void (responded = Promise.resolve(p)),
    };
    for (const h of handlers[type] ?? []) h(ev);
    await Promise.all(waits);
    return responded;
  };
  return { fire, handlers, stores: c.stores, state, posted };
}

const get = (url: string) => ({ url, method: "GET" });

describe("workerSource", () => {
  const net = (log: string[]) => async (r: any) => {
    log.push(r.url);
    return new Response("net:" + r.url);
  };

  test("is valid JS embedding the config safely", () => {
    const src = workerSource({ version: 'v1"</script>', precache: ["/a"] });
    expect(
      () => new Function("self", "caches", "fetch", "Response", src),
    ).not.toThrow();
    expect(workerSource({ version: "1" })).toContain(
      '"stale-while-revalidate"',
    );
  });

  test("rejects unknown strategies and bad patterns", () => {
    expect(() =>
      workerSource({ version: "1", strategy: "nope" as any }),
    ).toThrow(/strategy/);
    expect(() =>
      workerSource({
        version: "1",
        strategy: { routes: [{ pattern: "(", strategy: "cache-first" }] },
      }),
    ).toThrow();
  });

  test("install precaches; activate removes only old prefixed caches, claims, announces", async () => {
    const log: string[] = [];
    const s = makeScope(
      workerSource({ version: "2", precache: ["/", "/app.js"] }),
      net(log),
    );
    s.stores.set("pavlus-1", new Map());
    s.stores.set("other-app", new Map());
    await s.fire("install");
    expect([...s.stores.get("pavlus-2")!.keys()]).toEqual(["/", "/app.js"]);
    await s.fire("activate");
    expect([...s.stores.keys()].sort()).toEqual(["other-app", "pavlus-2"]);
    expect(s.state.claimed).toBe(true);
    expect(s.state.skipped).toBe(false); // install never skips by itself
    expect(s.posted).toEqual([
      ["a", { type: "ACTIVATED", version: "2" }],
      ["b", { type: "ACTIVATED", version: "2" }],
    ]);
  });

  const respond = async (
    s: ReturnType<typeof makeScope>,
    url: string,
    method = "GET",
  ) => {
    const r = await s.fire("fetch", { request: { url, method } });
    return r && (await (await r).text());
  };

  test("cache-first", async () => {
    const log: string[] = [];
    const s = makeScope(
      workerSource({ version: "1", strategy: "cache-first" }),
      net(log),
    );
    expect(await respond(s, "https://x/a")).toBe("net:https://x/a");
    await flush();
    expect(await respond(s, "https://x/a")).toBe("net:https://x/a");
    expect(log).toEqual(["https://x/a"]); // second time from cache
  });

  test("network-first falls back to cache, errors when neither", async () => {
    let online = true;
    const s = makeScope(
      workerSource({ version: "1", strategy: "network-first" }),
      async (r) => {
        if (!online) throw new TypeError("offline");
        return new Response("net:" + r.url);
      },
    );
    expect(await respond(s, "https://x/a")).toBe("net:https://x/a");
    await flush();
    online = false;
    expect(await respond(s, "https://x/a")).toBe("net:https://x/a");
    const miss = await (await s.fire("fetch", {
      request: get("https://x/zzz"),
    }))!;
    expect(miss.type).toBe("error");
  });

  test("network-first prefers fresh network", async () => {
    let n = 0;
    const s = makeScope(
      workerSource({ version: "1", strategy: "network-first" }),
      async () => new Response("v" + ++n),
    );
    expect(await respond(s, "https://x/a")).toBe("v1");
    await flush();
    expect(await respond(s, "https://x/a")).toBe("v2");
  });

  test("stale-while-revalidate serves stale and refreshes in the background", async () => {
    let n = 0;
    const s = makeScope(
      workerSource({ version: "1" }),
      async () => new Response("v" + ++n),
    );
    expect(await respond(s, "https://x/a")).toBe("v1");
    await flush();
    expect(await respond(s, "https://x/a")).toBe("v1"); // stale
    await flush();
    expect(await respond(s, "https://x/a")).toBe("v2"); // refreshed
  });

  test("routes pick strategies; non-GET and non-http are ignored; errors are not cached", async () => {
    const log: string[] = [];
    const s = makeScope(
      workerSource({
        version: "1",
        strategy: {
          default: "network-first",
          routes: [{ pattern: "/static/", strategy: "cache-first" }],
        },
      }),
      async (r) => {
        log.push(r.url);
        return r.url.includes("fail")
          ? new Response("no", { status: 500 })
          : new Response("ok");
      },
    );
    await respond(s, "https://x/static/a.css");
    await flush();
    await respond(s, "https://x/static/a.css");
    expect(log).toEqual(["https://x/static/a.css"]);
    await respond(s, "https://x/api");
    await respond(s, "https://x/api");
    expect(log.length).toBe(3);
    expect(await respond(s, "https://x/a", "POST")).toBeUndefined();
    expect(await respond(s, "chrome-extension://x/a")).toBeUndefined();
    await respond(s, "https://x/fail");
    await flush();
    expect(s.stores.get("pavlus-1")!.has("https://x/fail")).toBe(false);
  });

  test("messages: SKIP_WAITING, GET_VERSION and relay to other clients", async () => {
    const s = makeScope(
      workerSource({ version: "7" }),
      async () => new Response(""),
    );
    const replies: any[] = [];
    await s.fire("message", {
      data: { type: "SKIP_WAITING" },
      source: { id: "a" },
    });
    expect(s.state.skipped).toBe(true);
    await s.fire("message", {
      data: { type: "GET_VERSION" },
      source: { id: "a", postMessage: (d: any) => replies.push(d) },
    });
    expect(replies).toEqual([{ type: "VERSION", version: "7" }]);
    await s.fire("message", { data: { hello: 1 }, source: { id: "a" } });
    expect(s.posted).toEqual([["b", { hello: 1 }]]);
  });

  test("custom prefix", async () => {
    const s = makeScope(
      workerSource({ version: "1", prefix: "shop", precache: ["/"] }),
      async () => new Response(""),
    );
    await s.fire("install");
    expect([...s.stores.keys()]).toEqual(["shop-1"]);
  });
});
