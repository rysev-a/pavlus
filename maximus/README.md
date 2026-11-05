# Maximus

A small frontend framework on **fine-grained signals** and **real DOM**. Components are functions that run once, templates are tagged template literals, and every effect, listener and child belongs to an owner that cleans up after itself. No virtual DOM, no dependency arrays, no compiler required.

> **Status: 0.1 (wave 1).** `core`, `dom`, `store` and `testing` are implemented, tested (200+ tests, jsdom) and documented. `resource`, `router`, `form`, `ssr` and devtools are being built (wave 2) and appear in the docs as *API as designed*. Not published to npm yet.

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
import { signal, computed, html, render, each, show, createStore } from "maximus";

function TodoApp() {
  const state = createStore({ todos: [{ id: 1, text: "try Maximus", done: false }] });
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
      <input .value=${text} @input=${(e: Event) => text.set((e.target as HTMLInputElement).value)} />
      <button ?disabled=${() => !text().trim()}>add</button>
    </form>
    <ul>
      ${each(() => state.todos, (t) => t.id, (todo) => html`
        <li class=${() => (todo().done ? "done" : "")}>
          <input type="checkbox" .checked=${() => todo().done}
                 @change=${() => (todo().done = !todo().done)} />
          ${() => todo().text}
        </li>`)}
    </ul>
    <p>${left} left</p>
    ${show(() => left() === 0, () => html`<p>All done.</p>`)}
  `;
}

render(TodoApp, document.getElementById("app")!);
```

More: [`examples/counter`](./examples/counter), [`examples/todo`](./examples/todo) (keyed list, filters, persistence), and ten tested [recipes](./docs/recipes.md).

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

**As designed, wave 2 (not shipped)**: `resource`/`action`, router, forms, SSR/hydration/streaming, devtools panel. Docs: [async](./docs/concepts/async.md), [routing](./docs/concepts/routing.md), [forms](./docs/concepts/forms.md), [SSR](./docs/concepts/ssr.md).

## Documentation

[Index](./docs/index.md) · [Getting started](./docs/getting-started.md) · Concepts: [signals](./docs/concepts/signals.md), [ownership](./docs/concepts/ownership.md), [templates](./docs/concepts/templates.md), [stores](./docs/concepts/stores.md), [async](./docs/concepts/async.md), [routing](./docs/concepts/routing.md), [forms](./docs/concepts/forms.md), [SSR](./docs/concepts/ssr.md) · [Testing](./docs/testing.md) · [Performance](./docs/performance.md) · [Recipes](./docs/recipes.md) · [Comparison](./docs/comparison.md) · [DESIGN.md](./DESIGN.md) · module READMEs: [core](./src/core/README.md), [dom](./src/dom/README.md).

## Status and roadmap

Done: wave 1 as above.

In progress (wave 2): resource/action, router, form, ssr, devtools UI.

**What is not done (honest list)**

- No `resource`/`action`, router, forms or SSR in the shipped code; the docs for them describe the design, not behaviour you can run.
- No hydration or streaming; `hydrate` only has a marker design.
- Not published; no pre-built `dist/` for plain `<script>` use (you build it once; see getting started).
- core + dom is 11.1 kB gzip, above the 9 kB target. No compiler exists; a compiler is only an idea.
- Benchmarks run in jsdom only; there are no browser numbers and no cross-framework comparison.
- No devtools UI, no HMR with state, no editor support for templates, no compile-time template type checking.
- No accessibility helpers yet (focus management on route change, announcer) because they depend on the router.
- No security audit; the safety rules are tested but unreviewed by third parties.
- API may change before 1.0.

See [comparison](./docs/comparison.md#when-not-to-use-maximus) for when to pick something else.
