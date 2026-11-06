# Declarative routing

Status: **implemented**. Working example: the shell of `applications/admin/frontend`
(`app.ts`, one level). Nesting is covered by the framework's own tests
(`src/component/routing.test.ts`, `src/plugins/dom/outlet.test.ts`). Where the
built version differs from the first proposal it is marked "as built".

## 1. What it looks like

A component declares which child shows at which path, and its template says
where with one line:

```ts
class AppShell extends Component<AppState> {
  view = view;
  routing: Routing<AppState> = {
    "/": { component: dashboard, key: "dashboard", name: "dashboard" },
    "/about": { view: aboutView }, // a page that is only a template
    "/admin": { component: admin, key: "admin" },
    "*": { view: notFoundView }, // nothing else matched
  };
}
// `createApp({ app: new AppShell(), plugins, mount: "#app" })`: nothing else.
// `mounted` and `routeChanged` are defaults of `Component` (section 4).
```

```
main.page
  +outlet
```

Routing nests. A routed child with its own `routing` sees only the part of the
path below its base and navigates relative to it, without knowing who embeds
it:

```ts
class Admin extends Component<AdminState> {
  view = view; // has `+outlet` and a tab bar: +Tabs#tabs(items=tabs base=route.base path=route.path)
  routing: Routing<AdminState> = {
    "/": { component: roles, key: "roles", name: "roles" }, // /admin
    "/tasks": { component: tasks, key: "tasks" }, // /admin/tasks, which routes again
  };
  "tabs.go"(msg: Message) { return [router.navigate((msg.payload as string) || "/")]; } // → /admin/tasks
}
```

## 2. Routing entries are children

A `routing` entry has the shape of a `children` entry (`component` or `select`,
`key`, `props`) plus:

| Field | Meaning |
|---|---|
| `view` | instead of `component`, for a page that has a template but no logic |
| `name` | the instance name (message prefix). Default: the last static path segment (`"/admin/tasks"` → `tasks`, `"/users/:id"` → `users`), `index` for `"/"`, `fallback` for `"*"` |

Everything that works for children works for routed children: messages
`admin.tasks.run.run` go down the tree, store paths and reply ids get the
prefix back at every level, `props` adds read-only inputs, `ctx.send("admin",
...)` works. Two children (routed or not) with the same name are an error that
names the fix (`name`). Routing adds:

1. **`route` in the child's state**, in handlers and in its template:

   ```ts
   { path: "/tasks", base: "/admin", params: {}, search: "", hash: "" }
   ```

   `path` is what is left *below* the child's base, `base` the path above and
   including it, `params` the `:name` captures of every level so far.
2. **Relative `router.navigate`.** A navigate leaving a routed child gets that
   child's base put in front (`"/tasks"` from `admin` becomes `/admin/tasks`;
   `"/"` means the page itself). `navigate(url, { absolute: true })` opts out.
   A template link needs no handler either: a message `navigate` whose
   payload is a url, also as `header.navigate` from an embedded template or
   `about.navigate` from a view-only page, becomes `router.navigate(url)` by
   default, relative to the component that receives it.
   *As built:* the innermost routed child adds the whole base once and marks
   the effect `absolute`, so levels above do not add theirs again.
   Plain `href`s are not rewritten: write `href="{base}{to}"`.
3. **`enter` and `leave` messages**, sent by `ctx.setRoute` (section 4):
   `enter` when a child becomes active (payload: its route), `leave` when it
   stops being active. A leaf page also gets `enter` again when only its own
   route changes (`/items/5` → `/items/7`, because `params` differ); a child
   that has `routing` delegates inner changes instead. A change of search or
   hash alone does not re-enter.

## 3. Matching

- A pattern matches the path exactly or as a prefix ending at a `/`
  (`"/admin"` matches `/admin` and `/admin/tasks`, not `/administrator`). `"/"`
  matches only exactly. `"*"` matches anything left. `:name` captures.
- The longest pattern wins, then declaration order. `"*"` is used only when
  nothing else matches. With no match and no `"*"` the outlet is empty.

## 4. Where the route comes from

One state key, `route`, at the top. The component that owns the location (the
shell) handles the router plugin's message and calls the context helper. It
needs no code for that: a component with `routing` has two default handlers,

```ts
mounted: () => [router.listen("routeChanged")],
routeChanged: (msg, _s, { setRoute }) => setRoute(msg.payload),
```

which an own `mounted` or `routeChanged` replaces. (`mounted` is the message
`createApp({ mount })` sends once the application is in the DOM.)

`setRoute(location)` is pure. It returns `store.set("route", ...)` plus the
`leave` and `enter` effects for the whole tree, computed by matching the
previous and the new route level by level: from the first level whose active
child differs, the old children leave (deepest first) and the new ones enter
(top down). Routed children never set the route; they receive it.

## 5. `+outlet`

A built-in (lowercase, so it cannot clash with an imported component, which
starts with a capital). It takes nothing after it. It compiles to a dynamic
embed whose view, instance name and state come from the matched entry:

- **Another page** (different view or name): the old content between the two
  markers is cleared and the new page rendered, like `+{expr}`.
- **The same page**: only its own `diff` runs.

*As built:* the compiled `render(state, idSuffix, messagePrefix, env)` and
`diff(prev, next, idSuffix, messagePrefix, env)` take a fifth argument, `env`:
the component that owns the template. That is how `+outlet` finds `routing`.

| Who passes `env` | to |
|---|---|
| `viewOf(component)`, done by `createApp({ mount })` (and `mountView(component, ...)` in tests) | the root template |
| a static `+Child#name` embed | `children[name]` or the routing entry named `name` |
| `+{expr}#name` | the value itself, when it is a component |
| `+outlet` | the matched entry's component |

Mounting a bare view whose template has an `+outlet` fails with an error that
says to mount the component. The DOM plugin itself only knows `View`:
`viewOf(component)` is the component's template closed over the component. Because an outlet's content depends on a child
state slice the template cannot name, the nodes around it are re-checked on
every state change (their change guards say "the route and the routed child"
in the generated code); the pages inside still skip everything unchanged.

## 6. Loading data: `enter` instead of a table

A page that needs data handles `enter`; nothing in the shell lists pages:

```ts
class Roles {
  enter() { return this.load(); } // the router activated this page
  load() { return [store.set("status", "loading"), http.request({ ... })]; }
}
```

## 7. Not done

- Guards (redirect when not allowed) and redirects as route entries.
- Query-string parsing (`route.search` is the raw string).
- A `routing` entry with `props` for view-only pages is supported; typed
  `route.params` are not (everything is `Record<string, string>`).
- Lazy-loaded pages.
