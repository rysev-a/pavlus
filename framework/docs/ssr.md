# Server-side rendering

The application is pure functions over plain data, so it runs anywhere: on
the server the same `render` gives HTML, and the browser picks it up.

```
server                                   browser
createApp({ app, plugins })  ──state──▶  createApp({ app, plugins, mount: "#app" })
  dispatch routeChanged                    reviveState(json) → the store
  http.settled()                           the DOM plugin hydrates #app
  renderToString(view, state) ──html──▶    (listeners and ids on the markup)
```

## On the server

`@pavlus/client/ssr` has what the server needs:

```ts
import { createApp, viewOf } from "@pavlus/client";
import { createHttpPlugin, createStorePlugin } from "@pavlus/client/plugins";
import { renderToString, serializeState } from "@pavlus/client/ssr";

const store = createStorePlugin(initialState);
const http = createHttpPlugin({ fetch: inProcess }); // answers the API without a socket
const app = createApp({
  app: shell,
  plugins: [store, http, inert("dom"), inert("router")],
});
app.dispatch({ id: "routeChanged", payload: { path, search, hash: "" } });
await http.settled(); // every request is answered, including the ones the answers started
const state = store.getState();
const html = renderToString(viewOf(shell), state);
const json = serializeState(state, { list, table });
```

- No `mount`: there is no DOM. The router's message is dispatched by hand
  with the requested location; the component with `routing` handles it by
  default (`setRoute`), the pages that `enter` load their data.
- `http.settled()` resolves when nothing is in flight any more. The http
  plugin takes any `fetch`: on the server one that calls the API handlers
  directly.
- Effects for plugins that make no sense on the server (`dom`, `router`)
  need a plugin that accepts them and does nothing, or the core throws
  `no plugin "dom"`.
- `renderToString(view, state)` is `toHtml` with the markers, between the
  comments `<!--pavlus-->` and `<!--/pavlus-->` the DOM plugin looks for.
- `serializeState` is `JSON.stringify` that knows about **component values**
  in the state (`+{expr}` in a template): each instance listed in
  `components` becomes `{ "$component": name }`. An instance that is not
  listed is an error that says so.

The document is the host's business: put the HTML inside the mount point and
the JSON in a `<script>` before the application's own, escaping `<` as
`<` so the state cannot close the script.

## In the browser

```ts
import { reviveState } from "@pavlus/client/ssr";

const json = (globalThis as { __STATE__?: string }).__STATE__;
const store = createStorePlugin(json ? reviveState(json, { list, table }) : initialState);
createApp({ app: shell, plugins: [store, new DomPlugin(), ...], mount: "#app" });
```

`mount` sees the two comments in the container and **hydrates**: it walks the
server markup next to the view's `render(state)` and attaches the listeners
and the node ids to the nodes that are already there. Nothing is rebuilt, so
there is no flash, and the state of form controls survives. Two things the
HTML parser does are undone on the way: adjacent text nodes are split again,
and empty ones are inserted. When the markup does not match the view (a
different state, another version of the template), the plugin warns in the
console and renders afresh: the page still works.

The first `routeChanged` after hydration carries the location the server
rendered, so `setRoute` sends no `enter`: the data is not loaded twice.

The pieces are ready to wire: `@pavlus/server`'s `renderPage`
(`framework/server/src/ssr/mod.ts`) runs the app, waits for the requests and
returns the HTML with the serialized state, and the framework's own tests
(`framework/client/src/plugins/dom/dom.test.ts`, hydration) keep the two
sides honest.
