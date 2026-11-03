import { Component } from "@service-laboratory/pavlus";
import view from "./place-card.pavlus";

/** Opening hours of a day, in minutes since midnight; `null` is closed. */
export interface Hours {
  open: number;
  close: number;
}

export const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** By `Date#getDay()`: 0 is Sunday. */
export const HOURS: (Hours | null)[] = [
  { open: 8 * 60, close: 14 * 60 },
  null,
  { open: 7 * 60, close: 18 * 60 },
  { open: 7 * 60, close: 18 * 60 },
  { open: 7 * 60, close: 18 * 60 },
  { open: 7 * 60, close: 18 * 60 },
  { open: 7 * 60 + 30, close: 16 * 60 },
];

/** 450 -> `7:30`; the 24 hour clock, no leading zero on the hour. */
export function clock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${h}:${String(min % 60).padStart(2, "0")}`;
}

export function hoursText(h: Hours | null): string {
  return h ? `${clock(h.open)} - ${clock(h.close)}` : "Closed";
}

export interface HoursRow {
  day: string;
  text: string;
  today: boolean;
  closed: boolean;
}

/** The week from Monday, with today marked. */
export function hoursRows(weekday: number): HoursRow[] {
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    day: DAYS[d],
    text: hoursText(HOURS[d]),
    today: d === weekday,
    closed: HOURS[d] === null,
  }));
}

export interface Status {
  open: boolean;
  text: string;
}

/** Open now? And when it changes: "Open until 18:00", "Opens tomorrow at 7:00". */
export function statusOf(weekday: number, minutes: number): Status {
  const today = HOURS[weekday];
  if (today && minutes >= today.open && minutes < today.close) {
    return { open: true, text: `Open now, until ${clock(today.close)}` };
  }
  if (today && minutes < today.open) {
    return { open: false, text: `Closed, opens today at ${clock(today.open)}` };
  }
  for (let i = 1; i <= 7; i++) {
    const day = (weekday + i) % 7;
    const next = HOURS[day];
    if (next) {
      const when = i === 1 ? "tomorrow" : DAYS[day];
      return {
        open: false,
        text: `Closed, opens ${when} at ${clock(next.open)}`,
      };
    }
  }
  return { open: false, text: "Closed" };
}

export interface PlaceState {
  name: string;
  kicker: string;
  lines: string[];
  phone: string;
  email: string;
  note: string;
  hours: HoursRow[];
  status: Status;
}

/** The props of the card: the week and the status at a time. */
export function placeOf(
  base: Pick<
    PlaceState,
    "name" | "kicker" | "lines" | "phone" | "email" | "note"
  >,
  weekday: number,
  minutes: number,
): PlaceState {
  return {
    ...base,
    hours: hoursRows(weekday),
    status: statusOf(weekday, minutes),
  };
}

export const demoBase = {
  name: "Mill Street Bakery",
  kicker: "Visit us",
  lines: ["14 Mill Street", "Old Town, Portland"],
  phone: "+1 (503) 555-0142",
  email: "hello@millstreetbakery.example",
  note: "Free parking behind the building. Dogs welcome on the terrace.",
};

/** Wednesday, 10:20. */
export const initial = { place: placeOf(demoBase, 3, 10 * 60 + 20) };

/** Only data: the page has no messages of its own. */
export class PlaceCardPage extends Component<typeof initial> {
  view = view;
}

export const page = new PlaceCardPage();
