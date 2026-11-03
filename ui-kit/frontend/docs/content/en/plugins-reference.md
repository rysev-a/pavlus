---
summary: Every built-in plugin in one place - dom, store, http, router, time, logger and ws - with all their effects, fields and the messages they send back, plus the four plugins of the ui-kit as examples of app-specific plugins.
---
## Seven plugins, one table at the end

Seven plugins come with the framework. You register the ones you need in `createApp({ plugins })`, and the others cost nothing. This page describes each one: what it is for, every effect it handles with its fields, a short use in a handler, and the message that comes back. The last section is a table of all the effects, for quick lookup.

Every example uses the short alias of the effector, as in [how plugins work](page:plugins-overview):

```ts
import {
  domEffector as dom,
  httpEffector as http,
  loggerEffector as log,
  routerEffector as router,
  storeEffector as store,
  timeEffector as time,
  wsEffector as ws,
} from "@service-laboratory/pavlus/plugins";
```

Each plugin is created by a function named `createXPlugin(options)`, and each option exists so that a test can replace the outside world. The options are listed at the end of the page as well.

## store

**For:** holding the application state and a history of every change to it. It is the only plugin the core asks for the state: the handler receives the store's value, and when it changes, the other plugins are told.

```ts
const plugin = createStorePlugin({ user: { name: "Ann" }, todos: [] });
plugin.getState();
plugin.history;
```

| Effect | Fields | Meaning |
| --- | --- | --- |
| `set` | `path`, `value` | Set the value at `path`, creating missing parents. A root path (an empty string) replaces the whole state. |
| `merge` | `path`, `value` | Shallow-merge an object into the object at `path`. |
| `remove` | `path` | Remove a value. For an array element the array shrinks. |
| `undo` | `steps?` | Revert the last `steps` (default 1) recorded changes. |
| `restoreTo` | `timestamp` | Revert every change recorded after `timestamp`. |

A **path** is a dotted string (`"user.name"`, `"todos.0.done"`) or an array (`["todos", 0, "done"]`). Numeric segments index arrays.

```ts
rename(msg: Message): Effect[] {
  return [
    store.set("user.name", String(msg.payload)),
    store.merge("user", { edited: true }),
    store.remove("todos.1"),
  ];
}
```

**Comes back:** nothing. The result of a `store` effect is the new state, which the next message and the templates see.

The state is **immutable**. Every change builds new objects along the path and keeps the rest identical, so `diff` can skip untouched branches with one `===`. Setting a value to what it already is changes nothing and records nothing. Never mutate the state in place: neither the store nor `diff` can see it.

Every change is recorded with a `restoreEffect`, the effect that brings back the state before it. `undo` and `restoreTo` apply those without recording anything. The history keeps the last 1000 changes (`maxHistory`).

## dom

**For:** the only code that touches the DOM. It renders compiled views, applies the patches that `diff` returns, and owns every event listener. Events come back as messages.

The root of your application is mounted by `createApp({ mount })`. The effects below are for everything else: a second view in another place, a modal, a panel.

| Effect | Fields | Meaning |
| --- | --- | --- |
| `mount` | `target`, `view`, `onMounted?` | Render `view` into `target` (a CSS selector or an element) with the current state. |
| `unmount` | `target` | Remove what was mounted into `target`, with its listeners. |
| `focus` | `selector` | Focus the first matching element. |
| `blur` | `selector` | Blur the first matching element. |

```ts
open(): Effect[] {
  return [dom.mount("#panel", panelView, { onMounted: "panelMounted" })];
}

panelMounted(): Effect[] {
  return [dom.focus("input.filter")];
}
```

`view` is a compiled template (`import panelView from "./panel.pavlus"`), or `viewOf(component)` for a component whose template has an `+outlet` or children.

**Comes back:**

| When | Message |
| --- | --- |
| The view is in the DOM and `onMounted` was given | `{ id: onMounted }` |
| The user triggers an event bound in a template, like `@click=save(item)` | `{ id, payload, event }` |

For events, `id` is the message id from the template (with the prefix of embedded children), `payload` is the argument of the handler, and `event` is a plain snapshot: `{ type, value?, checked?, key? }`. `value` and `checked` come from the target of the event, `key` from keyboard events. `@submit.prevent` and `.stop` call `preventDefault()` and `stopPropagation()` before the message is sent.

`onMounted` is not one of the seven reply fields that a child gets a prefix on, so the message arrives with the name you wrote.

Two more things the plugin does. Whenever the state changes it runs `view.diff(previous, state)` for every mounted view and applies the patches; you never send an update effect. And when the target holds a server render, `mount` hydrates the markup instead of building it (see [server-side rendering](page:concepts-ssr)).

A node gets **one** listener per event type for its whole life. When the message of a handler changes, the plugin only swaps the stored message. Form fields are written as properties (`value`, `checked`, `selected`) as well as attributes, because after the user typed, only the property changes what is shown.

## http

**For:** requests. Every request has an **id**, and the id is also how it is cancelled: starting a request with the id of a running one cancels the old one. "The latest request wins" needs no state in the application.

| Effect | Fields | Meaning |
| --- | --- | --- |
| `request` | `id`, `url`, `onSuccess`, `onError`, `method?`, `headers?`, `body?`, `responseType?` | Send a request. |
| `cancel` | `id` | Cancel the running request `id`. |

`method` is `GET` unless you say otherwise. A string `body` is sent as it is; anything else is sent as JSON, and `content-type: application/json` is added unless you set one. `responseType` is `"json"` (default) or `"text"`. A body that is not valid JSON gives `data: null`.

```ts
search(msg: Message): Effect[] {
  return [
    http.request({
      id: "search",
      url: `/api/users?q=${msg.payload}`,
      onSuccess: "found",
      onError: "searchFailed",
    }),
  ];
}

save(msg: Message): Effect[] {
  return [
    http.request({
      id: "save",
      method: "POST",
      url: "/api/users",
      body: { name: msg.payload },
      onSuccess: "saved",
      onError: "saveFailed",
    }),
  ];
}
```

**Comes back:**

| When | Message |
| --- | --- |
| A 2xx response | `{ id: onSuccess, payload: { status, data } }` |
| Any other status | `{ id: onError, payload: { status, error: statusText, data } }` |
| A network failure | `{ id: onError, payload: { error: message } }` |
| Cancelled or replaced | nothing |

These are the real payloads for a fake `fetch` that answers 200, 404 and a network failure:

```json
[
  { "id": "ok", "payload": { "status": 200, "data": [1] } },
  { "id": "err", "payload": { "status": 404, "error": "Not Found", "data": { "m": 1 } } },
  { "id": "err", "payload": { "error": "offline" } }
]
```

> [!WARNING] A cancelled request is silent
> A cancelled request never produces a message, not even an error, and the answer of a replaced request that still arrives is ignored. If you show a loading indicator, do not wait for `onError` to hide it after a `cancel`: hide it yourself, in the handler that cancels.

The plugin has `pending()`, the ids in flight, and `settled()`, a promise that resolves when nothing is in flight (used for server rendering).

## router

**For:** the URL and the history. The application learns the location as messages and changes it with effects; it never reads `window.location`.

| Effect | Fields | Meaning |
| --- | --- | --- |
| `listen` | `onChange` | Start reporting. Replies at once with the current location. |
| `navigate` | `url`, `replace?`, `absolute?` | Go to `url`. From a routed child a url is relative to the base of the child unless `absolute` is set. |
| `back` | none | `history.back()` |
| `forward` | none | `history.forward()` |

```ts
init(): Effect[] {
  return [router.listen("route.changed")];
}

login(): Effect[] {
  return [router.navigate("/login", { replace: true })];
}
```

**Comes back:** `{ id: onChange, payload: { path, search, hash } }`. At `https://example.com/users?page=2#top` the payload is:

```json
{ "path": "/users", "search": "?page=2", "hash": "#top" }
```

It is sent when `listen` is handled, after every `navigate` (the plugin dispatches a `popstate` itself, because `pushState` fires no event) and when the user goes back or forward. Calling `listen` again replaces the listener. `navigate` reports only when a `listen` is active.

The plugin does not parse the URL beyond these three parts. Matching routes is the job of a `routing` table, see [routing](page:concepts-routing). Under a base path, pass `createRouterPlugin({ window })` a window that hides the base.

## time

**For:** the clock, timeouts and intervals. Application code cannot call `Date.now()` or `setTimeout`, because that would make it impure. It asks this plugin, and the answer comes back as a message. Every timer has an **id** and can be restarted or cancelled by it.

| Effect | Fields | Meaning |
| --- | --- | --- |
| `now` | `replyTo` | Reply with the current time. |
| `setTimeout` | `id`, `ms`, `replyTo`, `payload?` | Send `replyTo` once, after `ms`. |
| `setInterval` | `id`, `ms`, `replyTo`, `payload?` | Send `replyTo` every `ms`. |
| `cancel` | `id` | Stop the timer `id`. |
| `cancelAll` | none | Stop every timer. |

```ts
typing(msg: Message): Effect[] {
  return [
    store.set("query", msg.event?.value ?? ""),
    time.setTimeout("search", 300, "searchFire", msg.event?.value),
  ];
}

searchFire(msg: Message): Effect[] {
  return [http.request({ id: "search", url: `/api/users?q=${msg.payload}`, onSuccess: "found", onError: "searchFailed" })];
}
```

Starting a timer with an id that is already running **cancels the running one**. The example is a debounce with no state: while the visitor keeps typing, every key replaces the timer, and `searchFire` arrives 300 ms after the last key.

**Comes back:**

| Effect | Message |
| --- | --- |
| `now` | `{ id: replyTo, payload: <ms since the epoch> }` |
| `setTimeout` | `{ id: replyTo, payload }` once; the timer is then forgotten |
| `setInterval` | `{ id: replyTo, payload }` on every tick |

To stamp a document with the time, ask for it and finish the work when the answer comes: `save` returns `time.now("save.stamped")`, and `"save.stamped"` stores `msg.payload`. The same log of messages then always gives the same effects.

## logger

**For:** the console. Application code is pure, so even logging is an effect.

| Effect | Fields | Meaning |
| --- | --- | --- |
| `log` | `message`, `level?`, `data?` | Write an entry. `level` is `debug`, `info`, `warn` or `error`, default `info`. |

```ts
removed(msg: Message): Effect[] {
  return [log.info("user removed", { id: msg.payload }), log.warn("slow response", 2400)];
}
```

The effector has `log.debug`, `log.info`, `log.warn`, `log.error` and `log.log(level, message, data)`. Entries go to the matching method of `console`, with `data` as the second argument when present.

**Comes back:** nothing.

`withLogging(component, label)` from the main package wraps a component and adds one `debug` entry for each message it handles, with the payload and the plugins and types of the effects it returned. It adds an effect, so the logger plugin must be registered.

```ts
createApp({
  app: withLogging(dashboard, "dashboard"),
  plugins: [createStorePlugin(initialState), createLoggerPlugin()],
});
```

## ws

**For:** WebSocket connections, by **id**. The plugin keeps the sockets; the application sees messages.

| Effect | Fields | Meaning |
| --- | --- | --- |
| `connect` | `id`, `url`, `onMessage`, `onOpen?`, `onClose?`, `onError?` | Open the connection `id`. |
| `send` | `id`, `data` | Send on the connection `id`. An object is sent as JSON, a string as it is. |
| `close` | `id`, `code?`, `reason?` | Close the connection `id`. |

```ts
join(): Effect[] {
  return [
    ws.connect({ id: "chat", url: "wss://example.com/chat", onOpen: "opened", onMessage: "received", onClose: "closed", onError: "failed" }),
  ];
}

opened(): Effect[] {
  return [ws.send("chat", { text: "hi" })];
}
```

**Comes back:**

| When | Message |
| --- | --- |
| The connection opens | `{ id: onOpen }` |
| A frame arrives | `{ id: onMessage, payload }`. A text frame that is valid JSON is parsed. |
| The connection closes | `{ id: onClose, payload: { code, reason } }`; the id is forgotten |
| An error | `{ id: onError }` |

Connecting with the id of an open connection closes the old one first, without an `onClose` message. `send` to an id that has no connection **throws** (`pavlus/ws: no connection "chat"`). Send only after `onOpen`, and keep a `connected` flag in the state if you need to know.

## The effects at a glance

All 24 effects of the seven plugins:

| Plugin | Effect | Fields | Message back |
| --- | --- | --- | --- |
| store | `set` | `path`, `value` | none |
| store | `merge` | `path`, `value` | none |
| store | `remove` | `path` | none |
| store | `undo` | `steps?` | none |
| store | `restoreTo` | `timestamp` | none |
| dom | `mount` | `target`, `view`, `onMounted?` | `onMounted` |
| dom | `unmount` | `target` | none |
| dom | `focus` | `selector` | none |
| dom | `blur` | `selector` | none |
| http | `request` | `id`, `url`, `onSuccess`, `onError`, `method?`, `headers?`, `body?`, `responseType?` | `onSuccess` or `onError` |
| http | `cancel` | `id` | none |
| router | `listen` | `onChange` | `onChange` |
| router | `navigate` | `url`, `replace?`, `absolute?` | `onChange` of the listener |
| router | `back` | none | `onChange` of the listener |
| router | `forward` | none | `onChange` of the listener |
| time | `now` | `replyTo` | `replyTo` |
| time | `setTimeout` | `id`, `ms`, `replyTo`, `payload?` | `replyTo` once |
| time | `setInterval` | `id`, `ms`, `replyTo`, `payload?` | `replyTo` repeatedly |
| time | `cancel` | `id` | none |
| time | `cancelAll` | none | none |
| logger | `log` | `message`, `level?`, `data?` | none |
| ws | `connect` | `id`, `url`, `onMessage`, `onOpen?`, `onClose?`, `onError?` | the four callbacks |
| ws | `send` | `id`, `data` | none |
| ws | `close` | `id`, `code?`, `reason?` | `onClose` |

And the option of each plugin that a test replaces:

| Plugin | Option | What to pass |
| --- | --- | --- |
| store | `now`, `maxHistory` | A counter for timestamps. |
| dom | `document` | A jsdom document. |
| http | `fetch` | A fake `fetch`; it needs only `ok`, `status`, `statusText` and `json()` or `text()`. |
| router | `window` | A jsdom window, or a wrapper that hides a base path. |
| time | `now`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval` | A fake clock, or use `vi.useFakeTimers()`. |
| logger | `sink` | An object with `debug`, `info`, `warn` and `error` that collects calls. |
| ws | `create` | A function that returns a fake socket. |

## The ui-kit's own plugins

The framework has no plugin for `localStorage`, for random numbers or for the `<html>` element, because an application needs them only sometimes. The ui-kit, the site you are reading, has four plugins of its own. They show what an app-specific plugin looks like. All four are registered in its `main.ts`:

```ts main.ts
export const app = createApp<AppState>({
  app: shell,
  plugins: [
    store,
    createDomPlugin(),
    // the site is served under a base path; the app routes without it
    createRouterPlugin({ window: windowAt(root) }),
    createHttpPlugin(),
    createTimePlugin(),
    createRandomPlugin(),
    createSourcePlugin(),
    createDocsPlugin(),
    createThemePlugin(),
  ],
  mount: "#app",
});
```

| Plugin | Effect | Fields | Comes back |
| --- | --- | --- | --- |
| theme | `apply` | `look`, `vars`, `persist` | none |
| random | `int` | `max`, `replyTo` | `{ id: replyTo, payload: n }`, an integer from 0 up to but not including `max` |
| source | `load` | `path`, `onSuccess`, `onError` | `{ id: onSuccess, payload: { path, text } }`, or `{ id: onError, payload: path }` |
| docs | `load` | `slug`, `lang`, `onSuccess`, `onError` | `onSuccess` with the finished page, or `onError` with the slug |
| docs | `run` | `template`, `state`, `onSuccess` | `onSuccess` with the compiled and run demo |
| docs | `remember` | `lang` | none |

- **theme** is the only code that touches `<html>` for the look of the site: the `dark` or `light` class, the CSS variables, the `data-style` attribute, and the choice saved in `localStorage`. The application computes the variables with a pure function and returns `themeEffector.apply(look)`.
- **random** exists because a handler cannot call `Math.random()`. The next page, [writing your own plugin](page:plugins-custom), reads it line by line.
- **source** loads the source of a page for the Source tab. The files are bundled as lazy raw chunks by `import.meta.glob` with `query: "?raw"`, and the plugin loads one when the tab is opened. The application asks, and gets the text back as a message, then cuts it into highlighted lines with a pure function.
- **docs** is what makes this documentation work. `load` fetches the Markdown of a page and the demos of that page, loads the compiler on demand, compiles the demos and replies with the finished page; `run` does the same for the playground; `remember` saves the language.

Each follows the same shape as a built-in plugin: a type for the effect, an effector, a `createXPlugin` function with the outside world as a parameter, and a reply by `ctx.dispatch`.

## What you learned

- Seven plugins cover the DOM, the state, the network, the URL, time, the console and sockets. Each effect has fixed fields, and most replies are named by the effect itself.
- Things with an `id` (http requests, timers, connections) are replaced when the id is used again and can be cancelled. That gives you debounce and "latest wins" without state.
- Only `store` changes the state. Every other plugin answers with messages, and expected failures are messages too.
- An app-specific plugin is a small object with the same shape: an effect type, an effector and a `handle`.

Next: [writing your own plugin](page:plugins-custom).
