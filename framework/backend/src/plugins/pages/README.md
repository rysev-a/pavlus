# pages plugin

Plugin `pages`, effect `pages.serve` — everything impure about serving a frontend: Vite in middleware mode in development, the build in `dist/` in production, and the assets of both. The answer is one `pages.served` reply holding the whole `{status, headers, body}`, so the pure handler answers the request with a single `http.respond` effect (the server-rendered document included: for ssr we return http).

```ts
import { createPagesPlugin, pagesEffector } from "@pavlus/backend";

const pages = createPagesPlugin({
  mode: "dev", // "dev" (Vite) | "dist" (the build) | "none" (API only)
  root: ROOT, // where index.html, public/ and dist/ live
  quiet: false, // no Vite log (tests)
  // the document itself is injected — the server render is the app's:
  document: async ({ template, frontend, path, search }) =>
    renderDocument(template, await renderPage(await frontend(), ssrFetch, { path, search })),
});

// the handler: a GET that is no API route is a page
case "pages.show":
  return [pagesEffector.serve(req.path, req.search)];
case "pages.served": // the plugin's answer becomes the response as-is
  return [httpEffector.respond(msg.payload)];
```

- `pages.serve(path, search)` replies to `pages.served` (payload `ServedPage: {status, headers, body}`), or to `pages.failed` (`{code: "pages_error", message}`) when serving itself throws.
- Modes: `dev` boots Vite in middleware mode over the app root (`@pavlus/frontend/vite` included; its middleware answers its client, modules and `public/` files, a page falls through to `document`); `dist` serves `dist/` from memory (an asset as-is, a page through `document`); `none` answers every serve with `404 {"error": "no frontend: this server runs the API only"}`.
- The `document` hook is optional: without it (or when it throws — logged, answered 200) the plain template is served and the app renders in the browser. The hook gets the mode's `template`, a `frontend()` that loads the frontend's server entry (in `dist` mode, `dist/server/entry-server.js`), and the `path`/`search`; it returns the whole HTML. Everything that needs `@pavlus/frontend` values stays in the app — the plugin only serves.
- `ready()` resolves when the mode is up (Vite booted); `close()`/`dispose()` close it. The plugin never touches the socket: bytes go back through the reply, so the flow keeps its `rid` end to end.
