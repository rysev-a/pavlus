# Maximus

Maximus is a small frontend framework built on **fine-grained signals** and **real DOM**. You write components as plain functions that run once, you describe views with tagged template literals, and the framework updates exactly the DOM nodes whose inputs changed. There is no virtual DOM, no re-rendering of components, no dependency arrays and no compiler requirement.

> **Status: 0.1, wave 1 shipped.** `core`, `dom`, `store` and `testing` are implemented and tested. `resource`, `router`, `form`, `ssr` and devtools UI are being built in wave 2; their pages in these docs are marked **API as designed** and describe the contract in `DESIGN.md`, not shipped code. See the [README](../README.md#status-and-roadmap) for the honest list of what is not done.

## The 2-minute version

```ts
import { signal, computed, html, render, each, show } from "maximus";

function Todos() {
  const items = signal([{ id: 1, text: "write docs", done: false }]);
  const left = computed(() => items().filter((t) => !t.done).length);

  return html`
    <h1>${left} left</h1>
    <ul>
      ${each(items, (t) => t.id, (t) => html`
        <li class=${() => (t().done ? "done" : "")}
            @click=${() => items.update((all) => all.map((x) => x.id === t().id ? { ...x, done: !x.done } : x))}>
          ${() => t().text}
        </li>`)}
    </ul>
    ${show(() => left() === 0, () => html`<p>all done</p>`)}
  `;
}
render(Todos, document.body);
```

What happens when you click an `<li>`: the `items` signal is written, the `left` computed is marked stale, and the bindings that read them (the `<h1>` text, the clicked row's `class`, the `show`) re-run. `Todos` itself never runs again. Other rows are not touched.

## Why it exists

| Problem | Maximus answer |
| --- | --- |
| "Why did this re-render?" | Components run once. Bindings subscribe to exactly the signals they read. |
| Stale closures, dependency arrays | Reads are tracked automatically; there is nothing to list. |
| Leaked listeners, timers, subscriptions | Everything is created under an *owner*; disposing the owner disposes it all. `onCleanup` is the only teardown API you need. See [ownership](./concepts/ownership.md). |
| XSS through templating | Text and attributes are never parsed as markup; `on*`, `srcdoc`, `javascript:` URLs are rejected. See [templates](./concepts/templates.md#security-model). |
| Build tooling required to start | `html` templates are plain JS. A bundler is convenient, not mandatory. |
| Async scattered over userland | `resource`, `action`, `suspense`, `errorBoundary` are part of the same ownership tree (wave 2, [async](./concepts/async.md)). |

## What is in the box

| Module | Import | Status |
| --- | --- | --- |
| core: `signal`, `computed`, `effect`, `batch`, `untrack`, owners, context, errors | `maximus/core` | shipped |
| dom: `html`, `svg`, `render`, `show`, `each`, `match`, `portal`, `lazy`, `suspense`, `errorBoundary`, props helpers | `maximus/dom` | shipped |
| store: `createStore`, `produce`, `reconcile` | `maximus/store` | shipped |
| testing: `mount`, `fire`, `flush`, `waitFor`, `cleanup` | `maximus/testing` | shipped |
| resource: `resource`, `action` | `maximus/resource` | as designed |
| router | `maximus/router` | as designed |
| form | `maximus/form` | as designed |
| ssr: `renderToString`, `renderToStream`, `hydrate` | `maximus/ssr` | as designed |

## Where to go next

- [Getting started](./getting-started.md): a counter in a plain HTML file and with Vite.
- Concepts: [signals](./concepts/signals.md), [ownership](./concepts/ownership.md), [templates](./concepts/templates.md), [stores](./concepts/stores.md), [async](./concepts/async.md), [routing](./concepts/routing.md), [forms](./concepts/forms.md), [SSR](./concepts/ssr.md).
- [Testing](./testing.md), [performance](./performance.md), [recipes](./recipes.md) (runnable, tested code), [comparison with other frameworks](./comparison.md).
