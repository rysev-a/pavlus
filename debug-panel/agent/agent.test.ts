/**
 * Tests for the in-page debug agent. Runs with plain node (type stripping),
 * no browser needed:
 *
 *     node debug-panel/agent/agent.test.ts
 */
import assert from "node:assert/strict";
import { createPavlusDebug, type DebugHost } from "./pavlus-debug-agent.ts";
import { createApp, Component } from "@service-laboratory/pavlus";
import type { Children, Routing } from "@service-laboratory/pavlus";
import { createStorePlugin } from "@service-laboratory/pavlus/plugins/store";

/** Minimal sync runner so the file works with plain `node file.ts`. */
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log("ok -", name);
  } catch (e) {
    console.error("FAIL -", name, e);
    process.exitCode = 1;
  }
}

/** Deterministic fake of the browser window. */
function fakeHost() {
  let t = 0;
  const posted: any[] = [];
  const listeners: ((ev: { data?: unknown }) => void)[] = [];
  const host: DebugHost = {
    performance: {
      now: () => t,
    },
    addEventListener: (_type, fn) => listeners.push(fn),
    postMessage: (data) => posted.push(data),
    setTimeout: (fn) => {
      fn();
      return 0;
    },
  };
  return {
    host,
    posted,
    tick: (ms: number) => {
      t += ms;
    },
    /** Deliver a window message event as the page would. */
    say: (data: unknown) => {
      for (const fn of listeners) fn({ data });
    },
    /** Flatten all batches into one event list. */
    events: () => posted.filter((m) => m.batch).flatMap((m) => m.batch),
    hello: () => posted.find((m) => m.type === "hello"),
  };
}

function setup() {
  const f = fakeHost();
  const store = createStorePlugin({ n: 0, items: ["a"] });
  const debug = createPavlusDebug({ name: "t" }, f.host);
  const plugins = [
    store,
    {
      name: "dom",
      handle() {
        f.tick(5); // "the rerender took 5ms"
      },
    },
    {
      name: "http",
      handle(e: any, ctx: any) {
        if (e.type === "request")
          ctx.dispatch({ id: e.onSuccess, payload: { status: 200 } });
      },
    },
    debug.plugin,
  ];
  debug.watch(plugins);
  const app = createApp({
    app: (m: any) =>
      m.id === "go"
        ? [
            { plugin: "dom", type: "focus", selector: "#x" },
            {
              plugin: "http",
              type: "request",
              id: "r1",
              url: "/users",
              onSuccess: "ok",
              onError: "err",
            },
            { plugin: "store", type: "set", path: "n", value: 1 },
          ]
        : [],
    plugins,
    onStep: debug.onStep,
  });
  return { f, store, debug, app, plugins };
}

const stepOf = (f: ReturnType<typeof fakeHost>, id: string) =>
  f.events().find((e) => e.type === "step" && e.message.id === id)!;

test("messages, effects, durations, http wait and store history are recorded", () => {
  const { f, store, app, debug } = setup();
  app.dispatch({ id: "go" });

  // the "go" step: 3 effects, each with the plugin's handle duration
  const step = stepOf(f, "go");
  assert.equal(step.appId, debug.agent.id);
  assert.equal(step.effects.length, 3);
  assert.deepEqual(
    step.effects.map((e: any) => e.plugin),
    ["dom", "http", "store"],
  );
  assert.equal(step.effects[0].dur, 5);
  assert.deepEqual(step.effects[2].detail, { path: "n", value: 1 });
  assert.equal(step.effects[1].summary, "GET /users");

  // the answer message came back and got correlated with the request
  const ok = stepOf(f, "ok");
  assert.ok(ok);
  const wait = f.events().find((e) => e.type === "wait");
  assert.ok(wait, "wait event for the http round trip");
  assert.equal(wait.uid, step.effects[1].uid);
  assert.equal(typeof wait.ms, "number");

  // the store change produced a timeline entry naming its message…
  const hist = f.events().find((e) => e.type === "history+");
  assert.ok(hist);
  assert.deepEqual(hist.entries, [
    {
      time: hist.entries[0].time,
      type: "set",
      path: "n",
      value: 1,
      msgId: "go",
    },
  ]);
  // …and a state snapshot
  const state = f.events().find((e) => e.type === "state");
  assert.deepEqual(state.state, { n: 1, items: ["a"] });

  assert.equal(store.getState().n, 1);
});

test("hello replays the recording and answers with apps, state and history", () => {
  const { f, store, app, debug } = setup();
  app.dispatch({ id: "go" });
  const before = debug.agent.recorded();
  const id = debug.agent.id;

  f.say({ source: "__pavlus_agent_wrong__", cmd: "hello" }); // ignored
  f.say({ source: "__pavlus_panel__", cmd: "hello" });
  const hello = f.hello();
  assert.ok(hello, "hello was posted");
  assert.deepEqual(hello.apps, [
    {
      id,
      name: "t",
      plugins: ["store", "dom", "http"],
      hasStore: true,
      components: [],
    },
  ]);
  assert.deepEqual(hello.state[id], { n: 1, items: ["a"] });
  assert.equal(hello.history[id].length, 1);
  assert.ok(hello.replay.length >= before, "replay carries the recording");
  assert.ok(hello.dropped === 0);
});

test("undo / redo / restoreTo go through the real store and notify plugins", () => {
  const { f, store, app, debug } = setup();
  app.dispatch({ id: "go" }); // n: 0 → 1
  f.say({ source: "__pavlus_panel__", cmd: "hello" });
  f.posted.length = 0;

  // step back
  f.say({ source: "__pavlus_panel__", cmd: "undo", appId: debug.agent.id });
  assert.equal(store.getState().n, 0);
  const minus = f.events().find((e) => e.type === "history-");
  assert.ok(minus, "history shrank");

  // step forward again
  f.say({ source: "__pavlus_panel__", cmd: "redo", appId: debug.agent.id });
  assert.equal(store.getState().n, 1);
  const plus = f
    .events()
    .filter((e) => e.type === "history+")
    .pop();
  assert.equal(plus.entries[0].msgId, null, "redo is marked as panel-made");

  // a fresh app change invalidates the redo stack
  const { f: f2, store: store2, app: app2, debug: debug2 } = setup();
  app2.dispatch({ id: "go" }); // n → 1
  f2.say({ source: "__pavlus_panel__", cmd: "undo", appId: debug2.agent.id }); // n → 0
  assert.equal(store2.getState().n, 0);
  app2.dispatch({ id: "go" }); // app changes state again: n → 1
  f2.say({ source: "__pavlus_panel__", cmd: "redo", appId: debug2.agent.id });
  assert.equal(
    store2.getState().n,
    1,
    "stale redo must not reapply an old change twice",
  );
  assert.equal(store2.history.length, 1, "the stale redo was a no-op");

  // jump to a timestamp
  const { f: f3, store: store3, app: app3, debug: debug3 } = setup();
  app3.dispatch({ id: "go" });
  const stamp = store3.history[0].timestamp;
  f3.say({
    source: "__pavlus_panel__",
    cmd: "restoreTo",
    appId: debug3.agent.id,
    timestamp: stamp - 1,
  });
  assert.deepEqual(store3.getState(), { n: 0, items: ["a"] });
});

test("redo stack resets when the app makes its own store change", () => {
  const { f, store, app, debug } = setup();
  app.dispatch({ id: "go" }); // n → 1
  f.say({ source: "__pavlus_panel__", cmd: "undo", appId: debug.agent.id }); // n → 0
  app.dispatch({ id: "go" }); // app sets n → 1 again
  f.say({ source: "__pavlus_panel__", cmd: "redo", appId: debug.agent.id }); // stale
  assert.equal(store.getState().n, 1);
  assert.equal(store.history.length, 1, "stale redo recorded nothing");
});

test("an app without a store still reports messages and effects", () => {
  const f = fakeHost();
  const debug = createPavlusDebug({ name: "plain" }, f.host);
  const plugins = [{ name: "dom", handle() {} }, debug.plugin];
  debug.watch(plugins);
  const app = createApp({
    app: (m) =>
      m.id === "ping" ? [{ plugin: "dom", type: "blur", selector: "#a" }] : [],
    plugins,
    onStep: debug.onStep,
  });
  app.dispatch({ id: "ping" });
  const step = f.events().find((e) => e.type === "step");
  assert.ok(step, "the step was recorded");
  assert.equal(step.message.id, "ping");
  assert.equal(step.effects[0].summary, "#a");
  f.say({ source: "__pavlus_panel__", cmd: "hello" });
  const hello = f.hello();
  assert.equal(hello.apps[0].hasStore, false);
  assert.deepEqual(hello.history, {});
});

test("posted messages survive a structured clone (functions become markers)", () => {
  const f = fakeHost();
  const debug = createPavlusDebug({ name: "x" }, f.host);
  const plugins = [{ name: "dom", handle() {} }, debug.plugin];
  debug.watch(plugins);
  const app = createApp({
    // `view` is a compiled template function and `payload` comes from app
    // code — either used to make postMessage throw before the batch flushed.
    app: (m: any) =>
      m.id === "boot"
        ? [
            {
              plugin: "dom",
              type: "mount",
              target: "#app",
              view: function render() {},
              onMounted: "mounted",
            },
          ]
        : [],
    plugins,
    onStep: debug.onStep,
  });
  app.dispatch({ id: "boot", payload: { fn: () => {}, when: new Date(0) } });
  f.say({ source: "__pavlus_panel__", cmd: "hello" });

  // window.postMessage structured-clones every message it delivers; a
  // function left anywhere in one throws "Function object could not be
  // cloned".
  for (const msg of f.posted) structuredClone(msg);

  const step = f.events().find((e) => e.type === "step")!;
  assert.equal(step.effects[0].detail.view, "ƒ render()");
  assert.equal(step.effects[0].detail.onMounted, "mounted");
  assert.equal(step.message.payload.fn, "ƒ fn()");
  assert.ok(step.message.payload.when instanceof Date, "dates survive");
  const hello = f.hello();
  assert.ok(hello, "hello was posted");
  structuredClone(hello);
});

test("components of the app are reported as dotted paths", () => {
  const f = fakeHost();
  class Editor extends Component<any> {}
  class Users extends Component<any> {
    children: Children<any> = {
      editor: { component: new Editor(), tag: "ed" },
    };
  }
  class Settings extends Component<any> {}
  const shell = new (class Shell extends Component<any> {
    children: Children<any> = { users: { component: new Users() } };
    routing: Routing<any> = {
      "/settings": { component: new Settings(), tag: "cfg" },
    };
  })();
  const debug = createPavlusDebug({ name: "tree", app: shell }, f.host);
  f.say({ source: "__pavlus_panel__", cmd: "hello" });
  const hello = f.hello();
  assert.ok(hello, "hello was posted");
  assert.deepEqual(hello.apps[0].components, [
    "users",
    "users.editor",
    "settings",
  ]);
  // ChildSpec.tag wins over the component's own tag
  assert.deepEqual(hello.apps[0].tags, {
    "users.editor": "ed",
    settings: "cfg",
  });
});

test("the component trace feeds comps and per-component io", () => {
  const f = fakeHost();
  class Users extends Component<any> {
    tag = "users-mod";
    load() {
      return [{ plugin: "dom", type: "focus", selector: "#u" }];
    }
  }
  const shell = new (class Shell extends Component<any> {
    children: Children<any> = { users: { component: new Users() } };
  })();
  const debug = createPavlusDebug({ name: "io", app: shell }, f.host);
  const plugins = [{ name: "dom", handle() {} }, debug.plugin];
  debug.watch(plugins);
  const app = createApp({ app: shell, plugins, onStep: debug.onStep });
  app.dispatch({ id: "users.load" });

  // the receive chain: the root (full id) and the child, deepest last
  const step = f.events().find((e) => e.type === "step")!;
  assert.deepEqual(step.comps, ["", "users"]);

  f.say({ source: "__pavlus_panel__", cmd: "hello" });
  const hello = f.hello();
  assert.deepEqual(hello.apps[0].tags, { users: "users-mod" });

  // inputs are keyed by the full message id at every boundary; the child
  // heard the relative id, reported under the same full id
  assert.equal(hello.io[""].input.find((x) => x.id === "users.load").n, 1);
  assert.equal(hello.io["users"].input.find((x) => x.id === "users.load").n, 1);
  // outputs: every boundary reports its subtree's effects, with a summary
  const out = hello.io["users"].output.find((x) => x.id === "dom:focus");
  assert.equal(out.n, 1);
  assert.equal(out.summary, '{"selector":"#u"}');
  assert.equal(hello.io[""].output.find((x) => x.id === "dom:focus").n, 1);
});

test("a function root reports itself as the root component", () => {
  const { f, app } = setup();
  app.dispatch({ id: "go" });
  assert.deepEqual(stepOf(f, "go").comps, [""]);
});

console.log("agent tests: ok");
