# Architecture: a pure application, a small core, plugins at the edge

pavlus is three rings. The inner one is the application and it is pure: given a
message and the state, it returns a list of effects, and does nothing else. The
middle one is the core: one loop that feeds messages in and hands effects out.
The outer one is the plugins: the only code that touches the browser, the
network, the clock, storage. The same core runs on the server
(`@pavlus/server`), with other plugins.

```
                    ┌────────────────────────────────────────────┐
  DOM event         │ plugins                                    │
  HTTP reply   ───▶ │  turn the world into messages              │
  timer tick        │  and effects into actions on the world     │
  WS frame          └───────────────┬────────────▲───────────────┘
                                    │ message    │ effects (data)
                    ┌───────────────▼────────────┴───────────────┐
                    │ core                                       │
                    │  effects = app(message, state)             │
                    │  for each effect: plugins[effect.plugin]   │
                    └───────────────┬────────────▲───────────────┘
                                    │            │
                    ┌───────────────▼────────────┴───────────────┐
                    │ application: pure                          │
                    │  components, views, view models            │
                    └────────────────────────────────────────────┘
```

## 1. The contract: three plain types

Everything crosses the rings as data (`framework/core/src/types.ts`):

```ts
interface Message { id: string; payload?: unknown; event?: DomEventInfo; ctx?: Record<string, unknown> }
interface Effect  { plugin: string; type: string; [key: string]: unknown }
type AppFn<S>   = (message: Message, state: S) => Effect[];
```

A **message** is what happened: `{ id: "users.loaded", payload: [...] }`. An
**effect** is what should happen: `{ plugin: "http", type: "request", url, onSuccess: "loaded" }`.
The application is a function from one to the other. Because both are plain
objects they can be logged, serialized, replayed, and shown in the debug panel
without any cooperation from the code that produced them.

A plugin is the small interface that turns effects into actions and the world
into messages:

| Member                 | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `name`                 | matches `effect.plugin`                                   |
| `handle(effect, ctx)`  | does the side effect; may `ctx.dispatch(message)` later   |
| `init?(ctx)`           | start listening (events, the URL, a socket)               |
| `onState?(state, ctx)` | observe state changes (devtools, persistence)             |
| `dispose?()`           | stop everything                                           |
| `getState?()`          | marks the one plugin that owns the state: the store       |

## 2. One tick

`createApp({ app, plugins, init, mount })` wires the rings
(`framework/core/src/app.ts`, with `mount` added by `@pavlus/client`). Then, for
every message:

1. `dispatch(message)` queues it. Messages are processed strictly one at a time;
   a dispatch from inside a tick joins the queue.
2. `effects = app(message, state)`: the only call into the application.
3. Each effect goes to the plugin named in it, in the order returned.
4. If the state object changed identity, every plugin hears `onState(next)`.
5. A safety valve stops a message loop after a configurable number of messages
   in one tick.

Nothing else happens. The core does not know what a DOM is, what HTTP is, or
what the state looks like.

## 3. Painting is an effect too

The store plugin owns the state. A write (`store.set("items", list)`) replaces
the state immutably and, when it changed something, answers with a message
carrying `{ prev, next }`. The component that cares (its `paint` handler) diffs
its own view and returns the patches as an effect:

```ts
paint(msg: Message): Effect[] {
  const { prev, next } = msg.payload as { prev: State; next: State };
  return [DomPlugin.update(viewOf(this)!.diff(prev, next))];
}
```

So the sequence for a click is: the DOM plugin dispatches `{ id: "pick",
payload: 3 }` → the handler returns `store.set(...)` → the store answers `paint`
→ the handler returns `DomPlugin.update(patches)` → the DOM plugin applies them.
Four plain-data hops, each visible in the debug panel, none of them hidden
inside a framework scheduler. `paintOnWrite(component)` is the helper that gives
every store write without a reply the `paint` reply.

Two consequences:

- **State is treated as immutable.** The store uses structural sharing, so an
  untouched branch keeps its identity and `diff`'s `===` guards are exact.
- **Repainting is a decision of the application**, not a reaction of the
  framework. A component can choose not to paint, or to paint something else.

## 4. Components: handlers with a name

A component is a class extending `Component` (or a plain function). Each method
is the handler of the message with that name; `view`, `children`, `routing` and
`_`-prefixed helpers are not handlers:

```ts
export class ProjectsPage extends Component<ProjectsState> {
  view = view;                                     // the compiled template

  enter(_msg, state) { return [...setStatus("loading", state.items), this._list()]; }
  listed(msg, state) { ... return [store.set("rows", rows), store.set("items", items), ...]; }
  listedFailed(msg, state) { return [...setStatus("failed", state.items), store.set("error", failure(msg))]; }
}
```

Children are declared once, `children: { cart: { component: cartBlock, key: "cart" } }`,
and `namespace` does the plumbing: a message `cart.add` reaches the child as
`add`, the child's `store.set("count", n)` is re-rooted to `cart.count`, its
reply ids get the `cart.` prefix back. The instance name in the template
(`+Cart#cart`), the `children` key and the state slice are the same string. A
parent may observe a child's message by defining a method with the full name
(`"cart.add"`).

Routing is the same idea with the URL as the key: a `routing` table maps paths
to children, `+outlet` in the template renders the one that matches, and the
router plugin reports the URL as a message.

## 5. The same core on the server

`@pavlus/core` has no DOM and no Node APIs. `@pavlus/server` builds on it with
server plugins (http, ws, pg, redis, pages for SSR) and per-request flows: a
request is a message with a `ctx` (its id, its connection), the core stamps that
`ctx` on every effect the message produces, and plugins copy it onto their
replies, so a flow keeps its context from the first message to the last without
any global state. `applications/diagram-programming/server/` is a full example.

## 6. Where the lines are drawn

| Belongs in the application                            | Belongs in a plugin                                 | Belongs in the core |
| ----------------------------------------------------- | --------------------------------------------------- | ------------------- |
| deciding what to do with a message                    | doing it (fetch, DOM, timers, storage, sockets)     | the queue and the loop |
| shaping the state for the view (view models)          | owning mutable things (listeners, sockets, timers)  | the plugin registry |
| the views: `render` and `diff`                        | applying patches to real nodes                      | stamping `ctx`      |
| choosing when to paint                                | reporting the world as messages                     | the safety valve    |

The invariants that keep this honest (`framework/docs/architecture.md`,
section 9): application code is pure (a contract, not an enforcement), effects
and patches are plain data, `diff` trusts `===`, generated code stays readable.

## 7. Where to read next

- [plugins.md](./plugins.md): the outer ring in detail, and how to write one.
- [functional-programming.md](./functional-programming.md): what purity buys
  in composition and tests.
- `framework/docs/architecture.md`: the same architecture file by file, with
  sequence diagrams and a reading map.
