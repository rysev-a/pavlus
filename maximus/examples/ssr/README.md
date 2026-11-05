# ssr

The shop's product page, rendered on the server without a DOM and hydrated in the browser.

```sh
cd examples/ssr
npx vite build                                          # the client bundle and the HTML template
node --experimental-strip-types server.ts               # http://localhost:4400/products/3  (add ?stream)
node --experimental-strip-types render.ts /products/3   # just print the HTML (add --stream)
```

- `app.ts`: the page (router + a `resource` keyed `["product", id]` inside a `suspense`), reusing `../shop/api.ts` and `../shop/views.ts`.
- `render.ts`: `renderPage(url)` (`renderToString`) and `streamPage(url)` (`renderToStream`). Plain Node: no jsdom, no `document`; the router reads the request URL from `useServer()`, and the resolved product is written into the transfer state.
- `server.ts`: a small `node:http` handler that puts the rendered markup into `dist/index.html` (where `<!--ssr-outlet-->` is) and serves `dist/assets`. With `?stream` it writes the shell, then the product when it is ready.
- `client.ts`: `hydrate(() => SsrApp(), #app)`. The server markup is adopted in place (same nodes, focus and scroll kept), the product comes from the transferred state so nothing is fetched again, and clicking "Add to cart" works from the first interaction.
- Verified by `ssr.test.ts` (hydrate keeps node identity, no refetch, no mismatch warnings), `ssr-node.test.ts` (no `document` or `window` exist; string and stream output) and `e2e.cjs` (Playwright against the server, both modes).

Limits: `document.title` is not part of the server HTML (the router sets it on the client); the router's loader data is not transferred, which is why this page uses a keyed `resource` rather than a `load`.
