---
summary: Write a plugin step by step, from a three-line title plugin to a storage plugin that answers with a message and a viewport plugin that cleans up after itself. Learn the rules, how to test a plugin with a fake context, and when not to write one.
---
## The smallest plugin

A plugin is an object with a `name` and a `handle` function. That is all the framework needs. Here is a plugin that sets the title of the browser tab:

```ts title.ts
import type { Plugin } from "@service-laboratory/pavlus";

export const titlePlugin: Plugin = {
  name: "title",
  handle(effect) {
    document.title = String(effect.text);
  },
};
```

You register it with the others:

```ts
createApp({
  app: shell,
  plugins: [createStorePlugin(initialState), createDomPlugin(), titlePlugin],
  mount: "#app",
});
```

And a handler asks for a title by returning an effect for it:

```ts
count(msg: Message): Effect[] {
  return [{ plugin: "title", type: "set", text: `${msg.payload} left` }];
}
```

This is the whole path. The handler stays pure: it returns data. The core finds the plugin whose `name` is `"title"`, and calls `handle(effect, ctx)`. The one line with `document.title` is the only impure line in the whole application, and it lives in a place where it is easy to find.

It works, but it is not yet good. `effect.text` is `unknown`, so we needed `String(...)`. A typo in the handler (`txt` instead of `text`) is not a compile error. And `document` is a global, which a test has to fake. The next steps fix these three things.

## Type the effect and ship an effector

Give the plugin the type of its effects. An effect is a union of objects with `plugin` and `type`; `Plugin<E>` takes that union. Then the effector: a small object of functions that build the effects. Last, take the outside world, here the document, as a parameter with a default.

```ts title.ts
import type { Plugin } from "@service-laboratory/pavlus";

export type TitleEffect = { plugin: "title"; type: "set"; text: string };

export const titleEffector = {
  set: (text: string): TitleEffect => ({ plugin: "title", type: "set", text }),
};

export function createTitlePlugin(
  doc: Document = document,
): Plugin<TitleEffect> {
  return {
    name: "title",
    handle(effect) {
      doc.title = effect.text;
    },
  };
}
```

Read it from the top.

- `TitleEffect` is the shape of the data. `plugin: "title"` and `type: "set"` are literal types, so the effect cannot be confused with an effect of another plugin. If you add a second effect later, make the type a union: `type TitleEffect = SetTitle | ResetTitle`, and `handle` can switch on `effect.type`.
- `titleEffector.set(text)` returns exactly the object from the first version, typed. The handler now reads `title.set(...)` and a wrong field is a compile error.
- `createTitlePlugin(doc)` is a factory. The default is the global `document`, resolved when the factory is called, so on a server where there is no `document` you simply do not create this plugin. A test passes a jsdom document or any object with a `title` field.
- The return type is `Plugin<TitleEffect>`. Inside `handle`, `effect.text` is a `string`.

A handler now looks like the built-in ones:

```ts
import { titleEffector as title } from "./title.ts";

count(msg: Message): Effect[] {
  return [title.set(`${msg.payload} left`)];
}
```

> [!NOTE] Two ways to type an effect
> The ui-kit's plugins write `interface RandomEffect extends Effect`, which accepts any extra field. The framework's plugins use a union of exact object types, which is stricter: a field that does not exist is an error. Both are assignable to `Effect`, so both can be returned from a handler. Use the strict form for a plugin with several effects.

## A plugin that answers

The title plugin never replies. Most plugins do: the work takes time, or it can fail. The rule is the same as for the built-in ones. The effect names the messages to reply with, and the plugin calls `ctx.dispatch`.

Let us write a plugin for `localStorage`. It has two effects: `load` reads a key and replies with the value, `save` writes it. A value is stored as JSON.

```ts storage.ts
import type { Plugin } from "@service-laboratory/pavlus";

export type StorageEffect =
  | {
      plugin: "storage";
      type: "load";
      key: string;
      onSuccess: string;
      onError: string;
    }
  | {
      plugin: "storage";
      type: "save";
      key: string;
      value: unknown;
      onError?: string;
    };

export const storageEffector = {
  load: (key: string, onSuccess: string, onError: string): StorageEffect => ({
    plugin: "storage",
    type: "load",
    key,
    onSuccess,
    onError,
  }),
  save: (key: string, value: unknown, onError?: string): StorageEffect => ({
    plugin: "storage",
    type: "save",
    key,
    value,
    ...(onError !== undefined && { onError }),
  }),
};

export interface StorageOptions {
  /** Defaults to `localStorage`; replace it in tests. */
  storage?: Pick<Storage, "getItem" | "setItem">;
}

export function createStoragePlugin(
  opts: StorageOptions = {},
): Plugin<StorageEffect> {
  return {
    name: "storage",
    handle(effect, ctx) {
      const storage = opts.storage ?? localStorage;
      try {
        if (effect.type === "load") {
          const text = storage.getItem(effect.key);
          ctx.dispatch({
            id: effect.onSuccess,
            payload: text === null ? null : JSON.parse(text),
          });
        } else {
          storage.setItem(effect.key, JSON.stringify(effect.value));
        }
      } catch (error) {
        if (effect.onError) {
          ctx.dispatch({ id: effect.onError, payload: String(error) });
        }
      }
    },
  };
}
```

What is worth noticing:

- **Reply names.** `load` has `onSuccess` and `onError`, the standard names. A child component gets its message prefix put in front of these fields, so the reply finds its way back to the child. A field called `onDone` would not be prefixed, and the answer would go to the root. Use `replyTo`, `onSuccess`, `onError`, `onOpen`, `onMessage`, `onClose` or `onChange`.
- **Failure is a message.** The `try`/`catch` turns an exception (a blocked storage, a value that is not JSON) into the message `onError` with the reason. The application decides what to do. Nothing is thrown into the core. For `save`, `onError` is optional: if nobody asked, the error is dropped.
- **The world is an option.** `storage` defaults to the global `localStorage`, read when the effect is handled, and a test passes a plain object with `getItem` and `setItem`.
- **The reply may be synchronous.** `ctx.dispatch` inside `handle` is safe. The core queues the message and processes it after the current one, so the handler that asked for the `load` has already finished.
- **A missing key is not an error.** `getItem` returns `null`, and the reply is `null`. The handler decides what that means.

The code that uses it is two handlers, one that asks and one that receives:

```ts
load(): Effect[] {
  return [storage.load("todos", "loaded", "loadFailed")];
}

loaded(msg: Message): Effect[] {
  const items = Array.isArray(msg.payload) ? msg.payload : [];
  return [store.set("items", items)];
}
```

The flow is the usual loop. `load` returns a `storage` effect; the plugin reads the key and dispatches `{ id: "loaded", payload: [...] }`; the next turn, `loaded` stores the value. No promise, no callback and no state outside the store.

## Testing a plugin with a fake context

A plugin takes a context, and a context is three functions. A test can build one in four lines:

```ts storage.test.ts
import type { Message, PluginContext } from "@service-laboratory/pavlus";
import { expect, test } from "vitest";
import { createStoragePlugin, storageEffector as storage } from "./storage.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("storage loads, saves and reports errors", () => {
  const data: Record<string, string> = { a: '{"n":1}', bad: "{oops" };
  const plugin = createStoragePlugin({
    storage: {
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => void (data[key] = value),
    },
  });
  const { ctx, sent } = fakeContext();
  plugin.handle(storage.load("a", "ok", "failed"), ctx);
  plugin.handle(storage.load("missing", "ok", "failed"), ctx);
  plugin.handle(storage.load("bad", "ok", "failed"), ctx);
  plugin.handle(storage.save("b", [1, 2]), ctx);
  expect(sent).toEqual([
    { id: "ok", payload: { n: 1 } },
    { id: "ok", payload: null },
    { id: "failed", payload: expect.stringContaining("SyntaxError") },
  ]);
  expect(data.b).toBe("[1,2]");
});
```

The test passes a fake `storage` made of a plain object, calls `handle` with effects built by the effector, and compares what was dispatched with a list. It checks the three cases that matter: a value that exists, a key that is missing, and a value that is not JSON. There is no application, no browser storage and no mocking library.

Two more kinds of test are useful, and both fit in a few lines:

```ts title.test.ts
import {
  createApp,
  type Effect,
  type Message,
  type PluginContext,
} from "@service-laboratory/pavlus";
import { createStorePlugin } from "@service-laboratory/pavlus/plugins";
import { expect, test } from "vitest";
import { createTitlePlugin, titleEffector as title } from "./title.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("the title plugin sets document.title", () => {
  const { ctx } = fakeContext();
  createTitlePlugin(document).handle(title.set("3 left"), ctx);
  expect(document.title).toBe("3 left");
});

test("a handler asks for a title, the app performs it", () => {
  const app = createApp({
    app: (message: Message): Effect[] =>
      message.id === "count" ? [title.set(`${message.payload} left`)] : [],
    plugins: [createStorePlugin({}), createTitlePlugin(document)],
  });
  app.dispatch({ id: "count", payload: 2 });
  expect(document.title).toBe("2 left");
});
```

The second test starts the real core with the real title plugin: a handler returns the effect, and the document title changes. Use it for a plugin that is used by an application. Use the fake context for the plugin alone.

## A plugin that cleans up

`title` and `storage` hold nothing. A plugin that registers a listener, a timer or a socket owns something, and must give it back. The core calls `dispose()` when the application is disposed, in the reverse order of registration.

Here is a plugin that reports the size of the window. The effect `listen` starts a `resize` listener, `stop` removes it.

```ts viewport.ts
import type { Plugin } from "@service-laboratory/pavlus";

export type ViewportEffect =
  | { plugin: "viewport"; type: "listen"; onChange: string }
  | { plugin: "viewport"; type: "stop" };

export const viewportEffector = {
  listen: (onChange: string): ViewportEffect => ({
    plugin: "viewport",
    type: "listen",
    onChange,
  }),
  stop: (): ViewportEffect => ({ plugin: "viewport", type: "stop" }),
};

export function createViewportPlugin(
  win: Window = window,
): Plugin<ViewportEffect> {
  let stop: (() => void) | undefined;
  const size = () => ({ width: win.innerWidth, height: win.innerHeight });

  return {
    name: "viewport",
    handle(effect, ctx) {
      stop?.();
      stop = undefined;
      if (effect.type === "stop") return;
      const report = () =>
        ctx.dispatch({ id: effect.onChange, payload: size() });
      win.addEventListener("resize", report);
      stop = () => win.removeEventListener("resize", report);
      report();
    },
    dispose() {
      stop?.();
    },
  };
}
```

There are three points to take from it.

1. The plugin keeps the way to undo its own work, `stop`, in a variable of the factory. That variable is the plugin's private state. Application code never sees it.
2. Every `handle` first calls `stop?.()`. Listening again **replaces** the previous listener, like the router plugin does. Without it, two `listen` effects would give two reports for one resize.
3. `dispose` removes the listener. Without it, a test that creates and disposes ten applications leaks ten listeners.

The test drives it with the real window of jsdom:

```ts viewport.test.ts
import type { Message, PluginContext } from "@service-laboratory/pavlus";
import { expect, test } from "vitest";
import {
  createViewportPlugin,
  viewportEffector as viewport,
} from "./viewport.ts";

function fakeContext() {
  const sent: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (message) => void sent.push(message),
    getState: () => undefined,
    dispatchEffect: () => {},
  };
  return { ctx, sent };
}

test("the viewport plugin reports the size, and stops when disposed", () => {
  const { ctx, sent } = fakeContext();
  const plugin = createViewportPlugin(window);
  plugin.handle(viewport.listen("resized"), ctx);
  expect(sent).toEqual([
    { id: "resized", payload: { width: 1024, height: 768 } },
  ]);

  Object.assign(window, { innerWidth: 500 });
  window.dispatchEvent(new Event("resize"));
  expect(sent.at(-1)).toEqual({
    id: "resized",
    payload: { width: 500, height: 768 },
  });

  plugin.dispose?.();
  window.dispatchEvent(new Event("resize"));
  expect(sent).toHaveLength(2);
});
```

Use the same pattern for anything with an identity. A plugin that wraps a chart library would keep a map from id to chart, replace a chart when the same id is drawn again, and destroy all of them in `dispose`.

## Reading a real one: random

The ui-kit has a plugin that is short enough to read in one go. A handler cannot call `Math.random()`, because the same message would give different effects. So it asks a plugin for a number and gets it back as a message:

```ts random.ts
import type { Effect, Plugin } from "@service-laboratory/pavlus";

/**
 * The application is pure: it cannot call `Math.random()`. It asks this plugin
 * for a number and gets it back as a message, like an HTTP answer.
 */
export interface RandomEffect extends Effect {
  plugin: "random";
  type: "int";
  /** The answer is an integer from 0 up to, not including, `max`. */
  max: number;
  /** The id of the message that carries the answer as its payload. */
  replyTo: string;
}

export const randomEffector = {
  int: (max: number, replyTo: string): RandomEffect => ({
    plugin: "random",
    type: "int",
    max,
    replyTo,
  }),
};

export function createRandomPlugin(
  random: () => number = Math.random,
): Plugin<RandomEffect, unknown> {
  return {
    name: "random",
    handle(effect, ctx) {
      if (effect.type !== "int") return;
      ctx.dispatch({
        id: effect.replyTo,
        payload: Math.min(effect.max - 1, Math.floor(random() * effect.max)),
      });
    },
  };
}
```

- `RandomEffect` extends `Effect`, so extra fields are allowed. `max` is how many values are wanted, `replyTo` is the message that carries the answer.
- `randomEffector.int(max, replyTo)` is the only way the application builds the effect.
- `createRandomPlugin(random)` takes the source of randomness as a parameter, with `Math.random` as the default. This is the testing seam: pass `() => 0` or `() => 0.999999` and the answer is known.
- `handle` does one thing and replies by `ctx.dispatch`. The `Math.min` keeps the answer below `max` even if a custom source returns exactly 1.

It is used by the random button of the Theming page. The handler asks, and another handler receives the answer:

```ts
"theming.random"(): Effect[] {
  return [randomEffector.int(allThemes().length, "randomPicked")];
}

randomPicked(msg: Message, state: AppState): Effect[] {
  const pick = allThemes()[msg.payload as number];
  return pick
    ? this._choose(withTheme(state.look, pick.palette, pick.mode))
    : [];
}
```

and the ui-kit's test checks it with a fixed source of randomness:

```ts
const sent: unknown[] = [];
const ctx = { dispatch: (m: unknown) => sent.push(m) } as never;
const plugin = createRandomPlugin(() => 0.999999);
plugin.handle(randomEffector.int(100, "randomPicked"), ctx);
createRandomPlugin(() => 0).handle(
  randomEffector.int(100, "randomPicked"),
  ctx,
);
expect(sent).toEqual([
  { id: "randomPicked", payload: 99 },
  { id: "randomPicked", payload: 0 },
]);
```

Note that the test needs only `dispatch`, so the fake context is `{ dispatch }`. The other three plugins of the ui-kit (theme, source, docs) are described in [the plugin reference](page:plugins-reference).

## The rules

1. **A plugin has one name and one family of effects.** Name it for the world it talks to (`storage`, `viewport`, `title`), not for the feature that uses it.
2. **Do not decide, do.** A plugin performs one effect. It does not read the application state to choose what to do. Whatever it needs goes into the effect. `ctx.getState()` exists because the DOM plugin must render, but a plugin that branches on the state has moved application logic out of the pure core, where it cannot be tested with a plain function.
3. **Reply by `ctx.dispatch`, with a message id from the effect.** Do not return a value from `handle`, do not keep a callback for the application to call, and do not name the message in the plugin. The effect decides who gets the answer.
4. **Use the standard reply names**, so that children get their prefix.
5. **Expected failures are messages.** Catch them and dispatch `onError`. Let a bug (an effect of a wrong shape) throw. Remember that an error inside a promise or a timer callback is not seen by the core: catch it yourself.
6. **Take the world as an option.** `fetch`, `storage`, `window`, `document`, a clock, a random source. Default to the global, resolved when the effect is handled or the factory is called.
7. **Own your resources and release them.** Keep listeners, timers and sockets in the factory, make operations replaceable by id, and clean up in `dispose`.
8. **Ship an effector.** For a library, export an interface for the effector and a constant annotated with it, because JSR requires an explicit type on every exported constant, and the interface is a good place for doc comments.

> [!WARNING] Do not mutate the state from a plugin
> A plugin has no way to change the state, and it should not look for one. Only the `store` plugin changes it, in response to a `store.set` effect that your handler returned. If a plugin has a result to share, it dispatches a message, and a handler turns it into `store.set`.

## When not to write a plugin

A plugin is for the outside world. If the work is a calculation, a plugin is the wrong place, and a function is simpler. Use this table before you start:

| You want to | Use |
| --- | --- |
| Format a date, sort a list, compute a total | A pure function that a handler calls |
| Keep a value derived from the state (a filtered list) | Compute it in the handler, store it with `store.set` |
| Call an API | The `http` plugin |
| Wait, repeat, debounce | The `time` plugin |
| Focus an input | `dom.focus` |
| Change the URL | The `router` plugin |
| Show or hide something, toggle a class | A condition in the template, driven by the state |
| Business rules, validation | A handler |
| Read a browser API, a storage, a device, a third-party library with side effects | A plugin |

If you catch yourself putting an `if` about application data inside `handle`, that code belongs in a handler.

## What you learned

- A plugin is `{ name, handle }`. Type its effects as a union, build them with an effector, and take the outside world as an option.
- To answer, the effect names the reply messages with the standard fields, and the plugin calls `ctx.dispatch`. Failures are messages.
- A plugin that owns a resource stores the way to undo it and releases it in `dispose`. Test with a fake context of three functions.
- Do not decide in a plugin, do not touch the state, and do not write a plugin for something a function can do.

Next: [a complete app](page:guide-todo-app).
