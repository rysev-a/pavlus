# Comparison with other frameworks

An attempt at a fair comparison. Maximus is 0.1: two thirds of a framework by feature count, one person's design, no production users. Where a mature framework is simply better, this page says so.

**How to read the numbers.** Maximus sizes and benchmark figures were measured in this repo ([performance](./performance.md)). Figures for other frameworks are rough orders of magnitude from general knowledge, **not measured here**, and change between versions; check them yourself before deciding anything.

## At a glance

| | Maximus | React | Solid | Svelte 5 | Vue 3 | Lit | pavlus (this repo) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Update model | fine-grained signals | re-render + diff | fine-grained signals | compiled signals ("runes") | proxy-based reactivity + vdom | re-render of one template via lit-html, reactive properties | pure `diff(prev, next)` generated per template |
| Components run | once | on every state change | once | once (compiled) | `setup` once, render fn repeatedly | `render()` per update | not applicable: view is a compiled template |
| Templates | tagged literals, runtime | JSX (needs transform) | JSX (needs compiler) | `.svelte` (needs compiler) | SFC templates / JSX (compiler) | tagged literals, runtime | pug-like `.pavlus` (Vite plugin required) |
| Build step required | no | in practice yes (JSX) | yes | yes | in practice yes (SFC) | no | yes |
| Runtime size (gzip, rough) | 7.9-11 kB (core+dom) | tens of kB | ~ 7 kB | a few kB + compiled code | ~ 30 kB | ~ 5-6 kB | small runtime, compiler output |
| State outside components | signals, stores | context, external libs | signals, stores | runes, stores | refs, pinia | reactive controllers | message-driven store plugin |
| Router / forms / SSR | designed, wave 2 | ecosystem | solid-router, SolidStart | SvelteKit | vue-router, Nuxt | ecosystem | router plugin, SSR+hydration exist |
| Maturity | 0.1, new | very high | high | high | very high | high | 0.1, new |

## Where Maximus is better (or at least different in a useful way)

- **No compiler needed, and not worse for it.** Compared with Solid, Svelte and Vue SFCs, you can run Maximus from a text editor and a module script. Debugging is debugging your own code. Compared with React, there is no JSX transform.
- **Ownership is explicit and complete.** Effects, listeners, children, context and error handlers are all in one tree; `debugStats()` makes leaks testable. React gets here with discipline (`useEffect` cleanups), Solid has the same model, Svelte and Vue manage it for you but with less visibility.
- **Security defaults.** `on*` attributes, `srcdoc`, `innerHTML` and `javascript:` URLs are rejected at binding time, with one greppable opt-out (`unsafe`). Other frameworks also escape text by default and have explicit opt-outs (`dangerouslySetInnerHTML`, `v-html`, `{@html}`), but most leave URL schemes and inline-handler attributes to the author or to lint rules. This is a modest advantage, not a security audit: Maximus has had none.
- **Testing is in the box.** `mount`, `fire`, `flush`, `waitFor` ship with the package and are synchronous where they can be. React Testing Library does more (queries by role) but is a separate install.
- **Compared with React.** No stale closures or dependency arrays; no memoisation; updating one cell does not re-run its component. Keyed list moves use LIS.
- **Compared with Lit.** Lit is also build-free, but its unit of update is a whole template (cheap diff of the holes); Maximus updates one binding. Lit components are custom elements (shadow DOM, interop) - Maximus components are functions with no DOM encapsulation.
- **Compared with pavlus.** Maximus trades purity for ergonomics. Pavlus's application code is 100% pure (state in, effects out), which makes time-travel, replay and deterministic tests natural, and its compiler can skip subtrees by static dependency analysis. The cost: a custom template language, mandatory plugin/build, message boilerplate for every interaction, immutable state discipline. Maximus lets you write `count.update(...)` and call `fetch` where you need it, and is easier to learn; pavlus is easier to *reason about* in large teams that value the discipline. They can coexist (the repo contains both).
- **Async and error handling designed together** (once wave 2 lands): resource, action, suspense and errorBoundary share one owner tree.

## Where Maximus is worse or immature

Be realistic about these; several are decisive.

- **Ecosystem: none.** No component libraries, no devtools extension, no UI kits, no tutorials, no Stack Overflow answers, no hiring pool. React, Vue, Svelte and Solid have all of these to varying degrees. If you need a date picker, you write it (or wrap a vanilla one).
- **Tooling.** No IDE plugin: html templates are strings to editors unless you add a lit-style highlighter. No HMR that preserves state (a rebuild remounts). No lint rules. No type-checking of template contents: `@click=${wrongType}` is only caught at runtime. Svelte and Vue have language servers; React/Solid have JSX typing.
- **No compiler = missed optimisations.** Solid and Svelte compile templates to exact DOM instructions, avoiding runtime parsing and the cost of the scanner (a big part of our 11 kB). Compiled output is also smaller for small apps. Maximus parses each call site's template once at runtime and re-binds by walk index; this is fast after the first call, but the first render of a large template pays parse time. A compiler is described as optional future work and does not exist.
- **Size.** core + dom is 11.1 kB gzip (target was 9 kB, not met); a tree-shaken counter is 7.9 kB. That is comparable with Solid's runtime, bigger than Lit (~5-6 kB), and far bigger than a Svelte "hello world". It is smaller than React + ReactDOM and Vue, which is a real advantage, but not a headline one.
- **Missing features compared with mature frameworks** (not exhaustive): transitions/animation helpers, a stable SSR story (no `renderToString`/`hydrate` yet, **no Suspense streaming yet**), server components / resumability (Qwik, React), concurrent rendering / time slicing (React), custom elements output (Lit; Svelte/Vue can compile to them), native/mobile targets, a community-reviewed accessibility component set, DevTools UI (the hook exists, the panel does not).
- **Performance claims are unproven.** Benchmarks are jsdom only. They show no pathological behaviour (constant-time single-row updates, LIS list moves) but say nothing about browser frame times or memory versus Solid/Svelte/Vue Vapor. The js-framework-benchmark has not been run.
- **Single-author design, no stability promise.** The API in DESIGN.md is "fixed" for the project, not for the world. Expect breakage before 1.0.
- **Runtime-only signals have footguns.** Destructuring props, reading signals after `await`, calling `t()` outside a function in a template, forgetting that a delegated handler needs a connected element - these are Solid-like pitfalls; React users hit different ones. A compiler (Solid, Svelte) can prevent some of them.
- **Hydration is design-only** (see [SSR](./concepts/ssr.md)), so SEO-driven content sites should not choose Maximus yet.

## Per-framework notes and migration

### From React

| React | Maximus |
| --- | --- |
| `const [n, setN] = useState(0)` | `const n = signal(0)`; read `n()`, write `n.set(v)` / `n.update(f)` |
| `useMemo(() => f(a, b), [a, b])` | `computed(() => f(a(), b()))` (no dependency list) |
| `useEffect(() => { ...; return cleanup }, [dep])` | `effect(() => { dep(); ...; return cleanup })`; or `onCleanup` |
| `useRef` | `ref=${(el) => ...}` or a `signal<Element \| null>(null)` passed as `ref` |
| `useContext` | `Ctx.use()`; provider is `Ctx.provide(value, () => view)` |
| conditional JSX `{a && <B/>}` | `show(() => a(), () => B())` |
| `list.map(x => <li key={x.id}>)` | `each(list, x => x.id, (x) => html\`<li>...\`)` - `x` is an accessor |
| `className` / `onClick` | `class` / `@click` |
| `<Suspense>`, `<ErrorBoundary>` | `suspense(fallback, view)`, `errorBoundary(fallback, view)` |
| Props destructuring | don't: read `props.x` inside bindings |

Biggest mental shift: your component function does not run again. Put reactive reads in functions inside the template.

### From Solid

Closest relative. `createSignal` returns a `[get, set]` tuple, Maximus's `signal` is one callable with `.set/.update/.peek`. `createMemo` = `computed`, `createEffect` = `effect` (note first-run timing, see [signals](./concepts/signals.md#when-do-effects-run)), `createRoot` = `root`, `onCleanup`, `createContext` all map directly. `<Show>`, `<For>`, `<Match>` become the functions `show`, `each`, `match`. Solid's stores map to `createStore`, `produce`, `reconcile`. JSX becomes `html` templates; `ref`, `use:`, spread become `ref=${}` and `${directive}`. You lose Solid's compiler optimisations and ecosystem.

### From Svelte 5

`$state` -> `signal`, `$derived` -> `computed`, `$effect` -> `effect`, `{#if}` -> `show`, `{#each}` -> `each`, `bind:value` -> `.value=${s}` + `@input`. There is no `bind:` sugar yet (forms wave 2). Stores (`writable`) map to signals.

### From Vue 3

`ref` -> `signal` (explicit `()` instead of `.value`), `reactive` -> `createStore`, `computed`, `watchEffect` -> `effect`, `watch(src, cb)` -> `effect(() => { const v = src(); untrack(() => cb(v)) })`, `provide/inject` -> `createContext`. `v-if` -> `show`, `v-for :key` -> `each`, `v-model` -> property + event.

### From Lit

`html` tagged templates are nearly identical in spirit: `@click`, `.prop`, `?bool` have the same syntax. Differences: Maximus has no `class` extends/decorators, no shadow DOM, state is signals rather than reactive properties, and reactivity comes from passing functions or signals into holes rather than from re-rendering `render()`. `repeat` is `each`, `when` is `show`, `ifDefined` is just `null`/`undefined`, `classMap` is `class=${{...}}`, `styleMap` is `style=${{...}}`, `ref` is `ref`.

### From pavlus

State: `state.x` read by the template -> signals/stores; message handlers `(msg, state) => Effect[]` -> plain functions that set signals and call APIs; effects as data (http, time, ws) -> direct calls inside `effect`/`onCleanup` (or wave 2 `resource`/`action`); `.pavlus` templates -> `html`. If you valued purity, keep pavlus; you lose store `undo`/`restoreTo` history built-ins (the [undo recipe](./recipes.md#8-undoredo-with-a-store) rebuilds the useful part), and message replay.

## When not to use Maximus

- You need a **large ecosystem** (UI kits, data grids, charts, auth libs with first-class bindings): use React, Vue or Svelte.
- You need **production SSR with streaming, SEO-critical content, or server components today**: use Next/Remix, SvelteKit, Nuxt, SolidStart or Astro. Maximus's `ssr` module has not shipped.
- You need **long-term API stability** or a vendor/community behind the framework: Maximus is 0.1.
- You need the **smallest possible bundle for a tiny widget**: Svelte or hand-written DOM, or Lit/Preact for web components. A Maximus counter is 7.9 kB gzip.
- You need **web components as the deliverable** (design system consumed by any framework): use Lit or Stencil.
- You need a **team with strict static guarantees on templates**: Maximus does no compile-time checking.
- You are on **React Native / native targets**: Maximus is DOM only.
- You need **framework-level concurrency features** (time slicing, transitions that keep old UI): not present.

## When Maximus is a good fit

- Interactive widgets and apps where you want fine-grained updates **without** a build tool, or with whichever bundler you already have.
- Embeddable components (a script tag, a few kB, no global runtime state besides the delegated listeners).
- Teaching fine-grained reactivity: the model is small and the whole core is 2.9 kB gzip.
- Projects that value an explicit ownership/cleanup model and safe-by-default templates, and are willing to build around a young framework.
