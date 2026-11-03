import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { money } from "../shop-cart/shop-cart.ts";
import view from "./menu-list.pavlus";

export interface Dish {
  id: string;
  name: string;
  desc: string;
  /** In cents. */
  price: number;
  emoji: string;
  hue: number;
  category: string;
  tags?: string[];
  soldOut?: boolean;
}

export interface Category {
  id: string;
  title: string;
  note: string;
}

export interface MenuItem {
  id: string;
  name: string;
  desc: string;
  priceLabel: string;
  emoji: string;
  hue: number;
  tags: string[];
  soldOut: boolean;
  addLabel: string;
}

export interface MenuSection {
  id: string;
  title: string;
  note: string;
  items: MenuItem[];
}

/**
 * The menu by category. `only` limits it to one category ("" is all); a
 * category with no dishes is left out.
 */
export function sectionsOf(
  dishes: Dish[],
  categories: Category[],
  only = "",
): MenuSection[] {
  return categories
    .filter((c) => !only || c.id === only)
    .map((c) => ({
      id: c.id,
      title: c.title,
      note: c.note,
      items: dishes
        .filter((d) => d.category === c.id)
        .map((d) => ({
          id: d.id,
          name: d.name,
          desc: d.desc,
          priceLabel: money(d.price),
          emoji: d.emoji,
          hue: d.hue,
          tags: d.tags ?? [],
          soldOut: Boolean(d.soldOut),
          addLabel: d.soldOut ? `${d.name} is sold out` : `Add ${d.name}`,
        })),
    }))
    .filter((s) => s.items.length > 0);
}

// ---- the page of the block ----

const CATEGORIES: Category[] = [
  { id: "bread", title: "Bread", note: "Baked at 5 am, gone by noon" },
  { id: "sweet", title: "Sweet", note: "Made with butter, never margarine" },
  { id: "drinks", title: "Drinks", note: "Roasted down the road" },
];

const DISHES: Dish[] = [
  {
    id: "sourdough",
    name: "Country sourdough",
    desc: "Wheat and rye, 48 hours of fermentation, a thick crust.",
    price: 650,
    emoji: "🍞",
    hue: 38,
    category: "bread",
    tags: ["vegan"],
  },
  {
    id: "baguette",
    name: "Baguette tradition",
    desc: "Long, crackling, with an open crumb.",
    price: 280,
    emoji: "🥖",
    hue: 30,
    category: "bread",
    tags: ["vegan"],
  },
  {
    id: "croissant",
    name: "Butter croissant",
    desc: "Eighty-one layers of French butter.",
    price: 380,
    emoji: "🥐",
    hue: 45,
    category: "sweet",
    tags: ["bestseller"],
  },
  {
    id: "cinnamon",
    name: "Cinnamon roll",
    desc: "Soft, sticky, with cream cheese glaze.",
    price: 420,
    emoji: "🌀",
    hue: 20,
    category: "sweet",
    soldOut: true,
  },
  {
    id: "flat-white",
    name: "Flat white",
    desc: "Double ristretto, steamed whole milk.",
    price: 400,
    emoji: "☕",
    hue: 25,
    category: "drinks",
  },
];

export interface PageState {
  sections: MenuSection[];
  last: string;
}

export const initial: PageState = {
  sections: sectionsOf(DISHES, CATEGORIES),
  last: "Press a plus button: the menu sends the id of the dish.",
};

export class MenuListPage extends Component<PageState> {
  view = view;

  "menu.add"(msg: Message): Effect[] {
    return [store.set("last", `Added "${String(msg.payload)}" to the order.`)];
  }
}

export const page = new MenuListPage();
