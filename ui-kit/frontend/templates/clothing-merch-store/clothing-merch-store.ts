import {
  type Children,
  type ComponentCtx,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import {
  type AuthState,
  initial as authInitial,
  page as authBlock,
  validateRegister,
  validateSignin,
} from "../../blocks/auth/auth.ts";
import {
  confirmationOf,
  type ConfirmationState,
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
  cardOf,
  type CardItem,
  type Product,
} from "../../blocks/product-card/product-card.ts";
import {
  type DetailState,
  detailOf,
  type Fact,
} from "../../blocks/product-detail/product-detail.ts";
import {
  cartBlock,
  type CartLine,
  type CartState,
  cartInitial,
  money,
  type Totals,
} from "../../blocks/shop-cart/shop-cart.ts";
import {
  chooseColor,
  chooseSize,
  colorStock,
  pickerOf,
  type Selection,
  settle,
  stockOf,
  type Swatch,
  type VariantDef,
} from "../../blocks/swatch-picker/swatch-picker.ts";
import view from "./clothing-merch-store.pavlus";

// ---- the catalogue ----

const INK: Swatch = { id: "ink", label: "Ink", h: 220, s: 14, l: 14 };
const SAND: Swatch = { id: "sand", label: "Sand", h: 38, s: 38, l: 74 };
const FOREST: Swatch = { id: "forest", label: "Forest", h: 150, s: 32, l: 26 };
const RUST: Swatch = { id: "rust", label: "Rust", h: 15, s: 62, l: 42 };
const SKY: Swatch = { id: "sky", label: "Sky", h: 205, s: 70, l: 70 };
const STONE: Swatch = { id: "stone", label: "Stone", h: 40, s: 6, l: 62 };

export const COLORS = [INK, SAND, FOREST, RUST, SKY, STONE];
export const APPAREL = ["XS", "S", "M", "L", "XL"];
export const ONE_SIZE = ["One size"];

/**
 * Stock per color and size, from a seed: deterministic, so the shop looks the
 * same on every visit. Some sizes are sold out, some are nearly gone.
 */
export function stockGrid(
  colors: Swatch[],
  sizes: string[],
  seed: number,
): Record<string, number> {
  const stock: Record<string, number> = {};
  colors.forEach((c, ci) =>
    sizes.forEach((size, si) => {
      const v = (ci * 5 + si * 3 + seed) % 11;
      if (v >= 2) stock[`${c.id}|${size}`] = v - 1;
    }),
  );
  return stock;
}

export interface Garment extends Product {
  category: string;
  def: VariantDef;
  facts: Fact[];
  points: string[];
}

const g = (
  id: string,
  title: string,
  category: string,
  emoji: string,
  price: number,
  blurb: string,
  colors: Swatch[],
  sizes: string[],
  seed: number,
  extra: Partial<Garment> = {},
  facts: Fact[] = [],
  points: string[] = [],
): Garment => ({
  id,
  title,
  category,
  emoji,
  price,
  blurb,
  hue: colors[0].h,
  kicker: category,
  def: { colors, sizes, stock: stockGrid(colors, sizes, seed) },
  facts,
  points,
  ...extra,
});

export const GARMENTS: Garment[] = [
  g(
    "heavy-tee",
    "Everyday Heavy Tee",
    "Tees",
    "👕",
    3200,
    "A 240 gsm organic cotton tee that keeps its shape wash after wash.",
    [INK, SAND, FOREST, RUST],
    APPAREL,
    3,
    { rating: 4.8, reviews: 1320, badge: "Bestseller" },
    [
      { label: "Fabric", value: "240 gsm organic cotton" },
      { label: "Fit", value: "Regular" },
      { label: "Made in", value: "Portugal" },
    ],
    [
      "Pre-washed, no shrinking",
      "Reinforced collar",
      "Free returns for 30 days",
    ],
  ),
  g(
    "boxy-tee",
    "Boxy Pocket Tee",
    "Tees",
    "👕",
    3600,
    "A cropped, boxy cut with a chest pocket and dropped shoulders.",
    [SKY, SAND, INK],
    APPAREL,
    8,
    { rating: 4.6, reviews: 410, badge: "New" },
    [
      { label: "Fabric", value: "200 gsm cotton" },
      { label: "Fit", value: "Boxy" },
      { label: "Made in", value: "Portugal" },
    ],
    ["Garment dyed", "Chest pocket", "Model is 182 cm in M"],
  ),
  g(
    "pullover",
    "Pullover Hoodie",
    "Hoodies",
    "🧥",
    7800,
    "Brushed fleece inside, a double-layer hood and a kangaroo pocket.",
    [INK, FOREST, SAND, STONE],
    APPAREL,
    5,
    {
      rating: 4.9,
      reviews: 880,
      badge: "-15%",
      badgeTone: "destructive",
      was: 9200,
    },
    [
      { label: "Fabric", value: "420 gsm brushed fleece" },
      { label: "Fit", value: "Relaxed" },
      { label: "Made in", value: "Portugal" },
    ],
    ["Heavyweight and soft", "Flat drawcord", "Machine washable at 30 degrees"],
  ),
  g(
    "zip-hoodie",
    "Zip Hoodie",
    "Hoodies",
    "🧥",
    8800,
    "A full-zip hoodie with a metal zipper and two deep pockets.",
    [INK, RUST, STONE],
    APPAREL,
    1,
    { rating: 4.7, reviews: 342 },
    [
      { label: "Fabric", value: "400 gsm fleece" },
      { label: "Fit", value: "Regular" },
      { label: "Made in", value: "Portugal" },
    ],
    ["YKK metal zipper", "Hidden phone pocket", "Free returns for 30 days"],
  ),
  g(
    "chino",
    "Relaxed Chino",
    "Pants",
    "👖",
    6800,
    "Washed cotton twill with a relaxed leg and a tapered ankle.",
    [SAND, INK, FOREST],
    ["28", "30", "32", "34", "36"],
    6,
    { rating: 4.5, reviews: 276 },
    [
      { label: "Fabric", value: "Cotton twill" },
      { label: "Fit", value: "Relaxed, tapered" },
      { label: "Rise", value: "Mid" },
    ],
    ["Five pockets", "Garment washed", "Hems can be shortened in store"],
  ),
  g(
    "jogger",
    "Fleece Jogger",
    "Pants",
    "👖",
    6200,
    "Soft fleece sweatpants with a drawcord waist and zip pocket.",
    [INK, STONE, FOREST],
    APPAREL,
    9,
    { rating: 4.7, reviews: 530 },
    [
      { label: "Fabric", value: "380 gsm fleece" },
      { label: "Fit", value: "Tapered" },
      { label: "Made in", value: "Portugal" },
    ],
    ["Zip pocket for keys", "Cuffed ankles", "Matches the pullover"],
  ),
  g(
    "cap",
    "Six-Panel Cap",
    "Headwear",
    "🧢",
    2800,
    "A washed cotton cap with a curved brim and a brass buckle.",
    [INK, SAND, RUST, SKY],
    ONE_SIZE,
    4,
    { rating: 4.6, reviews: 215 },
    [
      { label: "Fabric", value: "Washed cotton" },
      { label: "Fit", value: "Adjustable" },
    ],
    ["Embroidered logo", "Brass buckle"],
  ),
  g(
    "beanie",
    "Knit Beanie",
    "Headwear",
    "🧶",
    2400,
    "A ribbed merino beanie that is warm without the itch.",
    [INK, FOREST, RUST, STONE],
    ONE_SIZE,
    7,
    { rating: 4.8, reviews: 460 },
    [
      { label: "Fabric", value: "100% merino wool" },
      { label: "Fit", value: "One size" },
    ],
    ["Ribbed, double layer", "Hand wash only"],
  ),
  g(
    "mug",
    "Stoneware Mug",
    "Merch",
    "☕",
    1900,
    "A 350 ml mug with a reactive glaze. Each one is a little different.",
    [SAND, INK, SKY],
    ONE_SIZE,
    2,
    { rating: 4.7, reviews: 188 },
    [
      { label: "Volume", value: "350 ml" },
      { label: "Care", value: "Dishwasher safe" },
    ],
    ["Made by a pottery in Porto", "Microwave safe"],
  ),
  g(
    "tote",
    "Canvas Tote",
    "Merch",
    "👜",
    2200,
    "A sturdy 12 oz canvas tote with a flat bottom and an inside pocket.",
    [SAND, INK, FOREST],
    ONE_SIZE,
    10,
    { rating: 4.6, reviews: 302 },
    [
      { label: "Fabric", value: "12 oz canvas" },
      { label: "Size", value: "38 x 40 cm" },
    ],
    ["Holds up to 10 kg", "Inside zip pocket"],
  ),
  g(
    "stickers",
    "Sticker Pack",
    "Merch",
    "🏷️",
    800,
    "Eight vinyl stickers, waterproof and sun-proof, for laptops and bottles.",
    [STONE],
    ONE_SIZE,
    0,
    { rating: 4.9, reviews: 95 },
    [{ label: "In the pack", value: "8 stickers" }],
    ["Matte vinyl", "Dishwasher safe"],
  ),
  g(
    "pins",
    "Enamel Pin Set",
    "Merch",
    "📌",
    1400,
    "Three hard-enamel pins with butterfly clasps.",
    [INK, RUST],
    ONE_SIZE,
    11,
    { rating: 4.5, reviews: 74 },
    [{ label: "In the set", value: "3 pins" }],
    ["Hard enamel", "Gold-tone plating"],
  ),
];

const stockTotal = (x: Garment): number =>
  x.def.colors.reduce((n, c) => n + colorStock(x.def, c.id), 0);

const toCard = (x: Garment): CardItem => ({
  ...cardOf(
    { ...x, stock: stockTotal(x) },
    { addLabel: "Choose options", previewLabel: "Quick view", lowStockAt: 6 },
  ),
  chips: [
    x.def.colors.length === 1 ? "1 color" : `${x.def.colors.length} colors`,
  ],
});

// ---- filters ----

const maxPrice = 10000;

export const barDef: BarDef = {
  placeholder: "Search tees, hoodies, mugs...",
  groups: [
    {
      id: "category",
      label: "Shop",
      multi: true,
      allLabel: "All",
      options: ["Tees", "Hoodies", "Pants", "Headwear", "Merch"].map((c) => ({
        id: c,
        label: c,
      })),
    },
    {
      id: "color",
      label: "Color",
      multi: true,
      allLabel: "Any",
      options: COLORS.map((c) => ({ id: c.id, label: c.label })),
    },
  ],
  toggles: [{ id: "stock", label: "In stock only" }],
  ranges: [
    {
      id: "price",
      label: "Price",
      min: 1000,
      max: maxPrice,
      step: 500,
      format: (v) => `up to ${money(v).replace(".00", "")}`,
    },
  ],
  sorts: [
    { id: "featured", label: "Featured" },
    { id: "rating", label: "Best rated" },
    { id: "low", label: "Price: low to high" },
    { id: "high", label: "Price: high to low" },
  ],
  noun: ["product", "products"],
};

export function visibleGarments(list: Garment[], f: Filters): Garment[] {
  const max = f.ranges.price ?? Infinity;
  const kept = list.filter(
    (x) =>
      matches(f.query, `${x.title} ${x.blurb} ${x.category}`) &&
      inPicks(f.picks.category, [x.category]) &&
      inPicks(
        f.picks.color,
        x.def.colors.map((c) => c.id),
      ) &&
      (!f.flags.stock || stockTotal(x) > 0) &&
      x.price <= max,
  );
  const title = (x: Garment) => x.title;
  switch (f.sort) {
    case "rating":
      return sortedBy(kept, (x) => x.rating ?? 0, -1, title);
    case "low":
      return sortedBy(kept, (x) => x.price, 1, title);
    case "high":
      return sortedBy(kept, (x) => x.price, -1, title);
    default:
      return kept;
  }
}

// ---- the customer account ----

export interface OrderRow {
  no: string;
  date: string;
  status: string;
  tone: string;
  summary: string;
  emojis: string;
  total: string;
}

export interface Account {
  name: string;
  email: string;
  initials: string;
  orders: OrderRow[];
}

/** `anna.lee@example.com` -> `Anna Lee`. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._\-+]+/).filter(Boolean);
  return (
    words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || "Friend"
  );
}

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

/** A row of the order history for a cart that was just paid. */
export function orderRow(
  lines: CartLine[],
  totals: Totals,
  no: string,
  date: string,
): OrderRow {
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const names = lines.map((l) => l.name);
  return {
    no,
    date,
    status: "Processing",
    tone: "info",
    summary: `${count} ${count === 1 ? "item" : "items"}: ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""}`,
    emojis: lines
      .slice(0, 4)
      .map((l) => l.emoji)
      .join(" "),
    total: money(totals.total),
  };
}

export function makeAccount(name: string, email: string): Account {
  return {
    name,
    email,
    initials: initialsOf(name),
    orders: [
      {
        no: "NL-1058",
        date: "Oct 29, 2026",
        status: "Shipped",
        tone: "warning",
        summary: "2 items: Pullover Hoodie, Knit Beanie",
        emojis: "🧥 🧶",
        total: "$113.40",
      },
      {
        no: "NL-1042",
        date: "Oct 18, 2026",
        status: "Delivered",
        tone: "success",
        summary: "2 items: Everyday Heavy Tee, Canvas Tote",
        emojis: "👕 👜",
        total: "$58.32",
      },
    ],
  };
}

// ---- state ----

export interface ClothingState {
  filters: Filters;
  bar: BarView;
  cards: CardItem[];
  cart: CartState;
  cartOpen: boolean;
  /** `shop` or `account`. */
  screen: string;
  detailId: string;
  selection: Selection;
  detail: DetailState | null;
  confirmation: ConfirmationState | null;
  toast: string;
  orders: number;
  account: Account | null;
  accountLabel: string;
  notice: string;
  auth: AuthState;
  links: { label: string; href: string }[];
}

const start = startFilters(barDef);
const startList = visibleGarments(GARMENTS, start);

export const initial: ClothingState = {
  filters: start,
  bar: barOf(barDef, start, startList.length),
  cards: startList.map(toCard),
  cart: {
    ...cartInitial,
    emptyText: "Nothing here yet. Our heavy tee is a good place to start.",
  },
  cartOpen: false,
  screen: "shop",
  detailId: "",
  selection: { color: "", size: "" },
  detail: null,
  confirmation: null,
  toast: "",
  orders: 0,
  account: null,
  accountLabel: "Sign in",
  notice: "",
  auth: authInitial,
  links: [
    { label: "Tees", href: "#shop" },
    { label: "Hoodies", href: "#shop" },
    { label: "Merch", href: "#shop" },
    { label: "Journal", href: "#about" },
  ],
};

const FIRST: Selection = { color: "", size: "" };

export class ClothingStore extends FilterHost<ClothingState> {
  view = view;
  readonly barDef = barDef;
  children: Children<ClothingState> = {
    cart: { component: cartBlock, key: "cart" },
    auth: { component: authBlock, key: "auth" },
  };

  _apply(filters: Filters): Effect[] {
    const list = visibleGarments(GARMENTS, filters);
    return [
      store.set("filters", filters),
      store.set("bar", barOf(barDef, filters, list.length)),
      store.set("cards", list.map(toCard)),
    ];
  }

  /** The product dialog for a selection: the cover takes the chosen color. */
  _detail(id: string, sel: Selection): Effect[] {
    const x = GARMENTS.find((q) => q.id === id);
    if (!x) return [];
    const picker = pickerOf(x.def, sel);
    const color = x.def.colors.find((c) => c.id === sel.color);
    const card = toCard(x);
    return [
      store.set("detailId", id),
      store.set("selection", sel),
      store.set(
        "detail",
        detailOf(
          {
            ...card,
            hue: color?.h ?? card.hue,
            chips: [],
            disabled: !picker.canBuy,
            addLabel: picker.canBuy ? "Add to cart" : "Sold out",
          },
          { facts: x.facts, points: x.points, picker },
        ),
      ),
    ];
  }

  _open(id: string): Effect[] {
    const x = GARMENTS.find((q) => q.id === id);
    if (!x) return [];
    const color =
      x.def.colors.find((c) => colorStock(x.def, c.id) > 0) ?? x.def.colors[0];
    return this._detail(id, settle(x.def, { ...FIRST, color: color.id }));
  }

  "grid.card.open"(msg: Message): Effect[] {
    return this._open(String(msg.payload));
  }

  "grid.card.preview"(msg: Message): Effect[] {
    return this._open(String(msg.payload));
  }

  /** A card's button needs a size and a color: it opens the product. */
  "grid.card.add"(msg: Message): Effect[] {
    return this._open(String(msg.payload));
  }

  "grid.clear"(msg: Message, s: ClothingState): Effect[] {
    return this["bar.clear"](msg, s);
  }

  "detail.picker.color"(msg: Message, s: ClothingState): Effect[] {
    const x = GARMENTS.find((q) => q.id === s.detailId);
    if (!x) return [];
    return this._detail(
      x.id,
      chooseColor(x.def, s.selection, String(msg.payload)),
    );
  }

  "detail.picker.size"(msg: Message, s: ClothingState): Effect[] {
    const x = GARMENTS.find((q) => q.id === s.detailId);
    if (!x) return [];
    return this._detail(
      x.id,
      chooseSize(x.def, s.selection, String(msg.payload)),
    );
  }

  "detail.add"(_msg: Message, s: ClothingState, ctx: ComponentCtx): Effect[] {
    const x = GARMENTS.find((q) => q.id === s.detailId);
    const left = x ? stockOf(x.def, s.selection.color, s.selection.size) : 0;
    if (!x || left === 0) return [];
    const color = x.def.colors.find((c) => c.id === s.selection.color);
    const variant =
      x.def.sizes === ONE_SIZE
        ? (color?.label ?? "")
        : `${color?.label} / ${s.selection.size}`;
    return [
      ...ctx.send("cart", "add", {
        id: x.id,
        name: x.title,
        variant,
        price: x.price,
        emoji: x.emoji,
        hue: color?.h ?? x.hue,
        max: left,
      }),
      store.set("detail", null),
      store.set("toast", `${x.title} (${variant}) is in your bag`),
      time.setTimeout("toast", 2600, "hideToast"),
    ];
  }

  hideToast(): Effect[] {
    return [store.set("toast", "")];
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

  showShop(): Effect[] {
    return [store.set("screen", "shop"), store.set("notice", "")];
  }

  showAccount(): Effect[] {
    return [store.set("screen", "account"), store.set("cartOpen", false)];
  }

  // ---- the account ----

  _signIn(s: ClothingState, name: string, email: string): Effect[] {
    const back = s.notice !== "";
    return [
      store.set("account", makeAccount(name, email)),
      store.set("accountLabel", name.split(" ")[0]),
      store.set("auth", authInitial),
      store.set("notice", ""),
      store.set("screen", back ? "shop" : "account"),
      store.set("cartOpen", back),
      store.set("toast", `Signed in as ${email}`),
      time.setTimeout("toast", 2600, "hideToast"),
    ];
  }

  "auth.submitSignin"(_msg: Message, s: ClothingState): Effect[] {
    const f = s.auth.signin;
    if (Object.keys(validateSignin(f)).length > 0) return [];
    return this._signIn(s, nameFromEmail(f.email), f.email);
  }

  "auth.submitRegister"(_msg: Message, s: ClothingState): Effect[] {
    const f = s.auth.register;
    if (Object.keys(validateRegister(f)).length > 0) return [];
    return this._signIn(s, f.name.trim(), f.email);
  }

  signOut(): Effect[] {
    return [
      store.set("account", null),
      store.set("accountLabel", "Sign in"),
      store.set("screen", "shop"),
      store.set("toast", "You are signed out"),
      time.setTimeout("toast", 2600, "hideToast"),
    ];
  }

  /** Checkout needs an account: without one the cart waits while you sign in. */
  "cart.checkout"(
    _msg: Message,
    s: ClothingState,
    ctx: ComponentCtx,
  ): Effect[] {
    if (s.cart.empty) return [];
    if (!s.account) {
      return [
        store.set("screen", "account"),
        store.set("cartOpen", false),
        store.set(
          "notice",
          "Sign in or create an account to place your order. Your bag is saved.",
        ),
      ];
    }
    const number = s.orders + 1;
    const no = orderNumber(number, "NL");
    const row = orderRow(s.cart.lines, s.cart.totals, no, "Today");
    return [
      store.set(
        "confirmation",
        confirmationOf(s.cart.lines, s.cart.promo, s.cart, {
          title: `Thank you, ${s.account.name.split(" ")[0]}!`,
          text: "Your order is being packed. You can follow it in your account.",
          orderNo: no,
          ctaLabel: "See my orders",
        }),
      ),
      store.set("account", {
        ...s.account,
        orders: [row, ...s.account.orders],
      }),
      store.set("orders", number),
      store.set("cartOpen", false),
      ...ctx.send("cart", "clear"),
    ];
  }

  "confirm.done"(): Effect[] {
    return [store.set("confirmation", null), store.set("screen", "account")];
  }

  closeConfirmation(): Effect[] {
    return [store.set("confirmation", null)];
  }
}

export const page = new ClothingStore();
