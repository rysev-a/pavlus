import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { money } from "../shop-cart/shop-cart.ts";
import pageView from "./product-card.pavlus";

/** What a shop knows about a product; `cardOf` turns it into what the card prints. */
export interface Product {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  /** 0-360: the cover is a gradient of this hue. */
  hue: number;
  /** In cents. */
  price: number;
  /** The old price, struck through. */
  was?: number;
  badge?: string;
  /** A `.ui-badge-*` variant: default, secondary, destructive, outline, success, warning, info. */
  badgeTone?: string;
  rating?: number;
  reviews?: number;
  /** Small facts under the text: "PDF", "24 MB", "Commercial". */
  chips?: string[];
  /** The small line over the title: the category. */
  kicker?: string;
  /** Units left; omit for unlimited, 0 is sold out. */
  stock?: number;
}

export interface CardOptions {
  addLabel?: string;
  /** Shows a "preview" button over the cover. */
  previewLabel?: string;
  /** The label when the item is already in the cart (optional). */
  lowStockAt?: number;
  /** The title opens the product (default); false makes it plain text. */
  openable?: boolean;
}

/** What `view.pavlus` prints. */
export interface CardItem {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  hue: number;
  kicker: string;
  priceLabel: string;
  wasLabel: string;
  badge: string;
  badgeTone: string;
  hasRating: boolean;
  stars: string;
  ratingLabel: string;
  chips: string[];
  addLabel: string;
  previewLabel: string;
  disabled: boolean;
  note: string;
  openable: boolean;
}

/** `4.6` -> `★★★★★` rounded to the nearest whole star, padded with `☆`. */
export function stars(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

/** `4.6, 1280` -> `4.6 (1,280)`. */
export function ratingLabel(rating: number, reviews = 0): string {
  const count = reviews.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return reviews > 0 ? `${rating.toFixed(1)} (${count})` : rating.toFixed(1);
}

export function cardOf(p: Product, options: CardOptions = {}): CardItem {
  const sold = p.stock === 0;
  const low =
    p.stock !== undefined &&
    p.stock > 0 &&
    p.stock <= (options.lowStockAt ?? 5);
  return {
    id: p.id,
    title: p.title,
    blurb: p.blurb,
    emoji: p.emoji,
    hue: p.hue,
    kicker: p.kicker ?? "",
    priceLabel: money(p.price),
    wasLabel: p.was && p.was > p.price ? money(p.was) : "",
    badge: sold ? "Sold out" : (p.badge ?? ""),
    badgeTone: sold ? "secondary" : (p.badgeTone ?? "default"),
    hasRating: p.rating !== undefined,
    stars: stars(p.rating ?? 0),
    ratingLabel: ratingLabel(p.rating ?? 0, p.reviews),
    chips: p.chips ?? [],
    addLabel: sold ? "Sold out" : (options.addLabel ?? "Add to cart"),
    previewLabel: options.previewLabel ?? "",
    disabled: sold,
    openable: options.openable !== false,
    note: low ? `Only ${p.stock} left` : "",
  };
}

// ---- the page of the block ----

export interface PageState {
  cards: CardItem[];
  last: string;
}

const demo: Product[] = [
  {
    id: "oak-lamp",
    title: "Oak desk lamp",
    blurb: "Hand-turned oak base, warm dimmable light.",
    emoji: "💡",
    hue: 38,
    price: 8900,
    was: 11900,
    badge: "-25%",
    badgeTone: "destructive",
    rating: 4.7,
    reviews: 312,
    kicker: "Lighting",
    stock: 3,
  },
  {
    id: "mug",
    title: "Stoneware mug",
    blurb:
      "A 350 ml mug with a reactive glaze. Each one is a little different.",
    emoji: "☕",
    hue: 15,
    price: 1900,
    badge: "New",
    rating: 4.4,
    reviews: 58,
    kicker: "Kitchen",
  },
  {
    id: "notebook",
    title: "Linen notebook",
    blurb: "160 pages of dotted paper that takes fountain pen ink.",
    emoji: "📓",
    hue: 160,
    price: 1400,
    kicker: "Paper",
    stock: 0,
  },
];

export const initial: PageState = {
  cards: demo.map((p) => cardOf(p, { previewLabel: "Quick view" })),
  last: "Nothing added yet.",
};

export class ProductCardPage extends Component<PageState> {
  view = pageView;
  "card.add"(msg: Message): Effect[] {
    return [store.set("last", `Added ${String(msg.payload)} to the cart.`)];
  }
}

export const page = new ProductCardPage();
