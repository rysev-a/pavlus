import { expect, test } from "vitest";
import { startFilters } from "../blocks/filter-bar/filter-bar.ts";
import { addLine } from "../blocks/shop-cart/shop-cart.ts";
import {
  clockOf,
  canPlace,
  DISHES,
  feeFor,
  itemOf as dishItem,
} from "../templates/local-bakery-shop/local-bakery-shop.ts";
import {
  orderInitial,
  settle as settleOrder,
} from "../blocks/order-form/order-form.ts";
import {
  ASSETS,
  barDef as digitalBar,
  itemOf as assetItem,
  licenseTag,
  visibleAssets,
} from "../templates/digital-products-shop/digital-products-shop.ts";
import {
  APPAREL,
  COLORS,
  GARMENTS,
  barDef as clothingBar,
  initialsOf,
  makeAccount,
  nameFromEmail,
  orderRow,
  stockGrid,
  visibleGarments,
} from "../templates/clothing-merch-store/clothing-merch-store.ts";
import {
  PRODUCTS,
  barDef as petBar,
  visibleProducts,
} from "../templates/pet-shop/pet-shop.ts";
import { totals } from "../blocks/shop-cart/shop-cart.ts";

test("pet shop: pets, types, stock, price and sort", () => {
  const f = startFilters(petBar);
  const ids = (x: { id: string }[]) => x.map((p) => p.id);
  expect(visibleProducts(PRODUCTS, f)).toHaveLength(PRODUCTS.length);
  const dogs = visibleProducts(PRODUCTS, {
    ...f,
    picks: { ...f.picks, pet: ["dogs"] },
  });
  expect(dogs.every((p) => p.pets.includes("dogs"))).toBe(true);
  // a product for several pets shows under each
  expect(ids(dogs)).toContain("bowl-set");
  const birdsToys = visibleProducts(PRODUCTS, {
    ...f,
    picks: { pet: ["birds"], category: ["toys"] },
  });
  expect(ids(birdsToys).sort()).toEqual(["bell-swing", "forage-blocks"]);
  const inStock = visibleProducts(PRODUCTS, { ...f, flags: { stock: true } });
  expect(ids(inStock)).not.toContain("dog-bed");
  const cheap = visibleProducts(PRODUCTS, { ...f, ranges: { price: 1000 } });
  expect(cheap.every((p) => p.price <= 1000)).toBe(true);
  const low = visibleProducts(PRODUCTS, { ...f, sort: "low" });
  expect(low[0].price).toBeLessThanOrEqual(low[1].price);
  expect(visibleProducts(PRODUCTS, { ...f, sort: "high" })[0].price).toBe(6990);
  expect(visibleProducts(PRODUCTS, { ...f, query: "salmon" }).length).toBe(2);
  expect(visibleProducts(PRODUCTS, { ...f, query: "zzzz" })).toEqual([]);
});

test("digital shop: licenses, types, one click add", () => {
  const f = startFilters(digitalBar);
  expect(visibleAssets(ASSETS, f)).toHaveLength(ASSETS.length);
  const commercial = visibleAssets(ASSETS, {
    ...f,
    picks: { ...f.picks, license: ["commercial"] },
  });
  expect(commercial.every((a) => a.commercial)).toBe(true);
  expect(commercial.length).toBe(ASSETS.length - 1);
  expect(
    visibleAssets(ASSETS, { ...f, picks: { ...f.picks, kind: ["font"] } }),
  ).toHaveLength(4);
  const inkwell = ASSETS.find((a) => a.id === "inkwell-script")!;
  expect(licenseTag(inkwell)).toBe("Personal only");
  expect(assetItem(inkwell).choices).toHaveLength(1);
  const fraunces = ASSETS.find((a) => a.id === "fraunces-pro")!;
  const item = assetItem(fraunces);
  expect(item.choices?.map((c) => c.price)).toEqual([4900, 14900]);
  // one file is bought once
  expect(addLine(addLine([], item), item)[0].qty).toBe(1);
});

test("bakery: fees, clock and the decision to place an order", () => {
  expect(feeFor("pickup", 9)).toBe(0);
  expect(feeFor("table", 9)).toBe(0);
  expect(feeFor("courier", 5)).toBe(600);
  expect(feeFor("courier", 20)).toBe(0);
  // 2026-11-04 (Wednesday) 10:20 in the local time zone
  const date = new Date(2026, 10, 4, 10, 20);
  expect(clockOf(date.getTime())).toEqual({ weekday: 3, minutes: 620 });
  const ready = settleOrder({
    ...orderInitial,
    weekday: 3,
    nowMin: 9 * 60,
    slot: "10:00",
    name: "Anna",
    phone: "5035550100",
    errors: {},
  });
  expect(canPlace(ready, 0)).toBe(false);
  expect(canPlace(ready, 2)).toBe(true);
  expect(canPlace({ ...ready, mode: "table" }, 0)).toBe(true);
  expect(dishItem(DISHES[0])).toMatchObject({ id: "sourdough", price: 650 });
  expect(DISHES.filter((d) => d.favourite).length).toBeGreaterThanOrEqual(4);
});

test("clothing: stock grid, filters, account helpers", () => {
  const grid = stockGrid(COLORS.slice(0, 2), APPAREL, 3);
  expect(stockGrid(COLORS.slice(0, 2), APPAREL, 3)).toEqual(grid);
  expect(Object.values(grid).every((n) => n >= 1 && n <= 9)).toBe(true);
  // some sizes are sold out: fewer keys than color x size
  expect(Object.keys(grid).length).toBeLessThan(2 * APPAREL.length);
  const f = startFilters(clothingBar);
  expect(visibleGarments(GARMENTS, f)).toHaveLength(GARMENTS.length);
  const hoodies = visibleGarments(GARMENTS, {
    ...f,
    picks: { ...f.picks, category: ["Hoodies"] },
  });
  expect(hoodies.map((g) => g.id).sort()).toEqual(["pullover", "zip-hoodie"]);
  const rust = visibleGarments(GARMENTS, {
    ...f,
    picks: { ...f.picks, color: ["rust"] },
  });
  expect(rust.every((g) => g.def.colors.some((c) => c.id === "rust"))).toBe(
    true,
  );
  expect(visibleGarments(GARMENTS, { ...f, sort: "low" })[0].price).toBe(800);

  expect(nameFromEmail("anna.lee@example.com")).toBe("Anna Lee");
  expect(nameFromEmail("bob_smith-jr@x.io")).toBe("Bob Smith Jr");
  expect(nameFromEmail("@x.io")).toBe("Friend");
  expect(initialsOf("Anna Lee")).toBe("AL");
  expect(initialsOf("  ")).toBe("?");
  expect(makeAccount("Anna Lee", "a@b.co").orders).toHaveLength(2);
});

test("clothing: a paid cart becomes a row of the order history", () => {
  const lines = ["a", "b", "c"].reduce(
    (acc, id) =>
      addLine(acc, {
        id,
        name: `Item ${id}`,
        price: 1000,
        emoji: "👕",
        hue: 1,
      }),
    [] as ReturnType<typeof addLine>,
  );
  const row = orderRow(lines, totals(lines, ""), "NL-1001", "Today");
  expect(row.summary).toBe("3 items: Item a, Item b and 1 more");
  expect(row.status).toBe("Processing");
  expect(row.total).toBe("$40.39");
  expect(row.emojis).toBe("👕 👕 👕");
});
