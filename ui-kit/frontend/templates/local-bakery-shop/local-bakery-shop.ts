import {
  Component,
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
  confirmationOf,
  type ConfirmationState,
  orderNumber,
} from "../../blocks/checkout-summary/checkout-summary.ts";
import {
  type Category,
  type Dish,
  sectionsOf,
  type MenuSection,
} from "../../blocks/menu-list/menu-list.ts";
import {
  courierFee,
  orderBlock,
  orderInitial,
  type OrderState,
  validateOrder,
} from "../../blocks/order-form/order-form.ts";
import {
  demoBase,
  type PlaceState,
  placeOf,
} from "../../blocks/place-card/place-card.ts";
import {
  cardOf,
  type CardItem,
} from "../../blocks/product-card/product-card.ts";
import {
  cartBlock,
  type CartItem,
  type CartState,
  cartInitial,
  recompute,
} from "../../blocks/shop-cart/shop-cart.ts";
import view from "./local-bakery-shop.pavlus";

export const CATEGORIES: Category[] = [
  { id: "bread", title: "Bread", note: "Baked at 5 am, gone by noon" },
  { id: "sweet", title: "Sweet", note: "Butter, not margarine" },
  { id: "savory", title: "Savory", note: "Warm from the oven until 2 pm" },
  { id: "drinks", title: "Drinks", note: "Coffee roasted two streets away" },
];

export interface BakeDish extends Dish {
  /** Shown as a card in "Today's favourites". */
  favourite?: boolean;
  badge?: string;
}

const d = (
  id: string,
  name: string,
  category: string,
  emoji: string,
  hue: number,
  price: number,
  desc: string,
  extra: Partial<BakeDish> = {},
): BakeDish => ({ id, name, category, emoji, hue, price, desc, ...extra });

export const DISHES: BakeDish[] = [
  d(
    "sourdough",
    "Country sourdough",
    "bread",
    "🍞",
    38,
    650,
    "Wheat and rye, 48 hours of fermentation, a thick crackling crust.",
    { tags: ["vegan"], favourite: true, badge: "Baker's pick" },
  ),
  d(
    "baguette",
    "Baguette tradition",
    "bread",
    "🥖",
    30,
    280,
    "Long, golden, with an open crumb. Best eaten within the hour.",
    { tags: ["vegan"] },
  ),
  d(
    "focaccia",
    "Rosemary focaccia",
    "bread",
    "🫓",
    110,
    450,
    "Olive oil, sea salt and rosemary from our own window box.",
    { tags: ["vegan"], favourite: true },
  ),
  d(
    "raisin-loaf",
    "Cinnamon-raisin loaf",
    "bread",
    "🍇",
    18,
    550,
    "Soft, swirled and just sweet enough for toast.",
  ),
  d(
    "croissant",
    "Butter croissant",
    "sweet",
    "🥐",
    45,
    380,
    "Eighty-one layers of French butter, baked until it shatters.",
    { favourite: true, badge: "Bestseller" },
  ),
  d(
    "choc-croissant",
    "Pain au chocolat",
    "sweet",
    "🍫",
    20,
    420,
    "Two sticks of dark chocolate in a flaky roll.",
  ),
  d(
    "cinnamon-roll",
    "Cinnamon roll",
    "sweet",
    "🌀",
    22,
    420,
    "Soft, sticky, with cream cheese glaze.",
    { soldOut: true },
  ),
  d(
    "lemon-tart",
    "Lemon tart",
    "sweet",
    "🍋",
    58,
    520,
    "Sharp lemon curd in a buttery shell, finished with meringue.",
    { favourite: true, tags: ["seasonal"] },
  ),
  d(
    "muffin",
    "Blueberry muffin",
    "sweet",
    "🫐",
    250,
    360,
    "Big, domed and full of Oregon blueberries.",
  ),
  d(
    "carrot-cake",
    "Carrot cake slice",
    "sweet",
    "🥕",
    28,
    500,
    "Walnuts, spice and a thick cream cheese frosting.",
    { favourite: true },
  ),
  d(
    "eclair",
    "Chocolate eclair",
    "sweet",
    "🍩",
    15,
    480,
    "Choux filled with vanilla cream and glazed in dark chocolate.",
  ),
  d(
    "ham-croissant",
    "Ham & gruyère croissant",
    "savory",
    "🧀",
    48,
    580,
    "Smoked ham and melted gruyère, baked twice.",
  ),
  d(
    "spinach-pastry",
    "Spinach & feta pastry",
    "savory",
    "🥬",
    120,
    490,
    "Flaky layers around spinach, feta and dill.",
    { tags: ["vegetarian"] },
  ),
  d(
    "quiche",
    "Quiche Lorraine slice",
    "savory",
    "🥧",
    40,
    620,
    "Bacon, egg and cream in a buttery crust.",
    { favourite: true },
  ),
  d(
    "flat-white",
    "Flat white",
    "drinks",
    "☕",
    25,
    400,
    "Double ristretto and steamed whole milk.",
  ),
  d(
    "filter",
    "Filter coffee",
    "drinks",
    "🫖",
    30,
    300,
    "Today's single origin, with a free refill.",
  ),
  d(
    "hot-chocolate",
    "Hot chocolate",
    "drinks",
    "🍵",
    12,
    420,
    "Thick, dark and topped with cream.",
  ),
  d(
    "orange-juice",
    "Fresh orange juice",
    "drinks",
    "🍊",
    35,
    450,
    "Squeezed when you order.",
  ),
];

const dishToCard = (x: BakeDish): CardItem =>
  cardOf(
    {
      id: x.id,
      title: x.name,
      blurb: x.desc,
      emoji: x.emoji,
      hue: x.hue,
      price: x.price,
      badge: x.badge ?? x.tags?.[0],
      badgeTone: x.badge ? "default" : "secondary",
      kicker: CATEGORIES.find((c) => c.id === x.category)?.title,
      stock: x.soldOut ? 0 : undefined,
    },
    { addLabel: "Add", openable: false },
  );

export const itemOf = (x: Dish): CartItem => ({
  id: x.id,
  name: x.name,
  price: x.price,
  emoji: x.emoji,
  hue: x.hue,
});

export const feeFor = (mode: string, km: number): number =>
  mode === "courier" ? (courierFee(km) ?? 0) : 0;

export interface Clock {
  weekday: number;
  minutes: number;
}

/** A timestamp in ms as the visitor's weekday and minutes since midnight. */
export function clockOf(ms: number): Clock {
  const date = new Date(ms);
  return {
    weekday: date.getDay(),
    minutes: date.getHours() * 60 + date.getMinutes(),
  };
}

/** What `order.submit` and the cart's button need to decide. */
export function canPlace(order: OrderState, itemCount: number): boolean {
  return Object.keys(validateOrder(order, itemCount)).length === 0;
}

export interface BakeryState {
  cart: CartState;
  order: OrderState;
  favourites: CardItem[];
  sections: MenuSection[];
  place: PlaceState;
  placed: ConfirmationState | null;
  toast: string;
  orders: number;
  links: { label: string; href: string }[];
}

export const initial: BakeryState = {
  cart: recompute({
    ...cartInitial,
    shipMode: "fee",
    fee: 0,
    shipLabel: "Delivery",
    checkoutLabel: "Place the order",
    emptyText: "Your tray is empty. Add bread, pastry or coffee from the menu.",
  }),
  order: orderInitial,
  favourites: DISHES.filter((x) => x.favourite).map(dishToCard),
  sections: sectionsOf(DISHES, CATEGORIES),
  place: placeOf(demoBase, 3, 10 * 60),
  placed: null,
  toast: "",
  orders: 0,
  links: [
    { label: "Menu", href: "#menu" },
    { label: "Order", href: "#order" },
    { label: "Visit", href: "#visit" },
  ],
};

export class LocalBakery extends Component<BakeryState> {
  view = view;
  children: Children<BakeryState> = {
    cart: { component: cartBlock, key: "cart" },
    order: {
      component: orderBlock,
      key: "order",
      props: (s) => ({ itemCount: s.cart.count }),
    },
  };

  /** The page is open: ask the time plugin what time it is. */
  enter(): Effect[] {
    return [time.now("clock")];
  }

  clock(msg: Message, _s: BakeryState, ctx: ComponentCtx): Effect[] {
    const at = clockOf(Number(msg.payload));
    return [
      store.set("place", placeOf(demoBase, at.weekday, at.minutes)),
      ...ctx.send("order", "setClock", at),
    ];
  }

  _add(id: string, ctx: ComponentCtx): Effect[] {
    const x = DISHES.find((q) => q.id === id);
    if (!x || x.soldOut) return [];
    return [
      ...ctx.send("cart", "add", itemOf(x)),
      store.set("toast", `${x.name} added to your tray`),
      time.setTimeout("toast", 2400, "hideToast"),
    ];
  }

  hideToast(): Effect[] {
    return [store.set("toast", "")];
  }

  "grid.card.add"(msg: Message, _s: BakeryState, ctx: ComponentCtx): Effect[] {
    return this._add(String(msg.payload), ctx);
  }

  "menu.add"(msg: Message, _s: BakeryState, ctx: ComponentCtx): Effect[] {
    return this._add(String(msg.payload), ctx);
  }

  /** The delivery fee follows the way to get the order and the distance. */
  "order.setMode"(
    msg: Message,
    state: BakeryState,
    ctx: ComponentCtx,
  ): Effect[] {
    const fee = feeFor(String(msg.payload), state.order.km);
    return ctx.send("cart", "configure", { fee });
  }

  "order.setKm"(msg: Message, state: BakeryState, ctx: ComponentCtx): Effect[] {
    const fee = feeFor(state.order.mode, Number(msg.event?.value));
    return ctx.send("cart", "configure", { fee });
  }

  /** The form was submitted: if it is valid, the order is placed. */
  "order.submit"(
    _msg: Message,
    state: BakeryState,
    ctx: ComponentCtx,
  ): Effect[] {
    const count = state.cart.count;
    if (!canPlace(state.order, count)) return [];
    const number = state.orders + 1;
    const o = state.order;
    const text = `${o.summary}. We will call ${o.phone} if anything changes.`;
    const placed: ConfirmationState =
      o.mode === "table" && count === 0
        ? {
            title: `Table booked, ${o.name.trim()}`,
            text,
            orderNo: orderNumber(number, "BK"),
            rows: [],
            figures: [],
            ctaLabel: "Done",
          }
        : confirmationOf(state.cart.lines, state.cart.promo, state.cart, {
            title: `Thank you, ${o.name.trim()}! Your order is in`,
            text: `${text} Pay when you ${o.mode === "courier" ? "receive it" : "collect it"}.`,
            orderNo: orderNumber(number, "BK"),
            ctaLabel: "Done",
          });
    return [
      store.set("placed", placed),
      store.set("orders", number),
      ...ctx.send("cart", "clear"),
    ];
  }

  /** The tray's own button does what the form's button does. */
  "cart.checkout"(
    msg: Message,
    state: BakeryState,
    ctx: ComponentCtx,
  ): Effect[] {
    return [
      ...ctx.send("order", "submit"),
      ...this["order.submit"](msg, state, ctx),
    ];
  }

  "placed.done"(): Effect[] {
    return [store.set("placed", null)];
  }

  closePlaced(): Effect[] {
    return [store.set("placed", null)];
  }
}

export const page = new LocalBakery();
