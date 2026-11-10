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
