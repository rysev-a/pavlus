---
summary: The full data flow of a pavlus application, from an event to a patched DOM. What pure code buys you, what effects look like as data, what plugins may and may not do, in which order messages run, and how to test a handler with plain asserts.
---
## One loop

Every pavlus application is the same loop. Something happens, a message is made, your pure code turns the message into effects, plugins carry out the effects, and the new state is shown on the screen. Here is the whole path, with the name of the part that does each step.

```text
 DOM event / HTTP reply / timer tick / socket frame / location change
        |
        |  a plugin turns it into a message
        v
 { id, payload, event }                           message: plain data
        |
        |  core: createApp puts it in the queue
        v
 handler(message, state)  ->  Effect[]            your code: pure
        |
        |  core: each effect goes to plugins[effect.plugin]
        v
 store.handle(set ...)    http.handle(request)    plugins: all side effects
        |                       |
        |                       |  later: ctx.dispatch(reply message)
        v                       +-------------------> back to the queue
 store: state replaced by a new object
        |
        |  core: state !== previous state  ->  onState(next) on every plugin
        v
 dom.onState:  view.diff(prev, next)  ->  Patch[]
        |
        v
 the dom plugin changes the real DOM
```

Everything on the left side of this picture is data or a pure function. Everything that touches the world is a plugin. The core, `createApp`, is the thin loop between them. Its source is about a hundred lines and has no dependency on the DOM.

Why this shape? It separates the part of a program that changes often and is hard to get right (what should happen when the user does X) from the part that changes rarely and can be written once (how to attach a listener, how to call `fetch`). The first part becomes ordinary functions on ordinary data, so it is easy to read, test and reuse.

## What "pure" buys you

A **pure** function depends only on its arguments and changes nothing outside itself. Your handlers have the signature `(message, state, ctx) => Effect[]`. Because they are pure:

- **You can test them without a browser.** The input is two plain values, and the output is a list of plain values. You compare them with `assert`. There is a full example at the end of this page.
- **You can run them on a server.** Without a DOM, the same components render to a string. The page [Server-side rendering](page:concepts-ssr) uses this.
- **You can replay a session.** Record the messages, feed them to a fresh app, and you get the same state. The core even gives you a hook, `onStep(message, effects)`, that is called for every processed message.
- **You can look at what happened.** An effect is an object you can print, log and compare. A callback is not.

Pavlus does **not** check purity. The documentation calls it the author's responsibility. A handler that calls `Math.random()` or reads `Date.now()` will work, and will make the application hard to test. The rule of thumb is to ask a plugin instead. A random number or the time is an effect whose answer comes back as a message.

## Effects are plain data

An effect is an object with at least two fields: `plugin`, the name of the plugin that handles it, and `type`, what to do. The other fields are the plugin's business. Here are real ones, from the built-in plugins. You write them with each plugin's *effector*, a small builder object, but the result is exactly the object shown.

```ts
{ plugin: "store", type: "set", path: "count", value: 1 }
{ plugin: "store", type: "merge", path: "user", value: { name: "Ann" } }
{ plugin: "http", type: "request", id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" }
{ plugin: "time", type: "setTimeout", id: "search", ms: 300, replyTo: "searchFire", payload: "ann" }
{ plugin: "router", type: "navigate", url: "/users" }
{ plugin: "logger", type: "log", level: "info", message: "user removed", data: { id: 3 } }
{ plugin: "dom", type: "focus", selector: "#name" }
```

Two things to notice. First, effects that need an answer say **which message to answer with**: `onSuccess: "loaded"`, `replyTo: "searchFire"`. The answer arrives later as a message, `{ id: "loaded", payload: ... }`, and goes through the same loop. Your code never waits. Second, an effect with an `id` (`http`, `time`, `ws`) replaces a running one with the same id. That is how "the latest request wins" and a debounce are written with no state in your code.

In handlers you use the effectors, because they are typed and read well:

```ts
import { Component, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";

interface SearchState {
  query: string;
  status: "idle" | "loading";
  results: string[];
}

export class Search extends Component<SearchState> {
  type(msg: Message) {
    const query = msg.event?.value ?? "";
    return [
      store.set("query", query),
      time.setTimeout("search", 300, "fire", query),
    ];
  }

  fire(msg: Message) {
    return [
      store.set("status", "loading"),
      http.request({
        id: "search",
        url: `/api/search?q=${msg.payload}`,
        onSuccess: "found",
        onError: "failed",
      }),
    ];
  }

  found(msg: Message) {
    const reply = msg.payload as { data: string[] };
    return [store.set("status", "idle"), store.set("results", reply.data)];
  }

  failed() {
    return [store.set("status", "idle"), store.set("results", [])];
  }
}
```

This is a complete debounced search. Every keystroke restarts the timer with the same id, so only the last query is sent. If a new query is sent while a request runs, the same id cancels the old request. The component has no timers, no `AbortController` and no mutable field.

## From state to patches

The last steps of the loop belong to the compiler. When the store has replaced the state, the DOM plugin calls the `diff(prev, next)` function of the mounted view. It returns **patches**: plain data too, one of eight operations (`text`, `attr`, `rmAttr`, `handler`, `insert`, `clear`, `remove`, `move`). The DOM plugin is the only code that turns patches into DOM calls.

::demo state-to-patches

Look at the two steps of the demo. In the first, only `status` changes, so the only patch is the insert of the "Loading..." paragraph. The list is not touched. In the second, `status` and `items` change: the paragraph is cleared and two list items are inserted. A node that reads only unchanged fields produces nothing at all. The compiler works out which fields each node reads, so `diff` can skip a subtree with one `===` check.

> [!WARNING] Immutability is part of the contract
> The core decides that a state changed by comparing object identity (`next !== state`), and `diff` compares fields the same way. The store plugin replaces state objects and shares the branches that did not change, so both checks are cheap and correct. If you mutated the state in place, no plugin would be notified and no patch would be made.

## The order of things

The core processes messages strictly one at a time. These rules are all in `createApp`, and you can rely on them.

1. **A queue.** `dispatch(message)` pushes the message on a queue. If the loop is already running, the call returns at once and the message is handled later in the same run, after the current message is finished.
2. **Effects in order.** For one message, the effects are handed to their plugins in the order your handler returned them.
3. **Replies are queued.** A plugin may call `ctx.dispatch` while it handles an effect, even at once. The reply waits in the queue behind the current message. A handler never sees a reply to its own effect during the same message.
4. **One notification per message.** After all effects of a message have run, the core reads the state once. If it is a different object than before the message, every plugin that has `onState` is called once with the final state. Three `set` effects cause one render, not three.
5. **A safety valve.** If more than `maxMessagesPerTick` messages (10 000 by default) are processed in one run, the queue is cleared and an error is thrown. It means that messages cause each other in a cycle.
6. **Errors.** An exception in a handler or in `plugin.handle` propagates out of `dispatch`. An effect for a plugin that is not registered throws `pavlus: no plugin "x" for effect "y"`. Two plugins with the same name throw when the app starts.
7. **Shutdown.** `dispose()` disposes the plugins in reverse order of registration, and later messages are ignored.

The state that handlers receive comes from the first plugin that has a `getState()` method, which is the store. You can pass `getState` yourself in the options, for example in a test.

## What plugins may and may not do

A plugin is an object: `{ name, init?, handle(effect, ctx), onState?, dispose? }`. The core gives it a context with three functions: `dispatch(message)`, `getState()` and `dispatchEffect(effect)`.

A plugin **may**:

- own mutable data: listeners, running requests, timers, sockets, a cache. Application code never sees it and never cleans it up.
- call any outside API: the DOM, `fetch`, `setTimeout`, `localStorage`, `console`.
- turn outside events into messages with `ctx.dispatch`, at any time.
- read the state with `ctx.getState()`, and react to changes in `onState`.
- clean up in `dispose`.

A plugin **should not**:

- change the application state by itself. Only the store plugin changes the state, and only because of a `set`, `merge`, `remove`, `undo` or `restoreTo` effect.
- hold business rules. It does one thing for one family of effects. "What happens after the reply" belongs to a handler.
- throw for an expected failure. A failed request or a closed socket is reported as a message (`onError`) so that handlers can deal with it.

The framework does not police these rules either. The [plugin pages](page:plugins-overview) show what each built-in plugin does and how to write your own.

## Testing a handler with plain asserts

Because a component is a pure function, a unit test needs no setup. `toHandler` turns a component into a plain function `(message, state) => Effect[]`. Call it and compare. This test uses only the standard library:

```ts search.test.ts
import assert from "node:assert/strict";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { toHandler } from "@pavlus/frontend";
import { Search } from "./search.ts";

const search = toHandler(new Search());
const state = { query: "ann", status: "idle" as const, results: [] };

assert.deepEqual(search({ id: "fire", payload: "ann" }, state), [
  store.set("status", "loading"),
  http.request({
    id: "search",
    url: "/api/search?q=ann",
    onSuccess: "found",
    onError: "failed",
  }),
]);

assert.deepEqual(search({ id: "nobody-handles-this" }, state), []);
```

A message with no handler returns an empty list, not an error. You compare against the effectors' own output, so the test breaks if a plugin's effect changes shape, and you never write the object by hand.

To test several steps together, run the real core with only the store plugin. The `dom` plugin is not needed, because the state is all you want to check. The option `onStep` collects what happened.

```ts flow.test.ts
import assert from "node:assert/strict";
import { createApp, type Plugin } from "@pavlus/frontend";
import { createStorePlugin } from "@pavlus/frontend/plugins";
import { Search } from "./search.ts";

const fakeHttp: Plugin = {
  name: "http",
  handle(effect, ctx) {
    ctx.dispatch({
      id: effect.onSuccess as string,
      payload: { status: 200, data: ["Ann Lee", "Anna Fox"] },
    });
  },
};
const fakeTime: Plugin = {
  name: "time",
  handle(effect, ctx) {
    ctx.dispatch({ id: effect.replyTo as string, payload: effect.payload });
  },
};

const store = createStorePlugin({ query: "", status: "idle", results: [] });
const steps: string[] = [];
const app = createApp({
  app: new Search(),
  plugins: [store, fakeHttp, fakeTime],
  onStep: (message) => steps.push(message.id),
});

app.dispatch({ id: "type", event: { type: "input", value: "ann" } });

assert.deepEqual(steps, ["type", "fire", "found"]);
assert.deepEqual(store.getState().results, ["Ann Lee", "Anna Fox"]);
assert.equal(store.getState().status, "idle");
```

The two fake plugins are four lines each. They answer at once, and the test sees the whole chain: `type`, then `fire` from the timer, then `found` from the request. No clock, no network, no browser.

When you do want to check a template in a DOM, `@pavlus/frontend/testing` has `mountView(viewOrComponent, initialState)`. It mounts a view in a fresh container without the core and returns the container, the `messages` the page dispatched, and a `set(next)` to change the state. A click on a button gives you the message to compare, and `set` shows the patched DOM.

## What you learned

- The loop is: event, message, handler, effects, plugins, store, new state, `diff`, patches, DOM. Messages, effects and patches are all plain data.
- Pure handlers can be tested with `assert`, run on a server and replayed. Purity is a convention that the framework does not enforce.
- Messages run one at a time. Effects run in the order returned, replies wait in the queue, and plugins are told about the state once per message.
- Plugins own every side effect and the mutable data for it. They answer with messages, and only the store changes the state.
- You can test a handler directly with `toHandler`, or a whole flow with `createApp`, the store and small fake plugins.

Next: [Components and state](page:concepts-components).
