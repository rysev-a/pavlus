# Server rendering and hydration

`maximus/ssr` runs the same component code on the server and adopts the HTML in the browser. There is no jsdom on the server: `renderToString` and `renderToStream` swap a small virtual DOM in behind the DOM layer, run your view, wait for the resources, and serialise. The snippets run as tests in `docs/concepts/concepts.test.ts`; the complete reference is [`src/ssr/README.md`](../../src/ssr/README.md), and `examples/ssr` is a working Node script plus client entry.

```ts
// server
import { renderToString, renderToStream } from "maximus/ssr";
const body = await renderToString(() => App(), { url: req.url }); // Promise<string>
const stream = renderToStream(() => App(), { url: req.url }); // ReadableStream<string>

// client
import { hydrate } from "maximus/ssr";
hydrate(() => App(), document.getElementById("app")!); // returns dispose
```

## What the server does

`renderToString` runs `view`, waits for everything registered with a suspense boundary (`resource`, `lazy`, `registerPending`), including work started while waiting, flushes effects, then serialises (default timeout 5 s, after which fallbacks are rendered). Effects and `onMount` also run on the server because bindings need them: guard browser-only work with `isServer()`. Output is escaped like the client's; `unsafe()` is the only raw path.

`renderToStream` returns the shell first (loading boundaries contain their fallback), then each boundary that becomes ready as a `<template>` plus a tiny inline script that swaps it in, then the state. Work outside any boundary delays the shell.

## The router and the request URL

`createRouter` reads `useServer()?.url` when no `history` is passed and uses a memory history, so the page for the request renders with no extra code; the base path is stripped as usual and `document.title` is not touched on the server.

```ts
function App() {
  const router = createRouter({ routes });
  return html`<main>${router.outlet()}</main>`;
}
await renderToString(App, { url: "/users/2" });
```

In the browser the same call picks the browser history. The server render waits for the first navigation's guards and loaders. Loader _data_ is not transferred, though: a client that hydrates a page whose route has a `load` runs the loader again and commits asynchronously, so the first client render does not match the server HTML. For pages that must hydrate, fetch with a keyed `resource` (below) instead of a `load`, as `examples/ssr` does.

## Resources travel with the page

A `resource` that has a `key` option writes its resolved value into the request's `TransferState`, keyed by its cache key. The server embeds it as `<script type="application/json" id="__MAXIMUS_STATE__">` and `hydrate` reads it back. On the client the resource starts with that value:

- no fetch if the entry is within its `staleTime`;
- with the default `staleTime: 0` the server value is shown at once and revalidated in the background;
- each transferred value is taken once, so later mounts fetch normally.

Resources without a `key` are private to the call and are **not** transferred (their default key contains a process-wide counter that differs between server and browser). On the server the cache is per request: concurrent requests never share entries and nothing accumulates in the process. The state script is escaped (`< > & U+2028 U+2029`), so data cannot close the script element.

## hydrate

```ts
const dispose = hydrate(() => App(), container, {
  onMismatch: (m) => console.warn(m),
});
```

Every `html` call claims the server nodes of its template instance and attaches its bindings to them. Nothing is cloned, so DOM node identity, focus, scroll position and text selection survive, and handlers work from the first interaction.

How: the server tags each template instance with a sequence number taken when its `html` call starts (`data-mx-i="seq:hash"` on a single root, `<!--mx:seq:hash-->...<!--/mx:seq-->` around a fragment); `hash` fingerprints the template's static strings. The client claims in the same order, verifies the hash and walks the server nodes in the same order as its clone walk, skipping the content of child holes. A difference (another template, a different text, unclaimed server markup) is reported through `onMismatch` and repaired by building the client version.

Requirements: the same `view`, the same data (so transfer what the server fetched), and a finished stream. Islands are `hydrate` on a container holding only that island's markup. Multi-root templates and control flow are moved through a fragment during the pass (same nodes; an `<iframe>` inside would reload).

## Not there yet

No selective/partial hydration (the whole container hydrates at once), no progressive hydration of streamed boundaries (hydrate after the stream completed), no loader-data transfer, no built-in HTTP server integration (you write the 20-line handler; see `examples/ssr/server.ts`), no source-map or error overlay for mismatches.
