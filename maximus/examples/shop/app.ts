import {
  action,
  computed,
  createForm,
  createRouter,
  each,
  effect,
  email,
  html,
  match,
  onCleanup,
  required,
  resource,
  show,
  signal,
  untrack,
} from "../../src/mod.ts";
import type { Child, Router } from "../../src/mod.ts";
import {
  ApiError,
  categories,
  emailAvailable,
  getProduct,
  listOrders,
  listProducts,
  orderTotal,
  placeOrder,
} from "./api.ts";
import type { Order, OrderInput, Product, ProductQuery } from "./api.ts";
import {
  addToCart,
  cart,
  clearCart,
  count,
  money,
  setQty,
  subtotal,
} from "./cart.ts";
import { ProductArt, ProductDetailView, Rating } from "./views.ts";

/** What every page needs: the router and the app-wide orders query. */
interface Ctx {
  router: Router;
  orders: ReturnType<typeof createOrders>;
}

function createOrders() {
  return resource<Order[], true>(
    () => true,
    (_, { signal }) => listOrders(signal),
    { key: () => ["orders"], staleTime: 10_000 },
  );
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

// ------------------------------------------------------------------ pages

function Home({ router }: Ctx): Child {
  const featured = resource<Product[], { sort: string }>(
    () => ({ sort: "rating" }),
    (q, { signal }) => listProducts(q, signal).then((l) => l.slice(0, 4)),
    { key: () => ["featured"], staleTime: 60_000 },
  );
  return html`<section class="hero">
      <h1>Small-batch tea, coffee and gear</h1>
      <p>
        A demo shop built with Maximus: routed pages, async queries, a form and
        a persisted cart.
      </p>
      ${router.a("/products", "Browse all products", { class: "button primary" })}
    </section>
    <h2>Top rated</h2>
    <ul class="grid" aria-busy=${() => String(featured.loading())}>
      ${show(
        () => featured.loading(),
        () => Skeletons(4),
      )}
      ${each(
        () => featured() ?? [],
        (p) => p.id,
        (p) => ProductCard(router, p()),
      )}
    </ul>`;
}

function Skeletons(n: number): Child {
  return Array.from({ length: n }, () => html`<li class="card skeleton"></li>`);
}

function ProductCard(router: Router, p: Product): Child {
  return html`<li class="card">
    ${ProductArt(p)}
    <h3>${router.a(`/products/${p.id}`, p.name)}</h3>
    <p class="muted">${p.category} · ${Rating(p.rating)}</p>
    <p class="price">${money(p.price)}</p>
    <button
      type="button"
      @click=${() => addToCart(p)}
      aria-label=${`Add ${p.name} to cart`}
    >
      Add
    </button>
  </li>`;
}

function ProductsLayout({ router }: Ctx): Child {
  return html`<nav class="crumbs" aria-label="Breadcrumb">
      ${router.a("/products", "Products")}
      ${() => (router.path() === "/products" ? null : html`<span> / ${router.path().split("/").pop()}</span>`)}
    </nav>
    ${router.outlet()}`;
}

function ProductList({ router }: Ctx): Child {
  // The URL is the state: ?q=&category=&sort=&max=
  const query = computed(() => {
    const q = router.query();
    return {
      q: str(q.q),
      category: str(q.category),
      sort: str(q.sort),
      max: Number(str(q.max)) || 0,
    };
  });
  const results = resource<Product[], ProductQuery>(
    () => query(),
    (q, { signal }) => listProducts({ ...q, max: q.max || undefined }, signal),
    {
      key: (q) => ["products", q],
      staleTime: 30_000,
    },
  );

  // The text box has its own signal so typing is instant; the URL follows after a pause.
  const text = signal(query.peek().q);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const onType = (e: Event): void => {
    text.set((e.target as HTMLInputElement).value);
    clearTimeout(timer);
    timer = setTimeout(
      () =>
        void router.setQuery(
          { q: text.peek() || undefined },
          { replace: true },
        ),
      200,
    );
  };
  // back/forward changes the URL: pull it into the box (unless it already matches)
  effect(() => {
    const fromUrl = query().q;
    if (fromUrl !== untrack(text)) text.set(fromUrl);
  });

  const set = (patch: Record<string, unknown>): void =>
    void router.setQuery(patch);

  return html`<h1>Products</h1>
    <form class="filters" role="search" @submit.prevent=${() => {}}>
      <label>
        Search
        <input
          type="search"
          name="q"
          placeholder="e.g. tea"
          .value=${text}
          @input=${onType}
        />
      </label>
      <label>
        Sort
        <select
          .value=${() => query().sort}
          @change=${(e: Event) => set({ sort: (e.target as HTMLSelectElement).value || undefined })}
        >
          <option value="">Relevance</option>
          <option value="price-asc">Price, low to high</option>
          <option value="price-desc">Price, high to low</option>
          <option value="rating">Rating</option>
        </select>
      </label>
      <label>
        Max price: ${() => (query().max ? money(query().max) : "any")}
        <input
          type="range"
          min="0"
          max="80"
          step="4"
          .value=${() => String(query().max)}
          @change=${(e: Event) => set({ max: Number((e.target as HTMLInputElement).value) || undefined })}
        />
      </label>
      <div class="chips" role="group" aria-label="Category">
        ${[""]
          .concat(categories)
          .map(
            (c) =>
              html`<button
                type="button"
                class="chip"
                aria-pressed=${() => String(query().category === c)}
                @click=${() => set({ category: c || undefined })}
              >
                ${c || "all"}
              </button>`,
          )}
      </div>
    </form>
    <p class="muted" role="status">
      ${() =>
        results.loading()
          ? "Searching..."
          : `${results()?.length ?? 0} product(s)`}
    </p>
    ${show(
      () => results.error(),
      (err) =>
        html`<p role="alert" class="error">
          ${() => String(err())}
          <button type="button" @click=${() => void results.refetch()}>
            Retry
          </button>
        </p>`,
    )}
    <ul
      class="grid"
      aria-busy=${() => String(results.fetching())}
      style=${() => ({ opacity: results.loading() ? 0.5 : 1 })}
    >
      ${each(
        () => results.latest() ?? [],
        (p) => p.id,
        (p) => ProductCard(router, p()),
      )}
    </ul>
    ${show(
      () => !results.loading() && results()?.length === 0,
      () =>
        html`<p class="empty">
          Nothing matches. ${router.a("/products", "Clear filters")}
        </p>`,
    )}`;
}

function ProductPage({ router }: Ctx, data: () => Product | undefined): Child {
  return html`${ProductDetailView(data, addToCart)}
    <p>
      ${router.a("/products", "Back to products")} ·
      ${router.a("/cart", "Go to cart")}
    </p>`;
}

function Cart({ router }: Ctx): Child {
  return html`<h1>Your cart</h1>
    ${show(
      () => cart.lines.length > 0,
      () =>
        html`<table class="cart">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th class="num">Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${each(
                () => cart.lines,
                (l) => l.id,
                (l) =>
                  html`<tr>
                    <td>${router.a(`/products/${l().id}`, () => l().name)}</td>
                    <td class="qty">
                      <button
                        type="button"
                        aria-label=${() => `One less ${l().name}`}
                        @click=${() => setQty(l().id, l().qty - 1)}
                      >
                        -
                      </button>
                      <output>${() => l().qty}</output>
                      <button
                        type="button"
                        aria-label=${() => `One more ${l().name}`}
                        @click=${() => setQty(l().id, l().qty + 1)}
                      >
                        +
                      </button>
                    </td>
                    <td class="num">${() => money(l().price * l().qty)}</td>
                    <td>
                      <button
                        type="button"
                        class="link"
                        @click=${() => setQty(l().id, 0)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>`,
              )}
            </tbody>
            <tfoot>
              <tr>
                <th colspan="2">Subtotal</th>
                <td class="num">${() => money(subtotal())}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p>
            ${router.a("/checkout", "Checkout", { class: "button primary" })}
          </p>`,
      () =>
        html`<p class="empty">
          Your cart is empty. ${router.a("/products", "Find something nice")}.
        </p>`,
    )}`;
}

function Checkout({ router, orders }: Ctx): Child {
  const confirmed = signal<Order | null>(null);

  // Optimistic: the order shows up in the list immediately and is rolled back if the "server" refuses it.
  const place = action(
    async (input: OrderInput, { signal, optimistic }) => {
      optimistic(() =>
        orders.mutate((list) => [
          { ...input, id: 0, total: orderTotal(input), pending: true },
          ...(list ?? []),
        ]),
      );
      return placeOrder(input, signal);
    },
    { invalidates: [["orders"]] },
  );

  const f = createForm({
    initial: {
      name: "",
      email: "",
      address: "",
      shipping: "standard" as "standard" | "express",
    },
    onSubmit: async (v) => {
      const order = await place.run({
        ...v,
        lines: cart.lines.map((l) => ({ ...l })),
      });
      if (order) {
        clearCart();
        confirmed.set(order);
      }
    },
  });
  const name = f.field("name", { validate: [required("Tell us your name")] });
  const mail = f.field("email", {
    validate: [
      required("We need an email"),
      email("That does not look like an email"),
      async (v, { signal }) =>
        (await emailAvailable(String(v), signal))
          ? undefined
          : "This email is already registered",
    ],
    debounce: 300,
  });
  const address = f.field("address", {
    validate: [required("Where should it go?")],
  });
  const shipping = f.field("shipping");

  const total = computed(() =>
    orderTotal({ lines: cart.lines, shipping: shipping.value() }),
  );

  const err = (field: {
    error: () => unknown;
    touched: () => boolean;
    errorId: () => string;
  }): Child =>
    html`<small class="error" id=${field.errorId}
      >${() => (field.touched() ? String(field.error() ?? "") : "")}</small
    >`;

  const form = html`<form class="checkout" novalidate @submit=${f.submit}>
    <label>Name <input autocomplete="name" ${name.bind} /></label>
    ${err(name)}
    <label
      >Email <input type="email" autocomplete="email" ${mail.bind}
    /></label>
    ${err(mail)}
    <p class="muted" aria-live="polite">
      ${() => (mail.validating() ? "Checking email..." : "")}
    </p>
    <label>Address <textarea rows="2" ${address.bind}></textarea></label>
    ${err(address)}
    <label>
      Shipping
      <select ${shipping.bind}>
        <option value="standard">Standard ($4)</option>
        <option value="express">Express ($9)</option>
      </select>
    </label>
    <p class="price">Total: ${() => money(total())}</p>
    ${show(
      () => place.error(),
      (e) =>
        html`<p role="alert" class="error">
          ${() => (e() instanceof ApiError ? (e() as ApiError).message : "Something went wrong")}
        </p>`,
    )}
    <button
      class="primary"
      ?disabled=${() => f.submitting() || cart.lines.length === 0}
    >
      ${() => (f.submitting() ? "Placing order..." : "Place order")}
    </button>
  </form>`;

  const recent = html`<aside aria-label="Recent orders">
    <h2>Recent orders</h2>
    <ul class="orders">
      ${each(
        () => orders() ?? [],
        (o) => (o.pending ? "pending" : o.id),
        (o) =>
          html`<li class=${() => (o().pending ? "pending" : "")}>
            #${() => (o().pending ? "..." : o().id)} ${() => o().name}:
            ${() => money(o().total)}
            ${() => (o().pending ? html`<em>placing...</em>` : null)}
          </li>`,
      )}
    </ul>
    ${show(
      () => (orders()?.length ?? 0) === 0,
      () => html`<p class="muted">No orders yet.</p>`,
    )}
  </aside>`;

  return html`<h1>Checkout</h1>
    ${match(
      () => (confirmed() ? "done" : cart.lines.length === 0 ? "empty" : "form"),
      {
        done: () =>
          html`<p class="ok" role="status">
            Thank you, ${() => confirmed()?.name}! Order
            #${() => confirmed()?.id} is placed.
            ${router.a("/products", "Keep shopping")}
          </p>`,
        empty: () =>
          html`<p class="empty">
            Nothing to check out. ${router.a("/products", "Browse products")}.
          </p>`,
        form: () => form,
      },
    )}
    ${recent}`;
}

function NotFound({ router }: Ctx): Child {
  return html`<h1>404: page not found</h1>
    <p>${() => router.path()} does not exist. ${router.a("/", "Go home")}.</p>`;
}

// -------------------------------------------------------------------- app

/** Build the shop. Call it under an owner (`render`, `hydrate`, `renderToString` do). */
export function App(): Child {
  const router: Router = createRouter({
    titleTemplate: (t) => `${t} · Maximus Shop`,
    routes: [
      { path: "/", title: "Home", component: () => Home(ctx) },
      {
        path: "/products",
        title: "Products",
        component: () => ProductsLayout(ctx),
        children: [
          { path: "", component: () => ProductList(ctx) },
          {
            path: ":id",
            title: ({ data }) =>
              (data as Product | undefined)?.name ?? "Product",
            load: ({ params, signal }) => getProduct(Number(params.id), signal),
            component: (p) =>
              ProductPage(ctx, p.data as () => Product | undefined),
            error: (e, retry) =>
              e instanceof ApiError && e.status === 404
                ? html`<h1>Product not found</h1>
                    <p>${router.a("/products", "See all products")}</p>`
                : html`<p role="alert">
                    Could not load the product.
                    <button type="button" @click=${retry}>Retry</button>
                  </p>`,
          },
        ],
      },
      { path: "/cart", title: "Cart", component: () => Cart(ctx) },
      { path: "/checkout", title: "Checkout", component: () => Checkout(ctx) },
      { path: "*", title: "Not found", component: () => NotFound(ctx) },
    ],
  });
  const ctx: Ctx = { router, orders: createOrders() };

  return html`<a class="skip" href="#main">Skip to content</a>
    <header class="top">
      <strong class="brand">Maximus Shop</strong>
      <nav aria-label="Main">
        ${router.a("/", "Home")}
        ${router.a("/products", "Products", {}, { exact: false })}
        ${router.a("/cart", html`Cart <span class="badge" aria-label=${() => `${count()} items`}>${count}</span>`)}
        ${router.a("/checkout", "Checkout")}
      </nav>
      <span
        class="progress"
        ?hidden=${() => !router.navigating()}
        role="progressbar"
        aria-label="Loading page"
      ></span>
    </header>
    <main id="main">${router.outlet()}</main>
    <footer class="foot muted">
      Built with Maximus · mock API with ${"250ms"} latency
    </footer>`;
}
