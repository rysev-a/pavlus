import {
  type Children,
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import {
  type AuthState,
  initial as authInitial,
  page as authPage,
  validateRegister,
  validateSignin,
} from "../../blocks/auth/auth.ts";
import { toggleFavorite } from "../../blocks/favorite-toggle/favorite-toggle.ts";
import {
  type CardProps,
  cardsOf,
  formatPrice,
} from "../../blocks/listing-card/listing-card.ts";
import view from "./classifieds-board.pavlus";
import {
  agoLabel,
  CATEGORIES,
  ITEMS,
  type Item,
  MESSAGES,
  type Message as Msg,
} from "./classifieds-data.ts";

export type Sort = "newest" | "price-asc" | "price-desc";

export interface Filters {
  query: string;
  category: string;
  /** What was typed in the price boxes. */
  min: string;
  max: string;
  sort: Sort;
}

/** Pure: `"1,200"` → 1200; empty or not a number → `null`. */
export function parsePrice(text: string): number | null {
  const clean = text.replace(/[,\s$]/g, "");
  if (clean === "") return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Pure: the listings that match the search, the category and the price range. */
export function filterItems(list: Item[], f: Filters): Item[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  const min = parsePrice(f.min);
  const max = parsePrice(f.max);
  return list.filter((it) => {
    const haystack =
      `${it.title} ${it.description} ${it.location}`.toLowerCase();
    return (
      words.every((w) => haystack.includes(w)) &&
      (f.category === "All" || it.category === f.category) &&
      (min === null || it.price >= min) &&
      (max === null || it.price <= max)
    );
  });
}

/** Pure: a sorted copy (newest first, or by price). */
export function sortItems(list: Item[], sort: Sort): Item[] {
  const by =
    sort === "price-asc"
      ? (a: Item, b: Item) => a.price - b.price
      : sort === "price-desc"
        ? (a: Item, b: Item) => b.price - a.price
        : (a: Item, b: Item) => a.hours - b.hours;
  return [...list].sort(by);
}

export interface ListingForm {
  id: string;
  title: string;
  category: string;
  price: string;
  location: string;
  description: string;
}

export type Errors = Record<string, string>;

/** Pure: what is wrong with the sell form, by field. */
export function validateListing(f: ListingForm): Errors {
  const errors: Errors = {};
  if (f.title.trim().length < 5)
    errors.title = "Give it a title of at least 5 characters.";
  if (f.title.length > 70) errors.title = "Keep the title under 70 characters.";
  if (!CATEGORIES.includes(f.category)) errors.category = "Choose a category.";
  const price = parsePrice(f.price);
  if (price === null) errors.price = "Enter a price (0 for free).";
  else if (price > 1_000_000) errors.price = "That price looks too high.";
  if (f.location.trim().length < 2)
    errors.location = "Where can the buyer find it?";
  if (f.description.trim().length < 20)
    errors.description = "Describe it in at least 20 characters.";
  return errors;
}

/** Pure: the emoji and the picture tone of a new listing, by its category. */
export function lookOfCategory(category: string): {
  emoji: string;
  tone: number;
} {
  const i = CATEGORIES.indexOf(category);
  return {
    emoji: ["🔌", "🏠", "👗", "🚗", "⚽", "📚"][i] ?? "🏷️",
    tone: (i % 5) + 1,
  };
}

const EMPTY_FORM: ListingForm = {
  id: "",
  title: "",
  category: "",
  price: "",
  location: "Brooklyn, NY",
  description: "",
};

export type View = "browse" | "detail" | "sell" | "profile" | "signin";
export type ProfileTab = "listings" | "favorites" | "messages";

export interface Core {
  view: View;
  profileTab: ProfileTab;
  items: Item[];
  filters: Filters;
  favorites: string[];
  detailId: string;
  contactOpen: boolean;
  contactText: string;
  contactSent: boolean;
  form: ListingForm;
  errors: Errors;
  saved: string;
  user: { name: string; email: string } | null;
  messages: Msg[];
  nextId: number;
}

export interface DetailView {
  item: Item & { priceLabel: string };
  favorite: boolean;
  initials: string;
  mine: boolean;
}

export interface Derived {
  cards: CardProps[];
  resultLabel: string;
  chips: { name: string; active: boolean; count: number }[];
  favCount: number;
  favCards: CardProps[];
  mine: (Item & { priceLabel: string })[];
  detail: DetailView | null;
  unread: number;
  isEdit: boolean;
  initials: string;
  filtered: boolean;
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .map((w) => w.slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function derive(s: Core): Derived {
  const matched = filterItems(s.items, s.filters);
  const cards = cardsOf(sortItems(matched, s.filters.sort), s.favorites);
  const base = filterItems(s.items, { ...s.filters, category: "All" });
  const chips = ["All", ...CATEGORIES].map((name) => ({
    name,
    active: s.filters.category === name,
    count:
      name === "All"
        ? base.length
        : base.filter((it) => it.category === name).length,
  }));
  const found = s.items.find((it) => it.id === s.detailId);
  const f = s.filters;
  return {
    cards,
    resultLabel:
      matched.length === 1 ? "1 listing" : `${matched.length} listings`,
    chips,
    favCount: s.favorites.length,
    favCards: cardsOf(
      s.items.filter((it) => s.favorites.includes(it.id)),
      s.favorites,
    ),
    mine: s.items
      .filter((it) => it.mine)
      .map((it) => ({ ...it, priceLabel: formatPrice(it.price) })),
    detail: found
      ? {
          item: { ...found, priceLabel: formatPrice(found.price) },
          favorite: s.favorites.includes(found.id),
          initials: initialsOf(found.seller),
          mine: found.mine,
        }
      : null,
    unread: s.messages.filter((m) => m.unread).length,
    isEdit: s.form.id !== "",
    initials: s.user ? initialsOf(s.user.name) : "?",
    filtered:
      f.query !== "" || f.category !== "All" || f.min !== "" || f.max !== "",
  };
}

const core: Core = {
  view: "browse",
  profileTab: "listings",
  items: ITEMS,
  filters: { query: "", category: "All", min: "", max: "", sort: "newest" },
  favorites: ["l1", "l9"],
  detailId: "",
  contactOpen: false,
  contactText: "",
  contactSent: false,
  form: EMPTY_FORM,
  errors: {},
  saved: "",
  user: { name: "Ann Lee", email: "ann@example.com" },
  messages: MESSAGES,
  nextId: 1,
};

export interface BoardState extends Core, Derived {
  auth: AuthState;
  categories: string[];
}

export const initial: BoardState = {
  ...core,
  ...derive(core),
  auth: authInitial,
  categories: CATEGORIES,
};

const CORE_KEYS = Object.keys(core) as (keyof Core)[];
const coreOf = (state: BoardState): Core => {
  const c: Record<string, unknown> = {};
  for (const k of CORE_KEYS) c[k] = state[k];
  return c as unknown as Core;
};

export class ClassifiedsBoard extends Component<BoardState> {
  view = view;

  children: Children<BoardState> = {
    auth: { component: authPage, key: "auth" },
  };

  goto(msg: Message, state: BoardState): Effect[] {
    const target = msg.payload as View;
    // selling and the profile belong to a signed-in user
    const view =
      (target === "sell" || target === "profile") && !state.user
        ? "signin"
        : target;
    return this._show(state, {
      view,
      saved: "",
      errors: {},
      form: view === "sell" ? EMPTY_FORM : state.form,
      contactOpen: false,
      contactSent: false,
    });
  }

  openProfile(msg: Message, state: BoardState): Effect[] {
    if (!state.user) return this._show(state, { view: "signin" });
    return this._show(state, {
      view: "profile",
      profileTab: msg.payload as ProfileTab,
      saved: "",
      form: EMPTY_FORM,
    });
  }

  // ---- search and filters ----
  setQuery(msg: Message, state: BoardState): Effect[] {
    return this._show(state, {
      filters: { ...state.filters, query: msg.event?.value ?? "" },
    });
  }

  setMin(msg: Message, state: BoardState): Effect[] {
    return this._show(state, {
      filters: { ...state.filters, min: msg.event?.value ?? "" },
    });
  }

  setMax(msg: Message, state: BoardState): Effect[] {
    return this._show(state, {
      filters: { ...state.filters, max: msg.event?.value ?? "" },
    });
  }

  setSort(msg: Message, state: BoardState): Effect[] {
    return this._show(state, {
      filters: {
        ...state.filters,
        sort: (msg.event?.value ?? "newest") as Sort,
      },
    });
  }

  setCategory(msg: Message, state: BoardState): Effect[] {
    return this._show(state, {
      filters: { ...state.filters, category: msg.payload as string },
    });
  }

  clearFilters(_msg: Message, state: BoardState): Effect[] {
    return this._show(state, {
      filters: {
        query: "",
        category: "All",
        min: "",
        max: "",
        sort: state.filters.sort,
      },
    });
  }

  // ---- cards and favorites ----
  open(msg: Message, state: BoardState): Effect[] {
    return this._show(state, {
      view: "detail",
      detailId: msg.payload as string,
      contactOpen: false,
      contactSent: false,
      contactText: "",
    });
  }

  favorite(msg: Message, state: BoardState): Effect[] {
    return this._show(state, {
      favorites: toggleFavorite(state.favorites, msg.payload as string),
    });
  }

  "card.open"(msg: Message, state: BoardState): Effect[] {
    return this.open(msg, state);
  }
  "card.fav.toggle"(msg: Message, state: BoardState): Effect[] {
    return this.favorite(msg, state);
  }
  "fcard.open"(msg: Message, state: BoardState): Effect[] {
    return this.open(msg, state);
  }
  "fcard.fav.toggle"(msg: Message, state: BoardState): Effect[] {
    return this.favorite(msg, state);
  }
  "dfav.toggle"(msg: Message, state: BoardState): Effect[] {
    return this.favorite(msg, state);
  }

  // ---- contacting a seller (a stub: nothing is sent anywhere) ----
  showContact(_msg: Message, state: BoardState): Effect[] {
    return this._show(state, { contactOpen: true, contactSent: false });
  }

  setContact(msg: Message, state: BoardState): Effect[] {
    return this._show(state, { contactText: msg.event?.value ?? "" });
  }

  sendContact(_msg: Message, state: BoardState): Effect[] {
    if (state.contactText.trim().length < 3) return [];
    return this._show(state, { contactSent: true, contactText: "" });
  }

  // ---- the sell form ----
  setField(msg: Message, state: BoardState): Effect[] {
    const name = msg.payload as keyof ListingForm;
    return this._show(state, {
      form: { ...state.form, [name]: msg.event?.value ?? "" },
    });
  }

  saveListing(_msg: Message, state: BoardState): Effect[] {
    const errors = validateListing(state.form);
    if (Object.keys(errors).length > 0) return this._show(state, { errors });
    const f = state.form;
    const price = parsePrice(f.price) ?? 0;
    const look = lookOfCategory(f.category);
    if (f.id) {
      const items = state.items.map((it) =>
        it.id === f.id
          ? {
              ...it,
              title: f.title.trim(),
              category: f.category,
              price,
              location: f.location.trim(),
              description: f.description.trim(),
              ...look,
            }
          : it,
      );
      return this._show(state, {
        items,
        errors: {},
        form: EMPTY_FORM,
        saved: "Your changes are saved.",
        view: "profile",
        profileTab: "listings",
      });
    }
    const created: Item = {
      id: `m${state.nextId + 10}`,
      title: f.title.trim(),
      price,
      category: f.category,
      location: f.location.trim(),
      badge: "New",
      seller: state.user?.name ?? "You",
      hours: 0,
      ago: agoLabel(0),
      description: f.description.trim(),
      mine: true,
      ...look,
    };
    return this._show(state, {
      items: [created, ...state.items],
      nextId: state.nextId + 1,
      errors: {},
      form: EMPTY_FORM,
      saved: `"${created.title}" is live.`,
      view: "profile",
      profileTab: "listings",
    });
  }

  editListing(msg: Message, state: BoardState): Effect[] {
    const it = state.items.find((x) => x.id === msg.payload);
    if (!it) return [];
    return this._show(state, {
      view: "sell",
      errors: {},
      saved: "",
      form: {
        id: it.id,
        title: it.title,
        category: it.category,
        price: String(it.price),
        location: it.location,
        description: it.description,
      },
    });
  }

  deleteListing(msg: Message, state: BoardState): Effect[] {
    const id = msg.payload as string;
    return this._show(state, {
      items: state.items.filter((it) => it.id !== id),
      favorites: state.favorites.filter((f) => f !== id),
      saved: "The listing was removed.",
    });
  }

  // ---- messages (a stub) ----
  readMessage(msg: Message, state: BoardState): Effect[] {
    return this._show(state, {
      messages: state.messages.map((m) =>
        m.id === msg.payload ? { ...m, unread: !m.unread } : m,
      ),
    });
  }

  // ---- the account: the auth block is a child ----
  "auth.submitSignin"(_msg: Message, state: BoardState): Effect[] {
    const { email, password } = state.auth.signin;
    if (Object.keys(validateSignin({ email, password })).length > 0) return [];
    return this._show(state, {
      user: { name: nameFromEmail(email), email },
      view: "profile",
    });
  }

  "auth.submitRegister"(_msg: Message, state: BoardState): Effect[] {
    const r = state.auth.register;
    if (Object.keys(validateRegister(r)).length > 0) return [];
    return this._show(state, {
      user: { name: r.name.trim(), email: r.email },
      view: "profile",
    });
  }

  signOut(_msg: Message, state: BoardState): Effect[] {
    return this._show(state, { user: null, view: "browse" });
  }

  _show(state: BoardState, patch: Partial<Core>): Effect[] {
    const next: Core = { ...coreOf(state), ...patch };
    const derived = derive(next);
    return [
      ...(Object.keys(patch) as (keyof Core)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      ...(Object.keys(derived) as (keyof Derived)[]).map((k) =>
        store.set(k, derived[k]),
      ),
    ];
  }
}

/** Pure: `ann.lee@example.com` → `Ann Lee`. */
export function nameFromEmail(email: string): string {
  return (email.split("@")[0] ?? "")
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
}

export const page = new ClassifiedsBoard();
