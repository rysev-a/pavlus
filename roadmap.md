# Roadmap: lazy components from the server, and pattern matching in templates

Status: **design proposal**. Nothing here is implemented. It extends
[framework/ROADMAP.md](./framework/ROADMAP.md) (the milestones that are done
and the decisions D1-D10) and is written against the code as it is today; every
"today" statement below was checked in the source.

| # | Topic | Why now | First step |
|---|---|---|---|
| 1 | [Components loaded when they are needed](#1-components-loaded-when-they-are-needed) | the ui-kit ships as **one 4.8 MB script (918 kB gzipped)**; an admin-app page pays for every page | a `lazy` plugin and `select`-based children, no framework change |
| 2 | [Pattern matching in templates](#2-pattern-matching-in-templates) | `if` / `else if` chains and one `class:` toggle per value are the commonest thing in the 44 ui-kit templates | `match` as sugar over `if`, then real patterns |

The two combine: the loading view of a lazy component is a `match` on its
status (see [section 3](#3-how-the-two-fit-together)).

---

## 1. Components loaded when they are needed

### 1.1 What you asked for

> When I open a page or a view I see "loading" while the component loads from
> the server as a simple JS function or class. On the server it is already
> compiled. After it has loaded, events are emitted, like *mount component*.

That is four things: **(a)** the component is not in the first bundle,
**(b)** what arrives is compiled code, as plain as a function or a class,
**(c)** the user sees a loading state meanwhile, **(d)** the framework tells the
application when the component is loaded and mounted.

### 1.2 What there is today

Facts, from the source:

- A template is compiled by the Vite plugin into `{ render, diff }`
  (`framework/client/src/vite/mod.ts`); a page imports it statically
  (`import view from "./x.pavlus"`), so every template is in the first bundle.
- A routing entry holds the component **instance** or a view
  (`framework/client/src/routing/mod.ts`, `resolveOutlet`). `+outlet` and
  `children` resolve it synchronously when they render.
- A **dynamic embed** `+{expr}` takes a view or a component *value* from the
  state. `asView(value)` returns its view (`runtime/helpers.ts`); when the view
  is another one than before, the old DOM is cleared and the new one rendered,
  otherwise `diff` runs (`compiler/emit/diff.ts`, `diffEmbed`). This is the hook
  that makes lazy loading cheap: *a value that is `null` today and a view
  tomorrow already works*.
- A `children` entry may use `select: (state) => component | null`; `null` means
  "no child, its messages are ignored" (`component/mod.ts`, `childHandler`).
  So a child that is **not there yet** is already expressible.
- **Lifecycle messages today**: the root gets `mounted` once (`core`, the
  `onMounted` of the dom `mount` effect). A routed child gets `enter` / `leave`
  (`setRoute`). An embedded child gets **nothing**: no `mounted`, no
  `unmounted`.
- Plugins already do lazy things: the ui-kit's **`source` plugin** loads a file
  with a dynamic `import()` when asked and answers with a message
  (`framework/ui-kit/src/source.ts`). That is the shape to copy.
- SSR serializes a component value in the state **by name**, through a
  `components` map (`applications/admin/frontend/app.ts`, `serializeState`). So the state
  holding a component value is already a known awkward spot: functions do not
  belong in a store with history and time travel.

### 1.3 The design

Three layers, each small.

#### Layer A: the artifact, a factory function

What the server sends for a component is **an ES module whose default export is
a function**. No imports of its own: the host passes in everything.

```js
// GET /_pavlus/components/reports@3f9a1c.js   (compiled and minified on the
// server, immutable, cacheable forever because the hash is in the name)
export default function define({ Component, runtime, effectors, component }) {
  const { toText, diffKeyedList } = runtime;           // helpers the compiled code uses
  const { store, http } = effectors;

  const view = {                                       // the compiled template
    render(state, sfx, ns, env) { /* ... uses toText ... */ },
    diff(prev, next, sfx, ns, env) { /* ... */ },
  };
  const Chart = component("chart");                    // a dependency: another lazy component

  class Reports extends Component {                    // the logic: a class
    view = view;
    mounted() { return [http.request({ id: "reports", url: "/api/reports",
                                       onSuccess: "loaded", onError: "failed" })]; }
    loaded(msg) { return [store.set("items", msg.payload.data)]; }
  }
  return { component: new Reports(), initial: { items: [], status: "idle" } };
}
define.api = 1;                                        // the host API it was compiled for
```

Why a **factory** and not "an ES module that imports `@pavlus/client`":

1. **One `Component` class.** `toHandler` refuses an object that is not an
   `instanceof Component` (`component/mod.ts`). A module that bundled its own
   copy of the framework would fail that check. The factory receives the host's
   class.
2. **No import maps, no bundler on the client.** `import(url)` (cacheable,
   CSP-friendly, can carry `integrity`) is all the client needs.
3. **It is the "simple function" you described.** A server can even generate it
   per request, which makes the next point possible.
4. **A version contract.** `define.api` lets the host refuse a module compiled
   for a host it does not match, instead of failing in a confusing way.

Dependencies between lazy components (`import Chart from "./chart.pavlus"`
inside `reports.pavlus`) become `component("chart")` and a line in the manifest
(`deps: ["chart"]`), so the loader fetches them in parallel and the factory
runs only when they are ready.

#### Layer B: a registry and the `asyncComponents` plugin

The plugin owns the mutable part: the registry (`name → status, component, view,
initial, error`), the in-flight requests and the retries. The application only
sees effects and messages (purity as everywhere).

```ts
// effects (built with asyncComponentsEffector, like the other plugins)
asyncComponents.load({ name: "reports", onLoaded: "reports.ready", onFailed: "reports.failed" })
asyncComponents.preload("reports")      // hover, idle, or the router telling it a link is near
asyncComponents.unload("reports")       // free the module and its state slice

// messages the plugin sends back
{ id: "reports.ready",  payload: { name, version } }
{ id: "reports.failed", payload: { name, error, attempts } }
```

- **De-duplicated**: two `load` of one name share a request.
- **Retry** with backoff, a **timeout**, and `failed` after N attempts; a manual
  `retry` is just another `load`.
- **Messages to a component that is still loading** are queued (bounded) and
  flushed when it is ready, or dropped; configurable, default drop with a log.
- The module is evaluated **once**; the instance and `initial` are registered.

How a component that arrives *later* joins the message routing: two options.

| Option | How | Needs |
|---|---|---|
| **P0 (today's code)** | a child with `select: () => registry.componentOf("reports")` in `children`. `null` until loaded, the instance after | nothing in the framework |
| **P1** | a `ComponentRef`, plain data `{ lazy: "reports" }`, accepted wherever a component is (`children`, `routing`, `+{expr}`); `asView` and `toHandler` resolve it through the host registry | a small change in `asView`, `childHandler`, `routeComponent` |

P1 is the cleaner one, because **the state then holds data, not functions**: it
serializes, it time-travels in the debug panel, and the SSR `components` map is
not needed for lazy components.

#### Layer C: lifecycle events

Today an embedded child never learns it was mounted. That is the missing piece
for "after it is loaded, emit events like mount component", and it is useful
without any lazy loading.

- **`mounted`** to an embedded or routed child, after its nodes are in the DOM
  (the dom plugin knows when: it applies the `insert` patch). Namespaced like
  any child message, so the parent can observe it as `"reports.mounted"`.
- **`unmounted`** when its range is cleared.
- For lazy components the order is the contract:

```
parent asks:        asyncComponents.load(reports)
                    reports.loading         (observable by the parent; the view shows the loading arm)
module arrives:     reports.ready           (registry now has the component)
state changes:      the +{ref} embed re-evaluates: a view instead of null, so it renders
dom inserts:        reports.mounted         (the child's own handler starts its data request)
                    enter                   (routed child only, after `ready`: never before the code exists)
on failure:         reports.failed          (the failed arm, with Try again -> load)
```

All of them are ordinary messages and effects, so the **debug panel** shows them
with their delays (how long the module took) with no extra work.

#### The view: what the user sees while it loads

With the `ComponentRef` and the `match` of [section 2](#2-pattern-matching-in-templates):

```
match reports.status
  "ready"
    +{reports.ref}#reports(range=range)
  "failed"
    div.ui-alert.ui-alert-danger
      p.ui-alert-title Could not load the reports
      button.ui-button.ui-button-outline.ui-button-sm(@click=retryReports) Try again
  _
    div.ui-skeleton(style="height: 240px")
```

and, for a whole page, in the routing table:

```ts
routing: {
  "/reports": { lazy: "reports", key: "reports" },   // shows the shell's fallback until ready
}
```

Until pattern matching exists the same view is written with `if` / `else if`,
which is why that step is first in the order of work.

### 1.4 The server

| Mode | What happens |
|---|---|
| **Build** | the Vite plugin gets a `lazy` option (a list of templates or a glob). For each it emits `components/<name>@<hash>.js` (the factory, minified), plus **`manifest.json`**: `{ name: { url, integrity, deps, size, api } }`. Shared helpers stay in the host, not in each file |
| **Dev** | a middleware compiles `.pavlus` on request (`compileTemplate` already exists) and invalidates on change |
| **Production** | the files are static, `Cache-Control: immutable`. The manifest is small and short-lived; the app shell embeds its hash so a shell and its components always match |
| **Dynamic backend** | a Node backend (like `applications/admin/backend`) may serve a component **per user**: `GET /components/admin-panel` answers 403 for a visitor who may not have it. That is delivery, not authorization: the API must still check |

Version skew: a tab that is open during a deploy keeps asking for the hashes it
knows, so old files stay available for a few releases.

### 1.5 Security and trust

Loading code from a server is running that code. The defaults must be safe:

- **Same origin** only, unless an allow-list is configured.
- **Integrity**: the manifest carries a hash and the plugin checks it
  (`fetch` + digest, then `import` of a blob URL; or `<link rel=modulepreload
  integrity>`).
- **No `eval`, no `new Function`**: only `import()`, so a strict
  `Content-Security-Policy: script-src 'self'` keeps working.
- A throwing `define()` is a **failed** load, not a crashed app.
- Third-party components that must not be trusted need a sandbox (iframe or
  worker). That is a different product; out of scope here.

### 1.6 Server rendering and hydration

A server render that includes a lazy component serializes `status: "ready"` and
emits `<link rel="modulepreload">` for it. The client must **load before it
hydrates that subtree**: hydrating markup whose component is missing would
mismatch (hydration falls back to a client render, as it does today for any
mismatch). Plan: the dom plugin waits for the registry's `ready` promise for the
refs it finds in the serialized state, then hydrates.

### 1.7 Order of work and acceptance

| Phase | Deliverable | Done when |
|---|---|---|
| **P0** | In the ui-kit, no framework change. A `lazy` plugin around `import()` of Vite-split chunks, children with `select`, a skeleton while loading | the ui-kit's first script is under **400 kB gzipped**; every template is its own chunk; opening one shows the skeleton, then the page; a blocked chunk shows the failed arm and "Try again" works. Measured by the existing page-visit test with a stub loader, and by a bundle test |
| **P1** | `ComponentRef`, the registry in the host, `mounted` / `unmounted` for embedded children, `asyncComponents` effects and messages, with unit tests (jsdom, a fake loader, fake timers for retry) | a lazy child gets `mounted` exactly once after its view is inserted; messages sent while loading are queued and flushed; `unload` removes it; the state round-trips through `serializeState` |
| **P2** | `routing: { lazy }` and `enter` after `ready`; `preload` on link hover / idle and from `router` | navigating to a lazy route never calls `enter` before the code exists; a hovered link has its chunk before the click |
| **P3** | server-compiled factories, `manifest.json`, integrity checks, dev middleware, `define.api` check | a component compiled by the server runs in a host that never saw its source; a changed byte fails the integrity check; an old `api` is refused with a clear message |
| **P4** | SSR + hydration order, version skew, devtools panel rows for loads | an SSR page with a lazy component hydrates without a mismatch; the panel shows each load and how long it took |

### 1.8 Open questions

1. **Factory or plain ES module** as the artifact? The factory wins on the shared
   `Component` class; a plain module wins on tooling. A build could emit both.
2. **Queue or drop** messages for a component that is still loading?
3. **Where does `initial` go**: the host merges it under the child's `key` at
   register time (proposed), or the application passes it?
4. **Unloading** a component that holds state: keep the state slice, or drop it?
5. Does a lazy component **share** helpers with the host (smaller files, tight
   coupling to `define.api`) or carry its own (bigger, decoupled)?

---

## 2. Pattern matching in templates

### 2.1 The problem

Look at the ui-kit's own templates. The same shape, again and again:

```
// the toast icon (pages/sonner)
if toast.kind === "success"
  span.k-icon.k-icon-check
else if toast.kind === "error"
  span.k-icon.k-icon-alert
else
  span.k-icon.k-icon-info

// the tab body (pages/tabs)
if active === "account"
  ...
else if active === "password"
  ...
else
  ...

// a status pill (pages/data-table): one toggle per value
span.ui-pill(class:ui-pill-success={row.status === "paid"} class:ui-pill-warning={row.status === "pending"} class:ui-pill-destructive={row.status === "failed"}) {row.status}
```

Every arm repeats the discriminant (`toast.kind ===`), nothing says the arms are
**one choice among several**, and nothing tells the author when an arm is
missing. In Erlang, Elixir, Rust, Gleam and Elm this is a `case` / `match`:
one value, several shapes, the compiler checks them.

### 2.2 Proposal

Two forms, both with the same patterns.

**A statement, `match`**, in the indentation style of the language:

```
match toast.kind
  "success"
    span.k-icon.k-icon-check
  "error"
    span.k-icon.k-icon-alert
  _
    span.k-icon.k-icon-info
```

**An expression, `match { ... }`**, for attribute values and text, instead of a
chain of ternaries or one `class:` per value:

```
span.ui-pill(class={match row.status { "paid" => "ui-pill-success", "pending" => "ui-pill-warning", "failed" => "ui-pill-destructive", _ => "" }}) {row.status}
```

#### Patterns, from the cheap to the useful

| Pattern | Example | Matches |
|---|---|---|
| literal | `"paid"`, `0`, `true`, `null` | that value (strict equality) |
| alternatives | `"paid" \| "refunded"` | any of them |
| wildcard | `_` | anything, binds nothing |
| binding | `n` | anything, and `n` is the value inside the arm |
| guard | `n when n > 99` | the binding, if the condition holds (Erlang's `when`) |
| object | `{ status: "ready", items }` | an object with that field value; binds `items` |
| array | `[]`, `[first, ...rest]` | an empty array; a head and the rest |
| tagged union | `{ kind: "error", message }` | the usual `{kind, ...}` shape of a state that is one of several |

```
match cart.count
  0
    p Your cart is empty
  1
    p One item
  n when n > 99
    p 99+ items
  n
    p {n} items

match load                              // { status: "loading" } | { status: "failed", error } | { status: "ready", items }
  { status: "loading" }
    div.ui-skeleton
  { status: "failed", error }
    p.ui-field-error {error}
  { status: "ready", items: [] }
    p.k-muted Nothing here yet
  { status: "ready", items }
    for item in items key item.id
      li {item.title}
```

The first arm that matches wins (top to bottom, as in Rust and Erlang).

A small companion, **`is`**, for the places where an `if` only needs a yes or
no and no arms: `if status is "paid" | "refunded"`, `class:done=status is "paid"`,
`if user is { role: "admin" }`. It is the same pattern machinery used as a
boolean.

### 2.3 How it compiles

The compiler already has the right machinery: an `if` chain is compiled to **a
branch index** (`-1` for none); `diff` compares the previous and next index,
**replaces** the range between the markers when it changed and **diffs inside**
when it did not (`compiler/emit/diff.ts`, `diffIf`). A `match` is the same thing
with a different way to compute the index.

| Step | What | Where |
|---|---|---|
| Parse | `match <expr>` then arms at one deeper indent; each arm is `pattern [when guard]` and its children. An arm line ends with no text | `template/parser.ts`, a `MatchNode` in `template/ast.ts` |
| Patterns | a small pattern grammar (below), separate from expressions | `template/pattern.ts` (new) |
| Dependencies | the discriminant, the guards and what each arm reads. **Names a pattern binds are local to the arm**, like a `for` variable (`nodeDeps` already removes loop variables) | `compiler/analyze.ts` |
| Render | evaluate the discriminant **once**, test the arms in order, render the first | `compiler/emit/render.ts` |
| Diff | same index: diff inside the arm, with the bindings of the previous and the next value (the loop-variable handling of `for` is the model). Another index: clear and insert | `compiler/emit/diff.ts` |
| Expression form | `match x { p => e, ... }` as an expression kind in the expression parser; compiles to a function-free nested conditional | `template/expr.ts`, `compiler/emit/expr.ts` |

The first version can be **pure sugar**: `match x` desugars in the parser to the
`if` chain with the discriminant bound once. That is a day of work, it needs no
change in `analyze` or `diff`, and every current golden test stays valid. Real
bindings (`{ status: "ready", items }`) are the second step, because they add
scoping to the analyzer and a prev/next pair per binding to `diff`.

### 2.4 Checks the compiler can give

The current error style (`line:col`, with the fix in the message) carries over.

- **Unreachable arm**: an arm after `_` or after an identical pattern.
- **No `_` and no proof of coverage**: *"this match has no `_` arm: when nothing
  matches, nothing is shown"* as a warning. For a state typed as a union the
  author can make it an error: a comment `// @match toast.kind: "success" | "error" | "info"`
  above the `match` declares the set, and a missing member is then
  *"match does not handle "info""*. (Reading the TypeScript type of the state is
  the better answer and belongs with the language server, which is already on
  the list of things not done.)
- **A binding that is never used** (warning, like an unused loop variable).
- **A guard that can read only bindings of its own arm and the state**: the
  usual scoping error otherwise.

### 2.5 Alternatives considered

| Alternative | Verdict |
|---|---|
| `switch x` / `case "a"` (JavaScript's words) | familiar, but implies fall-through and `break`; patterns beyond literals read oddly. The cost of a new word `match` is small: no HTML element has that name |
| Extend `if`: `else if x is "a"` | fine as the `is` companion, but it does not group the arms, so there is still no place to check them as a set |
| Elixir `cond` (boolean arms) | covered by `_ when <condition>` arms, without a second keyword |
| `ts-pattern`-style matching **in the handlers** (`match(msg).with(...)`) | useful and independent: the TypeScript side of the same idea. A tiny helper in `@pavlus/client`, later; it needs no compiler work |
| Erlang-style **function clauses for messages** (`on "loaded"(data)` ...) | the current rule "a method is the handler of the message with that name" already reads well; patterns on the *payload* are the part worth borrowing, and they are the `match(msg)` helper above |

### 2.6 Order of work and acceptance

| Phase | Deliverable | Done when |
|---|---|---|
| **P0** | `match` statement with literals, `\|` alternatives, `_` and a whole-value binding, as sugar over `if` | the three snippets of 2.1 rewritten; the compiled output is the same as the `if` version (a golden test says so); parse errors carry `line:col` |
| **P1** | `when` guards; `is`; the expression form `match x { ... }`; unreachable-arm and no-`_` diagnostics | the `class:` toggles of a status pill become one expression; the diagnostics have tests with their exact messages |
| **P2** | object and array patterns with bindings, a native `MatchNode` in `analyze` and `diff` | a `{ status: "ready", items }` arm updates in place when only `items` changes (no clear and insert), shown by a diff test |
| **P3** | tooling: the tree-sitter grammar and the Zed extension (highlighting for `match`, `=>`, `when`, `is`), the docs page, `@match` unions checked against the TypeScript type | the editor highlights all of it; `framework/README.md` has a "Pattern matching" section |

Compatibility: `match` is a new keyword only at the start of a template line
followed by an expression, as `if` and `for` are; an element called `match` is
not an HTML element. Existing templates compile unchanged.

### 2.7 Open questions

1. **`=>` or `->`** in the expression form? (`=>` reads as JavaScript, `->` as
   Rust and Elixir. The lexer that balances `{}` in attributes must learn it.)
2. **Do arms need a colon?** The language dropped trailing `:` after `if` and
   `for` (D6); arms follow that.
3. **Exhaustiveness without types**: a warning only, or an annotation comment?
   (Proposed above: the comment now, the real type later.)
4. **Binding names and the state**: may an arm binding shadow a state key
   (`items`)? A `for` variable shadows one silently today (the parser has no
   rule about it); a warning for both would keep templates predictable.
5. Should `match` accept **several discriminants** (`match status, error`) like
   Erlang's multi-argument clauses? It is a tuple pattern in disguise; later.

---

## 3. How the two fit together

- The **loading arm** of a lazy component is a `match` on its status; without
  pattern matching it is an `if` / `else if` / `else` of three arms, and
  nothing says that a fourth status would show nothing.
- The **`ComponentRef`** is plain data, so a state of
  `{ status, ref }` can be matched as it is: the ready arm embeds the ref
  (`+{reports.ref}`), the others show the skeleton or the error.
- The **debug panel** already lists effects and messages; the load events of
  section 1 show up there for free, which is the cheapest way to see where the
  time of a slow page goes.

## 4. Suggested order across both

1. `match` P0 (pure sugar): small, unblocks cleaner templates now.
2. Lifecycle `mounted` / `unmounted` for embedded children (useful alone).
3. ui-kit P0 lazy loading with the `source`-style plugin: proves the idea and
   removes the 4.8 MB first script, with no framework change.
4. `ComponentRef` and the registry (P1), then `routing: { lazy }`.
5. `match` P1-P2 (guards, `is`, bindings).
6. Server-compiled factories, manifest and integrity (P3).
7. SSR and hydration order; tooling for `match`.

Each step has its acceptance test above, and none of them changes what a
component or a template *is*: a component stays a function or a class of pure
handlers, a template stays two pure functions. Loading code and choosing a
branch are new ways to **get** them, not new kinds of them.
