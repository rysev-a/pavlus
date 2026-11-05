/**
 * The page the server renders and the browser hydrates. It reuses the shop's
 * mock API and its product view; the data comes from a keyed `resource`, which
 * is what makes the server's result travel to the browser.
 */
import {
  createRouter,
  html,
  resource,
  signal,
  suspense,
} from "../../src/mod.ts";
import type { Child } from "../../src/mod.ts";
import { catalog, getProduct } from "../shop/api.ts";
import type { Product } from "../shop/api.ts";
import { ProductDetailView } from "../shop/views.ts";

export interface Hooks {
  /** Called for every product request made (the tests count them). */
  onFetch?: (id: number) => void;
}

export function SsrApp(hooks: Hooks = {}): Child {
  const added = signal(0);
  const router = createRouter({
    titleTemplate: (t) => `${t} · Maximus SSR`,
    routes: [
      {
        path: "/",
        title: "Home",
        component: () =>
          html`<h1>Server-rendered shop</h1>
            <ul>
              ${catalog
                .slice(0, 4)
                .map(
                  (p) =>
                    html`<li>${router.a(`/products/${p.id}`, p.name)}</li>`,
                )}
            </ul>`,
      },
      {
        path: "/products/:id",
        title: "Product",
        component: (p) => {
          // inside the boundary: the server waits for it, the stream flushes the fallback first
          return suspense(
            () => html`<p aria-busy="true">Loading product...</p>`,
            () => {
              const product = resource<Product, number>(
                () => Number(p.params().id),
                (id, { signal }) => {
                  hooks.onFetch?.(id);
                  return getProduct(id, signal);
                },
                { key: (id) => ["product", id], staleTime: 60_000 },
              );
              return ProductDetailView(product, () =>
                added.update((n) => n + 1),
              );
            },
          );
        },
      },
      {
        path: "*",
        title: "Not found",
        component: () => html`<h1>Not found</h1>`,
      },
    ],
  });

  return html`<header class="top">
      <strong class="brand">Maximus SSR</strong>
      <nav aria-label="Main">
        ${router.a("/", "Home")} ${router.a("/products/1", "Sencha")}
        ${router.a("/products/8", "Colombia Washed")}
      </nav>
      <span class="muted">Added this visit: <output>${added}</output></span>
    </header>
    <main id="main">${router.outlet()}</main>`;
}
