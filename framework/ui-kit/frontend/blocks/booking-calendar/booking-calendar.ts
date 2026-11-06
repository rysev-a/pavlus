import {
  type Children,
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import {
  longDate,
  type Month,
  monthCells,
  shiftMonth,
  titleOf,
  WEEKDAYS,
} from "../../lib/calendar.ts";
import pageView from "./booking-calendar.pavlus";
import view from "./view.pavlus";

export interface Session {
  id: string;
  label: string;
  /** Length of the session in minutes. */
  minutes: number;
  price: string;
  emoji: string;
  note: string;
}

export interface BookingCell {
  key: string;
  /** 0 for a blank cell before the 1st. */
  day: number;
  iso: string;
  /** Not in the past and not a closed weekday. */
  available: boolean;
}

export interface Slot {
  /** The start, `HH:MM`. */
  time: string;
  /** `09:00 - 11:00`. */
  label: string;
  taken: boolean;
}

export interface Hours {
  /** Minutes from midnight. */
  open: number;
  close: number;
  /** Gap between two sessions, in minutes. */
  buffer: number;
  /** Weekdays with no sessions, 0 = Sunday. */
  closedDays: number[];
}

export type Errors = Record<string, string>;

export interface BookingState {
  today: string;
  hours: Hours;
  sessions: Session[];
  /** The id of the chosen session. */
  session: string;
  month: Month;
  title: string;
  cells: BookingCell[];
  weekdays: string[];
  /** `YYYY-MM-DD` of the chosen day, or "". */
  selected: string;
  selectedLabel: string;
  /** Derived from the day and the session. */
  slots: Slot[];
  /** The start of the chosen slot, or "". */
  slotTime: string;
  name: string;
  email: string;
  errors: Errors;
  /** `day time` of every confirmed booking: those slots are taken. */
  booked: string[];
  /** Derived: a line for the summary, "" until a day and a slot are chosen. */
  summary: string;
  done: boolean;
  reference: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pad = (n: number): string => String(n).padStart(2, "0");

/** Pure: 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Pure: `2026-11-14` -> `Saturday, November 14, 2026`. */
export function fullDate(iso: string): string {
  return `${DAYS[weekdayOf(iso)]}, ${longDate(iso)}`;
}

/** Pure: 570 -> `09:30`. */
export function formatTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Pure: `09:30` -> 570. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Pure: the start of every session that fits between open and close. */
export function generateStarts(
  open: number,
  close: number,
  duration: number,
  buffer: number,
): number[] {
  const starts: number[] = [];
  if (duration <= 0) return starts;
  for (let t = open; t + duration <= close; t += duration + buffer) {
    starts.push(t);
  }
  return starts;
}

/**
 * Pure: some slots are always taken so the picker looks lived in. A fixed
 * function of the day and the time, never a random number.
 */
export function isBusy(iso: string, time: string): boolean {
  let sum = 0;
  for (const ch of iso + time) sum += ch.charCodeAt(0);
  return sum % 5 === 0;
}

/** Pure: the slots of a day for a session, with the taken ones marked. */
export function slotsFor(
  iso: string,
  session: Session | undefined,
  hours: Hours,
  booked: string[],
): Slot[] {
  if (!iso || !session) return [];
  return generateStarts(
    hours.open,
    hours.close,
    session.minutes,
    hours.buffer,
  ).map((start) => {
    const time = formatTime(start);
    return {
      time,
      label: `${time} - ${formatTime(start + session.minutes)}`,
      taken: isBusy(iso, time) || booked.includes(`${iso} ${time}`),
    };
  });
}

/** Pure: the grid of a month with what can be booked. */
export function bookingCells(
  month: Month,
  today: string,
  closedDays: number[],
): BookingCell[] {
  return monthCells(month).map((cell) => ({
    ...cell,
    available:
      cell.day > 0 &&
      cell.iso >= today &&
      !closedDays.includes(weekdayOf(cell.iso)),
  }));
}

/** Pure: what is wrong with the contact fields, by field. */
export function validateBooking(f: { name: string; email: string }): Errors {
  const errors: Errors = {};
  if (!f.name.trim()) errors.name = "Tell us your name.";
  if (!EMAIL.test(f.email)) errors.email = "Enter a valid email address.";
  return errors;
}

/** Pure: `Saturday, November 14, 2026 at 11:30 - 13:30` or "". */
export function summaryOf(
  iso: string,
  slots: Slot[],
  slotTime: string,
): string {
  const slot = slots.find((s) => s.time === slotTime);
  return iso && slot ? `${fullDate(iso)} at ${slot.label}` : "";
}

/** Pure: a booking reference from the day and the start: `BK-1114-1130`. */
export function referenceOf(iso: string, time: string): string {
  return `BK-${iso.slice(5).replace("-", "")}-${time.replace(":", "")}`;
}

const SESSIONS: Session[] = [
  {
    id: "portrait",
    label: "Portrait session",
    minutes: 60,
    price: "$180",
    emoji: "🧑‍🎤",
    note: "One person, one location, 15 edited photos.",
  },
  {
    id: "family",
    label: "Couple or family",
    minutes: 90,
    price: "$260",
    emoji: "👨‍👩‍👧",
    note: "Up to five people, 25 edited photos.",
  },
  {
    id: "event",
    label: "Event coverage",
    minutes: 180,
    price: "$540",
    emoji: "🎉",
    note: "Three hours, 80 edited photos in a week.",
  },
  {
    id: "wedding",
    label: "Wedding, half day",
    minutes: 240,
    price: "$1,200",
    emoji: "💍",
    note: "Ceremony and portraits, an online album.",
  },
];

/** Pure: a booking picker for a given today, month and set of sessions. */
export function bookingState(
  today: string,
  sessions: Session[] = SESSIONS,
  hours: Hours = { open: 540, close: 1080, buffer: 30, closedDays: [1] },
): BookingState {
  const [y, m] = today.split("-").map(Number);
  const month: Month = { year: y, month: m - 1 };
  return {
    today,
    hours,
    sessions,
    session: sessions[0].id,
    month,
    title: titleOf(month),
    cells: bookingCells(month, today, hours.closedDays),
    weekdays: WEEKDAYS,
    selected: "",
    selectedLabel: "",
    slots: [],
    slotTime: "",
    name: "",
    email: "",
    errors: {},
    booked: [],
    summary: "",
    done: false,
    reference: "",
  };
}

export class BookingCalendar extends Component<BookingState> {
  view = view;

  prev(_msg: Message, state: BookingState): Effect[] {
    return this._month(shiftMonth(state.month, -1), state);
  }

  next(_msg: Message, state: BookingState): Effect[] {
    return this._month(shiftMonth(state.month, 1), state);
  }

  /** A day: the slots are computed again and the chosen time is dropped. */
  pickDate(msg: Message, state: BookingState): Effect[] {
    const iso = msg.payload as string;
    const slots = slotsFor(
      iso,
      state.sessions.find((s) => s.id === state.session),
      state.hours,
      state.booked,
    );
    return [
      store.set("selected", iso),
      store.set("selectedLabel", fullDate(iso)),
      store.set("slots", slots),
      store.set("slotTime", ""),
      store.set("summary", ""),
    ];
  }

  /** A session type: the slots change with its length. */
  pickSession(msg: Message, state: BookingState): Effect[] {
    const id = msg.payload as string;
    const slots = slotsFor(
      state.selected,
      state.sessions.find((s) => s.id === id),
      state.hours,
      state.booked,
    );
    const keep = slots.some((s) => s.time === state.slotTime && !s.taken);
    const slotTime = keep ? state.slotTime : "";
    return [
      store.set("session", id),
      store.set("slots", slots),
      store.set("slotTime", slotTime),
      store.set("summary", summaryOf(state.selected, slots, slotTime)),
    ];
  }

  pickSlot(msg: Message, state: BookingState): Effect[] {
    const time = msg.payload as string;
    return [
      store.set("slotTime", time),
      store.set("summary", summaryOf(state.selected, state.slots, time)),
    ];
  }

  /** `setField("name")` and `setField("email")`. */
  setField(msg: Message): Effect[] {
    return [
      store.set(msg.payload as string, msg.event?.value ?? ""),
      store.set("errors", {}),
    ];
  }

  confirm(_msg: Message, state: BookingState): Effect[] {
    const errors = validateBooking(state);
    if (!state.selected || !state.slotTime || Object.keys(errors).length > 0) {
      return [store.set("errors", errors)];
    }
    return [
      store.set("errors", {}),
      store.set("booked", [
        ...state.booked,
        `${state.selected} ${state.slotTime}`,
      ]),
      store.set("reference", referenceOf(state.selected, state.slotTime)),
      store.set("done", true),
    ];
  }

  /** Back to the start; the confirmed slots stay taken. */
  reset(): Effect[] {
    return [
      store.set("done", false),
      store.set("selected", ""),
      store.set("selectedLabel", ""),
      store.set("slots", []),
      store.set("slotTime", ""),
      store.set("summary", ""),
      store.set("name", ""),
      store.set("email", ""),
      store.set("reference", ""),
    ];
  }

  _month(month: Month, state: BookingState): Effect[] {
    return [
      store.set("month", month),
      store.set("title", titleOf(month)),
      store.set(
        "cells",
        bookingCells(month, state.today, state.hours.closedDays),
      ),
    ];
  }
}

export const part = new BookingCalendar();

export interface BookingPageState {
  booking: BookingState;
}

export const initial: BookingPageState = {
  booking: bookingState("2026-11-03"),
};

/** The demo page: the part as a child. */
export class BookingPage extends Component<BookingPageState> {
  view = pageView;

  children: Children<BookingPageState> = {
    booking: { component: part, key: "booking" },
  };
}

export const page = new BookingPage();
