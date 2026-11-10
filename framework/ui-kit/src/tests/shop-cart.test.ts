import { expect, test } from "vitest";
import {
  addLine,
  chooseLine,
  defaultConfig,
  isPromo,
  money,
  recompute,
  removeLine,
  setQuantity,
  cartInitial,
  summaryOf,
  totals,
  type CartItem,
} from "../blocks/shop-cart/shop-cart.ts";

const tee: CartItem = {
  id: "tee",
  name: "Tee",
  variant: "M",
  price: 2800,
  emoji: "👕",
  hue: 30,
  max: 3,
};
const font: CartItem = {
  id: "font",
  name: "Font",
  price: 4900,
  emoji: "🔤",
  hue: 200,
  max: 1,
  choices: [
    { id: "personal", label: "Personal", price: 4900 },
    { id: "commercial", label: "Commercial", price: 14900 },
  ],
};

test("money formats cents", () => {
  expect(money(0)).toBe("$0.00");
  expect(money(5)).toBe("$0.05");
  expect(money(1250)).toBe("$12.50");
  expect(money(123456789)).toBe("$1,234,567.89");
  expect(money(-300)).toBe("-$3.00");
});

test("a line is added once, then its quantity grows up to the stock", () => {
  let lines = addLine([], tee);
  lines = addLine(lines, tee);
  lines = addLine(lines, tee);
  lines = addLine(lines, tee);
  expect(lines).toHaveLength(1);
  expect(lines[0].qty).toBe(3);
  expect(lines[0].atMax).toBe(true);
  expect(lines[0].totalLabel).toBe("$84.00");
  // another variant is another line
  expect(addLine(lines, { ...tee, variant: "L" })).toHaveLength(2);
});

test("quantity: set, clamp, remove", () => {
  const lines = addLine([], tee);
  const key = lines[0].key;
  expect(setQuantity(lines, key, 2)[0].qty).toBe(2);
  expect(setQuantity(lines, key, 50)[0].qty).toBe(3);
  expect(setQuantity(lines, key, 0)).toEqual([]);
  expect(setQuantity(lines, key, Number.NaN)).toBe(lines);
  expect(removeLine(lines, key)).toEqual([]);
});

test("a choice changes the price of its line", () => {
  const lines = addLine([], font);
  expect(lines[0].price).toBe(4900);
  expect(lines[0].hasChoices).toBe(true);
  const upgraded = chooseLine(lines, lines[0].key, "commercial");
  expect(upgraded[0].price).toBe(14900);
  expect(upgraded[0].totalLabel).toBe("$149.00");
  expect(chooseLine(lines, lines[0].key, "nope")).toEqual(lines);
});

test("totals: promo, shipping, tax", () => {
  const small = addLine([], tee); // $28
  expect(totals([], "")).toMatchObject({ count: 0, shipping: 0, total: 0 });
  const t = totals(small, "");
  expect(t).toMatchObject({
    subtotal: 2800,
    shipping: 799,
    tax: 224,
    total: 3823,
  });
  expect(t.toFree).toBe(7200);
  // the code is case and space insensitive
  expect(isPromo(" pavlus10 ")).toBe(true);
  expect(totals(small, "PAVLUS10").discount).toBe(280);
  expect(totals(small, "NOPE").discount).toBe(0);
  // free shipping from $100, counted after the discount
  const big = [{ price: 11000, qty: 1 }];
  expect(totals(big, "").shipping).toBe(0);
  expect(totals(big, "PAVLUS10").shipping).toBe(799); // 110 - 11 = 99: not enough
});

test("totals: shipping modes and rounding", () => {
  const lines = [{ price: 999, qty: 3 }];
  expect(
    totals(lines, "", { ...defaultConfig, shipMode: "none" }).shipping,
  ).toBe(0);
  expect(
    totals(lines, "", { ...defaultConfig, shipMode: "fee", fee: 600 }).shipping,
  ).toBe(600);
  // 8% of 2997 = 239.76 -> 240
  expect(totals(lines, "", { ...defaultConfig, shipMode: "none" }).tax).toBe(
    240,
  );
  // an empty cart pays no fee
  expect(
    totals([], "", { ...defaultConfig, shipMode: "fee", fee: 600 }).shipping,
  ).toBe(0);
});

test("summary labels", () => {
  const lines = addLine([], tee);
  const s = summaryOf(totals(lines, "PAVLUS10"), defaultConfig);
  expect(s).toMatchObject({
    subtotal: "$28.00",
    discount: "-$2.80",
    hasDiscount: true,
    taxLabel: "Tax (8%)",
  });
  expect(s.shipNote).toContain("more for free shipping");
  expect(
    summaryOf(totals(lines, ""), { ...defaultConfig, shipMode: "none" })
      .hasShipping,
  ).toBe(false);
});

test("recompute derives the count and the empty flag", () => {
  expect(cartInitial.empty).toBe(true);
  const next = recompute({
    ...cartInitial,
    lines: addLine([], tee),
    promo: "PAVLUS10",
  });
  expect(next.empty).toBe(false);
  expect(next.count).toBe(1);
  expect(next.totals.discount).toBe(280);
});
