# Templates

`html` is a tagged template literal that returns real DOM. The static markup is parsed **once per call site** into a `<template>` element (cached by the identity of the `strings` array), each call clones it, and the holes are bound by their position in a tree walk. It returns an `Element` when there is a single root element and a `DocumentFragment` otherwise.

```ts
import { html, svg, render } from "maximus";

const view = html`<button class=${cls} @click=${onClick}>${label}</button>`;
render(() => view, document.body);
```

## Every binding kind

| Syntax | Meaning |
| --- | --- |
| `<p>${x}</p>` | **child**: string, number, `Node`, array, nested template, `null/undefined/false` (nothing), or a function / signal (reactive) |
| `class=${x}` | **attribute**. `null`, `undefined`, `false` remove it; `true` sets `""` |
| `title="a ${x} b"` | **composite attribute**: several holes and static text build one string |
| `.value=${x}` | **DOM property**. A function is a getter; to assign a function value, wrap it: `.render=${() => fn}` |
| `?disabled=${x}` | **boolean attribute** (present when truthy) |
| `@click=${fn}` | **event listener** |
| `@click.once.prevent=${fn}` | with modifiers (below) |
| `ref=${fn}` / `ref=${signal}` | receive the element |
| `style=${{ color: c, "--gap": g }}` or a string | **style**; object values may be functions/signals |
| `class=${["a", { on: flag }]}` | **class**: string, array, or object of `name: boolean \| signal`; classes you did not add are left alone |
| `...${obj}` or `<a ${obj}>` | **spread** / **directive** |

"Reactive" means: if the value is a function (or a signal, which is a function) the binding calls it inside an effect and re-applies the result whenever the signals it read change. A plain value is applied once.

```ts
const name = signal("world");
html`
  <input .value=${name} @input=${(e: Event) => name.set((e.target as HTMLInputElement).value)} />
  <p class=${() => ({ shout: name().length > 5 })} title="hello ${name}">Hello, ${name}!</p>
`;
```

### Events

`@type` adds a listener. Modifiers (any order): `.once .passive .capture .prevent .stop .self .direct`.

- Handlers run inside a `batch` and **untracked**, with `this` = the element. Errors thrown go to the nearest `errorBoundary`.
- Common bubbling events (`click dblclick contextmenu input beforeinput change keydown keyup mousedown mouseup pointerdown pointerup focusin focusout`) are **delegated**: one listener per type on `document`, a property on the element. This keeps long lists cheap. A delegated handler only fires for **connected** elements (attached to the document). Add `.direct` (or `.once/.passive/.capture`) to get a real `addEventListener` on the element. Everything else (`submit`, `drag*`, `scroll`, `pointermove`, ...) is always a real listener.
- `.self` ignores events whose target is a descendant; `.prevent`/`.stop` call `preventDefault`/`stopPropagation`.

### ref

`ref=${(el) => ...}` receives the element when it is **created, before it is attached**. For work that needs the element in the document (focus, measuring) use `onMount`. A signal passed as `ref` is set to the element and reset to `null` on dispose.

### Spread and directives

```ts
const attrs = { class: "btn", "@click": onClick, "?disabled": busy, ref: setEl };
html`<button ...${attrs}>go</button>`;
html`<button ${attrs}>go</button>`;                // same
html`<button ${(el: Element) => { el.setAttribute("x", "1"); return () => cleanup(); }}>`; // directive
```

- Keys of a spread use attribute-position syntax: `@click`, `.prop`, `?bool`, `ref`, `class`, `style`, plain attributes.
- Pass a **signal or computed** holding an object for a reactive spread (keys that disappear are removed). A plain arrow function is *not* a reactive spread, it is a directive.
- A plain **function** is a directive: `(el) => cleanup?`, run once with the element; the optional return value is registered with `onCleanup`.
- Spreads are how components forward props: `html\`<button ...${rest}>\``.

### Whitespace and parsing rules

- Whitespace-only text containing a newline between tags is dropped (like JSX) and the template is trimmed. To keep a space, write `${" "}`.
- An unquoted attribute value ends at `/>`, so `<path d=${x}/>` works.
- Holes are not allowed in tag names, closing tags, or inside `<script>`, `<style>`, `<textarea>`, `<title>`; you get a clear error on first use.
- Inside an `<svg>` in an `html` template the HTML parser already uses the SVG namespace. For a standalone SVG fragment use `svg\`<circle r=${r}/>\``.

## Security model

Templates are safe by construction; there is exactly one opt-out.

| Threat | Rule |
| --- | --- |
| Value parsed as markup | Never. Child text is a `createTextNode`; attribute values go through `setAttribute`, so a value cannot close the attribute or add another. |
| Inline handlers | `on*` attribute bindings (`onclick=${...}`, also via spread) **throw**. Use `@click`. |
| Script URLs | `href src action formaction poster xlink:href ...` (attribute and `.prop` forms, composite values too) reject `javascript:`, `vbscript:` and non-image `data:` URLs. Whitespace and control-character obfuscation is normalised first, as browsers do. `isSafeUrl(url)` is exported. |
| Markup properties | `srcdoc`, `.innerHTML`, `.outerHTML` throw. |
| Opt-out | Wrap a string in `unsafe(str)`. It is the only way to insert parsed HTML (as a child) or bypass the checks. It is greppable on purpose; never pass user input. |

A rejection throws an `Error` from the binding, so it reaches the nearest `errorBoundary` instead of silently doing nothing.

What this does **not** protect against: server-side injection, `eval`, a `<a href>` you build from user input that points to a phishing site (only scripting schemes are blocked), CSS injection through a `style` string you assemble yourself, and anything inside `unsafe()`.

## Control flow

All of these return a `DocumentFragment` delimited by comment markers; their content is kept current by effects owned by the caller's owner.

### show

```ts
show(() => user(), (u) => html`<p>${() => u().name}</p>`, () => html`<p>sign in</p>`);
```

The branch is rebuilt **only when truthiness flips**. `then` receives an accessor of the truthy value, so a change from one user to another updates the bindings inside instead of rebuilding.

### match

```ts
match(() => status(), { loading: () => Spinner(), ready: () => View(), _: () => "?" });
```

Keyed by `String(value)`; `_` is the fallback. Re-renders only when the chosen branch changes.

### each: keyed lists

```ts
each(
  () => todos(),                  // items accessor (array | null | undefined)
  (t) => t.id,                    // key: must be unique, else it throws
  (todo, index) => html`<li>${index}: ${() => todo().text}</li>`,
  () => html`<li>nothing</li>`,   // optional fallback when empty
);
```

- `item` and `index` are **accessors** that update in place when the same key appears with new data or at a new position. A row is created once per key and never re-created for data changes.
- Reconciliation trims the common prefix and suffix, then moves the minimum number of rows (longest increasing subsequence), and disposes rows whose key vanished (effects, listeners, `onCleanup`).
- A row may render any number of nodes.
- A row's `item()` changes identity when you replace the array's objects (immutable updates). For fine-grained updates inside a row use a [store](./stores.md) or signals as fields so that only the changed text node updates.

### portal, lazy, suspense, errorBoundary

```ts
portal(document.body, () => html`<dialog open>...</dialog>`); // removed on dispose; target can be a selector
const Chart = lazy(() => import("./chart.ts"));              // default export or the component itself
suspense(() => html`<p>loading</p>`, () => html`${Chart({})}`);
errorBoundary((err, reset) => html`<button @click=${reset}>${String(err)}: retry</button>`, () => App());
```

- `suspense(fallback, view)` creates `view` immediately (so loading starts), keeps it alive but **detached** while anything registered with `registerPending(promise)` below it is pending, shows the fallback meanwhile, and swaps back when all settle. The nearest boundary wins. See [async](./async.md).
- `lazy` registers its import with the nearest boundary; `Chart.preload()` starts it early; a failed import throws into the nearest `errorBoundary`.
- `errorBoundary(fallback, view)` catches errors thrown while rendering `view` and by any effect, event handler or resource created under it. `reset()` throws the fallback away and renders `view` afresh. An error thrown by the fallback propagates to the next boundary up.
- `portal(target, view)` returns a placeholder comment; the content lives in `target`.

## Components

A component is a function `(props) => Child` that runs **once**. Props are plain objects; reactive props are signals or getters the caller passes.

```ts
function Card(props: { title: string; children?: () => Child }) {
  const kids = children(() => props.children?.()); // resolved once into Node[]
  return html`<section><h2>${() => props.title}</h2>${kids}</section>`;
}
Card({ get title() { return t(); } }); // a getter keeps the prop reactive
```

| helper | use |
| --- | --- |
| `children(fn)` | resolve `props.children` once into an `Accessor<Node[]>` so you can insert it in several places or inspect it |
| `mergeProps(defaults, props)` | live view; later sources win; `undefined` does not override; sources may be functions |
| `splitProps(props, ["label"])` | returns `[picked, rest]` as getter views; nothing is read at split time |

Never destructure props in the body (`const { title } = props` reads once). Use `() => props.title` where you render it.

## Mounting

`render(fn, container)` appends the result in a new root and returns `dispose`, which tears down all effects and listeners and removes the nodes. Effects created during the first render (`effect`, `onMount`) run after the nodes are attached.
