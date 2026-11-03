# Pavlus roadmap

## Status

| Milestone | State |
|---|---|
| M1 Template parser | done |
| M2 Core runtime, plugin contract, logger, time | done |
| M3 Compiler + Vite plugin | done |
| M4 DOM plugin: mount / unmount | done |
| M5 Store plugin with `restoreEffect` history | done |
| M6 Update: dependency analysis + compiled `diff` | done (keyed lists, moves, if/else, nested loops) |
| M7 Component hierarchy | done: function / object / class components, `children` routing, `ctx.send`, `props`, embedded child views (static `+Name`, dynamic `+{expr}`), wrappers |
| M8 http, ws, router plugins | done |
| Plugin effectors and docs | done: `storeEffector`, `httpEffector`, `timeEffector`, `loggerEffector`, `wsEffector`, `routerEffector`, `domEffector`; one doc per plugin in `docs/plugins/` |
| Declarative routing | done: `routing` tables, `+outlet`, nested routes, relative `navigate`, `setRoute` with `enter`/`leave` ([docs/routing.md](./docs/routing.md)). Not done: guards, redirects, query parsing |
| Editor support | tree-sitter grammar + Zed extension done (`editors/`, highlighting only; not yet installed from Zed's UI by me). Language server not started |
| M9 Determinism / DX | dropped on purpose: purity is not enforced (app code may mutate, at the author's own risk). Missing: HMR with state, editor syntax file |
| M10 Packaging | `jsr publish --dry-run` passes. Not published yet |

Not implemented yet:

- **Slots** (content passed into a child, and `{tab.content()}` as an element). Child views themselves are done: [docs/child-views.md](./docs/child-views.md).
- Language server (diagnostics from the compiler's `line:col` errors, hover, completion). Highlighting is tree-sitter and does not need it.
- Replay / time-travel UI on top of store history.
- Plugin conformance test kit for third-party plugins.

## Decisions as implemented (D1-D10)

| # | Decision |
|---|---|
| D1 | Core passes the store snapshot with each message: `app(message, state)`. After a message, if the state changed, plugins get `onState` (the DOM plugin diffs mounted views). |
| D2 | Event handlers are message descriptors (`{id, payload}`), compared by value in `diff`. |
| D3 | Attribute value = expression. Complex ones need `{...}`, quotes are interpolated strings. |
| D4 | Own small expression language, so dependencies are exact. All member access is null safe. |
| D5 | `for x in xs key expr`; without `key` items are keyed by index. Duplicate keys throw. |
| D6 | Trailing `:` is accepted but not needed; `else if` / `else` supported. |
| D7 | `//` is a comment. Child views: `+Name#x(...)` / `+{expr}#x(...)` (see docs/child-views.md). Slots: not yet. |
| D8 | Time is an effect (`time.now`) whose answer returns as a message. |
| D9 | Effects carry the reply message id (`replyTo`, `onSuccess`, ...); `namespace` prefixes them so replies return to the right child. |
| D10 | Single package with sub-path exports (see `jsr.json`). |

## Syntax changes versus task.md

Chosen because they are easier to parse, diff or read:

- `@click=msg(arg)` instead of `onclick=handler`: handlers are data (D2).
- `class:active=cond` for class toggles.
- `for x in xs key x.id` (key clause); no colon needed after `if` / `for`.
- `else if` / `else` branches.
- Inline `// comments` after content.
- Attribute values are plain expressions: `href=item.url`, no braces needed.

---

Source: [task.md](./task.md). This document turns it into an ordered plan:
design decisions first, then milestones, each with deliverables and an
acceptance test.

## 0. Architecture in one picture

```
 DOM event / HTTP reply / timer tick / WS frame
                    │  (plugins turn the outside world into messages)
                    ▼
   ┌─────────────────────────────────────────┐
   │ CORE: queue → app(message, state) → effects │   pure, deterministic
   └─────────────────────────────────────────┘
                    │ effects (plain data, tagged with plugin name)
                    ▼
   plugins:  dom · store · http · ws · time · logger · custom
                    │ side effects, plugin-private state (listeners, request ids, timers)
                    ▼
                  browser
```

Two pure pieces sit on either side of the plugin boundary:

- **Application code**: `(message, state) → effects[]`.
- **Compiled template**: `render(state) → tree` and `diff(prev, next) → DomPatch[]`.
  Because `diff` returns *data* (patches), not DOM calls, the DOM plugin is the
  only place that touches the DOM. That keeps task.md's rule that all dirty work
  lives in plugins.

## 1. Design decisions to settle before coding

These come from gaps or inconsistencies in task.md. Each has a recommended
default, so work isn't blocked. Record the final answers in `docs/decisions.md`.

| # | Question | Recommended default | Why it matters |
|---|----------|---------------------|----------------|
| D1 | Where does app state live? §3 says the store is a plugin, but §4 says the app is a pure function of its input. | Core passes the current store snapshot with each message: `app(message, state)`. The store plugin owns the state and history. | The app cannot be pure and deterministic without state as an input. |
| D2 | What is an event handler in a template: a function or a message? `onclick=removeUser(user)` looks like a call. | A **message descriptor** (data), Elm-style. `onclick=removeUser(user)` builds `{id:'removeUser', payload:{user}}`. A bare `onclick=switchTab` is a message constructor receiving the DOM event. | Message data can be compared by value in `diff`, which gives cheap "did the handler change?" checks. Function identity breaks on every render. It also keeps the whole app serializable and replayable. |
| D3 | Attribute value syntax. The task mixes `href={item.url}` and `href=user.url`. | One rule: the value is an expression, and braces are optional around simple paths. Plain text is written `"..."`. | The parser needs one grammar. |
| D4 | Expression language inside `{}` / `if` / `for`. | A small own subset: paths, literals, calls, `! && \|\| ?:`, comparison, `+ -`. No arbitrary JS. | The compiler must know exactly which state paths each binding reads. This is the foundation of the dependency graph. |
| D5 | Keys in loops. | `for user in users key user.id:` is required for lists that can reorder or remove items. Without `key` it diffs by index. | Without keys, `removeUser` would rewrite every following row. |
| D6 | Block syntax: `for ...:` has a colon, `if ...` doesn't in task.md. | Optional trailing `:` on both, plus `else` / `else if`. | Same reason as D3. |
| D7 | `{tab.content()} // - as element`. Is `//` a comment, or does the note mean the value is an element? | `//` starts a line comment. A `{expr}` that evaluates to a template node (not a string) is inserted as an element. | This defines the slot/child-component mechanism. |
| D8 | Time and randomness in a deterministic app. | Both are effects whose answer comes back as a message (`time.now` → `{id:'time.now', at}`). Ids/seeds come in via messages. | Needed to keep the "no `Date.now()` / `Math.random()`" rule honest. |
| D9 | Effect results are routed back how? | Every effect carries a `replyTo` message constructor. The core builds the reply message and sends it down the component tree. | Needed for parent/child routing in §4 of the task. |
| D10 | Single package or monorepo? | Single JSR package with sub-path exports: `.` (core), `./vite` (plugin), `./plugins/dom`, `./plugins/store`, ... Split later only if needed. | Fits the current `jsr.json` and avoids overhead early on. |

## 2. Repository layout (target)

```
src/
  template/        lexer, parser, AST, expression parser, analyzer
  compiler/        AST → dependency graph → generated TS (render + diff)
  vite/            vite plugin (transform *.pug-like files)
  core/            runtime loop, message queue, effect dispatch, plugin registry
  component/       hierarchy helpers: mapMessage, mapEffects, wrap, compose
  plugins/
    dom/  store/  http/  ws/  time/  logger/
  testing/         fake plugins, test harness, DOM-equivalence checker
../admin-app/      runnable dashboard (the task.md example) with a node + Postgres backend
docs/
```

File extension for templates: `.pavlus`. Vite plugin imports them as modules
exporting `{ render, diff, meta }`.

## 3. Milestones

Order is deliberate: a thin end-to-end slice (M1–M4) comes before the hardest
part (M6, update), so the architecture is validated early.

### M1. Template language: parser

- Indentation lexer (INDENT/DEDENT), tags, `.class`, `#id`, `(attrs)`, inline
  text, `| text` lines, `//` comments, `{expr}` interpolation, `if/else`,
  `for ... in ... key ...`.
- Expression parser (D4) that returns an AST and the list of **read paths**
  (`user.isVisible` → `["user","isVisible"]`).
- Typed AST in TS, with source positions, and error messages that point at
  line and column.
- Deliverable: `parse(source): TemplateAst`.
- Acceptance: the two examples from task.md parse. A snapshot test per node
  type. Malformed input (bad indentation, unclosed `{`) gives a located error.

### M2. Core runtime and plugin contract

- Types for `Message`, `Effect`, `Plugin<E, S>`:
  `{ name, init(ctx), handle(effect, ctx), dispose() }`, where
  `ctx.dispatch(message)` is how a plugin feeds the core.
- Core loop: queue messages, call `app(message, state)`, route effects to
  plugins by `effect.plugin`, and process replies. Messages are handled strictly
  one at a time (no re-entrancy), which keeps behavior deterministic.
- Logger plugin and Time plugin (`now`, `setTimeout`/`setInterval` with ids and
  `cancel`) as the first two plugins. They are small and exercise the contract,
  including cancellation by id.
- Deliverable: `createApp({ app, plugins, initialMessage })`.
- Acceptance: a headless app (no DOM) with a debounced search using Time
  `setTimeout` + `cancel`. Tests run with a fake clock. Same message log in →
  same effect log out.

### M3. Compiler and Vite plugin (render only)

- Analyzer: walk the AST and attach to every dynamic node (text, attr, event,
  `if`, `for`) the set of state paths it reads and its enclosing guards.
- Codegen: emit TS with a typed `render(state)` that returns a
  virtual tree (plain data). Template inputs are typed from the exported state
  type where available.
- Vite plugin: `transform` hook for `.pavlus`, source maps, HMR full reload to
  start with.
- Deliverable: `import view from './view.pavlus'` works in a Vite app and in
  Vitest.
- Acceptance: snapshot tests of generated code. Rendering to an HTML string
  matches expected output for all node types.

### M4. DOM plugin: mount and unmount

- Effects: `dom.mount`, `dom.unmount`, `dom.focus`, plus later `dom.patch`.
- **Mount** (task 2.1): build real nodes from the tree. Add listeners and
  record them in the plugin's registry: `Map<nodeId, Map<eventName, handler>>`.
  Use one listener per node and event that looks up the current message
  descriptor. Updating a handler then replaces the registry entry and doesn't
  need `removeEventListener` and `addEventListener` (this addresses the
  `onEmailInput` case in task 3.1).
- **Unmount** (task 2.2): walk the mounted tree and drop every listener and
  child component state, then remove the nodes. The registry must be empty
  afterwards.
- Deliverable: counter and todo examples render and react to clicks entirely
  through effects and messages.
- Acceptance: a leak test mounts and unmounts 1000 times and asserts the
  registry size is 0 and no listeners remain (spy on `add`/`removeEventListener`).

### M5. Store plugin (needed by the examples, and by update)

- Effects: `set`, `merge`, `remove`, all path-based. The plugin turns each
  into a change record `{timestamp, effect, restoreEffect}`.
  `restoreEffect` is computed from the old value at apply time (task 3.2:
  `{user:null}` records `{user:{email}}` as its inverse).
- Timestamps come from an injected clock, not from `Date.now()` in app code.
- Effects `store.undo(n)` and `store.restoreTo(timestamp)`; bounded history.
- Deliverable: store with history and subscription of snapshots into the core.
- Acceptance: for random sequences of effects, applying all `restoreEffect`s
  in reverse order returns the initial state (property test).

### M6. Update: dependency graph and compiled diff (hardest)

This is task 2.3. Split into three steps that each ship on their own.

1. **Reference differ.** A generic tree diff `diff(prevTree, nextTree) →
   DomPatch[]` with keyed lists. It isn't optimized. It exists as the
   **correctness oracle** for the optimized version.
   `DomPatch` is data: `setText`, `setAttr`, `removeAttr`, `setHandler`,
   `insert`, `remove`, `move`.
2. **Dependency graph.** From M3's analysis build, per template, a graph:
   `state path → bindings`, where bindings are nested under their guards
   (`showUsers` → `users` → `user.isVisible` → `user.name`).
   Rules that fall out of the task.md examples:
   - If the guard didn't change and is false, skip everything beneath it.
   - If the guard flipped false→true, emit **mount** of the subtree from
     `next` only. true→false, emit **unmount** from `prev` only. Only here do
     both `prev` and `next` matter.
   - If the guard is true on both sides, recurse and re-check inner paths.
   - A `for` item with `isVisible` false on both sides emits nothing for that item.
   - A changed event handler (`removeUser`) matters only for bindings that are
     currently mounted. A changed value is compared by value (D2).
3. **Compiled diff.** Codegen of `diff(prev, next): DomPatch[]` per template.
   The generated code is straight-line: it checks only the paths that bindings
   depend on, using reference equality (`===`) first. State must be treated as
   immutable, so this is valid. Dev mode freezes state to catch violations.
   - **Invariant (the main test of the project):** for any `prev`, `next`,
     applying `diff(prev, next)` to the DOM rendered from `prev` yields the
     same DOM as rendering `next` from scratch. Run it as a property test
     (fast-check) over generated states for the dashboard example and others,
     comparing the compiled `diff` with the M6.1 oracle.
- Acceptance: the dashboard example. Toggling `showUsers`, changing `users`,
  hiding one user, and swapping `removeUser` produce exactly the minimal patch
  lists described in task.md, asserted by tests.

### M7. Component hierarchy (task §4)

- A component is `(message, state) → effects[]`, with optional child
  components. A parent calls its children explicitly. A child never imports
  or references its parent.
- Helpers in `component/`: `mapMessage` (rewrite or filter incoming
  messages), `mapEffects` (filter or transform outputs), `compose`,
  and wrappers such as `withLogging`, `withTracking`.
- Routing of replies for child effects via D9.
- Component identity for the DOM plugin: each component instance gets a stable
  path id, so unmount can cascade to nested components (M4).
- Acceptance: a logging wrapper added around the dashboard changes no child
  code and logs all messages and effects. A child test runs in isolation with
  only messages as input.

### M8. Remaining plugins

Each follows the same contract and ships with a fake for tests.

- **Http** (3.3): required request `id`. A new effect with a known id aborts
  the previous request (`AbortController`). `action:'cancel'` aborts by id.
  Plugin keeps `Map<id, state>`. Result is delivered via `replyTo`.
- **WebSocket** (3.4): connections by id; open, send, close; incoming frames,
  errors and closes become messages.
- **Router/History**: URL → messages, `navigate` effect. Listed in §3 of the
  task intro; not in the numbered list.
- **Plugin author kit** (3.\*): a documented, strongly typed helper
  `definePlugin<Effect, State>()` and a conformance test suite that any
  third-party plugin can run.

### M9. Determinism enforcement and DX

- Lint/analysis rule (ESLint rule or in the Vite plugin) that bans
  `Date`, `Math.random`, `fetch`, `setTimeout`, `localStorage`, `console`,
  `document`, `window` inside app and component modules.
- Dev-mode checks: freeze state and messages; run each message twice and
  assert identical effects.
- Message/effect log with replay and time-travel (builds on M5 history).
- Better errors, HMR that preserves state, template syntax highlighting file
  for editors.

### M10. Packaging and release

- `jsr.json` sub-path exports for `core`, `vite`, `plugins/*`; check the
  `jsr publish --dry-run` slow-types check passes for all public APIs (explicit
  return types).
- Docs site or README sections, the dashboard example as the flagship demo,
  `CHANGELOG.md`, semver policy (0.x until M6–M7 are stable).
- Publish `0.1.0` after M4 as a preview; `0.2.0` after M6.

## 4. Testing strategy

- Pure functions make most tests plain input/output: parser snapshots,
  codegen snapshots, `app(message, state)` effect lists.
- Plugins are tested against fakes of the outside world (fake clock, fake
  `fetch`, jsdom/happy-dom for the DOM plugin).
- Two cross-cutting property tests protect the riskiest parts:
  1. diff correctness invariant (M6),
  2. store undo invariant (M5).
- Determinism test: replay a recorded message log through the core and compare
  the effect log byte for byte.

## 5. Main risks

| Risk | Mitigation |
|------|------------|
| Compiled diff is subtly wrong for nested `if`/`for` | Build the oracle differ first (M6.1) and property-test against it. |
| Template language grows without a clear grammar | Freeze grammar decisions D3–D7 before M1 and write the grammar down. |
| Handler identity makes updates noisy | Message-descriptor handlers (D2). |
| State mutated by accident breaks `===` checks | Immutable state convention, dev-mode freezing (M9), typed `readonly` state. |
| Effects fired in a loop forever | Core guards: max effects per tick in dev mode, with a clear error. |
| Scope too large to finish | M1–M4 is already a usable preview; later milestones are independent releases. |

## 6. Suggested first week

1. Write `docs/decisions.md` with answers to D1–D10.
2. Write the template grammar (EBNF) and 10 sample templates, including the
   two from task.md.
3. Implement the lexer and parser (M1) test-first.
4. Sketch the `Plugin` and `Effect` types (M2) so M3 and M4 can use them.
