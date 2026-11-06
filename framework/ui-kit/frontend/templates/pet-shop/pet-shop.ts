import {
  type Children,
  type ComponentCtx,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import {
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";
import {
  type ConfirmationState,
  confirmationOf,
  orderNumber,
} from "../../blocks/checkout-summary/checkout-summary.ts";
import {
  type BarDef,
  type BarView,
  barOf,
  FilterHost,
  type Filters,
  inPicks,
  matches,
  sortedBy,
  startFilters,
} from "../../blocks/filter-bar/filter-bar.ts";
import {
  type CardItem,
  cardOf,
  type Product,
} from "../../blocks/product-card/product-card.ts";
import {
  type DetailState,
  detailOf,
} from "../../blocks/product-detail/product-detail.ts";
import {
  type CartItem,
  type CartState,
  cartBlock,
  cartInitial,
  money,
} from "../../blocks/shop-cart/shop-cart.ts";
import view from "./pet-shop.pavlus";

export type Pet = "dogs" | "cats" | "birds";
export type Category = "food" | "toys" | "accessories";

export interface PetProduct extends Product {
  pets: Pet[];
  category: Category;
  details?: { label: string; value: string }[];
  points?: string[];
}

const p = (
  id: string,
  title: string,
  blurb: string,
  emoji: string,
  hue: number,
  price: number,
  pets: Pet[],
  category: Category,
  extra: Partial<PetProduct> = {},
): PetProduct => ({
  id,
  title,
  blurb,
  emoji,
  hue,
  price,
  pets,
  category,
  kicker: { food: "Food", toys: "Toys", accessories: "Accessories" }[category],
  ...extra,
});

export const PRODUCTS: PetProduct[] = [
  p(
    "salmon-kibble",
    "Salmon & Sweet Potato Kibble",
    "Grain-free dry food for adult dogs with omega-3 for a shiny coat.",
    "🐟",
    22,
    5490,
    ["dogs"],
    "food",
    {
      rating: 4.8,
      reviews: 1840,
      badge: "Bestseller",
      chips: ["12 kg", "Grain free"],
      stock: 24,
      points: [
        "Single animal protein",
        "No wheat, corn or soy",
        "Made in small batches",
      ],
      details: [
        { label: "Pack", value: "12 kg" },
        { label: "Life stage", value: "Adult" },
        { label: "Protein", value: "28%" },
      ],
    },
  ),
  p(
    "puppy-lamb",
    "Lamb & Rice Puppy Formula",
    "Gentle, DHA-rich food for puppies up to 12 months.",
    "🍼",
    40,
    2490,
    ["dogs"],
    "food",
    {
      rating: 4.7,
      reviews: 920,
      badge: "New",
      chips: ["3 kg"],
      stock: 18,
    },
  ),
  p(
    "chicken-treats",
    "Chicken Training Treats",
    "Tiny soft pieces, 3 calories each: made for rewarding.",
    "🍗",
    30,
    690,
    ["dogs"],
    "food",
    {
      rating: 4.9,
      reviews: 3210,
      chips: ["200 g"],
      stock: 60,
    },
  ),
  p(
    "dental-chews",
    "Dental Chew Bones, 7 pack",
    "Daily chews that help reduce tartar and freshen breath.",
    "🦴",
    55,
    1290,
    ["dogs"],
    "food",
    {
      rating: 4.5,
      reviews: 1020,
      chips: ["7 pack"],
      stock: 31,
    },
  ),
  p(
    "rope-tug",
    "Cotton Rope Tug",
    "Knotted three-ply rope, tough on play and gentle on gums.",
    "🪢",
    12,
    990,
    ["dogs"],
    "toys",
    {
      rating: 4.6,
      reviews: 760,
      chips: ["45 cm"],
      stock: 40,
    },
  ),
  p(
    "fetch-balls",
    "Rubber Fetch Balls, 2 pack",
    "Bouncy, floats on water and squeaks when found.",
    "🎾",
    85,
    1190,
    ["dogs"],
    "toys",
    {
      rating: 4.6,
      reviews: 1480,
      was: 1490,
      badge: "-20%",
      badgeTone: "destructive",
      chips: ["2 pack"],
      stock: 52,
    },
  ),
  p(
    "harness",
    "Padded Walking Harness",
    "Breathable mesh with reflective stitching; no pulling on the neck.",
    "🦺",
    200,
    3490,
    ["dogs"],
    "accessories",
    {
      rating: 4.6,
      reviews: 540,
      chips: ["S", "M", "L"],
      stock: 6,
    },
  ),
  p(
    "dog-bed",
    "Orthopedic Dog Bed",
    "Memory foam that supports older joints, with a washable cover.",
    "🛏️",
    260,
    6990,
    ["dogs"],
    "accessories",
    {
      rating: 4.8,
      reviews: 380,
      was: 8990,
      badge: "-22%",
      badgeTone: "destructive",
      stock: 0,
    },
  ),
  p(
    "salmon-pate",
    "Wild Salmon Pâté, 12 x 85 g",
    "Silky wet food made with real fish and no fillers.",
    "🐠",
    15,
    2890,
    ["cats"],
    "food",
    {
      rating: 4.8,
      reviews: 2210,
      badge: "Bestseller",
      chips: ["12 cans"],
      stock: 36,
    },
  ),
  p(
    "indoor-dry",
    "Indoor Cat Dry Food",
    "Hairball control and healthy weight for cats that stay in.",
    "🥣",
    45,
    3290,
    ["cats"],
    "food",
    {
      rating: 4.4,
      reviews: 670,
      chips: ["4 kg"],
      stock: 20,
    },
  ),
  p(
    "freeze-dried",
    "Freeze-dried Chicken Bites",
    "One ingredient, crunchy, loved even by picky cats.",
    "🍗",
    28,
    890,
    ["cats"],
    "food",
    {
      rating: 4.7,
      reviews: 540,
      badge: "New",
      chips: ["40 g"],
      stock: 44,
    },
  ),
  p(
    "feather-wand",
    "Feather Wand",
    "A flexible rod with soft feathers that flutter like a bird.",
    "🪶",
    190,
    790,
    ["cats"],
    "toys",
    {
      rating: 4.6,
      reviews: 1310,
      chips: ["90 cm"],
      stock: 70,
    },
  ),
  p(
    "catnip-mice",
    "Catnip Mice, set of 5",
    "Hand-stitched cotton mice filled with organic catnip.",
    "🐭",
    140,
    890,
    ["cats"],
    "toys",
    {
      rating: 4.8,
      reviews: 2040,
      chips: ["5 pack"],
      stock: 80,
    },
  ),
  p(
    "play-tunnel",
    "Foldable Play Tunnel",
    "A crinkly tunnel with a peek-a-boo window, folds flat.",
    "⛺",
    160,
    1990,
    ["cats"],
    "toys",
    {
      rating: 4.3,
      reviews: 310,
      chips: ["120 cm"],
      stock: 14,
    },
  ),
  p(
    "scratch-post",
    "Sisal Scratching Post",
    "Stable, tall and wrapped in real sisal rope.",
    "🪵",
    35,
    3990,
    ["cats"],
    "accessories",
    {
      rating: 4.7,
      reviews: 880,
      chips: ["80 cm"],
      stock: 3,
    },
  ),
  p(
    "cat-cave",
    "Cozy Cave Bed",
    "Felted wool cave for hiding, napping and purring.",
    "🏠",
    330,
    4490,
    ["cats"],
    "accessories",
    {
      rating: 4.9,
      reviews: 460,
      stock: 11,
    },
  ),
  p(
    "seed-mix",
    "Tropical Seed Mix",
    "A rich mix of seeds, nuts and dried fruit for parrots.",
    "🌻",
    50,
    1290,
    ["birds"],
    "food",
    {
      rating: 4.5,
      reviews: 410,
      chips: ["1 kg"],
      stock: 28,
    },
  ),
  p(
    "millet",
    "Millet Spray, 10 pack",
    "A classic treat to nibble: good for taming shy birds.",
    "🌾",
    62,
    690,
    ["birds"],
    "food",
    {
      rating: 4.9,
      reviews: 1150,
      chips: ["10 pack"],
      stock: 55,
    },
  ),
  p(
    "bell-swing",
    "Bell & Ladder Swing",
    "Natural wood perches with a bell to ring.",
    "🔔",
    48,
    1090,
    ["birds"],
    "toys",
    {
      rating: 4.4,
      reviews: 220,
      chips: ["Small"],
      stock: 17,
    },
  ),
  p(
    "forage-blocks",
    "Foraging Wood Blocks",
    "Hide a treat inside; hours of beak-friendly puzzles.",
    "🧩",
    100,
    1490,
    ["birds"],
    "toys",
    {
      rating: 4.7,
      reviews: 190,
      badge: "New",
      stock: 9,
    },
  ),
  p(
    "travel-cage",
    "Travel Cage",
    "A light carrier with a perch, easy-clean tray and a handle.",
    "🪺",
    200,
    6490,
    ["birds"],
    "accessories",
    {
      rating: 4.5,
      reviews: 140,
      chips: ["40 cm"],
      stock: 5,
    },
  ),
  p(
    "feeder-set",
    "Stainless Feeder Set",
    "Two clip-on bowls that do not tip or rust.",
    "🥄",
    215,
    1390,
    ["birds"],
    "accessories",
    {
      rating: 4.6,
      reviews: 170,
      chips: ["2 bowls"],
      stock: 22,
    },
  ),
  p(
    "bowl-set",
    "Stainless Steel Bowl Set",
    "Non-slip bowls for food and water, dishwasher safe.",
    "🥣",
    210,
    1590,
    ["dogs", "cats"],
    "accessories",
    {
      rating: 4.7,
      reviews: 1290,
      chips: ["2 bowls"],
      stock: 33,
    },
  ),
  p(
    "deshed-glove",
    "Deshedding Glove",
    "Gather loose fur while you pet; gentle on skin.",
    "🧤",
    300,
    1290,
    ["dogs", "cats"],
    "accessories",
    {
      rating: 4.5,
      reviews: 860,
      stock: 26,
    },
  ),
  p(
    "calm-spray",
    "Calming Herb Spray",
    "Lavender and chamomile for car rides, vet visits and storms.",
    "🌿",
    130,
    1690,
    ["dogs", "cats", "birds"],
    "accessories",
    {
      rating: 4.2,
      reviews: 330,
      chips: ["100 ml"],
      stock: 15,
    },
  ),
];

const maxPrice =
  Math.ceil(Math.max(...PRODUCTS.map((x) => x.price)) / 1000) * 1000;

export const barDef: BarDef = {
  placeholder: "Search food, toys, brands...",
  groups: [
    {
      id: "pet",
      label: "For",
      multi: true,
      allLabel: "All pets",
      options: [
        { id: "dogs", label: "🐕 Dogs" },
        { id: "cats", label: "🐈 Cats" },
        { id: "birds", label: "🦜 Birds" },
      ],
    },
    {
      id: "category",
      label: "Type",
      multi: true,
      allLabel: "Everything",
      options: [
        { id: "food", label: "Food" },
        { id: "toys", label: "Toys" },
        { id: "accessories", label: "Accessories" },
      ],
    },
  ],
  toggles: [{ id: "stock", label: "In stock only" }],
  ranges: [
    {
      id: "price",
      label: "Price",
      min: 500,
      max: maxPrice,
      step: 500,
      format: (v) => `up to ${money(v).replace(".00", "")}`,
    },
  ],
  sorts: [
    { id: "popular", label: "Most popular" },
    { id: "low", label: "Price: low to high" },
    { id: "high", label: "Price: high to low" },
    { id: "rating", label: "Best rated" },
    { id: "name", label: "Name A-Z" },
  ],
  noun: ["product", "products"],
};

/** The products a set of filters lets through, in the chosen order. */
export function visibleProducts(list: PetProduct[], f: Filters): PetProduct[] {
  const max = f.ranges.price ?? Infinity;
  const kept = list.filter(
    (x) =>
      matches(
        f.query,
        `${x.title} ${x.blurb} ${x.category} ${x.pets.join(" ")}`,
      ) &&
      inPicks(f.picks.pet, x.pets) &&
      inPicks(f.picks.category, [x.category]) &&
      (!f.flags.stock || (x.stock ?? 1) > 0) &&
      x.price <= max,
  );
  const title = (x: PetProduct) => x.title;
  switch (f.sort) {
    case "low":
      return sortedBy(kept, (x) => x.price, 1, title);
    case "high":
      return sortedBy(kept, (x) => x.price, -1, title);
    case "rating":
      return sortedBy(kept, (x) => x.rating ?? 0, -1, title);
    case "name":
      return sortedBy(kept, () => 0, 1, title);
    default:
      return sortedBy(kept, (x) => x.reviews ?? 0, -1, title);
  }
}

export const itemOf = (x: PetProduct): CartItem => ({
  id: x.id,
  name: x.title,
  variant: x.chips?.[0] ?? "",
  price: x.price,
  emoji: x.emoji,
  hue: x.hue,
  max: x.stock,
});

const CARD = {
  addLabel: "Add to cart",
  lowStockAt: 6,
  previewLabel: "Quick view",
};

const cardsOf = (list: PetProduct[]): CardItem[] =>
  list.map((x) => cardOf(x, CARD));

export interface PetShopState {
  filters: Filters;
  bar: BarView;
  cards: CardItem[];
  cart: CartState;
  cartOpen: boolean;
  detail: DetailState | null;
  confirmation: ConfirmationState | null;
  toast: string;
  orders: number;
  links: { label: string; href: string }[];
}

const start = startFilters(barDef);
const startList = visibleProducts(PRODUCTS, start);

export const initial: PetShopState = {
  filters: start,
  bar: barOf(barDef, start, startList.length),
  cards: cardsOf(startList),
  cart: {
    ...cartInitial,
    emptyText:
      "Food, toys and treats are waiting in the shop. Pick something for your pet.",
  },
  cartOpen: false,
  detail: null,
  confirmation: null,
  toast: "",
  orders: 0,
  links: [
    { label: "Dogs", href: "#products" },
    { label: "Cats", href: "#products" },
    { label: "Birds", href: "#products" },
    { label: "Why us", href: "#why" },
  ],
};

export class PetShop extends FilterHost<PetShopState> {
  view = view;
  readonly barDef = barDef;
  children: Children<PetShopState> = {
    cart: { component: cartBlock, key: "cart" },
  };

  _apply(filters: Filters): Effect[] {
    const list = visibleProducts(PRODUCTS, filters);
    return [
      store.set("filters", filters),
      store.set("bar", barOf(barDef, filters, list.length)),
      store.set("cards", cardsOf(list)),
    ];
  }

  /** Puts a product in the cart, and tells the visitor. */
  _add(id: string, ctx: ComponentCtx): Effect[] {
    const x = PRODUCTS.find((q) => q.id === id);
    if (!x) return [];
    return [
      ...ctx.send("cart", "add", itemOf(x)),
      store.set("toast", `${x.title} is in your cart`),
      time.setTimeout("toast", 2600, "hideToast"),
    ];
  }

  hideToast(): Effect[] {
    return [store.set("toast", "")];
  }

  "grid.card.add"(msg: Message, _s: PetShopState, ctx: ComponentCtx): Effect[] {
    return this._add(String(msg.payload), ctx);
  }

  "detail.add"(msg: Message, _s: PetShopState, ctx: ComponentCtx): Effect[] {
    return [...this._add(String(msg.payload), ctx), store.set("detail", null)];
  }

  /** A card's title, or the quick view button, opens the product in full. */
  "grid.card.open"(msg: Message): Effect[] {
    const x = PRODUCTS.find((q) => q.id === msg.payload);
    if (!x) return [];
    const card = cardOf(x, CARD);
    return [
      store.set(
        "detail",
        detailOf(card, {
          facts: x.details ?? [
            { label: "For", value: x.pets.join(", ") },
            { label: "Type", value: x.category },
          ],
          points: x.points ?? ["Vet recommended", "Free returns for 30 days"],
        }),
      ),
    ];
  }

  "grid.card.preview"(msg: Message): Effect[] {
    return this["grid.card.open"](msg);
  }

  closeDetail(): Effect[] {
    return [store.set("detail", null)];
  }

  openCart(): Effect[] {
    return [store.set("cartOpen", true)];
  }

  closeCart(): Effect[] {
    return [store.set("cartOpen", false)];
  }

  "grid.clear"(msg: Message, s: PetShopState): Effect[] {
    return this["bar.clear"](msg, s);
  }

  /** The cart's button: the order is placed, the cart is emptied. */
  "cart.checkout"(
    _msg: Message,
    state: PetShopState,
    ctx: ComponentCtx,
  ): Effect[] {
    if (state.cart.empty) return [];
    const number = state.orders + 1;
    return [
      store.set(
        "confirmation",
        confirmationOf(state.cart.lines, state.cart.promo, state.cart, {
          title: "Thank you! Your order is on its way",
          text: "We pack orders within a day. A tracking link will arrive by email.",
          orderNo: orderNumber(number, "PET"),
          ctaLabel: "Keep shopping",
        }),
      ),
      store.set("orders", number),
      store.set("cartOpen", false),
      ...ctx.send("cart", "clear"),
    ];
  }

  "confirm.done"(): Effect[] {
    return [store.set("confirmation", null)];
  }

  closeConfirmation(): Effect[] {
    return [store.set("confirmation", null)];
  }
}

export const page = new PetShop();
