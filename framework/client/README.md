# pavlus

A framework where **application code is 100% pure functions** and all dirty work
(DOM, HTTP, time, storage, logging, routing) lives in plugins.

```
DOM event / HTTP reply / timer / WS frame
        │  plugins turn the outside world into messages
        ▼
  core:  app(message, state) → effects[]      ← pure, deterministic
        │  effects are plain data
        ▼
  plugins: dom · store · http · ws · time · logger · router · yours
```

How it works, with diagrams and a glossary: [docs/architecture.md](./docs/architecture.md).
See [ROADMAP.md](./ROADMAP.md) for status and design decisions.

## Template language

Indentation based, pug/slim style, compiled by a Vite plugin into two pure
functions: `render(state)` and `diff(prev, next)`.

```
nav.top-menu
  ul
    for item in topMenuItems key item.id          // key is optional, defaults to index
      li.top-menu__item(class:active=item.active)  // class:name=cond toggles a class
        a.top-menu__link(href=item.url @click=open(item.id)) {item.title}

main
  h1.header-1#page-title Pavlus framework
  if tabs.length > 0
    for tab, i in tabs key tab.id
      a.tab(@click.prevent=switchTab(i)) {tab.title}
  else if loading
    | Loading...
  else
    | Nothing here
```

| Feature         | Syntax                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Element         | `tag.class#id(attr=expr attr2="text {expr}" flag)`; tag defaults to `div`                                                                             |
| Text            | inline after the element, `\| text` lines, `{expr}` interpolation (`\{` escapes). Consecutive text lines are joined with a newline (a space in HTML)  |
| Attribute value | `name=expr` (no spaces; use `{a + b}` or parens for complex ones), `name="str {expr}"`; `false`/`null` removes the attribute, `true` renders it empty |
| Class toggle    | `class:active=cond`                                                                                                                                   |
| Event           | `@click=msg`, `@click=msg(arg)`, `@submit.prevent=save`, `.stop` modifier; dotted ids like `users.remove`                                             |
| Condition       | `if expr` / `else if expr` / `else`                                                                                                                   |
| Loop            | `for item in list [key expr]`, `for item, index in list`                                                                                              |
| Child view      | `import Row from "./row.pavlus"` at the top, then `+Row#row(id=item.id ...list)` (static); `+{expr}#name(props)` when the view is a value (dynamic)   |
| Routed child    | `+outlet`: renders the child the component's `routing` table selects for `state.route` ([docs/routing.md](./docs/routing.md))                         |
| Comment         | `// to end of line` (only after whitespace, so `http://` is safe)                                                                                     |

Expressions are a small pure subset of JS: paths (null safe), literals,
`! - + * / % == != === !== < > <= >= && \|\| ??`, `a ? b : c`, calls, arrays,
arrow functions with an expression body (`xs.filter(x => x.on)`; the params
shadow state names and are not counted as reads). Identifiers read the state
object (`items` is `state.items`) or a loop variable.

**Events are messages, not functions.** `@click=removeUser(user)` renders as
the data `{ id: "removeUser", payload: user }`. One argument becomes the
payload, several become an array. The DOM plugin adds `event: { type, value,
checked, key }`. Because handlers are data, `diff` can compare them by value.

## How update works

`diff(prev, next)` is generated per template and returns **patches as data**
(`text`, `attr`, `rmAttr`, `handler`, `insert`, `clear`, `remove`, `move`).
For every subtree the compiler knows which state it reads, so unchanged
subtrees are skipped with `===` checks, hidden items (`if user.isVisible`) cost
nothing, and `if` flips mount from `next` only or unmount from `prev` only.

> State must be treated as immutable (the store plugin does this). `diff`
> trusts `===`: mutating an object in place hides the change.

### Reading the compiled code

Compiled templates are plain, readable JavaScript, in dev as well as in the
bundle (Vite minifies only production builds). Open a `.pavlus` module in
DevTools' Sources (`users-list.pavlus?import`) to see `render` and `diff`:

- Variables are named after the template: `userList`, `prevUserKeys`,
  `liChildren`, `prevClass` (a number is added only where two names share a JS
  block).
- `// line 12: <li.users__item> (reads: user, selectedId)` comments say which
  template line a block comes from and which state it depends on (the guard
  right below is the dependency check).
- The helpers (`toText`, `diffKeyedList`...) are imported once from
  `@pavlus/client/runtime`; they are not repeated in every module.
  Change the module with `pavlus({ runtime: "..." })`.
- There is deliberately no source map: DevTools shows the generated code, not
  the template.

## Usage

```ts
// vite.config.ts
import { pavlus } from "@pavlus/client/vite";
export default { plugins: [pavlus()] };
// pavlus({ runtime: "..." }) changes where compiled templates import their helpers from
```

```ts
import { Component, createApp } from "@pavlus/client";
import { DomPlugin } from "@pavlus/client/plugins/dom";
import { createStorePlugin } from "@pavlus/client/plugins/store";
import view from "./dashboard.pavlus";

class Dashboard extends Component {
  view = view;
  // handlers: pure, no Date.now(), Math.random(), fetch, DOM...
}

createApp({
  app: new Dashboard(),
  plugins: [createStorePlugin({/* initial state */}), new DomPlugin()],
  mount: "#app", // renders the view here; `mounted` is the first message
});
```

A complete application is in [`../admin-app`](../admin-app), arranged the way
the framework intends: `app/` holds the pure isomorphic code (state, a
component per folder with its template), a thin `frontend/` mounts it into
the DOM, and a plain `backend/` serves the API from Postgres and
server-renders the same `app/` for hydration. Every repaint is explicit: a
store write answers with `{ prev, next }`, the component diffs its slice
and hands the patches to the dom plugin — a state change alone paints
nothing.

## Plugins

Plugins do everything with side effects; the application only returns effects.
Each plugin has a doc in [`docs/plugins`](./docs/plugins/main.md):

| Plugin           | Effects                                                                                                                                                                                                                                                                                                                                                      | Doc                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `plugins/dom`    | `mount`, `unmount`, `update`, `focus`, `blur`. `update(patches, target?)` applies what a component's view diff computed — the plugin never diffs or reads the state. A child's patches are scoped to its embed as they bubble up; without a target they belong to the one mount. Owns all listeners; hydrates a server render ([docs/ssr.md](./docs/ssr.md)) | [dom](./docs/plugins/dom.md)       |
| `plugins/store`  | `set`, `merge`, `remove` (each answers `onSuccess` with `{ prev, next }` when the change landed), `undo`, `restoreTo`. Every change is recorded with a `restoreEffect`                                                                                                                                                                                       | [store](./docs/plugins/store.md)   |
| `plugins/http`   | `request` (required `id`; same id cancels the previous), `cancel`; `settled()` for server rendering                                                                                                                                                                                                                                                          | [http](./docs/plugins/http.md)     |
| `plugins/ws`     | `connect`, `send`, `close` (by connection id)                                                                                                                                                                                                                                                                                                                | [ws](./docs/plugins/ws.md)         |
| `plugins/time`   | `now`, `setTimeout`, `setInterval`, `cancel`, `cancelAll` (by timer id)                                                                                                                                                                                                                                                                                      | [time](./docs/plugins/time.md)     |
| `plugins/logger` | `log`                                                                                                                                                                                                                                                                                                                                                        | [logger](./docs/plugins/logger.md) |
| `plugins/router` | `listen`, `navigate`, `back`, `forward`                                                                                                                                                                                                                                                                                                                      | [router](./docs/plugins/router.md) |

Build effects with each plugin's **effector** instead of writing the objects by
hand:

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

A plugin is `{ name, init?, handle(effect, ctx), onState?, dispose? }`;
`ctx.dispatch(message)` feeds results back. Effects needing an answer carry the
message id to reply with (`onSuccess`, `onError`, `replyTo`...). See
[docs/plugins/main.md](./docs/plugins/main.md) for the model and for writing your
own.

## Components

A component is **a function, or an instance of a class that extends
`Component`**. Every method of the class is the handler of the message with that
name, so there is no `switch`:

```ts
import { Component, type Message } from "@pavlus/client";

class UsersList extends Component<UsersState> {
  view = view; // import view from "./users-list.pavlus"
  load() {
    return [store.set("status", "loading"), request()];
  }
  loaded(msg: Message) {
    return [store.set("items", msg.payload.data)];
  }
  remove(msg: Message, state: UsersState) {
    return [
      store.set(
        "items",
        state.items.filter((u) => u.id !== msg.payload),
      ),
    ];
  }
  _helper() {
    /* `_name` and `#name` are never messages */
  }
}
export const usersList = new UsersList();
```

- Handlers are `(message, state, ctx) => Effect[]`. TypeScript does not infer the
  parameters of class methods, so annotate them (`Message`, your state,
  `ComponentCtx`), or declare a typed field: `load: Handler<UsersState> = (msg, state, ctx) => ...`.
- `createApp({ app })` takes the instance. A plain object, or a class that
  does not extend `Component`, is refused with an error that says what to
  write. `createApp({ mount })` renders its view.
- Never messages: `view`, `children`, `routing`, `dispatch`, names starting with
  `_`, `#private` members and what every object has. A subclass can override a
  handler and call `super`.
- The instance is shared by every message: keep it free of mutable state (purity
  is the author's responsibility).

**Routing.** A component can also list children by path, and put one
`+outlet` in its template where the matching page goes. Routing nests; a routed
child sees only the path below its base, and `router.navigate` from it is
relative to that base:

```ts
routing: {
  "/": { component: roles, key: "roles", name: "roles" },
  "/tasks": { component: tasks, key: "tasks" },   // /admin/tasks, which routes again
  "*": { view: notFoundView },
},
// the shell: routeChanged: (msg, _s, { setRoute }) => setRoute(msg.payload)
// pages load data in `enter`, and clean up in `leave`
```

See [docs/routing.md](./docs/routing.md). The same components render on the
server, and the browser hydrates the markup: [docs/ssr.md](./docs/ssr.md).

**Children.** A parent lists its children once. One name ties everything
together: the `#users` of the embed in the template, the key in `children`,
and `state.users`.

```ts
class Dashboard extends Component<DashboardState> {
  view = view;
  children: Children<DashboardState> = {
    // the annotation types the arrows below
    users: {
      component: usersList, // or select: (s) => s.usersComponent
      key: "users", // the child sees state.users
      props: (s) => ({ filter: s.filter }), // plus read-only inputs from the parent
    },
  };
  mounted(_msg: Message, _s: DashboardState, { send }: ComponentCtx) {
    return send("users", "load"); // the parent starts the child
  }
  "users.remove"(msg: Message) {
    return [/* the parent may observe its children */];
  }
}
export const dashboard = new Dashboard();
```

```
// dashboard.pavlus
div.dashboard
  input.filter(value=filter @input=filterInput)
  +{usersComponent}#users(...users filter=filter)
```

- `users.*` messages reach the child as `*`; its store paths and reply ids get
  the prefix back. The child never sees the parent.
- Events in the child template are sent as `users.<message>` automatically.
- `+{usersComponent}` is a value in the state: when it changes (list to
  table), the old DOM is replaced; when it stays, only the child's `diff`
  runs. The child's state lives under `users` and survives the swap.
- `createApp({ app: dashboard, mount: "#app" })` renders it; `mounted` is the first message.

**Keyed children.** An embed inside a loop can carry a key — `+Row#row(key=user.id)` —
and the boundary turns per element (`each`): the child sees only
`state.byId[7]`, its store paths root at `byId.7.…`, its replies come back as
`row.7.saved`, and messages of keys with no element are dropped. One name,
one address per row — details in [docs/child-views.md](./docs/child-views.md),
section 11.

Wrappers (`compose`, `mapMessage`, `mapEffects`, `namespace`, `withLogging`)
work on functions and components alike (they return functions). Purity of app code is the author's responsibility: the
framework does not police it. Design notes: [docs/child-views.md](./docs/child-views.md).

## Editor support

A tree-sitter grammar and a Zed extension (highlighting, brackets, comments) are in
[`editors/`](./editors); install with `./editors/zed/dev-extension.sh`.

## Development

```sh
npm install           # from the workspace root
npm run format        # from the workspace root: Prettier on every .ts file (same result as saving in Zed)
npm test              # Vitest (jsdom for DOM tests)
npm run typecheck
npm run build         # Vite library build + .d.ts
npm run publish:dry   # JSR dry run (includes the slow-types check)
```

**Formatting.** Zed formats TypeScript on save with Prettier, 80 columns, 2
spaces. The workspace root pins the same Prettier version (3.9.10) and the two
options Zed would pass (`.prettierrc.json`), so `npm run format` and saving in
Zed produce the same bytes, and a file written by a tool needs no reformatting
when you open it.

The source is **erasable-syntax only** (`erasableSyntaxOnly` in
`tsconfig.json`): no enums, namespaces or constructor parameter properties, so
Node can run it with its built-in type stripping, which is how the app's
`vite.config.ts` loads the plugin.

Publish with `npx jsr publish`.
