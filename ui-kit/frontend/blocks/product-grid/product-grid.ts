import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import {
  cardOf,
  type CardItem,
  type Product,
} from "../product-card/product-card.ts";
import view from "./product-grid.pavlus";

export interface GridState {
  cards: CardItem[];
  none: CardItem[];
  last: string;
}

const PRODUCTS: Product[] = [
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
    blurb: "350 ml with a reactive glaze. Each one is a little different.",
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
    rating: 4.9,
    reviews: 1204,
    kicker: "Paper",
  },
  {
    id: "plant",
    title: "Monstera in clay",
    blurb: "A healthy young plant in a hand-thrown terracotta pot.",
    emoji: "🪴",
    hue: 120,
    price: 3600,
    rating: 4.6,
    reviews: 96,
    kicker: "Plants",
    stock: 0,
  },
  {
    id: "headphones",
    title: "Studio headphones",
    blurb: "Closed-back, 40 hours of battery, folds flat.",
    emoji: "🎧",
    hue: 255,
    price: 14900,
    rating: 4.5,
    reviews: 640,
    kicker: "Audio",
  },
  {
    id: "camera",
    title: "Instant camera",
    blurb: "Point, shoot, shake. Prints in a minute.",
    emoji: "📷",
    hue: 335,
    price: 9900,
    was: 12900,
    badge: "Sale",
    badgeTone: "warning",
    rating: 4.2,
    reviews: 410,
    kicker: "Photo",
    stock: 4,
  },
];

export const initial: GridState = {
  cards: PRODUCTS.map((p) => cardOf(p)),
  none: [],
  last: "Click a card's button: the grid sends the product id to the page.",
};

export class ProductGridPage extends Component<GridState> {
  view = view;

  /** A card inside the grid inside the page: `grid.card.add`. */
  "grid.card.add"(msg: Message): Effect[] {
    return [store.set("last", `Added "${String(msg.payload)}" to the cart.`)];
  }

  "grid.card.open"(msg: Message): Effect[] {
    return [store.set("last", `Opened "${String(msg.payload)}".`)];
  }
}

export const page = new ProductGridPage();
