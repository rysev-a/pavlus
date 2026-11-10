# Plugins

Application code in pavlus is pure: it takes a message and the state and
returns **effects**, plain data that describe what should happen. It never
touches the DOM, the network, the clock or the console. **Plugins** do that.

```
DOM event / HTTP reply / timer tick / WS frame
        │  plugins turn the outside world into messages
        ▼
  core:   app(message, state) → effects[]        pure, deterministic
        │  effects are plain data: { plugin: "http", type: "request", ... }
        ▼
  plugin: does the side effect, owns its own mutable state,
          and sends the result back as a message
```

| Plugin   | Does                                                      | Doc                      |
| -------- | --------------------------------------------------------- | ------------------------ |
| `store`  | holds the application state and its history               | [store.md](./store.md)   |
| `dom`    | renders views, patches the DOM, owns every event listener | [dom.md](./dom.md)       |
| `http`   | requests, cancellable by id                               | [http.md](./http.md)     |
| `ws`     | WebSocket connections by id                               | [ws.md](./ws.md)         |
| `time`   | clock, timeouts and intervals, cancellable by id          | [time.md](./time.md)     |
| `logger` | writes log entries to the console                         | [logger.md](./logger.md) |
| `router` | URL and history                                           | [router.md](./router.md) |

## Using plugins

```ts
import { createApp } from "@pavlus/client";
import { createStorePlugin } from "@pavlus/client/plugins/store";
import { DomPlugin } from "@pavlus/client/plugins/dom";
import { createHttpPlugin } from "@pavlus/client/plugins/http";

createApp({
  app: dashboard, // a function, or an instance of a class extending Component
  plugins: [
    createStorePlugin(initialState), // the state lives here
    new DomPlugin(),
    createHttpPlugin(),
  ],
  mount: "#app", // render the app's view here; sends `mounted`
  init: { id: "init" }, // the first message, if any
});
```

- Each plugin has a `name` (`"store"`, `"http"`...). An effect is delivered to
  the plugin whose name equals `effect.plugin`.
- An effect for a plugin that is not in the list throws
  `pavlus: no plugin "x" for effect "y"`. Two plugins with the same name throw
  at start-up.
- Import plugins one by one from
  `@pavlus/client/plugins/<name>`, or everything from one place:

  ```ts
  import {
    DomPlugin,
    createHttpPlugin,
    createStorePlugin,
    storeEffector as store,
  } from "@pavlus/client/plugins";
  ```

  Importing the barrel runs no code (the package is marked `sideEffects:
false`), so a bundler keeps only what you use.

## Effectors: building effects

An effect is just an object, and you can write it by hand:

```ts
{ plugin: "store", type: "set", path: "status", value: "loading" }
```

Each plugin also ships an **effector**, a small object of builder functions
that returns exactly that object, typed, so a wrong field is a compile error
and handlers read like sentences. Import it with a short alias:

```ts
import { storeEffector as store } from "@pavlus/client/plugins/store";
import { httpEffector as http } from "@pavlus/client/plugins/http";
import { loggerEffector as log } from "@pavlus/client/plugins/logger";

class Users extends Component {
  load() {
    return [
      store.set("status", "loading"),
      http.request({
        id: "users",
        url: "/api/users",
        onSuccess: "loaded",
        onError: "failed",
      }),
      log.info("loading users"),
    ];
  }
}
```

| Plugin | Effector            | Alias used in the docs | Defined in                      |
| ------ | ------------------- | ---------------------- | ------------------------------- |
| store  | `storeEffector`     | `store`                | `src/plugins/store/helpers.ts`  |
| dom    | `DomPlugin` statics | `DomPlugin`            | `src/plugins/dom/mod.ts`        |
| http   | `httpEffector`      | `http`                 | `src/plugins/http/helpers.ts`   |
| ws     | `wsEffector`        | `ws`                   | `src/plugins/ws/helpers.ts`     |
| time   | `timeEffector`      | `time`                 | `src/plugins/time/helpers.ts`   |
| logger | `loggerEffector`    | `log`                  | `src/plugins/logger/helpers.ts` |
| router | `routerEffector`    | `router`               | `src/plugins/router/helpers.ts` |

Import an effector from the plugin's entry point or from the `plugins` barrel
(both re-export it). An effector does nothing by itself: it builds data, the
core hands that data to the plugin.

## Messages come back

Most plugins answer later (a response, a timer, a frame). The effect says
which message id to answer with, and the plugin dispatches
`{ id, payload }` into the application:

```ts
http.request({
  id: "users",
  url: "/api/users",
  onSuccess: "loaded",
  onError: "failed",
});
// ... later the application receives:
//   { id: "loaded", payload: { status: 200, data: [...] } }
```

The fields that carry a message id are `replyTo`, `onSuccess`, `onError`,
`onOpen`, `onMessage`, `onClose` and `onChange`. A child component
mounted with `namespace(...)`/`children` has its own prefix put in front of
exactly these fields, so the reply finds its way back to the child
(`loaded` becomes `users.loaded`). A plugin that uses these names gets that for
free.

## Who owns what

- The **store** plugin owns the application state. After every message, if
  the state changed, the core calls `onState(state)` on every plugin that
  defines it (the dom plugin does not: it never reads the state). Nothing
  repaints on its own: a store write answers with `{ prev, next }` and the
  component that cares returns `DomPlugin.update(patches)` — the patches its
  view diff computed. A root that wants "repaint everything on any write"
  wraps itself in `paintOnWrite(app)`.
- Every plugin owns its **private mutable state**: the DOM plugin its
  listeners, http its running requests, time its timers, ws its sockets.
  Application code never sees it and never needs to clean it up.
- Anything with an **id** (`http` requests, `time` timers, `ws`
  connections) is replaced when the same id is used again, and can be
  cancelled by id. That is how debouncing and "latest request wins" are
  written without any state in the application.

## Order and errors

- Messages are processed strictly one at a time. Effects of one message are
  handled in the order they were returned. A message dispatched by a plugin
  while handling an effect is queued and processed after the current one.
- More than `maxMessagesPerTick` (10 000) messages in one go is reported as a
  message loop.
- An error thrown by a plugin's `handle` propagates out of `dispatch`.
  Expected failures (a failed request, a closed socket) are not exceptions:
  they come back as messages.

## Testing

Every plugin takes its outside world as an option, so tests need no mocking
library and no real network, clock or browser:

| Plugin | Option                                                              | What to pass                          |
| ------ | ------------------------------------------------------------------- | ------------------------------------- |
| http   | `fetch`                                                             | a fake `fetch`                        |
| time   | `now`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval` | a fake clock, or `vi.useFakeTimers()` |
| ws     | `create`                                                            | a function returning a fake socket    |
| logger | `sink`                                                              | an object whose methods collect calls |
| router | `window`                                                            | a jsdom window                        |
| dom    | `document`                                                          | a jsdom document                      |
| store  | `now`, `maxHistory`                                                 | a counter for timestamps              |

Application code is pure, so most tests do not need plugins at all: call the
component with a message and a state and compare the returned effects (with
effectors, compare against `store.set(...)` itself).

```ts
import { toHandler } from "@pavlus/client";

expect(toHandler(dashboard)({ id: "reload" }, state)).toEqual([
  store.set("users.status", "loading"),
  http.request({
    id: "users",
    url: "/api/users",
    onSuccess: "users.loaded",
    onError: "users.failed",
  }),
]);
```

## Writing your own plugin

A plugin is an object. Give it strong types for its effects, and ship an
effector so using it feels like the built-in ones.

```ts
// clipboard/mod.ts
import type { Plugin } from "@pavlus/client";

export type ClipboardEffect = {
  plugin: "clipboard";
  type: "write";
  text: string;
  onDone: string;
  onError: string;
};

export interface ClipboardOptions {
  /** Defaults to `navigator.clipboard`; replace it in tests. */
  clipboard?: Pick<Clipboard, "writeText">;
}

export function createClipboardPlugin(
  opts: ClipboardOptions = {},
): Plugin<ClipboardEffect> {
  return {
    name: "clipboard",
    handle(effect, ctx) {
      const clipboard = opts.clipboard ?? navigator.clipboard;
      clipboard.writeText(effect.text).then(
        () => ctx.dispatch({ id: effect.onDone }),
        (error) => ctx.dispatch({ id: effect.onError, payload: String(error) }),
      );
    },
  };
}
```

```ts
// clipboard/helpers.ts
import type { ClipboardEffect } from "./mod.ts";

export interface ClipboardEffector {
  /** Copies `text`; replies `onDone`, or `onError` with the reason. */
  write(
    text: string,
    replies: { onDone: string; onError: string },
  ): ClipboardEffect;
}

export const clipboardEffector: ClipboardEffector = {
  write: (text, replies) => ({
    plugin: "clipboard",
    type: "write",
    text,
    ...replies,
  }),
};
```

Checklist:

1. **`name`** is what `effect.plugin` refers to.
2. **Type the effects** as a union on `type`, and use the reply field names from
   the list above for message ids.
3. **Take the outside world as an option** (`fetch`, a socket factory, a
   clock) so the plugin is testable.
4. **Own your state** and clean it in `dispose()` (the core calls it in
   reverse order when the app is disposed). Use ids to make operations
   replaceable and cancellable.
5. **Never throw for expected failures**: dispatch an error message.
6. **Ship an effector**, an exported interface plus a constant annotated with
   it. (JSR requires an explicit type on every exported constant, and the
   interface is also where the doc comments live.)
7. Optional hooks: `init(ctx)` runs once at start, `onState(state, ctx)` after
   every state change. A plugin that owns the application state also has
   `getState()` (see [store.md](./store.md)).
8. Write a short doc like the ones in this folder.

The contract, from `src/core/types.ts`:

```ts
interface Plugin<E extends { plugin: string; type: string }, S = unknown> {
  readonly name: string;
  init?(ctx: PluginContext<S>): void;
  handle(effect: E, ctx: PluginContext<S>): void;
  onState?(state: S, ctx: PluginContext<S>): void;
  dispose?(): void;
}
interface PluginContext<S> {
  dispatch(message: Message): void; // feed a message into the application
  getState(): S; // current application state
}
```
