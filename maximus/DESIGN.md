# Maximus

A small frontend framework designed from first principles for the best developer **and** user experience.
Where pavlus is "pure messages and effects, compiled templates", Maximus is "fine-grained signals, real DOM, zero build required".

## Thesis (what is different, and why)

1. **Signals, not diffing.** State is `signal`/`computed`; a binding subscribes to exactly the signals it reads and updates exactly one DOM node. No virtual DOM, no component re-render, no dependency arrays, no stale closures. Components are plain functions that run **once**.
2. **No build step required.** Templates are tagged template literals (`html`...``). The static HTML of a template is parsed once, cloned per use, and bindings are located by index (lit-html/Solid style). A compiler is an optional optimisation, never a requirement; plain `.ts` files run in the browser through any bundler or even native ESM.
3. **Ownership scopes.** Every effect, computed, event listener and child component belongs to an _owner_. Disposing an owner disposes everything beneath it (no leaks by construction). `onCleanup`, `context` (provide/use) and error boundaries all ride on the owner tree.
4. **Async is first class.** `resource` (queries: keyed cache, dedupe, abort, stale-while-revalidate, refetch, optimistic `mutate`) and `action` (mutations: pending/error/result, invalidation of resources by key). `suspense` boundaries show fallbacks while resources load; `errorBoundary` catches errors from render, effects and resources.
5. **Batteries on the same primitives:** router (nested layouts, loaders, guards, prefetch, view transitions, scroll restoration, typed params), forms (schema validation, per-field signals, dirty/touched, async validators), stores (deep reactive objects with path-level tracking), i18n-ready formatting helpers.
6. **Server and hydration without double work:** `renderToString` / `renderToStream` (with suspense streaming) and `hydrate` that adopts server DOM using markers; islands by simply hydrating a subtree.
7. **Observable by design:** one tiny hook (`__MAXIMUS__`) emits signal writes, effect runs, mounts and router events with owner paths; a devtools panel/time-travel can be built on it. Testing helpers (`mount`, `flush`, `fire`) are part of the package.
8. **Accessible and fast by default:** built-in focus management on route change, live-region announcer, `prefers-reduced-motion` aware transitions, event delegation for common events, keyed list reconciliation with LIS moves, batched microtask scheduling, tiny size (core <= 4 kB gz target, dom+core <= 9 kB).

## Package layout (`maximus/src`, ESM, TypeScript strict, no dependencies)

`core/` signal, computed, effect, batch, untrack, owner (root, onCleanup, context, errors), scheduler, devtools hook
`dom/` html, svg, render, bindings, control flow (show, each, match, portal, lazy, suspense, errorBoundary), component helpers, hydrate
`store/` createStore (proxy, path tracking), produce, reconcile
`resource/` resource, action, cache, invalidate
`router/` createRouter, routes, link, params/query signals, loaders, guards, prefetch, transitions
`form/` createForm, field, validators, standard-schema adapter
`ssr/` renderToString, renderToStream, hydrate markers
`testing/` mount, flush, fire, waitFor
`mod.ts` re-exports; package.json `exports` per folder.

## API (the contract; names and shapes are fixed)

```ts
// core
const count = signal(0);          count()  count.set(1)  count.update(n => n + 1)  count.peek()
const double = computed(() => count() * 2);   // lazy, cached, glitch-free
const stop = effect(() => { console.log(count()); return () => cleanup(); });
batch(() => { a.set(1); b.set(2); });   untrack(() => count());
root(dispose => { ... });  onCleanup(fn);  getOwner();  runWithOwner(owner, fn);
const Theme = createContext<"light"|"dark">("light");  Theme.provide("dark", () => view);  Theme.use();
catchError(fn, handler);

// dom
html`<button class=${cls} ?disabled=${off} .value=${v} @click=${onClick} ref=${r} style=${{color: c}}>${label}</button>`
// ${signal|() => value|value|Node|array|template}. Attributes: name=${x} (attr), .prop=${x}, ?bool=${x}, @event=${fn} (options: @click.once/.passive/.capture, @submit.prevent), ref=${fn|signal}, ...${spread}
render(() => App(), document.body)  // returns dispose
show(() => cond(), () => html`...`, () => html`else`)
each(() => items(), item => item.id, (item, index) => html`<li>${() => item().name}</li>`)  // item is a signal
match(() => status(), { loading: () => ..., ready: () => ..., _: () => ... })
portal(target, view)  lazy(() => import("./x.ts"))  suspense(fallback, () => view)  errorBoundary((err, reset) => view, () => view)
// components are functions: (props) => View. Props are plain objects; reactive props are signals/getters the caller passes. children is a function.

// store
const state = createStore({ user: { name: "a" }, todos: [] });  state.user.name = "b";  // fine-grained, only readers of name update
produce(state, s => { s.todos.push(t) });  reconcile(state.todos, next, { key: "id" })

// resource
const user = resource(() => id(), id => fetch(`/u/${id}`, {signal}).then(r => r.json()), { key: id => ["user", id], staleTime: 30_000 });
user(): T | undefined;  user.loading(); user.error(); user.refetch(); user.mutate(v)
const save = action(async (input, {signal}) => {...}, { invalidates: [["user"]] });  save.run(x); save.pending(); save.error(); save.result()

// router
const router = createRouter({ routes: [{ path: "/", component: Home }, { path: "/users/:id", component: User, load: ({params, signal}) => ..., guard: ctx => ..., children: [...] }], base: "/app" });
router.navigate("/x", { replace }); router.params(); router.query(); router.path(); link: html`<a ${router.link("/users/1")}>` or router.a("/users/1", label); router.outlet()

// form
const f = createForm({ initial: { email: "" }, schema /* standard-schema or fn */, onSubmit: async v => ... });
f.field("email") -> { value, error, touched, dirty, bind (spread directive for input), set }; f.submit; f.submitting(); f.valid(); f.reset();

// ssr / testing
renderToString(() => App(), { url }) ; renderToStream(...) ; hydrate(() => App(), container)
const t = mount(() => App()); t.query("button").click(); await flush(); expect(t.text()).toContain("1"); t.unmount();
```

## Quality bar

Every module has vitest + jsdom tests (behaviour, leak/dispose, error paths); strict TypeScript with inferred types and no `any` in public APIs; READMEs with examples; a gallery of examples in `maximus/examples` (counter, todo with keyed list and filters, async search with suspense, routed mini-app with loader and form, SVG chart). Benchmarks (jsdom, honest) in `maximus/bench`. A `docs/` with: concepts, signals mental model, ownership, templates, async, routing, SSR, testing, comparison with React/Solid/Svelte/Lit/pavlus (fair trade-offs).

## Implementation notes

Wave 1 (`core`, `dom`, `store`, `testing`). Everything in the contract above is implemented with the same names and shapes; the deliberate additions and deviations are:

**Scheduling.** `effect` runs its first pass synchronously at creation unless created inside a `batch`/`render`/flush, in which case it is deferred to the end of that (so effects see attached DOM). Later runs are queued and flushed in a microtask, or synchronously at the end of the outermost `batch` (event handlers are batched, so the DOM is current right after a handler). `renderEffect` (used by every DOM binding) runs first at creation and before user effects within a flush. Extras exported from core: `flushSync`, `tick`, `renderEffect`, `onMount`, `createOwner`, `disposeOwner`, `setOwner`, `handleError`, `isSignal`, `isTracking`, `subscriberCount`, `debugStats` (live owner/subscription counters for leak tests), `installDevtools`.
**Owners.** `root` is detached for disposal but keeps a lookup parent, so context and error handlers still resolve through it. `catchError` disposes whatever its callback built when it throws synchronously. Unhandled effect errors are thrown from `flushSync` only after the queue drained.
**Computeds** hold their sources until their owner is disposed (no lazy unsubscription); writing a signal inside a computed throws. Cycles: computed self-read throws `circular dependency detected`, effect ping-pong throws `effect cycle` after 1000 rounds.
**Devtools hook.** `globalThis.__MAXIMUS__ = { listeners: Set, on, emit }`; with no listener no event object is built. Events: `signal:write`, `computed:update`, `effect:run`, `owner:create`, `owner:dispose`, `error`, `mount`, `unmount`; each carries an owner `path`.
**html.** Returns an `Element` (single root) or a `DocumentFragment`. Holes: child, `name=${}`/composite `name="a ${} b"`, `.prop`, `?bool`, `@event.modifiers`, `ref`, `...${}` and a bare `${}` in a tag (spread when an object or a signal of an object, directive when a function). Marker design: child holes become `<!--$mx$--><!--$mx$-->` (omitted when the hole is the only child of its element), dynamic elements get a temporary `data-mx`; bindings are located by tree-walk index. Whitespace-only text nodes containing a newline are dropped and the template is trimmed. An unquoted value ends at `/>`.
**Events.** Delegated to `document` for common bubbling types unless `.once/.passive/.capture/.direct`; delegated handlers fire only for connected elements. Modifiers: `once passive capture prevent stop self direct`.
**Safety.** `on*` attribute bindings, `srcdoc`, `.innerHTML/.outerHTML` and unsafe URLs in URL-valued attributes/props throw (and so reach error boundaries); `unsafe(str)` is the single opt-out (also parsed-HTML children); `isSafeUrl` is exported.
**Control flow.** `show(when, then, else)` passes `then` an accessor for the value; `match` keys by `String(value)` with `_` fallback; `each(items, key, render, fallback?)` has an optional fallback, item/index accessors are lazy signals, rows are located by their first/last node, prefix/suffix trim + LIS moves, duplicate keys throw. `suspense(fallback, view)` renders `view` eagerly and keeps it detached while pending; `SuspenseContext = { register(promise), pending() }` is what wave 2's `resource` uses (`registerPending`, `useSuspense`, and `SuspenseCtx` are exported from core and dom). `lazy` exposes `.preload()`. `errorBoundary` also catches event-handler errors and handles sync render errors in the same pass (no empty flash).
**Components.** `children(fn)` resolves eagerly to an `Accessor<Node[]>`; `mergeProps` accepts reactive sources (functions); `splitProps` returns getter views.
**Store.** `createStore` uses the given object as backing storage, tracks per object+key (lazily created signals, only when read inside a computation), `Object.keys/in/length` track structure, array mutators are batched and untracked, only plain objects/arrays/non-frozen are proxied. `produce(state, fn)` returns the store. `reconcile(target, next, { key })` takes a store/array/object target and an optional key name or function.
**Testing.** `mount`, `cleanup`, `flush` (async, flushes effects around a few microtask ticks), `fire` (typed events, assigns `value`/`checked`), `waitFor`.
**Hydration (design only).** The comment-marker pairs and walk-index binding described above are what `hydrate` will adopt: walk server nodes in the same order as the client's clone walk instead of cloning. `suspense`/`each` fragments already carry their own marker comments.
**Size.** Minified+gzip, everything exported (no tree-shaking): core 2.9 kB, core+dom 11.0 kB, +store 12.1 kB; the target of 9 kB for core+dom is not met yet (the template scanner and error messages dominate); a tree-shaken counter app is 7.8 kB total.

Wave 2 B (`form`, `ssr`, `devtools`). Names and shapes follow the contract; additions and deviations:

**Form.** `createForm({ initial, schema, onSubmit, validateOn, debounce, validators })`; `f.field(path, { validate, debounce })` gives `{ value (signal), error, errors, touched (signal), dirty, validating, errorId, set, bind, validate, reset }`; `bind` is a spread directive for input/textarea/select/checkbox/radio/number/file and manages `aria-invalid`/`aria-describedby`. `f.array(path)` has `items` (stable keys), `add/remove/move/swap/clear`; per-path state (touched, errors) moves with the items. Validators are sync or async functions or built-ins (`required minLength maxLength pattern email min max equalsField`); typing-triggered validation is debounced, a newer run aborts the older and its result is dropped. `schema` is Standard Schema or a function `(values) => ({ path: message })`; `onSubmit` receives the schema output. `f.submit` prevents default, validates, focuses the first invalid field, catches errors into `f.submitError()`; `f.setErrors` takes server errors. Devtools time travel and SSR both work with forms (bind writes `value/checked/selected` on the server).

**SSR.** `renderToString(view, { url, timeout, ... })` is async (it waits for resources): it returns `Promise<string>`. It runs on a small virtual DOM (`ssr/vdom.ts`, parser, serializer), no jsdom, installed through a seam `dom/env.ts` (`doc()`, hooks that are `null` in browsers). The end marker of a child hole is now `<!--/$mx$-->` (start stays `<!--$mx$-->`). Template instances are tagged for hydration (`data-mx-i="seq:hash"` on single roots, `<!--mx:seq:hash-->`..`<!--/mx:seq-->` around fragments); `hydrate(view, container)` claims them in start order (wave 3: the sequence number is taken when the `html` call starts, which is when the client claims; the earlier completion order broke for templates built inside reactive child functions), verifies the template fingerprint and attaches bindings to the existing nodes (identity kept; mismatches warn through `onMismatch`). `renderToStream` returns `ReadableStream<string>`: shell, then `<template>` + inline swap script per ready suspense boundary, then the state. `TransferState` (+ `serializeState`/`stateScript`, escaping `< > & U+2028 U+2029`) carries resource results; `useServer()`/`isServer()` expose the request URL. Compiled templates are cached separately for server and client.

**Devtools.** `installDevtools()` from `maximus/devtools` (exposed as the `devtools` namespace from the root entry because `core` already exports the hook installer of the same name) keeps a bounded timeline, `snapshot()` of the owner tree and named signals, `timeTravel()` over `signal(v, { debug: true })`, and `devtoolsPanel()`. Core got small additions: `SignalOptions.debug`, `signal:write` carries `prev` and `set`, `owner:create` carries `parent` and `owner`, `computed:update` carries `path`.

Wave 3 (integration + examples). **Router + SSR.** `createRouter` without a `history` option reads `useServer()?.url` and uses a memory history; the server render waits for the first navigation (`registerPending`), `document.title` is not written on the server, and the first navigation never runs inside a View Transition (it commits synchronously, which hydration needs; this was a bug found in the browser). **Resource + SSR.** A resource with a `key` writes its settled value to `TransferState` under its cache key hash; on the client a fresh entry is seeded once from `take` (`updatedAt = now`, so `staleTime` decides whether it refetches). While a `ServerCtx` exists the cache is a per-request map (`activeCache()`, `Entry.home` remembers where an entry lives). `ServerCtx`/`useServer` moved to `ssr/context.ts` so `resource` and `router` can use them without importing the renderer. Resources without `key` are not transferred. **Hydration order.** `env.seq()` hands out template sequence numbers at the start of `instantiate` and `env.tag` receives it. Examples: `examples/shop`, `examples/dashboard`, `examples/ssr`; `npx vite build` works inside each (the root `vite.config.ts` uses `INIT_CWD` as the Vite root when run from `examples/*`). Known gaps: loader data is not transferred (pages that must hydrate use a keyed `resource`); no selective hydration; no retry/polling in `resource`.
