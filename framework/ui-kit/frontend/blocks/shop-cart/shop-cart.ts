import {
  type Children,
  Component,
  type ComponentCtx,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import pageView from "./shop-cart.pavlus";
import view from "./view.pavlus";

// ---- money: every amount is an integer number of cents ----

/** `1250` -> `$12.50`; `-300` -> `-$3.00`. */
export function money(cents: number, symbol = "$"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${symbol}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

export const PROMO_CODE = "PAVLUS10";
export const PROMO_RATE = 0.1;
export const FREE_SHIPPING_FROM = 10000;
export const STANDARD_SHIPPING = 799;
export const TAX_RATE = 0.08;
const MAX_QTY = 99;

/** One choice of a line, e.g. a license: it replaces the line's price. */
export interface Choice {
  id: string;
  label: string;
  price: number;
  /** "Commercial · $149.00", made by `addLine`. */
  text?: string;
}

/** What the shop sends to `add`. */
export interface CartItem {
  id: string;
  name: string;
  /** Size, color...: shown under the name, part of the line's key. */
  variant?: string;
  price: number;
  emoji: string;
  hue: number;
  /** How many can be bought (stock); default 99. */
  max?: number;
  /** Alternative prices (licenses). The line shows a select when there are several. */
  choices?: Choice[];
  choice?: string;
}

export interface CartLine extends CartItem {
  key: string;
  variant: string;
  qty: number;
  max: number;
  choices: Choice[];
  choice: string;
  /** Labels for the template. */
  priceLabel: string;
  totalLabel: string;
  atMax: boolean;
  hasChoices: boolean;
}

export type ShipMode = "standard" | "none" | "fee";

export interface CartConfig {
  /** `standard`: free from $100; `none`: nothing to ship; `fee`: `fee` cents. */
  shipMode: ShipMode;
  fee: number;
  taxRate: number;
  /** The word for it: Shipping, Delivery. */
  shipLabel: string;
}

export interface Totals {
  count: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  /** `standard` only: how much more makes the shipping free (0 if it is). */
  toFree: number;
}

export interface Summary {
  subtotal: string;
  discount: string;
  shipping: string;
  shipLabel: string;
  tax: string;
  total: string;
  hasDiscount: boolean;
  hasShipping: boolean;
  shipNote: string;
  taxLabel: string;
}

export interface CartState extends CartConfig {
  lines: CartLine[];
  /** The applied code, upper-case, or "". */
  promo: string;
  promoInput: string;
  promoMessage: string;
  promoOk: boolean;
  totals: Totals;
  sum: Summary;
  count: number;
  empty: boolean;
  checkoutLabel: string;
  emptyText: string;
}

export const defaultConfig: CartConfig = {
  shipMode: "standard",
  fee: 0,
  taxRate: TAX_RATE,
  shipLabel: "Shipping",
};

// ---- pure logic ----

export const isPromo = (code: string): boolean =>
  code.trim().toUpperCase() === PROMO_CODE;

/** The sums of a cart. Each step is rounded to cents. */
export function totals(
  lines: Pick<CartLine, "price" | "qty">[],
  promo: string,
  config: CartConfig = defaultConfig,
): Totals {
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  const discount = isPromo(promo) ? Math.round(subtotal * PROMO_RATE) : 0;
  const net = subtotal - discount;
  let shipping = 0;
  let toFree = 0;
  if (count > 0) {
    if (config.shipMode === "fee") shipping = config.fee;
    else if (config.shipMode === "standard") {
      if (net >= FREE_SHIPPING_FROM) shipping = 0;
      else {
        shipping = STANDARD_SHIPPING;
        toFree = FREE_SHIPPING_FROM - net;
      }
    }
  }
  const tax = Math.round(net * config.taxRate);
  return {
    count,
    subtotal,
    discount,
    shipping,
    tax,
    total: net + shipping + tax,
    toFree,
  };
}

/** The labels the template prints. */
export function summaryOf(t: Totals, config: CartConfig): Summary {
  return {
    subtotal: money(t.subtotal),
    discount: money(-t.discount),
    shipping: t.shipping === 0 ? "Free" : money(t.shipping),
    shipLabel: config.shipLabel,
    tax: money(t.tax),
    total: money(t.total),
    hasDiscount: t.discount > 0,
    hasShipping: config.shipMode !== "none",
    shipNote:
      config.shipMode === "standard" && t.toFree > 0 && t.count > 0
        ? `Add ${money(t.toFree)} more for free shipping`
        : "",
    taxLabel: `Tax (${Math.round(config.taxRate * 1000) / 10}%)`,
  };
}

type LineBase = Omit<
  CartLine,
  "priceLabel" | "totalLabel" | "atMax" | "hasChoices"
>;

function label(line: LineBase): CartLine {
  return {
    ...line,
    priceLabel: money(line.price),
    totalLabel: money(line.price * line.qty),
    atMax: line.qty >= line.max,
    hasChoices: line.choices.length > 1,
  };
}

/** Puts an item in the cart: a new line, or one more of the line it matches. */
export function addLine(lines: CartLine[], item: CartItem): CartLine[] {
  const choices = (item.choices ?? []).map((c) => ({
    ...c,
    text: `${c.label} · ${money(c.price)}`,
  }));
  const choice = item.choice ?? choices[0]?.id ?? "";
  const price = choices.find((c) => c.id === choice)?.price ?? item.price;
  const key = `${item.id}|${item.variant ?? ""}`;
  const max = Math.max(1, item.max ?? MAX_QTY);
  if (lines.some((l) => l.key === key)) {
    return lines.map((l) =>
      l.key === key ? label({ ...l, qty: Math.min(l.max, l.qty + 1) }) : l,
    );
  }
  return [
    ...lines,
    label({
      ...item,
      key,
      variant: item.variant ?? "",
      price,
      qty: 1,
      max,
      choices,
      choice,
    }),
  ];
}

export const removeLine = (lines: CartLine[], key: string): CartLine[] =>
  lines.filter((l) => l.key !== key);

/** Sets a quantity; below 1 removes the line, above the stock stops at it. */
export function setQuantity(
  lines: CartLine[],
  key: string,
  qty: number,
): CartLine[] {
  if (!Number.isFinite(qty)) return lines;
  const whole = Math.floor(qty);
  if (whole < 1) return removeLine(lines, key);
  return lines.map((l) =>
    l.key === key ? label({ ...l, qty: Math.min(l.max, whole) }) : l,
  );
}

/** Picks another choice (license) of a line: the price follows. */
export function chooseLine(
  lines: CartLine[],
  key: string,
  choice: string,
): CartLine[] {
  return lines.map((l) => {
    const picked = l.choices.find((c) => c.id === choice);
    return l.key === key && picked
      ? label({ ...l, choice: picked.id, price: picked.price })
      : l;
  });
}

type Core = Omit<CartState, "count" | "empty" | "totals" | "sum">;

/** The derived fields of a state, from its lines, promo and config. */
export function recompute(state: Core): CartState {
  const t = totals(state.lines, state.promo, state);
  return {
    ...state,
    totals: t,
    sum: summaryOf(t, state),
    count: t.count,
    empty: state.lines.length === 0,
  };
}

export const cartInitial: CartState = recompute({
  ...defaultConfig,
  lines: [],
  promo: "",
  promoInput: "",
  promoMessage: "",
  promoOk: false,
  checkoutLabel: "Checkout",
  emptyText: "Add something you like and it will wait for you here.",
});

/** Effects that write the derived part of `next`. */
function commit(next: CartState, ...extra: Effect[]): Effect[] {
  return [
    store.set("lines", next.lines),
    store.set("totals", next.totals),
    store.set("sum", next.sum),
    store.set("count", next.count),
    store.set("empty", next.empty),
    ...extra,
  ];
}

export class ShopCart extends Component<CartState> {
  view = view;

  add(msg: Message, state: CartState): Effect[] {
    const lines = addLine(state.lines, msg.payload as CartItem);
    return commit(recompute({ ...state, lines }));
  }

  inc(msg: Message, state: CartState): Effect[] {
    const key = msg.payload as string;
    const line = state.lines.find((l) => l.key === key);
    const lines = setQuantity(state.lines, key, (line?.qty ?? 0) + 1);
    return commit(recompute({ ...state, lines }));
  }

  dec(msg: Message, state: CartState): Effect[] {
    const key = msg.payload as string;
    const line = state.lines.find((l) => l.key === key);
    const lines = setQuantity(state.lines, key, (line?.qty ?? 1) - 1);
    return commit(recompute({ ...state, lines }));
  }

  /** `setQty(key)` from the number field. */
  setQty(msg: Message, state: CartState): Effect[] {
    const qty = Number.parseInt(String(msg.event?.value ?? ""), 10);
    const lines = setQuantity(state.lines, msg.payload as string, qty);
    return commit(recompute({ ...state, lines }));
  }

  remove(msg: Message, state: CartState): Effect[] {
    const lines = removeLine(state.lines, msg.payload as string);
    return commit(recompute({ ...state, lines }));
  }

  /** `choose(key)`: the select's value is the choice id. */
  choose(msg: Message, state: CartState): Effect[] {
    const lines = chooseLine(
      state.lines,
      msg.payload as string,
      String(msg.event?.value ?? ""),
    );
    return commit(recompute({ ...state, lines }));
  }

  clear(_msg: Message, state: CartState): Effect[] {
    return commit(
      recompute({ ...state, lines: [], promo: "" }),
      store.set("promo", ""),
      store.set("promoInput", ""),
      store.set("promoMessage", ""),
      store.set("promoOk", false),
    );
  }

  promoInput(msg: Message): Effect[] {
    return [store.set("promoInput", String(msg.event?.value ?? ""))];
  }

  applyPromo(_msg: Message, state: CartState): Effect[] {
    const code = state.promoInput.trim();
    const ok = isPromo(code);
    const next = recompute({ ...state, promo: ok ? PROMO_CODE : "" });
    return commit(
      next,
      store.set("promo", next.promo),
      store.set("promoOk", ok),
      store.set(
        "promoMessage",
        ok
          ? "Code applied: 10% off."
          : code
            ? "This code is not valid."
            : "Type a code first.",
      ),
    );
  }

  /** The shop sends `configure({ shipMode, fee, taxRate, checkoutLabel })`. */
  configure(msg: Message, state: CartState): Effect[] {
    const patch = msg.payload as Partial<CartState>;
    const next = recompute({ ...state, ...patch });
    return commit(
      next,
      store.set("shipMode", next.shipMode),
      store.set("fee", next.fee),
      store.set("taxRate", next.taxRate),
      store.set("shipLabel", next.shipLabel),
      store.set("checkoutLabel", next.checkoutLabel),
      store.set("emptyText", next.emptyText),
    );
  }

  /** The button only tells the shop; the shop decides what checkout means. */
  checkout(): Effect[] {
    return [];
  }
}

export const cartBlock = new ShopCart();

// ---- the page of the block: the cart, and a few things to put in it ----

export type DemoItem = CartItem & { priceLabel: string };

export interface DemoState {
  cart: CartState;
  /** A second, empty cart for the empty state demo. */
  blank: CartState;
  items: DemoItem[];
}

const demoItems: CartItem[] = [
  {
    id: "tee",
    name: "Organic tee",
    variant: "M / Sand",
    price: 2800,
    emoji: "👕",
    hue: 35,
    max: 4,
  },
  {
    id: "mug",
    name: "Stoneware mug",
    variant: "350 ml",
    price: 1900,
    emoji: "☕",
    hue: 15,
  },
  {
    id: "lamp",
    name: "Oak desk lamp",
    variant: "Warm white",
    price: 8900,
    emoji: "💡",
    hue: 70,
  },
  {
    id: "font",
    name: "Fraunces Pro",
    variant: "Font family",
    price: 4900,
    emoji: "🔤",
    hue: 260,
    choices: [
      { id: "personal", label: "Personal license", price: 4900 },
      { id: "commercial", label: "Commercial license", price: 14900 },
    ],
  },
];

export const initial: DemoState = {
  cart: cartInitial,
  blank: {
    ...cartInitial,
    emptyText: "Nothing here yet. Find something you like in the shop.",
  },
  items: demoItems.map((i) => ({ ...i, priceLabel: money(i.price) })),
};

export class ShopCartPage extends Component<DemoState> {
  view = pageView;
  children: Children<DemoState> = {
    cart: { component: cartBlock, key: "cart" },
  };

  addDemo(msg: Message, state: DemoState, ctx: ComponentCtx): Effect[] {
    const item = state.items.find((i) => i.id === msg.payload);
    return item ? ctx.send("cart", "add", item) : [];
  }
}

export const page = new ShopCartPage();
