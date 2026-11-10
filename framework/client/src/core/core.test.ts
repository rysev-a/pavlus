import { describe, expect, test, vi } from "vitest";
import { createApp } from "./mod.ts";
import type { Effect, Message, Plugin, PluginContext } from "./types.ts";
import { createStorePlugin } from "../plugins/store/mod.ts";
import { storeEffector } from "../plugins/store/helpers.ts";
import { DomPlugin } from "../plugins/dom/mod.ts";
import { createTimePlugin } from "../plugins/time/mod.ts";
import {
  Component,
  compose,
  mapEffects,
  mapMessage,
  namespace,
  withLogging,
  type ComponentFn,
} from "../component/mod.ts";

describe("core", () => {
  test("routes effects to plugins; replies come back as messages", () => {
    const seen: string[] = [];
    const echo: Plugin<{
      plugin: "echo";
      type: "say";
      text: string;
      replyTo: string;
    }> = {
      name: "echo",
      handle: (e, ctx) =>
        ctx.dispatch({ id: e.replyTo, payload: e.text.toUpperCase() }),
    };
    createApp({
      app: (m) => {
        seen.push(m.id);
        return m.id === "init"
          ? [{ plugin: "echo", type: "say", text: "hi", replyTo: "echoed" }]
          : [];
      },
      plugins: [echo],
      init: { id: "init" },
    });
    expect(seen).toEqual(["init", "echoed"]);
  });

  test("state is passed in, and plugins hear about changes", () => {
    const store = createStorePlugin({ n: 0 });
    const states: number[] = [];
    const spy: Plugin = {
      name: "spy",
      handle() {},
      onState: (s) => states.push((s as { n: number }).n),
    };
    const app = createApp<{ n: number }>({
      app: (m, s) =>
        m.id === "inc"
          ? [{ plugin: "store", type: "set", path: "n", value: s.n + 1 }]
          : [],
      plugins: [store, spy],
    });
    app.dispatch({ id: "inc" });
    app.dispatch({ id: "inc" });
    app.dispatch({ id: "noop" });
    expect(states).toEqual([1, 2]);
  });

  test("dispatchEffect applies an effect directly and notifies plugins", () => {
    const store = createStorePlugin({ n: 0 });
    const states: number[] = [];
    const spy: Plugin = {
      name: "spy",
      handle() {},
      onState: (s) => states.push((s as { n: number }).n),
    };
    let ctl: PluginContext<unknown> | undefined;
    const holder: Plugin = {
      name: "holder",
      handle() {},
      init: (c) => (ctl = c),
    };
    createApp<{ n: number }>({ app: () => [], plugins: [store, spy, holder] });
    ctl!.dispatchEffect({ plugin: "store", type: "set", path: "n", value: 7 });
    expect(store.getState()).toEqual({ n: 7 });
    expect(states).toEqual([7]);
    ctl!.dispatchEffect({ plugin: "store", type: "set", path: "n", value: 7 });
    expect(states).toEqual([7]); // unchanged state: no notification
  });

  test("unknown plugin and message loops are reported", () => {
    const a = createApp({
      app: () => [{ plugin: "nope", type: "x" }],
      plugins: [],
    });
    expect(() => a.dispatch({ id: "x" })).toThrow(/no plugin "nope"/);
    const loop = createApp({
      app: () => [{ plugin: "p", type: "t" }],
      plugins: [
        { name: "p", handle: (_e, ctx) => ctx.dispatch({ id: "again" }) },
      ],
      maxMessagesPerTick: 50,
    });
    expect(() => loop.dispatch({ id: "x" })).toThrow(/message loop/);
  });

  test("same message log gives the same effect log (determinism)", () => {
    const run = () => {
      const log: Effect[][] = [];
      const store = createStorePlugin({ n: 0 });
      const a = createApp<{ n: number }>({
        app: (m, s) =>
          m.id === "inc"
            ? [{ plugin: "store", type: "set", path: "n", value: s.n + 1 }]
            : [],
        plugins: [store],
        onStep: (_m, e) => log.push(e),
      });
      for (const id of ["inc", "inc", "x", "inc"]) a.dispatch({ id });
      return JSON.stringify(log);
    };
    expect(run()).toBe(run());
  });
});

describe("time plugin: debounce by id", () => {
  test("restarting a timer id cancels the previous one", () => {
    vi.useFakeTimers();
    const fired: unknown[] = [];
    const time = createTimePlugin();
    const app = createApp({
      app: (m) => {
        if (m.id === "type") {
          return [
            {
              plugin: "time",
              type: "setTimeout",
              id: "search",
              ms: 100,
              replyTo: "go",
              payload: m.payload,
            },
          ];
        }
        if (m.id === "go") fired.push(m.payload);
        return [];
      },
      plugins: [time],
    });
    app.dispatch({ id: "type", payload: "a" });
    vi.advanceTimersByTime(50);
    app.dispatch({ id: "type", payload: "ab" });
    vi.advanceTimersByTime(99);
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(fired).toEqual(["ab"]);
    expect(time.active()).toEqual([]);
    vi.useRealTimers();
  });

  test("intervals, cancel, now", () => {
    vi.useFakeTimers();
    const got: Message[] = [];
    const time = createTimePlugin({ now: () => 1234 });
    const ctx = {
      dispatch: (m: Message) => got.push(m),
      getState: () => undefined as never,
      dispatchEffect() {},
    };
    time.handle(
      { plugin: "time", type: "setInterval", id: "t", ms: 10, replyTo: "tick" },
      ctx,
    );
    vi.advanceTimersByTime(35);
    time.handle({ plugin: "time", type: "cancel", id: "t" }, ctx);
    vi.advanceTimersByTime(100);
    time.handle({ plugin: "time", type: "now", replyTo: "now" }, ctx);
    expect(got.map((m) => m.id)).toEqual(["tick", "tick", "tick", "now"]);
    expect(got[3].payload).toBe(1234);
    vi.useRealTimers();
  });
});

describe("components", () => {
  const child: ComponentFn<{ n: number }> = (m, s) =>
    m.id === "inc"
      ? [
          { plugin: "store", type: "set", path: "n", value: s.n + 1 },
          {
            plugin: "http",
            type: "request",
            id: "x",
            onSuccess: "done",
            onError: "failed",
          },
        ]
      : [];

  test("namespace: prefix routing, state slice, reply ids and store paths", () => {
    const c = namespace("counter", child, { key: "counter" });
    expect(c({ id: "other" }, { counter: { n: 1 } })).toEqual([]);
    expect(c({ id: "counter.inc" }, { counter: { n: 1 } })).toEqual([
      { plugin: "store", type: "set", path: "counter.n", value: 2 },
      {
        plugin: "http",
        type: "request",
        id: "x",
        onSuccess: "counter.done",
        onError: "counter.failed",
      },
    ]);
  });

  test("parents can rewrite messages and filter effects; children stay unaware", () => {
    const onlyStore = mapEffects(child, (effects) =>
      effects.filter((e) => e.plugin === "store"),
    );
    expect(onlyStore({ id: "inc" }, { n: 0 })).toHaveLength(1);
    const renamed = mapMessage(child, (m) =>
      m.id === "bump" ? { ...m, id: "inc" } : null,
    );
    expect(renamed({ id: "bump" }, { n: 0 })).toHaveLength(2);
    expect(renamed({ id: "inc" }, { n: 0 })).toEqual([]);
    const logged = withLogging(child, "counter");
    expect(logged({ id: "inc" }, { n: 0 })[0]).toMatchObject({
      plugin: "logger",
      level: "debug",
    });
    expect(compose(child, child)({ id: "inc" }, { n: 0 })).toHaveLength(4);
  });
});

describe("createApp({ mount })", () => {
  const view = { render: () => [], diff: () => [] };
  /** A stand-in for the dom plugin: records the mount, reports `mounted`. */
  function fakeDom() {
    const mounts: Effect[] = [];
    const plugin: Plugin = {
      name: "dom",
      handle(effect, ctx) {
        mounts.push(effect);
        if (typeof effect.onMounted === "string")
          ctx.dispatch({ id: effect.onMounted });
      },
    };
    return { plugin, mounts };
  }

  test("mounts the app's view into the target before `init`, then `mounted` arrives", () => {
    const seen: string[] = [];
    class Shell extends Component {
      view = view;
      mounted() {
        seen.push("mounted");
        return [];
      }
      init() {
        seen.push("init");
        return [];
      }
    }
    const shell = new Shell();
    const dom = fakeDom();
    createApp({
      app: shell,
      plugins: [dom.plugin],
      mount: "#app",
      init: { id: "init" },
    });
    expect(dom.mounts).toHaveLength(1);
    expect(dom.mounts[0]).toMatchObject({
      plugin: "dom",
      type: "mount",
      target: "#app",
      onMounted: "mounted",
    });
    expect(seen).toEqual(["mounted", "init"]);
  });

  test("the mounted view is the component's template closed over the component", () => {
    const calls: unknown[] = [];
    class Shell extends Component {
      view = {
        render: (...args: unknown[]) => {
          calls.push(args);
          return [];
        },
        diff: () => [],
      };
    }
    const shell = new Shell();
    const dom = fakeDom();
    createApp({ app: shell, plugins: [dom.plugin], mount: "#app" });
    const mounted = dom.mounts[0].view as { render(s: unknown): unknown };
    mounted.render({ a: 1 });
    expect(calls).toEqual([[{ a: 1 }, "", "", shell]]);
  });

  test("without the dom plugin, or with an app that has no view, it says so", () => {
    class NoView extends Component {}
    expect(() =>
      createApp({
        app: new NoView(),
        plugins: [fakeDom().plugin],
        mount: "#app",
      }),
    ).toThrow(/component with a `view`/);
    expect(() =>
      createApp({ app: () => [], plugins: [fakeDom().plugin], mount: "#app" }),
    ).toThrow(/component with a `view`/);
    class Shell extends Component {
      view = view;
    }
    expect(() =>
      createApp({ app: new Shell(), plugins: [], mount: "#app" }),
    ).toThrow(/dom plugin/);
  });

  test("a component paints itself in the handler of a store write's answer", () => {
    const diffs: unknown[] = [];
    const patches = [{ op: "text" as const, id: "1", text: "x" }];
    const view = {
      render: () => [],
      diff: (prev: unknown, next: unknown) => {
        diffs.push([prev, next]);
        return patches;
      },
    };
    class Shell extends Component<{ n: number }> {
      view = view;
      inc(_m: Message, s: { n: number }) {
        return [storeEffector.set("n", s.n + 1, { onSuccess: "paint" })];
      }
      paint(msg: Message) {
        const { prev, next } = msg.payload as {
          prev: { n: number };
          next: { n: number };
        };
        return [DomPlugin.update(view.diff(prev, next))];
      }
    }
    const dom = fakeDom();
    const store = createStorePlugin({ n: 0 });
    const a = createApp({
      app: new Shell(),
      plugins: [store, dom.plugin],
      mount: "#app",
    });
    expect(diffs).toEqual([]); // the mount itself renders, it does not diff
    a.dispatch({ id: "inc" });
    expect(diffs).toEqual([[{ n: 0 }, { n: 1 }]]);
    // the patches the diff computed went to the dom plugin as an update,
    // with no target: they belong to the application's only mount
    expect(dom.mounts[1]).toMatchObject({
      plugin: "dom",
      type: "update",
      patches,
    });
    expect(dom.mounts[1].target).toBeUndefined();
  });
});

describe("message context", () => {
  test("is stamped on the effects of a message and kept by a reply", () => {
    const seen: unknown[] = [];
    const echo: Plugin<any, any> = {
      name: "echo",
      handle(e, ctx) {
        seen.push(e.ctx);
        if (e.type === "x") ctx.dispatch({ id: "back", ctx: e.ctx });
      },
    };
    const app = createApp({
      app: (m: Message) =>
        m.id === "go"
          ? [{ plugin: "echo", type: "x" }]
          : m.id === "back"
            ? [{ plugin: "echo", type: "y", ctx: { rid: "other" } }]
            : [],
      plugins: [echo],
    });
    app.dispatch({ id: "go", ctx: { rid: "r1" } });
    expect(seen[0]).toEqual({ rid: "r1" });
    // an effect that already has a context keeps it; messages without one are untouched
    app.dispatch({ id: "back" });
    expect(seen[seen.length - 1]).toEqual({ rid: "other" });
  });
});
