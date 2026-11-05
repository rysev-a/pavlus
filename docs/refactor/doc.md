# Pavlus framework: how it works, and refactoring proposals

- **Scope:** `framework/` only (`admin-app/` is treated as a consumer, not a target).
- **Status:** R9, R4 and R1 are done (see Progress below); the rest is still a plan.
- **Goal:** make the architecture easier to explain (diagrams, glossary, reading map)
  and the code easier to read (smaller modules, classes where they help), without
  changing behavior or the public API.

---

# Part 1 — How the framework works

**Moved (R9, done):** the explanation, diagrams and glossary now live in
[`framework/docs/architecture.md`](../../framework/docs/architecture.md), and
are kept next to the code. This document keeps only the refactoring plan.

## 1.9 Invariants any refactor must preserve

1. **Purity of app code** is a documented contract, not enforced — don't accidentally
   move side effects into the component layer.
2. **Effects and patches are plain data.** Plugins and the DOM plugin are the only
   interpreters.
3. **`diff` trusts `===`.** Store updates must keep structural sharing.
4. **Generated code stays readable.** Named variables, `// line N:` comments, one
   statement per line, no minified helper names — this is a *tested feature*
   (`compiler/output.test.ts`), and the README documents it as the debugging story.
5. **`erasableSyntaxOnly`**: no enums, namespaces or constructor parameter
   properties. Classes are fine; parameter properties are not.
6. **Public entry points** are pinned by `package.json` + `jsr.json` (`./`,
   `./vite`, `./compiler`, `./runtime`, `./testing`, `./plugins/*`). Internal file
   layout may change as long as `main.ts` and the `mod.ts` entry files keep their
   paths and exports. JSR's slow-types check requires explicit types on anything
   exported.
7. **Behavioral safety net:** `npm test` (Vitest, jsdom) covers core, components,
   plugins, compiler output, embeds and the vite plugin.

---

# Part 2 — Refactoring proposals

> Guiding principle: the code is already clean and consistently documented — the
> problems are *module size* and *concept scattering* (one file mixing several
> responsibilities), not style. Every proposal below is behavior-preserving and
> can be landed as a separate small PR behind the existing test suite.

Summary:

| ID | Proposal | Priority | Effort | Risk |
|---|---|---|---|---|
| R1 | Split `compiler/codegen.ts` (1089 lines) by concern | **P1** | M | M |
| R2 | Split `component/mod.ts` (427 lines) into types / handler / namespace / combinators; move routing glue to `routing/` | **P1** | M | L |
| R3 | Convert the **dom** (and optionally **store**) plugin factories into classes | **P2** | M | L–M |
| R4 | Snapshot golden files of generated code before/after R1/R6 | **P1** (do first) | S | — |
| R5 | Shared micro-helpers (`isObject`, `viewOf`) in one module; break the `component ↔ routing` type cycle | **P2** | S | L |
| R6 | Organize `template/parser.ts` (591 lines): line sanitizing, import scan, table-driven dispatch | **P3** | M | M |
| R7 | Encapsulate `analyze.ts`'s module-level memo in a small class | **P3** | S | L |
| R8 | One error factory / error base for consistent `pavlus[/<scope>]:` messages | **P3** | S | L |
| R9 | `docs/architecture.md` with the diagrams + glossary from Part 1, linked from README | **P1** | S | — |
| R10 | Typing polish (`Component<S = unknown>`, per-plugin effect map) | **P3, optional** | M | M |

**Progress**

| ID | State |
|---|---|
| R9 | done: `framework/docs/architecture.md` (diagrams, glossary), linked from the README |
| R4 | done: 11 fixtures in `src/compiler/__fixtures__/`, goldens in `__goldens__/`, vitest file snapshots; mutation-checked (a one-word comment change fails them) |
| R1 | done: `codegen.ts` 1089 → 75 lines + `compiler/emit/` (writer, names, shared, element-info, base, expr, render, diff; largest file 412). Verified byte-identical on the 11 goldens **and** on all 19 templates in the repo (138 KB of output) against the old implementation. |
| class-only components | done: `fromObject` and `defineComponent` are gone; `abstract class Component<S>` with `dispatch`; plain objects are refused with a clear error; the function type is `ComponentFn` |
| R2, R5 | next, with the revised split below (the cycle analysis still holds, with `Component#dispatch` in place of `fromObject`) |
| R3 | `dom` only, if classes are wanted |
| R6 | only the lines/imports extraction |
| R7, R8, R10 | dropped (see review notes) |

**As built (R1):** one object in layers rather than two sibling classes.
`EmitBase → ExprEmitter → RenderEmitter → DiffEmitter`: diff has to call the
render emitters to produce new content (an inserted list item, a new branch),
so the layers follow the dependency direction. The method bodies were moved
verbatim by script, not retyped.

## Review notes (after R4 and R1)

- **R2 as written would create the import cycle it wants to remove.** Inside
  `component/mod.ts` the functions are mutually recursive:
  `toHandler → Component#dispatch → childHandler → namespace → toHandler`, and
  `Component#dispatch → routedHandler → namespace`. Putting `handler.ts` and
  `namespace.ts` in separate files makes them import each other. Split along the
  real seams instead: `types.ts`; `combinators.ts` (`compose`, `mapMessage`,
  `mapEffects`, `withLogging`, which only need `toHandler`); one dispatch module
  with the `Component` class, `toHandler`, `namespace`, `routedHandler`; and the
  pure routing math (`chain`, `transitions`, `matchRoute`) in `routing/`.
  (`fromObject` no longer exists: the class-only change turned it into
  `Component#dispatch`.)
- **R6:** extract line sanitizing and the import scan, but skip the table-driven
  dispatch: branches like `else` mutate the previous sibling and return no node,
  so a table adds indirection without clarity.
- **R7:** the dependency memo is keyed by node identity, so it cannot leak between
  compilations; wrapping it in a class is cosmetic. **R8:** error codes only
  matter if consumers will catch them. **R10:** the `any` defaults are deliberate.
- **Not in the original plan:** `component/mod.ts` imports the logger and store
  effectors (`withLogging` and `setRoute` hardcode those plugins), so the
  component layer depends on specific plugins. And routing patterns match as a
  prefix, so a page without its own `routing` also answers `/page/anything`
  (a behavior question, not a refactor).

Deferred on purpose (see 2.11): `View.render` options-object signature, heavy
generic typing of effects.

---

## R1 — Split `compiler/codegen.ts` by concern (P1) — DONE (see "As built")

**Where:** `src/compiler/codegen.ts` (1089 lines; the `Codegen` class alone is ~825).

**Why:** render emission, diff emission, name allocation and expression emission
are four orthogonal concerns living in one class. The file is the hardest part of
the framework to navigate (the ROADMAP itself calls update/diff "hardest"), and
every template feature touches both render and diff paths in one place.

**Shape:** keep `src/compiler/mod.ts` as the entry (`./compiler` package export
stays valid); introduce a folder:

```
src/compiler/
  mod.ts          // compileTemplate, compileToView (unchanged API)
  writer.ts       // class Writer (already a clean unit, ~55 lines)
  names.ts        // RESERVED_WORDS, FIXED_NAMES, class NameScopes { name(), scoped() }
  expr.ts         // per-side expression emission: expr, parts, attrValue,
                  // classValue, payload, eventMsg  (pure functions over (Ctx, Side))
  render.ts       // class RenderGen: renderNode/Element/If/For/Embed/Outlet
  diff.ts         // class DiffGen: changed, diffNode/Text/Element/If/For/Embed/Outlet
  codegen.ts      // class Codegen: shared base (scopes, h(), capture(), Ctx building)
                  // + generate(); RenderGen/DiffGen extend or compose it
  element-info.ts // elementInfo, isStaticAttr, describe, lineOf
```

Two viable structures:

- **Option A (recommended):** keep one `Codegen` orchestrator; extract
  `NameScopes` and the expression emitters as collaborating classes, and move the
  `render*` / `diff*` method groups into `RenderGen` / `DiffGen` classes that share
  a small protected base (`writer`, `scopes`, `h()`, `capture()`). The split
  mirrors exactly the two generated functions — the mental model becomes
  "render.ts produces, diff.ts compares".
- **Option B:** free functions taking an explicit `(w, scopes, ctx, side)`
  parameter object. Less state, but many parameters re-threaded at every call;
  the class keeps call sites shorter.

**Must hold:**

- Generated output stays **byte-identical**. The name allocator, `capture()`
  depths and Writer behavior are subtle (sibling blocks *reuse* names; numbering
  only inside a shared JS scope) — that's what output.test.ts asserts, and what
  R4's golden snapshots will pin down.
- `helpers` set collection (`this.h(...)`) must survive the split unchanged, since
  the import line is generated from it.

**Validation:** `npm test --workspace framework` + R4 goldens + `npm run typecheck`.

## R2 — Split `component/mod.ts`, move routing glue to `routing/` (P1)

**Where:** `src/component/mod.ts` (427 lines), `src/routing/mod.ts`.

**Why:** the module currently mixes five responsibilities: type definitions,
form normalization (`toHandler` and the dispatch that used to be `fromObject`), child plumbing, **routing glue**
(`routedHandler`, `chain`, `transitions`, `joinPath`, `sameRoute` — ~120 lines of
routing semantics living in the component module), and combinators. It also
creates a confusing import story: `routing/mod.ts` imports the `ChildSpec` *type*
from `component/mod.ts`, while `component/mod.ts` imports values from
`routing/mod.ts` (harmless at runtime because it's `import type`, but it reads as
a cycle and blocks clean splitting).

**Shape:**

```
src/component/
  types.ts        // ComponentFn, Handler, ComponentLike, Children,
                  // ChildSpec, ComponentCtx, NamespaceOptions
  handler.ts      // the Component class (dispatch), lookup, toHandler, viewOf
  namespace.ts    // namespace + REPLY_FIELDS
  combinators.ts  // compose, mapMessage, mapEffects, withLogging
  mod.ts          // re-exports (public paths unchanged)
src/routing/
  transitions.ts  // routedHandler, chain, transitions, sameRoute, joinPath
  mod.ts          // existing matchers + re-export of transitions
```

`ChildSpec` moving into `component/types.ts` (imported by `routing/`) breaks the
cycle; `RouteSpec extends ChildSpec` stays in `routing/`.

**Must hold:** `main.ts` re-exports and `src/component/mod.ts` / `src/routing/mod.ts`
entry paths stay put; only internals move. `Component#dispatch` keeps dispatch order
(own handler → child) and error messages verbatim — component tests assert them.

**Validation:** full test suite (component.test.ts, embed.test.ts, core.test.ts).

## R3 — Class-based plugins: dom first, store second (P2)

**Where:** `src/plugins/dom/mod.ts` (297 lines), `src/plugins/store/mod.ts` (227).

**Why (user goal):** the dom plugin is the biggest piece of stateful runtime code
and its closure currently hides five mutable fields (`instances`, `listening`,
`ids`, `listenerCount`, `ctx`) plus nine inner functions behind a factory. A class
turns that into named, typed fields and private methods with the same grouping the
code already has (`resolve`, `snapshot`, `setHandler`, `writeAttr`, `build`,
`dispose`, `removeRange`, `get`, `apply`, `mount`, `unmount`). It also makes the
plugin *inspectable* and subclass-friendly for anyone embedding pavlus.

**Shape:**

```ts
// src/plugins/dom/plugin.ts
export class DomPlugin implements Plugin<DomEffect, any> {
  private instances = new Map<Element, Instance>();
  private listening = new WeakMap<Node, Listening>();
  private ids = new WeakMap<Node, string>();
  private listenerCount = 0;
  private ctx?: PluginContext<any>;
  constructor(private readonly doc: Document) {}   // ← NOT allowed: param property.
  // erasableSyntaxOnly — write it out:
  //   readonly #doc: Document; constructor(doc: Document) { this.#doc = doc; }
  name = "dom";
  init(c) { this.ctx = c; }
  handle(effect: DomEffect, c: PluginContext<any>) { … }
  onState(state) { … }
  dispose() { … }
  stats(): DomStats { … }
}
// mod.ts — public API unchanged:
export function new DomPlugin(opts: DomPluginOptions = {}): DomPlugin {
  return new DomPlugin(opts.document ?? globalThis.document);
}
```

Constraints to respect:

- **No parameter properties** (`erasableSyntaxOnly`) — assign fields in the
  constructor body explicitly (see sketch).
- **JSR slow-types:** exported class members need explicit types (return types on
  public methods).
- `this`-binding is safe in the current core (`plugin.handle(...)` is a method
  call on the plugin object), but keep handlers as arrow-bound properties or
  plain methods consistently — pick one convention and document it.
- The store's *pure* helpers (`setAt`, `removeAt`, `applyChange`, `restoreFor`,
  `getIn`) should **stay module-level functions** (they're pure and exported for
  tests); only the stateful wrapper (`createStorePlugin`) becomes
  `class StorePlugin<S>` with `state` / `history` fields.

Honest counterpoint: for the small plugins (`http`, `ws`, `time`, `logger`,
`router`, each ≤ 110 lines) the closure factory is already perfectly readable —
converting them adds `this.` noise for little gain. Recommend classes only where
state is multi-field and lifecycle is real: **dom** and **store**.

**Validation:** dom.test.ts, embed.test.ts, store.test.ts, plugins.test.ts — no
new tests should be needed, though a `stats()` consistency test after
mount/patch/unmount would lock listener accounting.

## R4 — Golden snapshots of generated code (P1, do before R1/R6) — DONE

**Why:** R1 and R6 restructure the two biggest emitters. `output.test.ts` asserts
*properties* of the output (readable names, comments, imports), not its exact
bytes. Byte-exact goldens make the "output unchanged" claim mechanical.

**Shape:** a `compiler/__goldens__/` folder with a handful of `.pavlus` sources
covering every node kind (element with toggles + dynamic class + events, text,
if/else chains, keyed for, static embed, dynamic embed, outlet, imports) and one
`.js` golden per source; a test that diffs `compileTemplate(src)` against the
golden with a `--update-goldens`-style env flag for intentional changes.

## R5 — Shared micro-helpers; break the type cycle (P2)

- `isObject` is defined three times (`component/mod.ts`, `routing/mod.ts`,
  `plugins/store/mod.ts` as `isObj`), and "view or component with a view" logic
  exists as `viewOf` in `component/mod.ts`, a *different* `viewOf` in
  `routing/mod.ts` (checks `render` is a function), and `asView` in
  `runtime/helpers.ts`. Consolidate the guards into `src/utils.ts` (or
  `src/internal/`), and make the view-extraction variants explicitly named for
  their strictness (`viewOf` lenient vs `asView` throwing) in one place.
- Breaks the `component ↔ routing` `import type` cycle described in R2 if done
  together with it.

**Risk:** low, but `routing/mod.ts`'s `viewOf` must keep its duck-typing semantics
(it accepts unknown objects); don't "unify" behavior, only location.

## R6 — Organize `template/parser.ts` (P3)

**Where:** `src/template/parser.ts` (591 lines).

**Why:** one `parse()` function with a chain of inline regexes interleaves line
sanitizing, import validation, block-structure (stack of `Frame`s) and node
construction. The `Builder` class already exists but the dispatcher doesn't.

**Shape (no behavior change):**

- `template/lines.ts`: source → `Line[]` (split, tab check, comment strip) — the
  first `forEach` in `parse`.
- `template/imports.ts`: the import-line scan + validation errors.
- `parser.ts`: the stack walk + a **table-driven dispatch**: an ordered array of
  `{ test: RegExp | fn, build: (m, line, b) => { node, into } }` for
  `if` / `else if` / `else` / `for` / `|` text / `{` text / `+outlet` / `+embed` /
  element. Order matters (`+outlet` before `+`), and the table makes that explicit.
- Keep `Builder` as-is (it's already a class doing one job).

**Validation:** compiler.test.ts + output goldens (R4) — the AST is internal, so
goldens plus existing tests are sufficient.

## R7 — Encapsulate the dependency memo (P3)

`compiler/analyze.ts` keeps `const memo = new WeakMap` at module level. Wrap it in
a tiny class (`class DependencyAnalyzer { deps(node) … }`) instantiated per
compilation, or accept an optional memo parameter. Benefits: no hidden global
state, easier to reason about in tests/SSR contexts where multiple compilations
run. Behavior identical (WeakMap GC semantics preserved).

## R8 — Consistent error messages (P3)

Errors are prefixed `pavlus:` in most places but `pavlus/dom:`, `pavlus/ws:` in
plugins, built by hand with `throw new Error(\`pavlus…\`)`. Add
`src/errors.ts` with `PavlusError extends Error` (or a `fail(scope, msg)` helper)
and a `templateError(msg, line, col)` wrapper around the existing
`TemplateError`. Locks the convention and enables tests that assert on error
*codes* rather than prose. Purely mechanical sweep.

## R9 — `docs/architecture.md` + glossary (P1, pure win) — DONE

Move Part 1 of this document into `framework/docs/architecture.md` (diagrams
render on GitHub), add:

- **Glossary table:** `Message`, `Effect`, `Effector`, `Plugin`, `Component`,
  `View`, `VNode`, `Patch`, `Route`, `namespace`, `embed`/`outlet` — each with its
  defining type and file.
- A link from `framework/README.md` next to the existing docs links.
- Optionally a sequence diagram per plugin family in `docs/plugins/*.md`.

No code risk; biggest clarity win per line spent.

## R10 — Typing polish (P3, optional)

- `Component<S = any>` / handlers default to `any`. Switching defaults to
  `unknown` is stricter but will ripple through call sites and may fight
  inference in app code — measure on `admin-app` before deciding; fine to keep
  `any` and document why.
- A light **effect registry** gives app code autocomplete without runtime cost:

  ```ts
  // src/core/effects.ts
  import type { DomEffect } from "../plugins/dom/mod.ts";
  import type { StoreEffect } from "../plugins/store/mod.ts";
  export interface EffectsByPlugin {
    dom: DomEffect; store: StoreEffect; http: HttpEffect; /* … */
  }
  ```

  Avoid deeper conditional-type machinery: it hurts the readability goal and
  risks JSR slow-types complaints.
- Keep the current discriminated unions (`DomEffect`, `StoreEffect`, `Patch`,
  `Node`, `Expr`) — they're already the right modeling and narrow cleanly in
  `switch`.

## 2.11 Deferred on purpose

| Idea | Why not now |
|---|---|
| `View.render(state, opts)` options object instead of 4 positional params (`idSuffix, messagePrefix, env`) | Changes **every generated module** and the `View` public type; only worth doing in a planned breaking release. The current signature is internal-ish (generated by the compiler), so the pain is low today. |
| Enforcing purity statically (lint rule / Proxy) | README states purity is the author's responsibility by design; enforcement is a product decision, not a refactor. |
| Minimal-edit diff (LIS) for keyed lists | `diffKeyedList` documents the tradeoff ("simple, not minimal"); optimizing is a perf project, orthogonal to readability. |
| Splitting `runtime/helpers.ts`'s re-export of `childEnv`/`resolveOutlet` | The re-export is what compiled templates import from `@service-laboratory/pavlus/runtime`; moving it breaks the runtime import surface for no clarity gain. |

---

# Part 3 — Suggested order of work

1. **R9** architecture docs (no code) — then the rest can reference them.
2. **R4** golden snapshots — the safety net for everything compiler-related.
3. **R1** codegen split (biggest win; goldens make it safe).
4. **R2** component split + routing glue move (breaks the type cycle).
5. **R5** shared utils (fold into R2's PR if convenient).
6. **R3** dom/store plugin classes.
7. **R6, R7, R8** — independent, any time.
8. **R10** — only after measuring on `admin-app`.

Each step is one small PR; after every step run:

```sh
npm test --workspace framework
npm run typecheck
npm run publish:dry   # slow-types + entry points still fine
```

**Definition of done for the whole effort:** no behavior change (goldens byte-identical,
all tests green), public API and entry points untouched, and every file over
~400 lines reduced to modules that each explain *one* concept — so that
`framework/src` reads in the same order as Part 1 of this document.
