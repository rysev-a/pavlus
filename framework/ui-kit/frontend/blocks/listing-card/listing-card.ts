import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { toggleFavorite } from "../favorite-toggle/favorite-toggle.ts";
import view from "./listing-card.pavlus";

export interface Listing {
  id: string;
  title: string;
  /** Whole currency units; 0 is free. */
  price: number;
  category: string;
  location: string;
  /** `New`, `Top` or empty. */
  badge: string;
  emoji: string;
  /** 1..5: which `--chart-N` colors the picture. */
  tone: number;
  seller: string;
  ago: string;
  description: string;
}

export interface CardProps extends Listing {
  priceLabel: string;
  favorite: boolean;
}

/** Pure: `1250` → `$1,250`, `0` → `Free`. */
export function formatPrice(price: number): string {
  if (price === 0) return "Free";
  return `$${String(Math.round(price)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** Pure: the cards of a list, with the price text and the heart state. */
export function cardsOf(list: Listing[], favorites: string[]): CardProps[] {
  return list.map((l) => ({
    ...l,
    priceLabel: formatPrice(l.price),
    favorite: favorites.includes(l.id),
  }));
}

const SAMPLE: Listing[] = [
  {
    id: "d1",
    title: "Vintage film camera, Olympus OM-1",
    price: 180,
    category: "Electronics",
    location: "Brooklyn, NY",
    badge: "Top",
    emoji: "📷",
    tone: 1,
    seller: "Nora K.",
    ago: "2 h ago",
    description: "Works perfectly, fresh light seals.",
  },
  {
    id: "d2",
    title: "Solid oak dining table, seats six",
    price: 450,
    category: "Home",
    location: "Austin, TX",
    badge: "New",
    emoji: "🪑",
    tone: 2,
    seller: "Mike R.",
    ago: "Yesterday",
    description: "Some scratches, very sturdy.",
  },
  {
    id: "d3",
    title: "Moving boxes, free to a good home",
    price: 0,
    category: "Home",
    location: "Denver, CO",
    badge: "",
    emoji: "📦",
    tone: 4,
    seller: "Ana P.",
    ago: "3 days ago",
    description: "About 30 boxes, various sizes.",
  },
];

export interface ListingCardState {
  listings: Listing[];
  favorites: string[];
  cards: CardProps[];
  opened: string;
}

export const initial: ListingCardState = {
  listings: SAMPLE,
  favorites: ["d2"],
  cards: cardsOf(SAMPLE, ["d2"]),
  opened: "Nothing opened yet.",
};

export class ListingCardPage extends Component<ListingCardState> {
  view = view;

  "card.fav.toggle"(msg: Message, state: ListingCardState): Effect[] {
    const favorites = toggleFavorite(state.favorites, msg.payload as string);
    return [
      store.set("favorites", favorites),
      store.set("cards", cardsOf(state.listings, favorites)),
    ];
  }

  "card.open"(msg: Message, state: ListingCardState): Effect[] {
    const found = state.listings.find((l) => l.id === msg.payload);
    return [store.set("opened", found ? `Opened: ${found.title}` : "")];
  }
}

export const page = new ListingCardPage();
