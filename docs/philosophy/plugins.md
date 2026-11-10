# Plugins: the one door to the browser

Application code in pavlus never touches the DOM, never calls `fetch`, never
reads the clock, never asks `Math.random()`. It returns **effects**, plain
objects that describe what should happen, and gets the results back as
**messages**. Plugins are the only code that does the thing. This document is
about why that boundary is drawn where it is, and how to write a plugin.

```
                 effect (data)                   the world
 application ──────────────────▶  plugin  ───────────────────▶  DOM, fetch, timers,
     ▲                               │                           sockets, storage
     │        message (data)         │
     └───────────────────────────────┘
```

## 1. Why a boundary at all

A pure application is one you can reason about, test and replay. But a web
application has to talk to a browser, and a browser is nothing but side
effects. The question is not whether to have side effects but **where**. pavlus
answers: in one kind of module, with one interface, registered by name, and
nowhere else.

What that buys:

- **The application is testable without a browser.** A handler is called with a
  message and a state and returns effects; a test reads the effects. No jsdom,
  no mocks of `fetch`, no fake timers, unless you are testing a plugin.
- **Everything that happens is visible.** Effects are data, so the debug panel
  shows every request, every timer, every DOM update, with the message that
  caused it.
- **The browser is replaceable.** The DOM plugin takes a `document`; the time
  plugin takes a clock; the WebSocket plugin takes a socket factory. Tests and
  SSR pass their own.
- **Purity is checkable.** `grep` for `fetch`, `document`, `Date.now`,
  `Math.random`, `localStorage` in the application folders should find nothing.

## 2. The contract

```ts
interface Plugin<E extends EffectLike = Effect, S = unknown> {
  readonly name: string;                              // matches effect.plugin
  init?(ctx: PluginContext<S>): void;                 // start listening
  handle(effect: E, ctx: PluginContext<S>): void;     // do one effect
  onState?(state: S, ctx: PluginContext<S>): void;    // the state changed
  dispose?(): void;                                   // stop everything
}

interface PluginContext<S> {
  dispatch(message: Message): void;                   // feed a message back in
  getState(): S;
  dispatchEffect(effect: Effect): void;               // devtools and tests
}
```

A plugin owns its mutable state: the DOM plugin keeps the map from node ids to
nodes and the listeners; the http plugin keeps its `AbortController`s by request
id; the time plugin keeps its timers by id; the store keeps the state and its
history. The application owns none of it.

## 3. Effectors: effects with a type

Application code does not spell out `{ plugin: "http", type: "request", ... }`.
Each plugin exports an **effector**, a small typed builder:

```ts
import { httpEffector as http, storeEffector as store, timeEffector as time } from "@pavlus/client/plugins";

return [
  store.set("status", "loading"),
  http.request({ id: "projects", url: "/api/projects", onSuccess: "listed", onError: "listedFailed" }),
  time.setTimeout("toast", 4000, "hideToast"),
];
```

The reply is a message with the id you named: `listed` arrives with the
response in its payload, `hideToast` arrives after four seconds. A request with
an id that is already running cancels the old one; a cancelled request never
dispatches. The handler that receives the reply is just another pure method.

## 4. The built-in plugins

| Plugin   | Turns effects into                              | Turns the world into messages          |
| -------- | ----------------------------------------------- | -------------------------------------- |
| `dom`    | node creation and the eight patch operations    | DOM events, with `value`/`checked`/`key` snapshotted |
| `store`  | immutable state changes, undo, time travel      | `{ prev, next }` after a write that changed something |
| `http`   | requests, cancellable by id                     | the reply or the error                 |
| `ws`     | connections by id, frames                       | open, message, close                   |
| `time`   | timeouts and intervals, cancellable by id       | the tick                               |
| `router` | `pushState` navigation                          | the location, on load and on every change |
| `logger` | console output                                  | nothing                                |

More live under `framework/client/src/plugins/` (svg, canvas, audio, video,
service worker, a direct DOM mode). On the server (`@pavlus/server`) the same
contract covers http, ws, Postgres, Redis and page rendering.

## 5. Writing one

A plugin is small. The ui-kit's random plugin exists because application code
may not call `Math.random()`:

```ts
import type { Effect, Plugin } from "@pavlus/client";

export interface RandomEffect extends Effect {
  plugin: "random";
  type: "int";
  max: number;          // an integer from 0 up to, not including, max
  replyTo: string;      // the message that carries the answer
}

export const randomEffector = {
  int: (max: number, replyTo: string): RandomEffect => ({ plugin: "random", type: "int", max, replyTo }),
};

export function createRandomPlugin(random: () => number = Math.random): Plugin<RandomEffect, unknown> {
  return {
    name: "random",
    handle(effect, ctx) {
      if (effect.type !== "int") return;
      ctx.dispatch({ id: effect.replyTo, payload: Math.min(effect.max - 1, Math.floor(random() * effect.max)) });
    },
  };
}
```

The application asks and answers:

```ts
"themepanel.random"() { return [randomEffector.int(allThemes().length, "randomPicked")]; }
randomPicked(msg, state) { const pick = allThemes()[msg.payload as number]; return [...]; }
```

Three habits to copy from it:

- **Inject the world.** `random` is a parameter with a default. The theme
  plugin takes a `document`, the export plugin too, the time plugin a clock. A
  test passes a fake and asserts on what the plugin dispatched.
- **Answer with a message, never with a return value.** The application cannot
  wait; it will handle the answer as the next message.
- **Keep the effect honest.** The fields of the effect are everything the
  plugin needs; it reads nothing from globals the application did not name.

Other examples in the repository: the theme plugin
(`framework/ui-kit/src/theme.ts`) is the only code that sets a class and CSS
variables on `<html>` and writes to `localStorage`; the export plugin
(`framework/ui-kit/src/export.ts`) reads stylesheets, saves a file and writes
the clipboard; the app-theme plugin of diagram-programming
(`applications/diagram-programming/frontend/app-theme.ts`) owns one `<style>`
element. Each one is a few dozen lines, and each one is the only place its part
of the browser is touched.

## 6. Wiring

`main.ts` is the one file of an application with side effects: it creates the
plugins and the app.

```ts
export const app = createApp<AppState>({
  app: paintOnWrite(shell),
  plugins: [
    createStorePlugin(initialState()),
    new DomPlugin(),
    createRouterPlugin(),
    createHttpPlugin(),
    createTimePlugin(),
    createThemePlugin(),
    createRandomPlugin(),
  ],
  mount: "#app",
});
```

Everything above this file is pure. Everything in the plugins is not. The line
is a file boundary you can point at.

## 7. Testing a plugin

A plugin test needs no application: build an effect with the effector, call
`handle` with a fake context, look at what was dispatched.

```ts
const sent: unknown[] = [];
const ctx = { dispatch: (m: unknown) => sent.push(m) } as never;
createRandomPlugin(() => 0.999999).handle(randomEffector.int(100, "randomPicked"), ctx);
expect(sent).toEqual([{ id: "randomPicked", payload: 99 }]);
```

For the DOM plugin there is `mountView` in `@pavlus/client/testing`: it mounts
a view in jsdom, applies `diff` on `set(next)` and records the messages the DOM
plugin dispatched, without running the core.

## 8. Where to read next

- `framework/docs/plugins/main.md` and the files next to it: each built-in
  plugin's effects, options and messages.
- [architecture.md](./architecture.md): how the core hands effects to plugins
  and why painting is one of them.
