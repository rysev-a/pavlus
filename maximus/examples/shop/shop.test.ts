import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCache } from "../../src/resource/mod.ts";
import { cleanup, fire, flush, mount, waitFor } from "../../src/testing/mod.ts";
import { delay } from "./api.ts";
import { App } from "./app.ts";
import { clearCart, persistCart } from "./cart.ts";

beforeEach(() => {
  window.scrollTo = () => {}; // jsdom does not implement it
  delay.ms = 2;
  localStorage.clear();
  clearCart();
});
afterEach(() => {
  cleanup();
  clearCache();
  document.title = "";
});

function open(url: string) {
  history.replaceState(null, "", url);
  return mount(() => {
    persistCart();
    return App();
  });
}

describe("shop", () => {
  it("search and filters live in the query string, and drive the list", async () => {
    const t = open("/products");
    await waitFor(() => expect(t.queryAll(".grid .card").length).toBe(24));
    fire(t.query("input[type=search]"), "input", { value: "tea" });
    await waitFor(() => expect(location.search).toBe("?q=tea"), {
      timeout: 1000,
    });
    await waitFor(() => expect(t.queryAll(".grid .card").length).toBe(2));
    fire(t.query(".chip:nth-child(3)"), "click"); // coffee
    await waitFor(() => expect(location.search).toContain("category=coffee"));
    await waitFor(() =>
      expect(t.query(".empty").textContent).toContain("Nothing matches"),
    );
  });

  it("marks the current page with aria-current and shows a 404 page", async () => {
    const t = open("/products");
    expect(
      t.query("nav[aria-label=Main] [aria-current=page]").textContent,
    ).toBe("Products");
    t.query("nav[aria-label=Main] a[href='/cart']").click();
    await waitFor(() => expect(location.pathname).toBe("/cart"));
    expect(
      t.query("nav[aria-label=Main] [aria-current=page]").textContent,
    ).toContain("Cart");
    const u = open("/nothing-here");
    await waitFor(() => expect(u.text()).toContain("404"));
  });

  it("product detail uses a loader; the cart persists to localStorage", async () => {
    const t = open("/products/2");
    await waitFor(() =>
      expect(t.query("article.detail h1").textContent).toBe("Earl Grey"),
    );
    expect(document.title).toBe("Earl Grey · Maximus Shop");
    fire(t.query("article.detail button"), "click");
    fire(t.query("article.detail button"), "click");
    await flush();
    expect(t.query(".badge").textContent).toBe("2");
    expect(JSON.parse(localStorage.getItem("maximus-shop-cart")!)).toEqual([
      { id: 2, name: "Earl Grey", price: 28, qty: 2 },
    ]);
  });

  it("an unknown product shows the route's error view", async () => {
    const t = open("/products/999");
    await waitFor(() => expect(t.text()).toContain("Product not found"));
  });
});
