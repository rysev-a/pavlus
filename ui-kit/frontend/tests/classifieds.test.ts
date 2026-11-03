import { expect, test } from "vitest";
import {
  toggleFavorite,
  savedLabel,
} from "../blocks/favorite-toggle/favorite-toggle.ts";
import { cardsOf, formatPrice } from "../blocks/listing-card/listing-card.ts";
import {
  agoLabel,
  ITEMS,
} from "../templates/classifieds-board/classifieds-data.ts";
import {
  derive,
  filterItems,
  lookOfCategory,
  nameFromEmail,
  parsePrice,
  sortItems,
  validateListing,
  type Filters,
} from "../templates/classifieds-board/classifieds-board.ts";

const none: Filters = {
  query: "",
  category: "All",
  min: "",
  max: "",
  sort: "newest",
};

test("prices are formatted and parsed", () => {
  expect(formatPrice(0)).toBe("Free");
  expect(formatPrice(180)).toBe("$180");
  expect(formatPrice(7400)).toBe("$7,400");
  expect(formatPrice(1234567)).toBe("$1,234,567");
  expect(parsePrice("1,200")).toBe(1200);
  expect(parsePrice(" $45 ")).toBe(45);
  expect(parsePrice("0")).toBe(0);
  expect(parsePrice("")).toBeNull();
  expect(parsePrice("abc")).toBeNull();
  expect(parsePrice("-5")).toBeNull();
});

test("favorites toggle in and out of the list", () => {
  expect(toggleFavorite([], "a")).toEqual(["a"]);
  expect(toggleFavorite(["a", "b"], "a")).toEqual(["b"]);
  expect(savedLabel(0)).toBe("Nothing saved yet");
  expect(savedLabel(3)).toBe("3 saved");
});

test("filtering by words, category and price", () => {
  expect(filterItems(ITEMS, none)).toHaveLength(ITEMS.length);
  const bikes = filterItems(ITEMS, { ...none, query: "road bike" });
  expect(bikes.map((i) => i.id)).toEqual(["l3"]);
  // every word must match, in any order and any case
  expect(
    filterItems(ITEMS, { ...none, query: "OAK table" }).map((i) => i.id),
  ).toEqual(["l2"]);
  expect(filterItems(ITEMS, { ...none, query: "zzz" })).toEqual([]);
  const home = filterItems(ITEMS, { ...none, category: "Home" });
  expect(home.every((i) => i.category === "Home")).toBe(true);
  expect(home.length).toBeGreaterThan(1);
  const cheap = filterItems(ITEMS, { ...none, max: "50" });
  expect(cheap.every((i) => i.price <= 50)).toBe(true);
  const range = filterItems(ITEMS, { ...none, min: "100", max: "300" });
  expect(range.every((i) => i.price >= 100 && i.price <= 300)).toBe(true);
  // a price box that is not a number does not filter
  expect(filterItems(ITEMS, { ...none, min: "abc" })).toHaveLength(
    ITEMS.length,
  );
  // location is searched too
  expect(
    filterItems(ITEMS, { ...none, query: "austin" }).map((i) => i.id),
  ).toEqual(["l2"]);
});

test("sorting", () => {
  const asc = sortItems(ITEMS, "price-asc").map((i) => i.price);
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  const desc = sortItems(ITEMS, "price-desc").map((i) => i.price);
  expect(desc).toEqual([...asc].reverse());
  const newest = sortItems(ITEMS, "newest").map((i) => i.hours);
  expect(newest).toEqual([...newest].sort((a, b) => a - b));
  // the input is not changed
  expect(ITEMS[0].id).toBe("l1");
  expect(agoLabel(0)).toBe("Just now");
  expect(agoLabel(5)).toBe("5 h ago");
  expect(agoLabel(30)).toBe("Yesterday");
  expect(agoLabel(100)).toBe("4 days ago");
});

test("the sell form is validated", () => {
  const ok = {
    id: "",
    title: "Retro games console",
    category: "Electronics",
    price: "90",
    location: "Austin, TX",
    description: "Works great, two controllers included.",
  };
  expect(validateListing(ok)).toEqual({});
  expect(
    Object.keys(
      validateListing({
        ...ok,
        title: "Hi",
        category: "",
        price: "x",
        location: "",
        description: "short",
      }),
    ).sort(),
  ).toEqual(["category", "description", "location", "price", "title"]);
  expect(validateListing({ ...ok, price: "0" })).toEqual({});
  expect(validateListing({ ...ok, price: "5000000" })).toHaveProperty("price");
  expect(validateListing({ ...ok, title: "x".repeat(71) })).toHaveProperty(
    "title",
  );
  expect(lookOfCategory("Vehicles")).toEqual({ emoji: "🚗", tone: 4 });
  expect(lookOfCategory("nope").emoji).toBe("🏷️");
});

test("names and the derived board", () => {
  expect(nameFromEmail("ann.lee@example.com")).toBe("Ann Lee");
  expect(nameFromEmail("bob@x.io")).toBe("Bob");
  const cards = cardsOf(ITEMS.slice(0, 2), ["l2"]);
  expect(cards.map((c) => c.favorite)).toEqual([false, true]);
  expect(cards[0].priceLabel).toBe("$180");
  const d = derive({
    view: "browse",
    profileTab: "listings",
    items: ITEMS,
    filters: { ...none, category: "Sports" },
    favorites: ["l8"],
    detailId: "l8",
    contactOpen: false,
    contactText: "",
    contactSent: false,
    form: {
      id: "",
      title: "",
      category: "",
      price: "",
      location: "",
      description: "",
    },
    errors: {},
    saved: "",
    user: { name: "Ann Lee", email: "a@b.co" },
    messages: [],
    nextId: 1,
  });
  expect(d.cards.map((c) => c.id).sort()).toEqual(["l10", "l8"]);
  expect(d.resultLabel).toBe("2 listings");
  expect(d.chips[0].count).toBe(ITEMS.length);
  expect(d.favCards.map((c) => c.id)).toEqual(["l8"]);
  expect(d.detail?.item.priceLabel).toBe("$25");
  expect(d.mine.map((m) => m.id)).toEqual(["m1", "m2"]);
  expect(d.filtered).toBe(true);
  expect(d.initials).toBe("AL");
});
