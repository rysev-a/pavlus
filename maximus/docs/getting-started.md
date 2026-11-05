# Getting started

## Install

Maximus 0.1 is not published to npm yet. Use it from the repository: `maximus/package.json` exposes `maximus`, `maximus/core`, `maximus/dom`, `maximus/store` and `maximus/testing` (plus `maximus/resource`, `maximus/router`, `maximus/form`, `maximus/ssr` and `maximus/devtools`). The source is TypeScript (`.ts` files with `.ts` import specifiers, `erasableSyntaxOnly`), so something has to strip types before a browser sees it.

## A counter in 15 lines

```ts
// main.ts
import { signal, html, render } from "maximus";

function Counter(props: { start?: number }) {
  const count = signal(props.start ?? 0);
  return html`
    <button @click=${() => count.update((n) => n + 1)}>
      Clicked ${count} times
    </button>
    <button ?disabled=${() => count() === 0} @click=${() => count.set(0)}>
      reset
    </button>
  `;
}

render(() => Counter({ start: 0 }), document.getElementById("app")!);
```

`${count}` puts the signal itself in the template: the text node subscribes to it. `?disabled=${() => count() === 0}` is a function, so it is re-evaluated when `count` changes. `Counter` runs once.

## With Vite

```sh
npm create vite@latest my-app -- --template vanilla-ts
cd my-app
# copy or link maximus/src into your project (or add a path alias), then:
```

```ts
// vite.config.ts: an alias is all that is needed
import { defineConfig } from "vite";
export default defineConfig({
  resolve: { alias: { maximus: "/path/to/maximus/src/mod.ts" } },
});
```

```html
<!-- index.html -->
<div id="app"></div>
<script type="module" src="/main.ts"></script>
```

No plugin is needed: templates are ordinary JavaScript. Vite strips types in dev and tree-shakes in `vite build`; a bundled counter app is about 7.9 kB gzip (see [performance](./performance.md#size)).

## Zero-build ESM in a plain HTML file

A browser cannot import `.ts`, so produce one JavaScript file from the Maximus sources once. With Vite as the tool (Maximus has no other build requirement):

```js
// vite.config.mjs, in an empty folder
export default {
  build: {
    lib: {
      entry: "/path/to/maximus/src/mod.ts",
      formats: ["es"],
      fileName: "maximus",
    },
    minify: true,
  },
};
```

`npx vite build` writes `dist/maximus.mjs` (about 12.8 kB gzip for everything exported, including the testing helpers). After that your app is a single HTML file with no build step of its own:

```html
<!doctype html>
<div id="app"></div>
<script type="module">
  import { signal, html, render } from "./maximus.mjs";

  function Counter() {
    const count = signal(0);
    return html`<button @click=${() => count.update((n) => n + 1)}>
      Clicked ${count} times
    </button>`;
  }
  render(Counter, document.getElementById("app"));
</script>
```

Serve the folder with any static server (module scripts do not run from `file://` in most browsers). The bundled build was verified to run this exact counter under jsdom.

This is what "no build step required" means today: no template compiler, no JSX transform, no framework-specific plugin. A published, pre-built `dist/` is on the roadmap but does not exist yet.

## Project layout that works well

```
src/
  main.ts            render(() => App(), document.body)
  components/*.ts    functions returning html`...`
  state/*.ts         signals, stores, and plain functions that change them
```

Keep state in modules or create it in the component that owns it; both are fine because signals are plain values. Anything that must be cleaned up (timers, listeners, sockets) is created while an owner is active and registers `onCleanup`; see [ownership](./concepts/ownership.md).

## Next

[Signals](./concepts/signals.md) explains the model; [templates](./concepts/templates.md) lists every binding; [recipes](./recipes.md) has ten working patterns.
