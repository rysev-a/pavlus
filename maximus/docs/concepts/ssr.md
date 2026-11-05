# Server rendering and hydration

> **API as designed.** `maximus/ssr` is **wave 2** and is not shipped in 0.1. Only the *DOM layer's preparation for hydration* exists today. This page documents the contract in `DESIGN.md` plus the markup design recorded in the implementation notes.

## API from the design

```ts
import { renderToString, renderToStream, hydrate } from "maximus/ssr";

const html = renderToString(() => App(), { url: "/users/1" });  // string
const stream = renderToStream(() => App(), { url });            // streaming, with suspense
hydrate(() => App(), document.getElementById("app")!);          // adopt server DOM
```

Goals from the design: server and hydration **without double work**, islands by hydrating a subtree, suspense streaming.

## How hydration is meant to work

The DOM layer was shaped for this from the start (already true in the shipped code):

- The static markup of a template is exactly what the server emits.
- Each dynamic child is delimited by a pair of comment markers, `<!--$mx$--><!--$mx$-->`. A child hole that is the only child of its element has no markers.
- Elements with dynamic attributes need no marker: bindings are located by the **index of a tree walk**, in the same element/comment order on the client clone and on the server DOM.
- Control flow carries its own marker comments (`<!--each-->`/`<!--/each-->`, and so on).
- A hydrating `instantiate` walks the **server's nodes** instead of cloning the template, and attaches bindings without creating nodes. State is therefore never rendered twice.
- A `suspense` boundary streams its fallback inside the marker range and patches the real content in later.

## What you can do today

- Components are plain functions of state, so they are straightforward to share between server and client.
- Avoid touching `window`/`document` at module top level or in a component body (use `onMount`, which only runs on the client). `html` itself needs a DOM implementation; a server renderer is expected to supply its own.
- Test the output you would hydrate with `mount(...).html()`, which strips the marker comments.

## Not implemented (honest list)

`renderToString`, `renderToStream`, `hydrate`, streaming suspense, serialising resource caches into the page, and the islands API. Treat any claim of SSR support as roadmap, not fact.
