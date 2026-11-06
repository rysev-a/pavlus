import { expect, test } from "vitest";
import {
  barOf,
  cleared,
  countLabel,
  flip,
  inPicks,
  isDirty,
  matches,
  pick,
  slide,
  sortedBy,
  startFilters,
  visibleFruit,
  type BarDef,
} from "../blocks/filter-bar/filter-bar.ts";
import {
  cardOf,
  ratingLabel,
  stars,
} from "../blocks/product-card/product-card.ts";
import { sectionsOf } from "../blocks/menu-list/menu-list.ts";
import {
  bestDay,
  courierFee,
  slotsFor,
  summaryOf,
  validateOrder,
  orderInitial,
  settle as settleOrder,
} from "../blocks/order-form/order-form.ts";
import { clock, hoursRows, statusOf } from "../blocks/place-card/place-card.ts";
import {
  chooseColor,
  chooseSize,
  colorStock,
  pickerOf,
  settle,
  stockOf,
  type VariantDef,
} from "../blocks/swatch-picker/swatch-picker.ts";

const def: BarDef = {
  placeholder: "",
  groups: [
    {
      id: "kind",
      label: "Kind",
      multi: true,
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    },
    {
      id: "season",
      label: "Season",
      multi: false,
      options: [
        { id: "x", label: "X" },
        { id: "y", label: "Y" },
      ],
    },
  ],
  toggles: [{ id: "stock", label: "In stock" }],
  ranges: [
    {
      id: "price",
      label: "Price",
      min: 100,
      max: 500,
      step: 100,
      format: (v) => `$${v}`,
    },
  ],
  sorts: [{ id: "name", label: "Name" }],
  noun: ["thing", "things"],
};

test("filters: multi and single groups, switches, ranges, clear", () => {
  let f = startFilters(def);
  expect(isDirty(f, def)).toBe(false);
  f = pick(f, def, "kind", "a");
  f = pick(f, def, "kind", "b");
  expect(f.picks.kind).toEqual(["a", "b"]);
  f = pick(f, def, "kind", "a"); // toggles off
  expect(f.picks.kind).toEqual(["b"]);
  f = pick(f, def, "season", "x");
  f = pick(f, def, "season", "y"); // single: replaces
  expect(f.picks.season).toEqual(["y"]);
  expect(pick(f, def, "season", "").picks.season).toEqual([]);
  expect(pick(f, def, "nope", "a")).toBe(f);
  f = flip(f, "stock");
  expect(f.flags.stock).toBe(true);
  f = slide(f, def, "price", 9999);
  expect(f.ranges.price).toBe(500);
  f = slide(f, def, "price", 300);
  expect(f.ranges.price).toBe(300);
  expect(slide(f, def, "price", Number.NaN)).toBe(f);
  expect(isDirty(f, def)).toBe(true);
  const c = cleared(def, { ...f, sort: "name" });
  expect(isDirty(c, def)).toBe(false);
  expect(c.sort).toBe("name");
});

test("the bar's props show what is chosen", () => {
  let f = startFilters(def);
  f = pick(f, def, "kind", "b");
  const bar = barOf(def, f, 1);
  expect(bar.groups[0].options.map((o) => o.active)).toEqual([false, true]);
  expect(bar.groups[0].allActive).toBe(false);
  expect(bar.ranges[0].text).toBe("Any");
  expect(bar.resultLabel).toBe("1 thing");
  expect(bar.dirty).toBe(true);
});

test("search, picks, sort and counts", () => {
  expect(matches("sal pate", "Wild Salmon Pâté")).toBe(true);
  expect(matches("  ", "anything")).toBe(true);
  expect(matches("cat dog", "cat food")).toBe(false);
  expect(inPicks([], ["a"])).toBe(true);
  expect(inPicks(["a"], ["b", "a"])).toBe(true);
  expect(inPicks(["a"], ["b"])).toBe(false);
  const items = [
    { n: "b", v: 2 },
    { n: "a", v: 2 },
    { n: "c", v: 1 },
  ];
  const by = (dir: 1 | -1) =>
    sortedBy(
      items,
      (x) => x.v,
      dir,
      (x) => x.n,
    ).map((x) => x.n);
  expect(by(1)).toEqual(["c", "a", "b"]);
  expect(by(-1)).toEqual(["a", "b", "c"]);
  expect(countLabel(0, ["fruit", "fruits"])).toBe("No fruits");
  expect(countLabel(1, ["fruit", "fruits"])).toBe("1 fruit");
  expect(countLabel(5, ["fruit", "fruits"])).toBe("5 fruits");
});

test("the demo list of the filter bar page", () => {
  const all = startFilters({ ...def });
  expect(
    visibleFruit({ ...all, ranges: { price: 800 }, sort: "name" }),
  ).toHaveLength(8);
  const berries = visibleFruit({
    ...all,
    ranges: { price: 800 },
    picks: { kind: ["berry"] },
    flags: { stock: true },
    sort: "low",
  });
  expect(berries.map((x) => x.id)).toEqual(["strawberry", "raspberry"]);
});

test("stars, rating and the card's labels", () => {
  expect(stars(4.6)).toBe("★★★★★");
  expect(stars(4.4)).toBe("★★★★☆");
  expect(stars(0)).toBe("☆☆☆☆☆");
  expect(ratingLabel(4.56, 1280)).toBe("4.6 (1,280)");
  expect(ratingLabel(4)).toBe("4.0");
  const card = cardOf({
    id: "x",
    title: "X",
    blurb: "",
    emoji: "🍞",
    hue: 1,
    price: 1999,
    was: 2999,
    stock: 3,
    rating: 4,
  });
  expect(card).toMatchObject({
    priceLabel: "$19.99",
    wasLabel: "$29.99",
    note: "Only 3 left",
    disabled: false,
    openable: true,
  });
  const sold = cardOf({
    id: "x",
    title: "X",
    blurb: "",
    emoji: "🍞",
    hue: 1,
    price: 100,
    stock: 0,
  });
  expect(sold).toMatchObject({
    disabled: true,
    badge: "Sold out",
    addLabel: "Sold out",
  });
  expect(
    cardOf({
      id: "x",
      title: "X",
      blurb: "",
      emoji: "",
      hue: 1,
      price: 100,
      was: 50,
    }).wasLabel,
  ).toBe("");
});

const variants: VariantDef = {
  colors: [
    { id: "ink", label: "Ink", h: 0, s: 0, l: 10 },
    { id: "sand", label: "Sand", h: 38, s: 38, l: 74 },
    { id: "sky", label: "Sky", h: 205, s: 70, l: 70 },
  ],
  sizes: ["S", "M", "L"],
  stock: { "ink|S": 4, "ink|M": 0, "ink|L": 2, "sand|M": 1 },
};

test("variants: stock per size, settling, choosing", () => {
  expect(stockOf(variants, "ink", "S")).toBe(4);
  expect(stockOf(variants, "ink", "M")).toBe(0);
  expect(colorStock(variants, "sand")).toBe(1);
  expect(colorStock(variants, "sky")).toBe(0);
  // a sold out size moves to the first size in stock
  expect(settle(variants, { color: "ink", size: "M" })).toEqual({
    color: "ink",
    size: "S",
  });
  expect(settle(variants, { color: "sky", size: "M" })).toEqual({
    color: "sky",
    size: "",
  });
  // the size follows when the color changes; a sold out color cannot be chosen
  expect(chooseColor(variants, { color: "ink", size: "S" }, "sand")).toEqual({
    color: "sand",
    size: "M",
  });
  const sel = { color: "ink", size: "S" };
  expect(chooseColor(variants, sel, "sky")).toBe(sel);
  expect(chooseColor(variants, sel, "nope")).toBe(sel);
  expect(chooseSize(variants, sel, "M")).toBe(sel);
  expect(chooseSize(variants, sel, "L")).toEqual({ color: "ink", size: "L" });
});

test("the picker's props", () => {
  const p = pickerOf(variants, { color: "ink", size: "L" });
  expect(p.colorTitle).toBe("Color: Ink");
  expect(p.sizeTitle).toBe("Size: L");
  expect(p.note).toBe("Only 2 left");
  expect(p.low).toBe(true);
  expect(p.sizes.map((s) => s.soldOut)).toEqual([false, true, false]);
  expect(p.colors.map((c) => c.soldOut)).toEqual([false, false, true]);
  expect(pickerOf(variants, { color: "sky", size: "" })).toMatchObject({
    canBuy: false,
    note: "Sold out in this color",
  });
  expect(pickerOf(variants, { color: "ink", size: "S" }).note).toBe(
    "In stock, ships in 2 days",
  );
});

test("opening hours and the open status", () => {
  expect(clock(450)).toBe("7:30");
  expect(clock(18 * 60)).toBe("18:00");
  const week = hoursRows(3);
  expect(week.map((r) => r.day)[0]).toBe("Monday");
  expect(week.find((r) => r.today)?.day).toBe("Wednesday");
  expect(week[0]).toMatchObject({ text: "Closed", closed: true });
  expect(statusOf(3, 10 * 60)).toEqual({
    open: true,
    text: "Open now, until 18:00",
  });
  expect(statusOf(3, 6 * 60).text).toBe("Closed, opens today at 7:00");
  expect(statusOf(3, 19 * 60).text).toBe("Closed, opens tomorrow at 7:00");
  // Sunday evening: Monday is closed, so Tuesday
  expect(statusOf(0, 15 * 60).text).toBe("Closed, opens Tuesday at 7:00");
});

test("courier fee by distance", () => {
  expect(courierFee(1)).toBe(300);
  expect(courierFee(2)).toBe(300);
  expect(courierFee(2.5)).toBe(400);
  expect(courierFee(5)).toBe(600);
  expect(courierFee(12)).toBe(1300);
  expect(courierFee(13)).toBeNull();
  expect(courierFee(-1)).toBeNull();
  expect(courierFee(Number.NaN)).toBeNull();
});

test("time slots: lead time, step, closed days, tables", () => {
  // Wednesday 09:10: pickup needs 30 minutes, 15 minute steps -> 09:45 first
  const today = slotsFor(3, 9 * 60 + 10, "today", "pickup");
  expect(today[0].label).toBe("9:45");
  expect(today.at(-1)?.label).toBe("17:45");
  // the busy ones are taken, not removed
  expect(
    slotsFor(3, 0, "today", "pickup").find((s) => s.label === "12:30")?.taken,
  ).toBe(true);
  // courier: 60 minutes lead, 30 minute steps
  expect(slotsFor(3, 9 * 60, "today", "courier")[0].label).toBe("10:00");
  // tomorrow starts at opening
  expect(slotsFor(3, 17 * 60, "tomorrow", "pickup")[0].label).toBe("7:00");
  // after closing there is nothing today
  expect(slotsFor(3, 18 * 60, "today", "pickup")).toEqual([]);
  // Monday is closed
  expect(slotsFor(1, 0, "today", "pickup")).toEqual([]);
  expect(slotsFor(0, 0, "tomorrow", "pickup")).toEqual([]);
  // a table can be booked until 90 minutes before closing
  expect(slotsFor(3, 0, "tomorrow", "table").at(-1)?.label).toBe("16:30");
  expect(bestDay(3, 9 * 60, "pickup")).toBe("today");
  expect(bestDay(3, 18 * 60, "pickup")).toBe("tomorrow");
});

test("an order is checked before it is placed", () => {
  const ok = {
    mode: "pickup" as const,
    slot: "9:45",
    km: 3,
    guests: 2,
    name: "Anna",
    phone: "+1 503 555 0100",
    address: "",
  };
  expect(validateOrder(ok, 2)).toEqual({});
  expect(validateOrder(ok, 0)).toEqual({
    items: "Add something from the menu first.",
  });
  expect(
    Object.keys(
      validateOrder({ ...ok, slot: "", name: " ", phone: "12" }, 1),
    ).sort(),
  ).toEqual(["name", "phone", "slot"]);
  const courier = { ...ok, mode: "courier" as const };
  expect(validateOrder(courier, 1).address).toBe("Enter your address.");
  expect(
    validateOrder({ ...courier, address: "22 Birch Road", km: 14 }, 1).address,
  ).toBe("We deliver up to 12 km.");
  // a table needs no cart
  expect(validateOrder({ ...ok, mode: "table" }, 0)).toEqual({});
});

test("the order form derives its lists, fee and summary", () => {
  const s = settleOrder({
    ...orderInitial,
    weekday: 3,
    nowMin: 9 * 60,
    mode: "courier",
    km: 5,
    slot: "10:00",
    day: "today",
    errors: {},
  });
  expect(s.fee).toBe(600);
  expect(s.feeLabel).toBe("Delivery $6.00");
  expect(s.slot).toBe("10:00");
  expect(s.summary).toBe("Delivery today, Wednesday at 10:00");
  expect(s.modes.find((m) => m.active)?.id).toBe("courier");
  // a slot that is not offered is dropped
  expect(settleOrder({ ...s, slot: "3:33" }).slot).toBe("");
  expect(settleOrder({ ...s, km: 14 }).feeLabel).toContain("Too far");
  expect(
    summaryOf({ mode: "table", slot: "19:00", guests: 4 }, "tomorrow", 3),
  ).toBe("Table for 4 tomorrow, Thursday at 19:00");
  expect(
    summaryOf({ mode: "pickup", slot: "", guests: 1 }, "today", 3),
  ).toContain("Pick a time");
});

test("the menu by category", () => {
  const cats = [
    { id: "a", title: "A", note: "" },
    { id: "b", title: "B", note: "" },
    { id: "empty", title: "E", note: "" },
  ];
  const dishes = [
    {
      id: "1",
      name: "One",
      desc: "",
      price: 650,
      emoji: "",
      hue: 1,
      category: "a",
    },
    {
      id: "2",
      name: "Two",
      desc: "",
      price: 380,
      emoji: "",
      hue: 1,
      category: "b",
      soldOut: true,
      tags: ["vegan"],
    },
  ];
  const all = sectionsOf(dishes, cats);
  expect(all.map((s) => s.id)).toEqual(["a", "b"]);
  expect(all[0].items[0].priceLabel).toBe("$6.50");
  expect(all[1].items[0]).toMatchObject({
    soldOut: true,
    tags: ["vegan"],
    addLabel: "Two is sold out",
  });
  expect(sectionsOf(dishes, cats, "b").map((s) => s.id)).toEqual(["b"]);
});
