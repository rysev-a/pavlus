/** Presentational pieces shared by the shop and the SSR example. */
import { html, show } from "../../src/mod.ts";
import type { Accessor, Child } from "../../src/mod.ts";
import type { Product } from "./api.ts";
import { money } from "./cart.ts";

export function ProductArt(p: Pick<Product, "name" | "hue">): Child {
  return html`<div
    class="art"
    aria-hidden="true"
    style=${{ background: `hsl(${p.hue} 55% 88%)`, color: `hsl(${p.hue} 45% 32%)` }}
  >
    ${p.name.slice(0, 1)}
  </div>`;
}

export function Rating(value: number): Child {
  return html`<span
    class="rating"
    role="img"
    aria-label=${`Rated ${value.toFixed(1)} out of 5`}
    >${"★".repeat(Math.round(value))}${"☆".repeat(5 - Math.round(value))}</span
  >`;
}

/** The product page body. `product()` is undefined while loading. */
export function ProductDetailView(
  product: Accessor<Product | undefined>,
  onAdd: (p: Product) => void,
): Child {
  return show(
    () => product(),
    (p) =>
      html`<article class="detail">
        ${() => ProductArt(p())}
        <div>
          <h1>${() => p().name}</h1>
          <p class="muted">
            ${() => p().category} · ${() => Rating(p().rating)}
          </p>
          <p>${() => p().blurb}</p>
          <p class="price">${() => money(p().price)}</p>
          <button class="primary" type="button" @click=${() => onAdd(p())}>
            Add to cart
          </button>
        </div>
      </article>`,
    () => html`<div class="detail skeleton" aria-busy="true">Loading...</div>`,
  );
}
