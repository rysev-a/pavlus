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
  recompute,
} from "../../blocks/shop-cart/shop-cart.ts";
import view from "./digital-products-shop.pavlus";

export type Kind = "3d" | "plugin" | "ui" | "font";

export const KINDS: Record<Kind, string> = {
  "3d": "3D model",
  plugin: "Code plugin",
  ui: "UI kit",
  font: "Font",
};

export interface Asset extends Product {
  kind: Kind;
  formats: string[];
  size: string;
  /** Commercial license price in cents; none means personal use only. */
  commercial?: number;
  updated: string;
  points: string[];
}

const a = (
  id: string,
  title: string,
  kind: Kind,
  emoji: string,
  hue: number,
  blurb: string,
  formats: string[],
  size: string,
  price: number,
  commercial: number | undefined,
  rating: number,
  reviews: number,
  updated: string,
  points: string[],
): Asset => ({
  id,
  title,
  kind,
  emoji,
  hue,
  blurb,
  formats,
  size,
  price,
  commercial,
  rating,
  reviews,
  updated,
  points,
  kicker: KINDS[kind],
  chips: [...formats.slice(0, 2), size],
});

export const ASSETS: Asset[] = [
  a(
    "forest-pack",
    "Low-poly Forest Pack",
    "3d",
    "🌲",
    140,
    "42 trees, rocks and bushes in a soft low-poly style, with one shared texture.",
    ["FBX", "OBJ", "BLEND"],
    "84 MB",
    1900,
    5900,
    4.8,
    412,
    "Oct 2026",
    [
      "42 models, 1 draw call",
      "Game-ready, under 600 triangles each",
      "Source .blend included",
    ],
  ),
  a(
    "scifi-crates",
    "Sci-fi Crate Kit",
    "3d",
    "📦",
    30,
    "Modular crates, barrels and containers with PBR textures and emissive lights.",
    ["GLTF", "FBX"],
    "212 MB",
    2900,
    8900,
    4.6,
    188,
    "Sep 2026",
    [
      "PBR textures at 2K",
      "Modular snapping pieces",
      "Works in Unity, Unreal and Godot",
    ],
  ),
  a(
    "space-rig",
    "Stylized Astronaut Rig",
    "3d",
    "🧑‍🚀",
    280,
    "A fully rigged character with 24 animations and swappable helmets.",
    ["BLEND", "FBX"],
    "310 MB",
    4900,
    14900,
    4.9,
    530,
    "Oct 2026",
    [
      "Humanoid rig, face shapes",
      "24 looped animations",
      "Four helmet variants",
    ],
  ),
  a(
    "dungeon-tiles",
    "Modular Dungeon Tiles",
    "3d",
    "🏰",
    20,
    "Walls, floors, doors and props to build dungeons in minutes.",
    ["FBX", "OBJ"],
    "156 MB",
    3900,
    11900,
    4.5,
    241,
    "Aug 2026",
    [
      "120 snap-together pieces",
      "Lit and unlit materials",
      "Free updates for a year",
    ],
  ),
  a(
    "form-kit",
    "Pavlus Form Kit",
    "plugin",
    "🔌",
    210,
    "Schema-driven forms with validation, wizards and file fields for pavlus apps.",
    ["TS", "ESM"],
    "420 KB",
    2400,
    7900,
    4.7,
    356,
    "Oct 2026",
    ["Zero dependencies", "Accessible by default", "Full TypeScript types"],
  ),
  a(
    "chart-sparkle",
    "Chart Sparkle",
    "plugin",
    "📈",
    160,
    "Tiny charts for dashboards: sparklines, bars and gauges in under 8 KB.",
    ["TS", "ESM"],
    "96 KB",
    1500,
    4900,
    4.4,
    129,
    "Jul 2026",
    ["8 KB gzipped", "Follows your theme tokens", "Live demo and docs"],
  ),
  a(
    "dark-toolkit",
    "Dark Mode Toolkit",
    "plugin",
    "🌗",
    250,
    "Light, dark and system themes with no flash on load and a tiny API.",
    ["JS", "CSS"],
    "38 KB",
    900,
    2900,
    4.6,
    702,
    "Sep 2026",
    ["No flash of wrong theme", "Remembers the choice", "Works with any CSS"],
  ),
  a(
    "csv-wizard",
    "CSV Import Wizard",
    "plugin",
    "🗂️",
    60,
    "A drop-in importer: map columns, fix errors and preview before saving.",
    ["TS", "ESM"],
    "610 KB",
    3400,
    9900,
    4.8,
    274,
    "Oct 2026",
    [
      "Handles 1M rows in a worker",
      "Custom validators",
      "Localised in 12 languages",
    ],
  ),
  a(
    "harbor-ui",
    "Harbor Dashboard UI Kit",
    "ui",
    "🧩",
    200,
    "180 components and 60 screens for admin dashboards, with auto layout.",
    ["FIG", "SKETCH"],
    "96 MB",
    6900,
    19900,
    4.9,
    988,
    "Oct 2026",
    [
      "180 components, light and dark",
      "60 ready screens",
      "Design tokens included",
    ],
  ),
  a(
    "bloom-mobile",
    "Bloom Mobile UI Kit",
    "ui",
    "🌸",
    330,
    "Soft, friendly mobile screens for wellness and lifestyle apps.",
    ["FIG"],
    "64 MB",
    4900,
    14900,
    4.7,
    310,
    "Aug 2026",
    [
      "90 screens, 5 flows",
      "iOS and Android variants",
      "Illustrations included",
    ],
  ),
  a(
    "orbit-landing",
    "Orbit Landing Pages",
    "ui",
    "🪐",
    260,
    "Twelve marketing page layouts with copy blocks, pricing and logos.",
    ["FIG", "HTML"],
    "48 MB",
    3900,
    9900,
    4.5,
    203,
    "Sep 2026",
    ["12 page layouts", "HTML + CSS export", "Responsive at 3 sizes"],
  ),
  a(
    "admin-pro",
    "Admin Panel Pro",
    "ui",
    "🗄️",
    220,
    "Tables, filters, forms and charts for back-office tools.",
    ["FIG", "HTML"],
    "120 MB",
    5900,
    17900,
    4.6,
    421,
    "Oct 2026",
    ["40 table patterns", "Form and filter library", "Dark and light themes"],
  ),
  a(
    "fraunces-pro",
    "Fraunces Pro",
    "font",
    "🔤",
    30,
    "A warm old-style serif with soft wonky shapes, in nine weights.",
    ["OTF", "TTF", "WOFF2"],
    "4.2 MB",
    4900,
    14900,
    4.9,
    1204,
    "Oct 2026",
    ["9 weights, italics included", "Variable font file", "Latin and Cyrillic"],
  ),
  a(
    "mono-grotesk",
    "Mono Grotesk",
    "font",
    "🅰️",
    190,
    "A monospace with grotesque proportions and coding ligatures.",
    ["OTF", "WOFF2"],
    "1.8 MB",
    2900,
    8900,
    4.7,
    640,
    "Sep 2026",
    [
      "Programming ligatures",
      "Slashed and dotted zero",
      "Variable weight axis",
    ],
  ),
  a(
    "inkwell-script",
    "Inkwell Script",
    "font",
    "✒️",
    300,
    "A brush script with 400 alternates. Personal use only.",
    ["OTF", "TTF"],
    "2.6 MB",
    1900,
    undefined,
    4.4,
    318,
    "Jun 2026",
    ["400 alternates and swashes", "Stylistic sets", "Personal use only"],
  ),
  a(
    "pixel-sans",
    "Pixel Sans",
    "font",
    "👾",
    120,
    "A crisp pixel face for games, with every glyph on an 8-pixel grid.",
    ["TTF", "WOFF2"],
    "0.9 MB",
    1200,
    3900,
    4.6,
    457,
    "Jul 2026",
    ["8 px grid", "Latin, Cyrillic, Greek", "Bitmap sizes included"],
  ),
];

const maxPrice = 20000;

export const barDef: BarDef = {
  placeholder: "Search models, plugins, kits, fonts...",
  groups: [
    {
      id: "kind",
      label: "Type",
      multi: true,
      allLabel: "All",
      options: [
        { id: "3d", label: "3D models" },
        { id: "plugin", label: "Code plugins" },
        { id: "ui", label: "UI kits" },
        { id: "font", label: "Fonts" },
      ],
    },
    {
      id: "license",
      label: "License",
      multi: false,
      allLabel: "Any",
      options: [
        { id: "personal", label: "Personal" },
        { id: "commercial", label: "Commercial" },
      ],
    },
  ],
  toggles: [],
  ranges: [
    {
      id: "price",
      label: "Starting price",
      min: 1000,
      max: maxPrice,
      step: 500,
      format: (v) => `up to ${money(v).replace(".00", "")}`,
    },
  ],
  sorts: [
    { id: "popular", label: "Most downloaded" },
    { id: "rating", label: "Best rated" },
    { id: "low", label: "Price: low to high" },
    { id: "high", label: "Price: high to low" },
    { id: "name", label: "Name A-Z" },
  ],
  noun: ["file", "files"],
};

/** Which license an asset offers: both, or personal only. */
export const licenseTag = (x: Asset): string =>
  x.commercial ? "Personal + Commercial" : "Personal only";

export function visibleAssets(list: Asset[], f: Filters): Asset[] {
  const max = f.ranges.price ?? Infinity;
  const kept = list.filter(
    (x) =>
      matches(
        f.query,
        `${x.title} ${x.blurb} ${KINDS[x.kind]} ${x.formats.join(" ")}`,
      ) &&
      inPicks(f.picks.kind, [x.kind]) &&
      (f.picks.license?.[0] !== "commercial" || Boolean(x.commercial)) &&
      x.price <= max,
  );
  const title = (x: Asset) => x.title;
  switch (f.sort) {
    case "rating":
      return sortedBy(kept, (x) => x.rating ?? 0, -1, title);
    case "low":
      return sortedBy(kept, (x) => x.price, 1, title);
    case "high":
      return sortedBy(kept, (x) => x.price, -1, title);
    case "name":
      return sortedBy(kept, () => 0, 1, title);
    default:
      return sortedBy(kept, (x) => x.reviews ?? 0, -1, title);
  }
}

/** One click adds the personal license; the cart lets the buyer upgrade. */
export function itemOf(x: Asset): CartItem {
  const choices = [{ id: "personal", label: "Personal", price: x.price }];
  if (x.commercial)
    choices.push({
      id: "commercial",
      label: "Commercial",
      price: x.commercial,
    });
  return {
    id: x.id,
    name: x.title,
    variant: `${KINDS[x.kind]} · ${x.size}`,
    price: x.price,
    emoji: x.emoji,
    hue: x.hue,
    max: 1,
    choices,
    choice: "personal",
  };
}

const CARD = { addLabel: "Add", previewLabel: "Preview" };

const toCard = (x: Asset): CardItem => ({
  ...cardOf(x, CARD),
  badge: licenseTag(x),
  badgeTone: x.commercial ? "success" : "secondary",
  priceLabel: `From ${money(x.price)}`,
});

export interface DigitalState {
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
const startList = visibleAssets(ASSETS, start);

export const initial: DigitalState = {
  filters: start,
  bar: barOf(barDef, start, startList.length),
  cards: startList.map(toCard),
  cart: recompute({
    ...cartInitial,
    shipMode: "none",
    checkoutLabel: "Pay and get the files",
    emptyText:
      "Pick a model, plugin, kit or font. Files are ready the moment you pay.",
  }),
  cartOpen: false,
  detail: null,
  confirmation: null,
  toast: "",
  orders: 0,
  links: [
    { label: "Browse", href: "#files" },
    { label: "Licenses", href: "#licenses" },
    { label: "Help", href: "#help" },
  ],
};

export class DigitalShop extends FilterHost<DigitalState> {
  view = view;
  readonly barDef = barDef;
  children: Children<DigitalState> = {
    cart: { component: cartBlock, key: "cart" },
  };

  _apply(filters: Filters): Effect[] {
    const list = visibleAssets(ASSETS, filters);
    return [
      store.set("filters", filters),
      store.set("bar", barOf(barDef, filters, list.length)),
      store.set("cards", list.map(toCard)),
    ];
  }

  _add(id: string, ctx: ComponentCtx): Effect[] {
    const x = ASSETS.find((q) => q.id === id);
    if (!x) return [];
    return [
      ...ctx.send("cart", "add", itemOf(x)),
      store.set("toast", `${x.title} added with a personal license`),
      time.setTimeout("toast", 2800, "hideToast"),
    ];
  }

  hideToast(): Effect[] {
    return [store.set("toast", "")];
  }

  "grid.card.add"(msg: Message, _s: DigitalState, ctx: ComponentCtx): Effect[] {
    return this._add(String(msg.payload), ctx);
  }

  "detail.add"(msg: Message, _s: DigitalState, ctx: ComponentCtx): Effect[] {
    return [...this._add(String(msg.payload), ctx), store.set("detail", null)];
  }

  /** The title or the Preview button opens the file's page in a dialog. */
  "grid.card.open"(msg: Message): Effect[] {
    const x = ASSETS.find((q) => q.id === msg.payload);
    if (!x) return [];
    return [
      store.set(
        "detail",
        detailOf(toCard(x), {
          facts: [
            { label: "Type", value: KINDS[x.kind] },
            { label: "Formats", value: x.formats.join(", ") },
            { label: "File size", value: x.size },
            { label: "Updated", value: x.updated },
            { label: "Personal", value: money(x.price) },
            {
              label: "Commercial",
              value: x.commercial ? money(x.commercial) : "Not offered",
            },
          ],
          points: x.points,
        }),
      ),
    ];
  }

  "grid.card.preview"(msg: Message): Effect[] {
    return this["grid.card.open"](msg);
  }

  "grid.clear"(msg: Message, s: DigitalState): Effect[] {
    return this["bar.clear"](msg, s);
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

  /** A fake checkout: a confirmation with a download link for each file. */
  "cart.checkout"(
    _msg: Message,
    state: DigitalState,
    ctx: ComponentCtx,
  ): Effect[] {
    if (state.cart.empty) return [];
    const number = state.orders + 1;
    return [
      store.set(
        "confirmation",
        confirmationOf(state.cart.lines, state.cart.promo, state.cart, {
          title: "Payment received: your files are ready",
          text: "The links stay valid for 30 days. A receipt is on its way to your inbox.",
          orderNo: orderNumber(number, "DL"),
          ctaLabel: "Keep browsing",
          downloads: true,
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

export const page = new DigitalShop();
