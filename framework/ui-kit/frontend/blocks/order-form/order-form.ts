import {
  type Children,
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { clock, DAYS, HOURS } from "../place-card/place-card.ts";
import { money } from "../shop-cart/shop-cart.ts";
import pageView from "./order-form.pavlus";
import view from "./view.pavlus";

export type Mode = "pickup" | "courier" | "table";
export type Day = "today" | "tomorrow";

export const MODES: { id: Mode; label: string; note: string }[] = [
  { id: "pickup", label: "Pickup", note: "Ready in the shop" },
  { id: "courier", label: "Courier", note: "To your door" },
  { id: "table", label: "Table", note: "Book a table" },
];

/** The courier does not go further than this. */
export const MAX_KM = 12;
/** Table bookings: the last seating is this long before closing. */
const SEATING = 90;
const STEP: Record<Mode, number> = { pickup: 15, courier: 30, table: 30 };
const LEAD: Record<Mode, number> = { pickup: 30, courier: 60, table: 30 };

/** Times that are already taken (the shop is busy then). */
const BUSY = new Set(["8:00", "12:30", "13:00", "17:15"]);

// ---- pure logic ----

/** The courier fee in cents: $3 up to 2 km, then $1 for each started km. */
export function courierFee(km: number): number | null {
  if (!Number.isFinite(km) || km < 0 || km > MAX_KM) return null;
  return 300 + 100 * Math.ceil(Math.max(0, km - 2));
}

export interface Slot {
  id: string;
  label: string;
  /** Minutes since midnight. */
  at: number;
  taken: boolean;
}

/**
 * Times a customer can pick for a day. Today starts after the lead time (rounded
 * up to the step); a closed day has none; tables stop 90 min before closing.
 */
export function slotsFor(
  weekday: number,
  nowMin: number,
  day: Day,
  mode: Mode,
): Slot[] {
  const target = day === "today" ? weekday : (weekday + 1) % 7;
  const hours = HOURS[target];
  if (!hours) return [];
  const step = STEP[mode];
  const last = mode === "table" ? hours.close - SEATING : hours.close - step;
  let from = hours.open;
  if (day === "today") {
    const soonest = nowMin + LEAD[mode];
    from = Math.max(from, Math.ceil(soonest / step) * step);
  }
  const slots: Slot[] = [];
  for (let at = from; at <= last; at += step) {
    const label = clock(at);
    slots.push({ id: label, label, at, taken: BUSY.has(label) });
  }
  return slots;
}

/** Today, unless nothing is left today. */
export function bestDay(weekday: number, nowMin: number, mode: Mode): Day {
  return slotsFor(weekday, nowMin, "today", mode).some((s) => !s.taken)
    ? "today"
    : "tomorrow";
}

export interface OrderFields {
  mode: Mode;
  slot: string;
  km: number;
  guests: number;
  name: string;
  phone: string;
  address: string;
}

/** What is wrong with an order, by field. `itemCount` is what is in the cart. */
export function validateOrder(
  f: OrderFields,
  itemCount: number,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (f.mode !== "table" && itemCount < 1)
    errors.items = "Add something from the menu first.";
  if (!f.slot) errors.slot = "Pick a time.";
  if (!f.name.trim()) errors.name = "Tell us your name.";
  if (f.phone.replace(/\D/g, "").length < 7)
    errors.phone = "Enter a phone number we can call.";
  if (f.mode === "courier") {
    if (f.address.trim().length < 6) errors.address = "Enter your address.";
    if (courierFee(f.km) === null)
      errors.address = `We deliver up to ${MAX_KM} km.`;
  }
  return errors;
}

/** "Pickup today at 10:30", "Table for 4 tomorrow at 19:00"... */
export function summaryOf(
  f: Pick<OrderFields, "mode" | "slot" | "guests">,
  day: Day,
  weekday: number,
): string {
  if (!f.slot) return "Pick a time to see the summary.";
  const when = `${day === "today" ? "today" : "tomorrow"}, ${DAYS[day === "today" ? weekday : (weekday + 1) % 7]} at ${f.slot}`;
  if (f.mode === "pickup") return `Pickup ${when}`;
  if (f.mode === "courier") return `Delivery ${when}`;
  return `Table for ${f.guests} ${when}`;
}

// ---- state ----

export interface OrderState extends OrderFields {
  day: Day;
  weekday: number;
  nowMin: number;
  notes: string;
  /** From the shop (the cart): how many things are ordered. */
  itemCount: number;
  errors: Record<string, string>;
  // derived, see `settle`
  modes: ((typeof MODES)[number] & { active: boolean })[];
  days: { id: Day; label: string; active: boolean; disabled: boolean }[];
  slots: (Slot & { active: boolean })[];
  slotsNote: string;
  fee: number;
  feeLabel: string;
  kmLabel: string;
  summary: string;
  hasErrors: boolean;
}

type Raw = Omit<
  OrderState,
  | "modes"
  | "days"
  | "slots"
  | "slotsNote"
  | "fee"
  | "feeLabel"
  | "kmLabel"
  | "summary"
  | "hasErrors"
>;

/** The derived fields: lists for the view, the fee, the summary. */
export function settle(raw: Raw): OrderState {
  const todays = slotsFor(raw.weekday, raw.nowMin, "today", raw.mode);
  const list = slotsFor(raw.weekday, raw.nowMin, raw.day, raw.mode);
  const slot = list.some((s) => s.id === raw.slot && !s.taken) ? raw.slot : "";
  const fee = raw.mode === "courier" ? (courierFee(raw.km) ?? 0) : 0;
  const tomorrowOpen = HOURS[(raw.weekday + 1) % 7] !== null;
  return {
    ...raw,
    slot,
    modes: MODES.map((m) => ({ ...m, active: m.id === raw.mode })),
    days: [
      {
        id: "today",
        label: "Today",
        active: raw.day === "today",
        disabled: todays.length === 0,
      },
      {
        id: "tomorrow",
        label: "Tomorrow",
        active: raw.day === "tomorrow",
        disabled: !tomorrowOpen,
      },
    ],
    slots: list.map((s) => ({ ...s, active: s.id === slot })),
    slotsNote:
      list.length === 0
        ? raw.day === "today"
          ? "No more times today. Try tomorrow."
          : "We are closed that day."
        : "",
    fee,
    feeLabel:
      raw.mode !== "courier"
        ? ""
        : courierFee(raw.km) === null
          ? `Too far: we deliver up to ${MAX_KM} km`
          : `Delivery ${money(fee)}`,
    kmLabel: `${raw.km} km`,
    summary: summaryOf(
      { mode: raw.mode, slot, guests: raw.guests },
      raw.day,
      raw.weekday,
    ),
    hasErrors: Object.keys(raw.errors).length > 0,
  };
}

export const orderInitial: OrderState = settle({
  mode: "pickup",
  day: "today",
  weekday: 3,
  nowMin: 9 * 60,
  slot: "",
  km: 3,
  guests: 2,
  name: "",
  phone: "",
  address: "",
  notes: "",
  itemCount: 0,
  errors: {},
});

/** The effects that write what changed between two states. */
export function changes(prev: OrderState, next: OrderState): Effect[] {
  return (Object.keys(next) as (keyof OrderState)[])
    .filter((k) => next[k] !== prev[k])
    .map((k) => store.set(k, next[k]));
}

const FIELDS = ["name", "phone", "address", "notes"];

export class OrderForm extends Component<OrderState> {
  view = view;

  /** `update` with a partial state: the one place a change is made. */
  _next(state: OrderState, patch: Partial<OrderState>): Effect[] {
    return changes(state, settle({ ...state, ...patch, errors: {} }));
  }

  /** The shop tells the form what time it is: `setClock({ weekday, minutes })`. */
  setClock(msg: Message, state: OrderState): Effect[] {
    const { weekday, minutes } = msg.payload as {
      weekday: number;
      minutes: number;
    };
    const day = bestDay(weekday, minutes, state.mode);
    return changes(
      state,
      settle({
        ...state,
        weekday,
        nowMin: minutes,
        day,
        errors: state.errors,
      }),
    );
  }

  setMode(msg: Message, state: OrderState): Effect[] {
    const mode = msg.payload as Mode;
    const day = bestDay(state.weekday, state.nowMin, mode);
    return this._next(state, { mode, day, slot: "" });
  }

  setDay(msg: Message, state: OrderState): Effect[] {
    return this._next(state, { day: msg.payload as Day, slot: "" });
  }

  setSlot(msg: Message, state: OrderState): Effect[] {
    return this._next(state, { slot: String(msg.payload) });
  }

  setKm(msg: Message, state: OrderState): Effect[] {
    const km = Number(msg.event?.value);
    return this._next(state, { km: Number.isFinite(km) ? km : state.km });
  }

  guests(msg: Message, state: OrderState): Effect[] {
    const guests = Math.min(8, Math.max(1, state.guests + Number(msg.payload)));
    return this._next(state, { guests });
  }

  /** `field("name")`: a text input. */
  field(msg: Message, state: OrderState): Effect[] {
    const name = String(msg.payload);
    if (!FIELDS.includes(name)) return [];
    const value = String(msg.event?.value ?? "");
    return changes(
      state,
      settle({ ...state, [name]: value, errors: state.errors }),
    );
  }

  submit(_msg: Message, state: OrderState): Effect[] {
    const errors = validateOrder(state, state.itemCount);
    return changes(state, settle({ ...state, errors }));
  }
}

export const orderBlock = new OrderForm();

// ---- the page of the block ----

export interface PageState {
  order: OrderState;
  /** What the shop would tell the form. */
  note: string;
}

export const initial: PageState = {
  order: settle({
    ...orderInitial,
    weekday: 3,
    nowMin: 10 * 60 + 20,
    itemCount: 2,
  }),
  note: "The form is told it is Wednesday, 10:20 and the cart holds 2 things. Place the order to see what is checked.",
};

export class OrderFormPage extends Component<PageState> {
  view = pageView;
  children: Children<PageState> = {
    order: { component: orderBlock, key: "order" },
  };
}

export const page = new OrderFormPage();
