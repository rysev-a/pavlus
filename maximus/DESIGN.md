# Maximus

A small frontend framework designed from first principles for the best developer **and** user experience.
Where pavlus is "pure messages and effects, compiled templates", Maximus is "fine-grained signals, real DOM, zero build required".

## Thesis (what is different, and why)
1. **Signals, not diffing.** State is `signal`/`computed`; a binding subscribes to exactly the signals it reads and updates exactly one DOM node. No virtual DOM, no component re-render, no dependency arrays, no stale closures. Components are plain functions that run **once**.
2. **No build step required.** Templates are tagged template literals (`html`...``). The static HTML of a template is parsed once, cloned per use, and bindings are located by index (lit-html/Solid style). A compiler is an optional optimisation, never a requirement; plain `.ts` files run in the browser through any bundler or even native ESM.
3. **Ownership scopes.** Every effect, computed, event listener and child component belongs to an *owner*. Disposing an owner disposes everything beneath it (no leaks by construction). `onCleanup`, `context` (provide/use) and error boundaries all ride on the owner tree.
4. **Async is first class.** `resource` (queries: keyed cache, dedupe, abort, stale-while-revalidate, refetch, optimistic `mutate`) and `action` (mutations: pending/error/result, invalidation of resources by key). `suspense` boundaries show fallbacks while resources load; `errorBoundary` catches errors from render, effects and resources.
5. **Batteries on the same primitives:** router (nested layouts, loaders, guards, prefetch, view transitions, scroll restoration, typed params), forms (schema validation, per-field signals, dirty/touched, async validators), stores (deep reactive objects with path-level tracking), i18n-ready formatting helpers.
6. **Server and hydration without double work:** `renderToString` / `renderToStream` (with suspense streaming) and `hydrate` that adopts server DOM using markers; islands by simply hydrating a subtree.
7. **Observable by design:** one tiny hook (`__MAXIMUS__`) emits signal writes, effect runs, mounts and router events with owner paths; a devtools panel/time-travel can be built on it. Testing helpers (`mount`, `flush`, `fire`) are part of the package.
8. **Accessible and fast by default:** built-in focus management on route change, live-region announcer, `prefers-reduced-motion` aware transitions, event delegation for common events, keyed list reconciliation with LIS moves, batched microtask scheduling, tiny size (core <= 4 kB gz target, dom+core <= 9 kB).

## Package layout (`maximus/src`, ESM, TypeScript strict, no dependencies)
`core/`  signal, computed, effect, batch, untrack, owner (root, onCleanup, context, errors), scheduler, devtools hook
`dom/`   html, svg, render, bindings, control flow (show, each, match, portal, lazy, suspense, errorBoundary), component helpers, hydrate
`store/` createStore (proxy, path tracking), produce, reconcile
`resource/` resource, action, cache, invalidate
`router/` createRouter, routes, link, params/query signals, loaders, guards, prefetch, transitions
`form/`  createForm, field, validators, standard-schema adapter
`ssr/`   renderToString, renderToStream, hydrate markers
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
