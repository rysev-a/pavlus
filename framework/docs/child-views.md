# Child views and component composition (design)

Status: **implemented** (decisions in section 8). Working example:
[`admin-app/frontend`](../../admin-app/frontend). Differences from the first
draft are marked "as built".

## 1. The scenario

- `Dashboard` is a component with a template. When it is mounted it must start
  loading users.
- `UsersList` is a component with its own template, used inside the dashboard.
- When the users arrive, only the list must re-render, and data has to flow
  from the dashboard (component and template) down to the users list
  (component and template).
- The list component must be replaceable (a table instead of a list), also
  while the app is running.

## 2. Two layers, one name

Composition has a **logic layer** (components: messages in, effects out) and a
**view layer** (templates: state in, DOM patches out). They are tied together
by one **instance name per embedded child** (`users` below):

| Layer    | What the name does                                                 |
| -------- | ------------------------------------------------------------------ |
| Messages | prefix of every message the child's template sends: `users.select` |
| Logic    | the key in the parent's `children` that routes `users.*` messages  |
| State    | the key where the child's state lives: `state.users`               |

Rule to remember: **`users` in the template, `users` in `children`, `users` in
the state.**

## 3. Components as classes

A component is **a function, or an instance of a class that extends
`Component`**. **Each method is a message handler named by the message id.**
(This design first allowed plain objects built with `defineComponent({...})`;
they were removed in favour of classes only: every key became a method, and
`view` / `children` / `routing` became fields.)

```ts
// users-list.ts: pure, knows nothing about the dashboard
import view from "./users-list.pavlus";

class UsersList extends Component<UsersState> {
  view = view; // the template of this component
  load() {
    return [
      set("status", "loading"), // paths are relative to the child
      {
        plugin: "http",
        type: "request",
        id: "users",
        url: "/api/users",
        onSuccess: "loaded",
        onError: "failed",
      },
    ];
  }
  loaded(msg: Message) {
    return [set("items", msg.payload.data), set("status", "idle")];
  }
  failed() {
    return [set("status", "failed")];
  }
  select(msg: Message) {
    return [set("selectedId", msg.payload)];
  }
  remove(msg: Message, s: UsersState) {
    return [
      set(
        "items",
        s.items.filter((u) => u.id !== msg.payload),
      ),
    ];
  }
}
export const usersList = new UsersList();
```

Rules:

- Handler signature: `(message, state, ctx) => Effect[]`; annotate the
  parameters (TypeScript does not infer them for class methods). `this` is the
  component, so helpers and constructor config (`new UsersList(20)`) work, and
  a subclass can override a handler and call `super`. Instances should be
  immutable; keeping mutable fields makes the component impure, which is the
  author's responsibility.
- A message whose id has no matching method returns `[]`. A handler must
  return an array, otherwise the error names the handler.
- Not message ids: `view`, `children`, `routing`, `dispatch`, names starting
  with `_`, `#private` members, and anything on `Object.prototype`. Dotted ids
  are possible with quoted names (`"users.remove"() {}`).
- A function component is still valid: `(msg, state) => Effect[]`.
- `createApp({ app })` accepts a function or a component instance;
  `createApp({ mount })` renders a component instance's view. `dom.mount`
  takes a `View`: `viewOf(component)` turns a component into one.

### Children and calling them

A parent declares its children once; routing, state slice and reply ids come
from the existing `namespace` logic.

```ts
class Dashboard extends Component<DashboardState> {
  view = dashboardView;
  children: Children<DashboardState> = {
    users: {
      component: usersList,
      key: "users", // child state = state.users
      props: (s) => ({ filter: s.filter }), // + read-only inputs
    },
  };
  mounted(_msg: Message, _s: DashboardState, { send }: ComponentCtx) {
    return send("users", "load"); // parent starts the child
  }
  filterInput(msg: Message) {
    return [set("filter", msg.event?.value ?? "")];
  }
}
export const dashboard = new Dashboard();
```

- `users.*` messages go to `usersList` automatically (prefix stripped; store
  paths become `users.items`; reply ids become `users.loaded`).
- `ctx.send(name, id, payload?)` returns the child's effects for a message the
  parent sends to it. It is pure: it just calls the child's handler.
- As built: `component` is the child itself; `select: (state) => component`
  is the alternative for components that are values in the state (a function
  in `component` would be ambiguous, since a function is also a valid
  component).
- Messages for a child also reach the parent's own handler of the same id
  (`"users.loaded"() {}`), so a parent can observe its children. The child
  never sees the parent.

## 4. Templates

```
// users-list.pavlus. State = the props passed by the parent.
section.users
  h2 Users ({items.length})
  if status === "loading"
    p.status Loading...
  ul.users__list
    for user in items key user.id
      if !filter || user.name.includes(filter)
        li.users__item(class:users__item--selected={user.id === selectedId} @click=select(user.id))
          span {user.name}
          button(@click.stop=remove(user.id)) remove
```

```
// dashboard.pavlus
import UsersList from "./users-list.pavlus"

div.dashboard
  h1 Admin panel dashboard
  input.filter(value=filter @input=filterInput)
  +UsersList#users(...users filter=filter)
```

- `+Name#instance(props)` embeds a child. Props are expressions evaluated on
  the parent's state; `...expr` spreads an object. The result is the child
  template's state. Without `#instance` the name is the camel-cased component
  name (`usersList`).
- Events in the child get the instance prefix automatically, so
  `@click=select(user.id)` reaches the parent as `users.select`.

## 5. Changing the child: three levels

"What if I want to change the list component?"

1. **At edit time**: change the `import` line.
2. **By state, closed set** (list or table): ordinary `if` / `else if`, both
   branches imported. State stays plain data (`mode: "table"`).
   ```
   if mode === "table"
     +UsersTable#users(...users filter=filter)
   else
     +UsersList#users(...users filter=filter)
   ```
3. **By value, open set** (the component comes from the state or from the
   parent as an input): `+{expr}`. As built, this is the **strict form**:
   `+Name` only accepts an imported name, and an unknown `+Name` is a compile
   error that points you to `+{Name}`. A dynamic embed always needs an
   instance name.
   ```
   +{UsersList}#users(...users filter=filter)    // UsersList = state.UsersList
   +{tab.component}#content(...tab.state)
   ```
   The value is a `View` or a component object (the template uses `.view`).
   A template cannot see your TypeScript imports: it only knows its state.

### What `diff` does when the value changes

`patch(prev: { UsersList: A }, next: { UsersList: B })`

A dynamic embed is delimited by two markers, exactly like `if`. Generated
`diff`:

```js
const vp = p.UsersList, vn = n.UsersList;
if (vp !== vn) {                       // compared by identity
  if (vp) out.push({ op: "clear", from: "5s" + sfx, to: "5e" + sfx });
  if (vn) out.push({ op: "insert", before: "5e" + sfx,
                     nodes: view(vn).render(propsN, sfx + "/5", ns + "users.") });
} else if (vn && /* props deps changed */) {
  out.push(...view(vn).diff(propsP, propsN, sfx + "/5", ns + "users."));
}
```

- Different value: old DOM and its listeners are removed, the new template is
  rendered from scratch, and nothing is diffed across two unrelated templates.
- Same value: normal `diff` of that child, guarded by the props' dependencies.
- `null` / `undefined`: renders nothing.

### And the logic side

The logic child can follow the same value:

```ts
children: {
  users: { select: (s) => s.UsersList, key: "users" },
},
```

Caveats to keep in mind:

- **The child's state is the parent's state** under `users`, so it survives a
  swap. The message that swaps the component should reshape or reset it:
  `[set("UsersList", usersTable), set("users", { items: [], status: "idle" }), ...]`.
- **Components in the state are not JSON.** The store works (values are kept
  as they are, never cloned), but a serialized history or a devtools view will
  not show them. If you need serializable state, use level 2, or keep a string
  in the state and map it to the component in a function
  (`component: (s) => registry[s.usersKind]`) plus the same choice in the
  template with `if`.
- Never `store.set` a path _inside_ a component value (the store spreads
  plain objects and would drop the prototype of a class instance).

## 6. Compiler and runtime changes

| Area                   | Change                                                                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parser                 | `import X from "path"` header lines; `+Name#instance(props)` and `+{expr}#instance(props)` lines; `...spread` in the attribute list.                                                                                                                            |
| Codegen: signatures    | `render(state, sfx = "", ns = "")` and `diff(prev, next, sfx = "", ns = "")`. `sfx` (node id suffix) is what is hard-coded as `""` today; `ns` prefixes every event message id. Defaults keep all current behavior.                                             |
| Codegen: static embed  | render: `out.push(...Child.render(props, sfx + "/<nid>", ns + "users."))`. diff: guarded by the props' dependencies, calls `Child.diff(propsP, propsN, ...)`. No markers needed.                                                                                |
| Codegen: dynamic embed | Markers plus the identity check from section 5, built from the same code as `if`.                                                                                                                                                                               |
| Dependencies           | An embed reads the identifiers in its prop expressions (and in `{expr}`), so the parent skips the child when none changed.                                                                                                                                      |
| Metadata               | Compiled views export `meta.embeds` (instance names). As built, nothing checks it yet: a mismatch is not always a bug (a presentational child such as a footer has no logic, and a logic-only child has no markup), so a useful check needs an explicit opt-in. |
| Vite plugin            | The generated module keeps its `import`s; Vite resolves them through the same plugin. `compileToView` (tests) takes a `{ components }` map.                                                                                                                     |
| DOM plugin             | Patches are unchanged: ids are unique per mount thanks to `sfx`. New: `onMounted` option on `mount`; `mount` accepts a component and uses `.view`.                                                                                                              |
| Core                   | `createApp({ app })` accepts a function or a component instance.                                                                                                                                                                                                |
| `component/`           | the `Component` base class (`dispatch`), `toHandler` (function / instance), `children` routing built on the existing `namespace`, `props` option, `ctx.send`.                                                                                                   |

Unchanged: the pure `render`/`diff` split, patches as data, the main invariant
test. It gets extended with nested static and dynamic children.

## 7. Left out for now

- **Slots**: content passed into a child (`+Card(title=t)` with an indented
  body, also covers `task.md`'s `{tab.content()}` "as element"). Plan: the
  parent hands the child `{ render, diff }` closures that capture both its prev
  and next state; the child places them with a `slot` node.
- **Template lifecycle hooks** (`@mounted=load`, `@unmounted=...`): the DOM
  plugin would send the message when nodes are inserted/removed. For now the
  parent starts children explicitly (`ctx.send`).
- **Typed props** generated from the child template.
- **Recursive templates** (a tree component embedding itself).
- **`switch` / `case` in templates**: sugar over `if` / `else if` with `===`.
  Trivial to add if the chains get long.

## 8. Decisions (all accepted)

1. **Component forms**: a function, or a class extending `Component`, handlers
   named by message id, `(message, state, ctx)`. It removes the `switch`.
2. **`children` with `ctx.send`** for parent → child calls, and routing by
   instance name. The alternative is calling `namespace(...)` by hand as today.
3. **Embed syntax**: `+Name#instance(...props)`, with `import` header, `+{expr}`
   for computed values.
4. **Name resolution**: the strict form. `+Name` is static and must be
   imported; dynamic values are `+{expr}`.
5. **Swap semantics**: different value means clear and re-render; the child's
   state slice is kept and the swapping message must reset it.
6. **Instance names are static per embed site**; identity inside loops
   travels in payloads (`remove(user.id)`), not in prefixes.
7. **Lifecycle**: `onMounted` on `dom.mount` plus explicit `ctx.send`;
   template hooks later.

## 9. Implementation status

Done: component forms and `children` routing (`src/component`), parser and
codegen for `import`, `+Name#instance(props)`, `+{expr}#instance(props)` and
`...spread`, `sfx`/`ns` parameters, `meta`, `dom.mount({ onMounted })` and
mounting a component, `createApp` taking any component form, the rewritten
example, property tests for nested and swapping children (the
"`diff` equals fresh render" invariant over random states, with the DOM
checked for leaked nodes and listeners), display `tag` on `ChildSpec` and
`Component` (the debug panel's Apps tab labels), and `setComponentTrace` —
a global receive/emit hook per component boundary that the debug agent
drains into per-component input/output (the Apps tab's **io** view), and
`DomPlugin.update` — the plugin applies what a component computed (below).

Not done: template slots (content passed into a child, section 7), template
lifecycle hooks, typed props, recursive templates, `switch`/`case`
(section 7).

## 10. Children that paint themselves (implemented)

A child embedded with `+Name#key(props)` is rendered by the parent's own
view, in place — there is nothing to mount by hand. Painting follows the
same hierarchy as messages and state:

- **Down (a lens):** the child sees only its slice (`state[key]` plus props);
  its store writes are rooted at `key`; its events are prefixed `key.`.
- **Up (enrichment):** a child's write answers `paint` with the whole
  state's `{ prev, next }`; the boundary slices the answer to the child's
  slice, and the child's paint handler diffs its own view:

```ts
// user-list/user-list.ts — the child knows nothing of its surroundings
paint(msg: Message): Effect[] {
  const { prev, next } = msg.payload as { prev: ListState; next: ListState };
  return [DomPlugin.update(view.diff(prev, next))]; // no target, local ids
}
```

The patches bubble up with the effect, and every boundary adds its own
segment: node ids get the embed's `"/nid"` in front (so they address the
nodes the parent's render created), event messages the `"key."` prefix.
By the root they address the application's one mount; nested children
compose, because each boundary only adds its own segment. The dom plugin
never diffs, never reads the state, and knows nothing about components; it
applies the patches it is given.

- What a child cannot paint is appearing and disappearing: closing a form
  writes its slice to `null`, which the child's template cannot render. Those
  writes answer something else (`done`, `closed`), and the parent — whose
  diff mounts and unmounts the embed (`if edit` in its template) — paints the
  change itself.
- A root that wants "repaint everything on any write" wraps itself in
  `paintOnWrite(app)` and gives its `paint` handler the root diff — the
  outlet and the embedded children repaint with it, since the root's diff
  reaches into both.
- A component is a mini-application: nothing in this wiring differs between
  the whole app and a child, they compose hierarchically.
- On the server the shell renders whole, children included, from the same
  state; the browser hydrates the whole page at once (`adopt` walks the
  rendered nodes and attaches ids and listeners).
