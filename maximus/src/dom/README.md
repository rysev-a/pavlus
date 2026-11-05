# maximus/dom

Templates, bindings and control flow on real DOM. Components are plain functions that run **once**; a binding subscribes to exactly the signals it reads and updates exactly one node.

```ts
import { html, render, signal, show, each } from "maximus";

function Counter() {
  const n = signal(0);
  return html`<button @click=${() => n.update((c) => c + 1)}>clicked ${n} times</button>`;
}
render(() => Counter(), document.body); // returns dispose()
```

## html

The static parts of a template literal are parsed once (cached by the identity of the `strings` array, i.e. per call site) into a `<template>`; each call clones it and binds the holes by their position in a tree walk. It returns an `Element` when there is a single root element, otherwise a `DocumentFragment`.

| hole | meaning |
| --- | --- |
| `<p>${x}</p>` | child: text, number, `Node`, array, nested template, or a **function/signal** (reactive) |
| `class=${x}` `title="a ${x} b"` | attribute (null/undefined/false removes it, true sets `""`); several holes build one string |
| `.value=${x}` | DOM property (a function is a getter; wrap `() => fn` to assign a function) |
| `?disabled=${x}` | boolean attribute |
| `@click=${fn}` | event listener, modifiers: `.once .passive .capture .prevent .stop .self .direct` |
| `ref=${fn \| signal}` | receives the element at creation (use `onMount` for attached work); a signal is reset to `null` on dispose |
| `style=${{ color: c, "--x": v }}` | object (values may be functions/signals) or string |
| `class=${["a", { on: flag }]}` | string, array, or object of `name: boolean \| signal`; classes you did not add are left alone |
| `...${obj}` or `<a ${obj}>` | spread of attribute-position keys (`@click`, `.prop`, `?bool`, `ref`, `class`...); pass a signal for a reactive spread; a plain function is a directive `(el) => cleanup?` |

```ts
const items = signal(["a", "b"]);
html`
  <ul>
    ${each(items, (s) => s, (item, index) => html`<li>${index}: ${item}</li>`)}
  </ul>
`;
```

Things worth knowing:

- Whitespace-only text containing a newline between tags is dropped (like JSX), and leading/trailing whitespace of the template is trimmed. Put an explicit `${" "}` where a space matters.
- An unquoted attribute value ends at `/>`, so `<path d=${x}/>` works (HTML itself would swallow the `/`).
- No holes in tag names, closing tags, or inside `<script>/<style>/<textarea>/<title>`: these throw a clear error at first use.
- Delegated events (click, input, change, key*, pointer/mouse down/up, focusin/out, ...) share one listener per type on `document`; this keeps rows cheap but means a delegated handler only fires for **connected** elements. Add `.direct` (or `.capture/.once/.passive`) for a real listener on the element. Handlers run in a `batch` and untracked, with `this` = the element, and their errors go to the nearest `errorBoundary`.
- `svg` is `html` for SVG fragments: `svg\`<circle r=${r}/>\``. Inside an `<svg>` in an `html` template the parser already uses the SVG namespace.

## Safety by construction

- Text is created with `createTextNode`; values are never parsed as markup.
- Attribute values are set with `setAttribute`; a value cannot close the attribute or add another.
- `on*` attribute bindings (`onclick=${...}`, also through a spread) are **rejected**: use `@click`.
- `href`/`src`/`action`/`formaction`/`poster`/`xlink:href`/... (attribute and `.prop` forms, composite values too) reject `javascript:`, `vbscript:` and non-image `data:` URLs (whitespace/control-character obfuscation is normalised first). `isSafeUrl(url)` is exported.
- `srcdoc`, `.innerHTML`, `.outerHTML` are rejected.
- The one way out is wrapping the value in `unsafe(str)`, which also lets a child insert parsed HTML. It is greppable on purpose; never feed it user input.

Rejections throw `Error`s from the binding (so they land in the nearest `errorBoundary`).

## Control flow

All of these return a `DocumentFragment` delimited by two comment markers; their content is kept current by effects owned by the caller's owner.

```ts
show(() => user(), (u) => html`<p>${() => u().name}</p>`, () => html`<p>sign in</p>`);
// the branch is rebuilt only when truthiness flips; `u` is an accessor of the value

match(() => status(), { loading: () => Spinner(), ready: () => View(), _: () => "?" });

each(() => todos(), (t) => t.id, (todo, index) => html`<li>${() => todo().text}</li>`, () => "nothing");
```

**`each`** is keyed. `item` and `index` are accessors that update in place when the same key reappears with new data or at a new position, so a row is created once per key, never re-created. Reconciliation trims the common prefix/suffix, then moves the minimum number of rows (longest increasing subsequence) and disposes removed rows (their effects, listeners and cleanups). Keys must be unique (a duplicate throws). A row may render any number of nodes. Combine with `createStore` so only the changed field's text node updates.

```ts
portal(document.body, () => html`<dialog open>...</dialog>`); // removed on dispose
const Chart = lazy(() => import("./chart.ts")); // module default export, or the component itself
suspense(() => html`<p>loading</p>`, () => html`${Chart({})}`);
errorBoundary((err, reset) => html`<button @click=${reset}>${String(err)} - retry</button>`, () => App());
```

- **suspense(fallback, view)** creates `view` immediately (so loading starts), keeps it alive but detached while anything registered with `registerPending(promise)` below it is pending, shows the fallback meanwhile, and swaps back when all settle. A later registration shows the fallback again. The nearest boundary wins.
- **lazy** registers its import with the nearest boundary; `Chart.preload()` starts it early; a failed import throws into the nearest `errorBoundary`.
- **errorBoundary(fallback, view)** catches errors thrown while rendering `view` and by any effect, event handler or resource created under it. `reset()` throws the fallback away and renders `view` afresh. An error thrown by the fallback propagates to the next boundary up.
- **portal(target, view)** renders into an element or selector; returns a placeholder comment.

## Component helpers

```ts
function Card(props: { title: string; children?: () => Child }) {
  const kids = children(() => props.children?.()); // resolved once into Node[]
  return html`<section><h2>${() => props.title}</h2>${kids}</section>`;
}
const merged = mergeProps({ size: "m" }, props); // live view, later wins, undefined does not override
const [mine, rest] = splitProps(props, ["label"]); // getters, nothing is read; rest is a live view
html`<button ...${rest}>${() => mine.label}</button>`;
```

Props are plain objects; reactive props are signals/getters the caller passes (`Card({ get title() { return t(); } })`). Never destructure props in the component body, that reads them once.

## Hydration and the environment seam

`env.ts` is the only place where the DOM layer looks at its environment: `doc()` is `document` unless `maximus/ssr` installed a virtual document (server), plus a few optional hooks (`tag`, `claim`, `pending`, `suspense`, `mismatch`) that are `null` in a browser, so the browser path costs one nullish check per `html` call.

Markers: each child hole is `<!--$mx$-->` ... `<!--/$mx$-->` (or none when it is the only child of its element); control-flow fragments carry their own comments (`<!--each-->`, `<!--suspense-->`, ...). `maximus/ssr` renders with these, tags every template instance, and `hydrate` walks the server nodes in the same element/comment order as the client's clone walk (skipping hole content), so binding indexes match and bindings attach to the existing nodes. See `src/ssr/README.md`.
