import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { type CardItem, cardOf } from "../product-card/product-card.ts";
import type { PickerView } from "../swatch-picker/swatch-picker.ts";
import view from "./product-detail.pavlus";

export interface Fact {
  label: string;
  value: string;
}

/** What `view.pavlus` prints: a card, plus facts, points and a picker. */
export interface DetailState extends CardItem {
  facts: Fact[];
  points: string[];
  hasPicker: boolean;
  /** Only read when `hasPicker`; present always so the view has a state. */
  picker: PickerView;
}

export const noPicker: PickerView = {
  colorTitle: "",
  colors: [],
  sizeTitle: "",
  sizes: [],
  note: "",
  low: false,
  canBuy: true,
  left: 0,
};

export interface DetailExtra {
  facts?: Fact[];
  points?: string[];
  picker?: PickerView;
}

export function detailOf(card: CardItem, extra: DetailExtra = {}): DetailState {
  return {
    ...card,
    facts: extra.facts ?? [],
    points: extra.points ?? [],
    hasPicker: Boolean(extra.picker),
    picker: extra.picker ?? noPicker,
  };
}

// ---- the page of the block ----

export interface PageState {
  detail: DetailState;
  last: string;
}

const card = cardOf(
  {
    id: "oak-lamp",
    title: "Oak desk lamp",
    blurb:
      "A desk lamp with a hand-turned oak base and a linen shade. The light is warm and dims from a touch on the base, so it is soft enough to read by and sharp enough to work by.",
    emoji: "💡",
    hue: 38,
    price: 8900,
    was: 11900,
    badge: "-25%",
    badgeTone: "destructive",
    rating: 4.7,
    reviews: 312,
    kicker: "Lighting",
    chips: ["Oak", "Linen"],
    stock: 3,
  },
  { addLabel: "Add to cart" },
);

export const initial: PageState = {
  detail: detailOf(card, {
    facts: [
      { label: "Height", value: "42 cm" },
      { label: "Light", value: "2700 K, dimmable" },
      { label: "Cable", value: "2 m, fabric" },
      { label: "Warranty", value: "5 years" },
    ],
    points: [
      "Hand-turned from sustainably sourced oak",
      "Touch dimmer with three steps",
      "Ships in recycled packaging",
    ],
  }),
  last: "The page hears what the detail sends: press the button.",
};

export class ProductDetailPage extends Component<PageState> {
  view = view;

  "detail.add"(msg: Message): Effect[] {
    return [store.set("last", `Added "${String(msg.payload)}" to the cart.`)];
  }
}

export const page = new ProductDetailPage();
