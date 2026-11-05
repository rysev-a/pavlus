---
summary: Application code only returns effects, plain data that describe what should happen. Plugins do it. Learn the plugin contract, how effects and replies travel, in what order things happen, how errors are handled and how to test a plugin.
---
## Pure code, dirty plugins

In a pavlus application, the code you write never touches the outside world. A handler does not call `fetch`, does not read the clock, does not write to `localStorage` and does not change the DOM. It takes a message and the state and **returns a list of effects**. An effect is a plain object that describes something that should happen.

```ts
{ plugin: "store", type: "set", path: "status", value: "loading" }
```

Doing the thing is the job of a **plugin**. A plugin is an object with a name and a function. The core connects the two: it sends each effect to the plugin whose name is `effect.plugin`.

```text
DOM event / HTTP reply / timer tick / WS frame
        |  plugins turn the outside world into messages
        v
  core:   app(message, state) -> effects[]        pure, deterministic
        |  effects are plain data: { plugin: "http", type: "request", ... }
        v
  plugin: does the side effect, owns its own mutable state,
          and sends the result back as a message
```

The picture is a loop. The world makes a **message** (a click, an answer, a tick). The pure code turns the message into **effects**. The plugins perform the effects, and when something happens later, they send a new message. Your code is only the middle step, and the middle step is a function that you can call in a test without any browser.

Even a click is a message. A template event is not a function, it is data. The demo shows the vnode that the button gets:

::demo event-as-data open=vnodes

The `events.click` of the vnode is `{ id: "remove", payload: 3 }`. The DOM plugin owns the real listener. When the click happens, it sends the message `{ id: "remove", payload: 3, event: { type: "click" } }` into the application. The `event` field is a small plain-data copy of the DOM event, with `value`, `checked` and `key` where they make sense.

## The plugin contract

This is the whole interface of a plugin. It is a type from `src/core/types.ts`, and the main package exports it as `Plugin`:

```ts
export interface Plugin<E extends EffectLike = Effect, S = unknown> {
  readonly name: string;
  init?(ctx: PluginContext<S>): void;
  handle(effect: E, ctx: PluginContext<S>): void;
  /** Called after the application state changed. */
  onState?(state: S, ctx: PluginContext<S>): void;
  dispose?(): void;
}
```

Only two members are required: `name` and `handle`.

- `name` is the string that `effect.plugin` refers to. It must be unique in one application.
- `handle(effect, ctx)` is called for every effect addressed to this plugin. The first parameter is the effect; the generic `E` is the type of the effects this plugin accepts, usually a union on `type`.
- `init(ctx)` runs once when the application is created. A plugin that needs to remember the context (the DOM plugin keeps it to dispatch events) saves it here.
- `onState(state, ctx)` runs after the state changed. The DOM plugin re-renders in it.
- `dispose()` runs when the application is disposed, and cleans up: listeners, timers, sockets.

The second type is the context that every hook receives:

```ts
export interface PluginContext<S = unknown> {
  /** Feed a message back into the application. Safe to call from anywhere. */
  dispatch(message: Message): void;
  /** Current application state (from the store plugin). */
  getState(): S;
  /**
   * Applies an effect directly, without going through the application
   * (devtools, tests): the plugin runs, and plugins are notified if the
   * state changed.
   */
  dispatchEffect(effect: Effect): void;
}
```

`dispatch` is the only way a plugin talks to your code. `getState` exists, and the DOM plugin needs it to render. `dispatchEffect` is for developer tools and tests. A normal plugin uses `dispatch` and nothing else.

A message is `{ id, payload?, event? }`. The `id` is the name of the handler that will receive it.

## Effects are data

An effect has two required fields, `plugin` and `type`. Everything else is up to the plugin. `plugin` picks the plugin; `type` picks what to do inside it. The store plugin has `set`, `merge` and `remove`; the http plugin has `request` and `cancel`.

Because an effect is data, three good things follow.

1. **Tests need no mocks.** To test a handler, call it and compare the list it returns with the list you expect.
2. **Effects can be recorded, replayed and shown.** The `onStep` option of `createApp` receives every message with its effects; developer tools and your own debugging use it.
3. **Nothing happens by accident.** Returning an effect is not doing it. A handler that is called ten times in a test performs nothing.

### Effectors

You can write an effect by hand, but every plugin ships an **effector**: a small object of functions that build exactly that object, typed. A wrong field is then a compile error, and a handler reads like a sentence.

```ts
import {
  httpEffector as http,
  loggerEffector as log,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";

class Users extends Component<UsersState> {
  load(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }),
      log.info("loading users"),
    ];
  }
}
```

An effector does nothing by itself. `store.set("status", "loading")` returns the object shown at the top of this page, and nothing else. In a test you compare the result of a handler with the same effector calls:

```ts
expect(toHandler(users)({ id: "load" }, state)).toEqual([
  store.set("status", "loading"),
  http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }),
  log.info("loading users"),
]);
```

Each built-in plugin has its effector. The usual short alias is in the second column.

| Plugin | Effector (alias) |
| --- | --- |
| store | `storeEffector` as `store` |
| dom | `DomPlugin` (static builders) |
| http | `httpEffector` as `http` |
| ws | `wsEffector` as `ws` |
| time | `timeEffector` as `time` |
| logger | `loggerEffector` as `log` |
| router | `routerEffector` as `router` |

You can import them from the entry point of one plugin (`@service-laboratory/pavlus/plugins/store`) or from the barrel `@service-laboratory/pavlus/plugins`. Importing the barrel runs no code, and the bundler keeps only what you use.

## Registering plugins

Plugins are listed when the application is created:

```ts
import { createApp } from "@service-laboratory/pavlus";
import {
  DomPlugin,
  createHttpPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";

createApp({
  app: dashboard,
  plugins: [createStorePlugin(initialState), new DomPlugin(), createHttpPlugin()],
  mount: "#app",
});
```

- `app` is a function, or an instance of a class that extends `Component`.
- Every plugin has a `name`, and an effect goes to the plugin whose name is equal to `effect.plugin`.
- Two plugins with the same name are an error at start-up: `pavlus: duplicate plugin "store"`.
- An effect for a plugin that is not in the list is an error when it is performed: `pavlus: no plugin "nope" for effect "x"`. This is the first thing to check when something throws after you add a new effect.
- The state comes from the first plugin that has a `getState()` method, which is the store plugin. Without it, handlers receive `undefined` as the state.
- `mount` needs the dom plugin and an `app` with a `view`.
- `init` is a message that is dispatched once all the plugins are ready, after `mount`.

You do not register one plugin per effect type, but one per *family* of effects: all the `http` effects go to one plugin object that keeps the table of running requests.

## Messages come back

Most plugins answer later: a response, a timer, a frame. The effect carries the **id of the message to answer with**, and the plugin calls `ctx.dispatch` when it has the result.

```ts
http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" })
// later, the application receives:
//   { id: "loaded", payload: { status: 200, data: [...] } }
```

The reply fields have conventional names: `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` and `onChange`. The names matter, because of components. A child component is mounted under a message prefix (`users`). The child writes `onSuccess: "loaded"`, and the framework puts the prefix in front of exactly these seven fields, so the answer finds its way back to the child as `users.loaded`. This is what the effect of a child looks like after it left the child:

```json
[
  { "plugin": "time", "type": "setTimeout", "id": "t", "ms": 10, "replyTo": "kid.tick" },
  { "plugin": "q", "type": "q", "onDone": "done", "onSuccess": "kid.ok" }
]
```

Look at the second effect. A field that has another name, here `onDone`, is not changed, and its message would go to the root, not to the child. So a plugin that wants to work inside components must use the standard names.

## Who owns what

- The **store** plugin owns the application state. After every message, if the state changed, the core calls `onState(state)` on every plugin that defines it.
- Every plugin owns its **private mutable state**: the DOM plugin its listeners, http its running requests, time its timers, ws its sockets. Your code never sees it, and never needs to clean it up.
- Anything with an **id** (an http request, a timer, a connection) is replaced when the same id is used again, and can be cancelled by that id. A debounce or "the latest request wins" needs no state in the application: start the same id again.

## Order, lifecycle and loops

Messages are processed **strictly one at a time**. For a message the core calls the application, performs the effects in the order they were returned, and then, if the state changed, calls `onState` on every plugin. A message that a plugin dispatches while it handles an effect is not processed at once. It waits in a queue and runs after the current message is finished.

A test makes it concrete. The plugin `echo` replies at once, and still the replies come after both effects:

```ts overview.test.ts
import {
  createApp,
  type Effect,
  type Message,
  type Plugin,
  type PluginContext,
} from "@service-laboratory/pavlus";
import {
  createStorePlugin,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import { expect, test } from "vitest";

const echo: Plugin = {
  name: "echo",
  handle(effect, ctx) {
    ctx.dispatch({ id: "echoed", payload: effect.text });
  },
};

test("effects run in order, replies wait for the next turn", () => {
  const seen: string[] = [];
  const app = createApp({
    app: (message: Message): Effect[] => {
      seen.push(message.id);
      return message.id === "start"
        ? [
            { plugin: "echo", type: "say", text: "a" },
            { plugin: "echo", type: "say", text: "b" },
          ]
        : [];
    },
    plugins: [createStorePlugin({}), echo],
  });
  app.dispatch({ id: "start" });
  expect(seen).toEqual(["start", "echoed", "echoed"]);
});
```

The hooks have a fixed order too. The test below records every call. `init` is called in the order of the array, before anything else; the store effect is applied before the effect for `x`; `onState` comes after all the effects of the message, once per plugin; and `dispose` runs in the **reverse** order, so a plugin that depends on an earlier one is stopped first.

```ts
test("the hooks run in a fixed order", () => {
  const calls: string[] = [];
  const spy = (name: string): Plugin => ({
    name,
    init: () => void calls.push(`${name}.init`),
    handle: (effect) => void calls.push(`${name}.handle:${effect.type}`),
    onState: (state) =>
      void calls.push(`${name}.onState:${JSON.stringify(state)}`),
    dispose: () => void calls.push(`${name}.dispose`),
  });
  const app = createApp({
    app: () => [store.set("n", 1), { plugin: "x", type: "hello" }],
    plugins: [createStorePlugin({ n: 0 }), spy("x"), spy("y")],
  });
  app.dispatch({ id: "go" });
  app.dispose();
  expect(calls).toEqual([
    "x.init",
    "y.init",
    "x.handle:hello",
    'x.onState:{"n":1}',
    'y.onState:{"n":1}',
    "y.dispose",
    "x.dispose",
  ]);
});
```

A loop of messages (a handler that answers a message by causing the same message again) is stopped after `maxMessagesPerTick` messages in one turn, 10 000 by default:

```text
pavlus: more than 50 messages in one tick (message loop?)
```

(The number in the message is the limit that was set. Here it was 50, set with the option `maxMessagesPerTick` of `createApp`.)

## Errors

There are two kinds of failure, and they are handled differently.

**Expected failures are messages.** A request that fails, a socket that closes, a file that is not found: these are not exceptions. The plugin dispatches an error message (`onError`) and your code decides what to show. A request that was cancelled or replaced sends nothing at all.

**Bugs throw.** If `handle` throws, the exception goes out of `app.dispatch`. The rest of the effects of that message are skipped, and the state changes that were already applied stay. The application itself is not broken: the next `dispatch` works.

Two cases are easy to miss:

- An error inside a promise callback or a timer callback of a plugin never reaches the core, because the core is no longer on the stack. A plugin must catch its own asynchronous errors and turn them into an error message. All the built-in plugins do so.
- A handler that does not return an array is an error of the component, with the name of the message: `pavlus: handler "add" must return an array of effects`.

## Testing a plugin

Every built-in plugin takes the outside world as an option. The http plugin takes `fetch`, the time plugin a clock, the ws plugin a socket factory, the logger a sink, the router a `window`, the dom plugin a `document`. A test passes a fake, and no mocking library is needed.

You can test a plugin without an application. Create a fake context that records the messages, call `handle`, and check what was dispatched:

```ts
test("a plugin is tested with a fake context", () => {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  echo.handle({ plugin: "echo", type: "say", text: "hi" }, ctx);
  expect(sent).toEqual([{ id: "echoed", payload: "hi" }]);
});
```

A third level is a test of the whole application with real plugins and fake outside worlds. The [guide](page:guide-todo-app) does this for a todo list.

> [!TIP] Prefer testing the handler
> Most of your logic is in handlers, and a handler is a pure function. Test it by calling `toHandler(component)(message, state)`. You need a plugin test only when you write a plugin, and then it tests what the plugin does with one effect.

## What you learned

- A handler returns effects, plain objects `{ plugin, type, ... }`. Effectors build them, typed. A plugin is `{ name, handle }` plus optional `init`, `onState` and `dispose`.
- Plugins answer by `ctx.dispatch`. The effect names the reply messages with `replyTo`, `onSuccess`, `onError` and the other standard fields, and a child component gets the prefix back.
- Messages run one at a time, effects in order, and a message from a plugin waits for the next turn. Plugins are disposed in reverse order.
- Expected failures are messages, bugs throw. A plugin test needs only a fake context.

Next: [the built-in plugins](page:plugins-reference).
