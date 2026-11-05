# shop

A routed mini-app: home, product list, product detail, cart, checkout and a 404 page, on a tiny in-memory mock API (`api.ts`, fetch-like functions with 250 ms latency that honour `AbortSignal`).

```sh
cd examples/shop
npx vite build && npx vite preview --port 4301     # or: npx vite (dev server)
```

What it shows, and where:

- **Router** (`app.ts`): nested layout (`/products` with a breadcrumb and an outlet for the list and the detail), `aria-current` on the active nav link (`exact: false` keeps "Products" active on a product page), a `:id` route with a `load` and an `error` view (unknown ids render "Product not found"), `*` for the 404 page, `titleTemplate`, focus/announcement on navigation.
- **Async search and filters in the URL**: the list keys a `resource` on the query string (`?q=&category=&sort=&max=`); the search box debounces into `router.setQuery`, filters push history entries, so back/forward walk through them and the box follows the URL. `results.latest()` keeps the old list (dimmed, `aria-busy`) while the next one loads.
- **Store persisted to localStorage** (`cart.ts`): `createStore` plus one `effect` that writes it, guarded for blocked storage.
- **Checkout form**: `createForm` with sync validators, an async "email already registered" validator (try `taken@example.com`), and an `action` whose `optimistic` step adds a pending order to the orders resource immediately and rolls it back if the mock API declines (`fail@example.com`).
- Verified by `shop.test.ts` (vitest, jsdom) and `e2e.cjs` (Playwright; run the preview first, then `SHOTS=/tmp node e2e.cjs`).

`views.ts` holds the presentational pieces that `examples/ssr` reuses.
