# Maximus

A small frontend framework on **fine-grained signals** and **real DOM**. Components are functions that run once, templates are tagged template literals, and every effect, listener and child belongs to an owner that cleans up after itself. No virtual DOM, no dependency arrays, no compiler required.

> **Status: 0.1.** `core`, `dom`, `store`, `testing`, `resource`, `router`, `form`, `ssr` and `devtools` are implemented, tested (450+ tests, jsdom and Node) and documented, and three example apps (a routed shop, a dashboard, server rendering with hydration) are built on them. Not published to npm yet; the API may still change.

## Install

Not on npm yet. Use the sources in this repository (`maximus/src`, TypeScript, ESM, zero dependencies):

```sh
git clone <this repository> && cd maximus
npm install        # dev dependencies only: vitest, jsdom, vite, typescript
npm test           # vitest run
npm run bench      # jsdom benchmark
```

In an app, alias `maximus` to `maximus/src/mod.ts` (Vite: `resolve.alias`), or build one `maximus.mjs` for plain `<script type="module">` use. See [getting started](./docs/getting-started.md).

## A 30-line example

```ts
import {
  signal,
  computed,
  html,
  render,
  each,
  show,
  createStore,
} from "maximus";

function TodoApp() {
  const state = createStore({
    todos: [{ id: 1, text: "try Maximus", done: false }],
  });
  const text = signal("");
  const left = computed(() => state.todos.filter((t) => !t.done).length);
  let nextId = 2;

  const add = (e: Event) => {
    e.preventDefault();
    if (!text().trim()) return;
    state.todos.push({ id: nextId++, text: text(), done: false });
    text.set("");
  };

  return html`
    <form @submit=${add}>
      <input
        .value=${text}
        @input=${(e: Event) => text.set((e.target as HTMLInputElement).value)}
      />
      <button ?disabled=${() => !text().trim()}>add</button>
    </form>
    <ul>
      ${each(
        () => state.todos,
        (t) => t.id,
        (todo) =>
          html` <li class=${() => (todo().done ? "done" : "")}>
            <input
              type="checkbox"
              .checked=${() => todo().done}
              @change=${() => (todo().done = !todo().done)}
            />
            ${() => todo().text}
          </li>`,
      )}
    </ul>
    <p>${left} left</p>
    ${show(
      () => left() === 0,
      () => html`<p>All done.</p>`,
    )}
  `;
}

render(TodoApp, document.getElementById("app")!);
```

More: [`examples/counter`](./examples/counter), [`examples/todo`](./examples/todo) (keyed list, filters, persistence), [`examples/shop`](./examples/shop) (router, resource, store, form, action with optimistic update), [`examples/dashboard`](./examples/dashboard) (SVG charts, live stream, keyed sortable table), [`examples/ssr`](./examples/ssr) (Node script, no jsdom, plus a hydrating client), and ten tested [recipes](./docs/recipes.md).

## Features

**Shipped (wave 1)**

- `signal`, `computed` (lazy, cached, glitch-free), `effect`, `batch`, `untrack`; equal writes notify nobody; cycles fail loudly.
- Owner tree: `root`, `onCleanup`, `onMount`, `createContext`, `catchError`, `getOwner`/`runWithOwner`; leak counters (`debugStats`).
- `html`/`svg` templates: attributes, `.props`, `?booleans`, `@events` with modifiers and delegation, `ref`, `class`/`style` objects, spread and directives; whitespace rules like JSX.
- Safe by construction: no markup parsing of values, `on*`/`srcdoc`/`innerHTML`/script URLs rejected, one `unsafe()` opt-out.
- Control flow: `show`, `match`, keyed `each` (prefix/suffix trim + LIS moves), `portal`, `lazy`, `suspense`, `errorBoundary`.
- Props helpers: `children`, `mergeProps`, `splitProps`.
- Stores: deep reactive objects with per-property tracking, `produce`, `reconcile`, `unwrap`.
- Testing helpers: `mount`, `fire`, `flush`, `waitFor`, `cleanup`.
- Devtools hook (`globalThis.__MAXIMUS__`): signal writes, effect runs, owner create/dispose, errors, mount/unmount, with owner paths.
- Size: core 2.9 kB, core+dom 11.1 kB, +store 12.1 kB (gzip, nothing tree-shaken); a counter app is 7.9 kB.

**Shipped (wave 2)**

- `resource` (keyed shared cache, dedupe, abort, stale-while-revalidate, `mutate`) and `action` (pending/error/result, optimistic updates with rollback, invalidation); [async](./docs/concepts/async.md).
- Router: nested layouts, guards, loaders, typed params, query signals, prefetching links, focus/announcer/scroll handling, view transitions; reads the request URL when server rendering; [routing](./docs/concepts/routing.md).
- Forms: per-field signals, sync/async validators, Standard Schema, arrays, `bind` directive with ARIA wiring; [forms](./docs/concepts/forms.md).
- SSR: `renderToString`, `renderToStream` (suspense streaming) without jsdom, `hydrate` that keeps node identity, resource results transferred to the client; [SSR](./docs/concepts/ssr.md).
- Devtools: `installDevtools()` timeline, snapshot, time travel over named signals, a panel.

## Documentation

[Index](./docs/index.md) · [Getting started](./docs/getting-started.md) · Concepts: [signals](./docs/concepts/signals.md), [ownership](./docs/concepts/ownership.md), [templates](./docs/concepts/templates.md), [stores](./docs/concepts/stores.md), [async](./docs/concepts/async.md), [routing](./docs/concepts/routing.md), [forms](./docs/concepts/forms.md), [SSR](./docs/concepts/ssr.md) · [Testing](./docs/testing.md) · [Performance](./docs/performance.md) · [Recipes](./docs/recipes.md) · [Comparison](./docs/comparison.md) · [DESIGN.md](./DESIGN.md) · module READMEs: [core](./src/core/README.md), [dom](./src/dom/README.md), [resource](./src/resource/README.md), [router](./src/router/README.md), [form](./src/form/README.md), [ssr](./src/ssr/README.md), [devtools](./src/devtools/README.md).

## Status and roadmap

Done: waves 1 and 2 (core, dom, store, testing, resource, router, form, ssr, devtools) and wave 3 (integration: router + resource + hydration wired together, three example apps verified in a real browser).

**What is not done (honest list)**

- Hydration is all-or-nothing per container: no selective or progressive hydration, and streamed boundaries must be complete before `hydrate`. Router loader data is not transferred to the client (only keyed `resource`s are).
- `resource` has no retry/backoff, polling or refetch-on-focus; there is no infinite-query helper.
- Not published; no pre-built `dist/` for plain `<script>` use (you build it once; see getting started).
- core + dom is 11.1 kB gzip, above the 9 kB target. No compiler exists; a compiler is only an idea.
- Benchmarks run in jsdom only; there are no browser numbers and no cross-framework comparison.
- The devtools panel is minimal; no browser extension, no HMR with state, no editor support for templates, no compile-time template type checking.
- Accessibility helpers exist for routing (focus, announcer) and forms (`aria-invalid`, `aria-describedby`), but there is no component set and no screen-reader test beyond DOM assertions.
- No security audit; the safety rules are tested but unreviewed by third parties.
- API may change before 1.0.

See [comparison](./docs/comparison.md#when-not-to-use-maximus) for when to pick something else.
