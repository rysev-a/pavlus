# maximus/ssr

The same component code runs on the server. There is no jsdom: `renderToString` and `renderToStream` swap in a small virtual DOM (`vdom.ts`, an HTML parser and a serializer, ~700 lines) behind the DOM layer's document seam (`dom/env.ts`), run your view, wait for the resources, and serialise. `hydrate` adopts the HTML in the browser without creating the nodes again.

```ts
// server
import { renderToString, renderToStream, useServer } from "maximus/ssr";
const body = await renderToString(() => App(), { url: req.url }); // string (state script appended)
return new Response(
  `<!doctype html><div id="app">${body}</div><script type="module" src="/client.js"></script>`,
);

// streaming: shell first, then suspended parts
const stream = renderToStream(() => App(), { url: req.url }); // ReadableStream<string>
return new Response(stream.pipeThrough(new TextEncoderStream())); // wrap with your own head/tail

// client
import { hydrate } from "maximus/ssr";
hydrate(() => App(), document.getElementById("app")!); // returns dispose
```

## renderToString(view, options)

`options`: `url` (read it in the app with `useServer()?.url`; give it to your router), `request` (anything else, also via `useServer()`), `timeout` (ms to wait for resources, default 5000, then fallbacks are rendered and `onTimeout`/`console.warn` fires), `state`, `embedState` (default true), `stateId`.

- Everything registered with `registerPending` (so `resource`, `lazy`, anything below `suspense`) is awaited, including work registered while waiting, then effects are flushed again. Inside a boundary the content is rendered when ready.
- `isServer()` is true while rendering. **Effects and `onMount` run on the server too** (bindings need them); guard browser-only work (`window`, timers, subscriptions) with `isServer()`. `portal` renders nothing on the server.
- The server DOM supports what the `dom` module uses; selectors are limited to tag, `#id`, `.class`, `[attr]`. The template parser is forgiving but not the full HTML5 algorithm (write well-formed templates; no automatic `<tbody>`).
- Output is escaped like the client: text and attributes through the serializer, `unsafe()` is the only raw path, unsafe URLs throw.
- Renders are independent, also when concurrent (per-render state lives on the owner tree).

## renderToStream(view, options)

A `ReadableStream<string>`. The first chunk is the shell: boundaries that are still loading contain their fallback between `<!--suspense:N-->` and `<!--/suspense:N-->`. Each boundary that becomes ready follows as `<template id="mx-bN">content</template><script>$MX(N)</script>` (a 400-byte runtime is sent before the first one); the script swaps the fallback for the content and removes itself. Last comes the state script. Work that is _not_ inside a suspense boundary delays the shell (there is nothing to show instead). Cancelling the stream stops rendering. Hydrate after the stream finished.

## hydrate(view, container, options)

Runs `view` on the client against the server HTML in `container`. Every `html` call **claims** the server nodes of its template instance and attaches its bindings to them (`dom/template.ts` walks the server nodes in the same order as its clone walk, skipping the content of child holes). Nothing is cloned or recreated, so node identity, focus and scroll position are kept and event handlers work from the first interaction.

How it finds things (the marker design):

- Child holes keep their `<!--$mx$-->`/`<!--/$mx$-->` pair (the end marker is distinct so nesting can be skipped).
- The server tags every template instance: a single-root template gets `data-mx-i="seq:hash"` on its root element, a multi-root one is wrapped in `<!--mx:seq:hash-->`...`<!--/mx:seq-->`. `hash` fingerprints the template's static strings, `seq` is the completion order of the call. The client claims instances in `seq` order (templates that finished first claim first, which is the order in which `html` is called), verifying the hash. The markers are removed while claiming.
- `bindChild` adopts the server's content of a hole: a text node is reused, nodes produced by claimed templates stay where they are, everything else is removed.

Mismatches (a template that differs, a text that differs, markup of a different shape, server templates nobody claimed) are reported through `options.onMismatch(message)` (default `console.warn("Maximus hydrate: ...")`) and repaired by building the client version. A text mismatch fixes the text node in place.

Notes and limits:

- Run `hydrate` with the same `view`, the same data and after streaming finished.
- Multi-root templates and control-flow output (`each`, `show`, `match`, `suspense`) are moved through a `DocumentFragment` and put back in place during the pass. They are the same nodes, but an `<iframe>` in them would reload. Text produced by control flow or `unsafe()` HTML is created fresh.
- Islands: call `hydrate` on a container that holds only that island's markup.
- `hydrate` leaves `container` alone except for its server content: the state script inside it is read and removed.

## State transfer

`TransferState` is a per-request JSON bag. On the server it is provided through context (`useTransferState()`), embedded as `<script type="application/json" id="__MAXIMUS_STATE__">`, read back by `hydrate` (or passed as `options.state`) and provided again, so the client can start with what the server fetched:

```ts
function userQuery(id: number) {
  const st = useTransferState();
  const data = signal<User | undefined>(
    isServer() ? undefined : st?.take<User>("user:" + id),
  ); // client: take once
  if (data() === undefined)
    registerPending(
      fetchUser(id).then((u) => {
        data.set(u);
        if (isServer()) st?.set("user:" + id, u);
      }),
    );
  return data;
}
```

`serializeState(state)`, `deserializeState(text)` and `stateScript(state, id)` are exported for custom pages. The JSON escapes `<`, `>`, `&`, U+2028 and U+2029 as `\uXXXX`, so `</script>`, `<!--` or a line separator in data cannot end the script or break a JS literal; the script content is data, never executed.

`resource` keeps its cache in a module-level map and does not use `TransferState` yet; wiring it (write the settled value on the server, seed the entry from `take` on the client) is a small change in `resource.ts`. Until then the client refetches. The server cache is process-wide: clear it (`clearCache()`) per request if results are user specific.
