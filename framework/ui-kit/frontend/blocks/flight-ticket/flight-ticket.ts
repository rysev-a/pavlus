import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./flight-ticket.pavlus";

export type Step = "search" | "results" | "details" | "ticket";
export type Cabin = "economy" | "business";
export type Errors = Record<string, string>;

export interface City {
  code: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { code: "JFK", name: "New York", country: "USA", lat: 40.64, lon: -73.78 },
  { code: "LHR", name: "London", country: "UK", lat: 51.47, lon: -0.45 },
  { code: "CDG", name: "Paris", country: "France", lat: 49.0, lon: 2.55 },
  { code: "FRA", name: "Frankfurt", country: "Germany", lat: 50.03, lon: 8.57 },
  { code: "DXB", name: "Dubai", country: "UAE", lat: 25.25, lon: 55.36 },
  {
    code: "SIN",
    name: "Singapore",
    country: "Singapore",
    lat: 1.36,
    lon: 103.99,
  },
  { code: "HND", name: "Tokyo", country: "Japan", lat: 35.55, lon: 139.78 },
  {
    code: "SYD",
    name: "Sydney",
    country: "Australia",
    lat: -33.94,
    lon: 151.18,
  },
];

/** The calendar is fixed: dates before it cannot be booked. */
export const TODAY = "2026-11-03";
export const MAX_PASSENGERS = 6;
export const CABIN_FACTOR: Record<Cabin, number> = {
  economy: 1,
  business: 2.6,
};
export const CABIN_LABEL: Record<Cabin, string> = {
  economy: "Economy",
  business: "Business",
};

const AIRLINES = [
  { name: "Skyline Air", code: "SK" },
  { name: "Northwind Airways", code: "NW" },
  { name: "Aurora Jet", code: "AJ" },
  { name: "Meridian", code: "MD" },
];

export const cityOf = (code: string): City =>
  CITIES.find((c) => c.code === code) ?? CITIES[0];

/** Pure: a 32-bit hash of a text (FNV-1a). */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pure: the great-circle distance between two cities, in km. */
export function distanceKm(a: City, b: City): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(x)));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Pure: minutes after midnight as HH:MM. */
export const clock = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

/** Pure: 455 minutes as "7h 35m". */
export const durationLabel = (minutes: number): string =>
  `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;

/** Pure: 1234 as "$1,234". */
export const money = (n: number): string =>
  "$" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Pure: "2026-12-10" as "Thu, 10 Dec 2026" (empty text for a bad date). */
export function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export interface Flight {
  id: string;
  airline: string;
  number: string;
  depart: string;
  arrive: string;
  /** "+1" when the plane lands the next day. */
  nextDay: string;
  duration: number;
  durationLabel: string;
  stops: number;
  stopsLabel: string;
  /** Per passenger, in the cabin asked for. */
  unit: number;
  unitLabel: string;
  total: number;
  totalLabel: string;
}

/** Pure: four flights for a route and a date. Same input, same flights. */
export function flightsFor(
  from: string,
  to: string,
  date: string,
  passengers: number,
  cabin: Cabin,
): Flight[] {
  const a = cityOf(from);
  const b = cityOf(to);
  const km = distanceKm(a, b);
  const h = hashOf(`${from}-${to}-${date}`);
  const starts = [6 * 60 + 10, 9 * 60 + 45, 14 * 60 + 20, 19 * 60 + 55];
  return starts.map((start, i) => {
    const airline = AIRLINES[(i + (h % 4)) % 4];
    const stops = i === 0 ? 0 : (h >>> (i + 2)) % 3 === 0 ? 1 : 0;
    const depart = start + ((h >>> (i * 2)) % 6) * 5;
    const duration =
      Math.round(km / 820) * 60 + 35 + ((h >>> (i + 5)) % 40) + stops * 95;
    const arriveAt = depart + duration;
    const swing = 1 + ((h >>> (i + 3)) % 25) / 100;
    const unit = Math.round(
      (90 + km * 0.11) * swing * (stops ? 0.88 : 1) * CABIN_FACTOR[cabin],
    );
    const total = unit * passengers;
    return {
      id: `${airline.code}${100 + ((h >>> (i * 3)) % 800)}`,
      airline: airline.name,
      number: `${airline.code} ${100 + ((h >>> (i * 3)) % 800)}`,
      depart: clock(depart),
      arrive: clock(arriveAt),
      nextDay:
        arriveAt >= 24 * 60 ? `+${Math.floor(arriveAt / (24 * 60))}` : "",
      duration,
      durationLabel: durationLabel(duration),
      stops,
      stopsLabel: stops === 0 ? "Nonstop" : "1 stop",
      unit,
      unitLabel: money(unit),
      total,
      totalLabel: money(total),
    };
  });
}

export interface SearchForm {
  from: string;
  to: string;
  depart: string;
  ret: string;
  passengers: number;
  cabin: Cabin;
}

/** Pure: what is wrong with a search, by field. */
export function validateSearch(f: SearchForm): Errors {
  const errors: Errors = {};
  if (f.from === f.to) errors.to = "Choose a different destination.";
  if (!f.depart) errors.depart = "Pick a departure date.";
  else if (f.depart < TODAY)
    errors.depart = "The departure cannot be in the past.";
  if (!f.ret) errors.ret = "Pick a return date.";
  else if (f.depart && f.ret < f.depart)
    errors.ret = "The return cannot be before the departure.";
  if (f.passengers < 1 || f.passengers > MAX_PASSENGERS)
    errors.passengers = `Between 1 and ${MAX_PASSENGERS} passengers.`;
  return errors;
}

/** Pure: a name needs a first and a last name. */
export const nameError = (name: string): string =>
  /^\S+(\s+\S+)+$/.test(name.trim())
    ? ""
    : "Enter the first and the last name.";

/** Pure: errors of the passengers, by position. */
export function validateNames(names: string[]): Errors {
  const errors: Errors = {};
  names.forEach((n, i) => {
    const e = nameError(n);
    if (e) errors[String(i)] = e;
  });
  return errors;
}

/** Pure: the list of names resized to `count`, keeping what was typed. */
export function resizeNames(names: string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => names[i] ?? "");
}

export interface NameRow {
  i: number;
  label: string;
  value: string;
  error: string;
}

export const nameRowsOf = (names: string[], errors: Errors): NameRow[] =>
  names.map((value, i) => ({
    i,
    label: `Passenger ${i + 1}`,
    value,
    error: errors[String(i)] ?? "",
  }));

export interface Bar {
  id: number;
  w: number;
}
export interface Cell {
  id: number;
  on: boolean;
}

/** Pure: the widths of the bars of a barcode, from a reference. */
export function barsOf(reference: string, count = 44): Bar[] {
  let h = hashOf(reference);
  return Array.from({ length: count }, (_, id) => {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    return { id, w: 1 + ((h >>> 16) % 4) };
  });
}

export const QR_SIZE = 19;

/** Pure: the cells of a QR-looking block; the three corners are left free. */
export function cellsOf(reference: string): Cell[] {
  let h = hashOf(reference + "qr");
  const cells: Cell[] = [];
  for (let y = 0; y < QR_SIZE; y++) {
    for (let x = 0; x < QR_SIZE; x++) {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      const corner =
        (x < 8 && y < 8) ||
        (x >= QR_SIZE - 8 && y < 8) ||
        (x < 8 && y >= QR_SIZE - 8);
      cells.push({ id: y * QR_SIZE + x, on: !corner && (h >>> 20) % 2 === 0 });
    }
  }
  return cells;
}

export interface Seat {
  name: string;
  seat: string;
}

export interface Ticket {
  reference: string;
  flight: Flight;
  fromCity: City;
  toCity: City;
  departDate: string;
  returnDate: string;
  cabin: string;
  boarding: string;
  gate: string;
  seats: Seat[];
  bars: Bar[];
  cells: Cell[];
}

const BASE36 = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Pure: the booking reference: six characters from the booking. */
export function referenceOf(
  f: SearchForm,
  flight: Flight,
  names: string[],
): string {
  let h = hashOf(`${f.from}${f.to}${f.depart}${flight.id}${names.join("|")}`);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += BASE36[h % BASE36.length];
    h = Math.floor(h / BASE36.length) || hashOf(out);
  }
  return out;
}

/** Pure: the ticket of a booking. */
export function ticketFor(
  f: SearchForm,
  flight: Flight,
  names: string[],
): Ticket {
  const reference = referenceOf(f, flight, names);
  const h = hashOf(reference);
  const [hh, mm] = flight.depart.split(":").map(Number);
  const row = 4 + (h % 20);
  const letters = f.cabin === "business" ? "ACDF" : "ABCDEF";
  return {
    reference,
    flight,
    fromCity: cityOf(f.from),
    toCity: cityOf(f.to),
    departDate: dateLabel(f.depart),
    returnDate: dateLabel(f.ret),
    cabin: CABIN_LABEL[f.cabin],
    boarding: clock(hh * 60 + mm - 45),
    gate: `${"ABCD"[(h >>> 4) % 4]}${1 + ((h >>> 8) % 24)}`,
    seats: names.map((name, i) => ({
      name: name.trim().toUpperCase(),
      seat: `${f.cabin === "business" ? 1 + ((row + i) % 4) : row + Math.floor(i / 3)}${letters[i % letters.length]}`,
    })),
    bars: barsOf(reference),
    cells: cellsOf(reference),
  };
}

export interface StepRow {
  n: number;
  label: string;
  state: "done" | "current" | "todo";
}

const STEP_ORDER: { id: Step; label: string }[] = [
  { id: "search", label: "Search" },
  { id: "results", label: "Flights" },
  { id: "details", label: "Passengers" },
  { id: "ticket", label: "Ticket" },
];

/** Pure: the stepper for the current step. */
export function stepsOf(step: Step): StepRow[] {
  const at = STEP_ORDER.findIndex((s) => s.id === step);
  return STEP_ORDER.map((s, i) => ({
    n: i + 1,
    label: s.label,
    state: i < at ? "done" : i === at ? "current" : "todo",
  }));
}

export interface FlightTicketState extends SearchForm {
  step: Step;
  steps: StepRow[];
  cities: City[];
  minDate: string;
  errors: Errors;
  flights: Flight[];
  selectedId: string;
  chosen: Flight | null;
  names: string[];
  nameRows: NameRow[];
  ticket: Ticket | null;
  /** Texts for the summary line. */
  routeLabel: string;
  tripLabel: string;
  cabinLabel: string;
  paxLabel: string;
  canMinus: boolean;
  canPlus: boolean;
}

/** Pure: the summary texts of a search. */
export function summaryOf(
  f: SearchForm,
): Pick<
  FlightTicketState,
  | "routeLabel"
  | "tripLabel"
  | "cabinLabel"
  | "paxLabel"
  | "canMinus"
  | "canPlus"
> {
  const a = cityOf(f.from);
  const b = cityOf(f.to);
  return {
    routeLabel: `${a.name} (${a.code}) to ${b.name} (${b.code})`,
    tripLabel: `${dateLabel(f.depart)} - ${dateLabel(f.ret)}`,
    cabinLabel: CABIN_LABEL[f.cabin],
    paxLabel: `${f.passengers} passenger${f.passengers === 1 ? "" : "s"}`,
    canMinus: f.passengers > 1,
    canPlus: f.passengers < MAX_PASSENGERS,
  };
}

const START: SearchForm = {
  from: "JFK",
  to: "LHR",
  depart: "2026-12-10",
  ret: "2026-12-17",
  passengers: 2,
  cabin: "economy",
};

export const initial: FlightTicketState = {
  ...START,
  step: "search",
  steps: stepsOf("search"),
  cities: CITIES,
  minDate: TODAY,
  errors: {},
  flights: [],
  selectedId: "",
  chosen: null,
  names: [],
  nameRows: [],
  ticket: null,
  ...summaryOf(START),
};

const formOf = (s: SearchForm): SearchForm => ({
  from: s.from,
  to: s.to,
  depart: s.depart,
  ret: s.ret,
  passengers: s.passengers,
  cabin: s.cabin,
});

const goto = (step: Step): Effect[] => [
  store.set("step", step),
  store.set("steps", stepsOf(step)),
];

export class FlightTicket extends Component<FlightTicketState> {
  view = view;

  /** `setField("from")`: selects, dates and the cabin radios. */
  setField(msg: Message, state: FlightTicketState): Effect[] {
    const field = msg.payload as keyof SearchForm;
    const value = String(msg.event?.value ?? "");
    const next = { ...formOf(state), [field]: value } as SearchForm;
    const effects: Effect[] = [
      store.set(field, value),
      ...Object.entries(summaryOf(next)).map(([k, v]) => store.set(k, v)),
    ];
    if (state.errors[field] !== undefined || state.errors.ret !== undefined) {
      effects.push(store.set("errors", validateSearch(next)));
    }
    return effects;
  }

  /** `passengers(1)` or `passengers(-1)`. */
  passengers(msg: Message, state: FlightTicketState): Effect[] {
    const count = Math.min(
      MAX_PASSENGERS,
      Math.max(1, state.passengers + Number(msg.payload)),
    );
    const next = { ...formOf(state), passengers: count };
    return [
      store.set("passengers", count),
      ...Object.entries(summaryOf(next)).map(([k, v]) => store.set(k, v)),
    ];
  }

  search(_msg: Message, state: FlightTicketState): Effect[] {
    const form = formOf(state);
    const errors = validateSearch(form);
    if (Object.keys(errors).length > 0) return [store.set("errors", errors)];
    const flights = flightsFor(
      form.from,
      form.to,
      form.depart,
      form.passengers,
      form.cabin,
    );
    return [
      store.set("errors", {}),
      store.set("flights", flights),
      store.set("selectedId", ""),
      store.set("chosen", null),
      ...goto("results"),
    ];
  }

  pick(msg: Message, state: FlightTicketState): Effect[] {
    const chosen = state.flights.find((f) => f.id === msg.payload) ?? null;
    return [
      store.set("selectedId", chosen?.id ?? ""),
      store.set("chosen", chosen),
    ];
  }

  toDetails(_msg: Message, state: FlightTicketState): Effect[] {
    if (!state.chosen) return [];
    const names = resizeNames(state.names, state.passengers);
    return [
      store.set("names", names),
      store.set("nameRows", nameRowsOf(names, {})),
      ...goto("details"),
    ];
  }

  setName(msg: Message, state: FlightTicketState): Effect[] {
    const i = Number(msg.payload);
    const names = state.names.map((n, k) =>
      k === i ? String(msg.event?.value ?? "") : n,
    );
    const errors = { ...validateNames(names) };
    // Only the rows that already showed an error are re-checked while typing.
    const shown: Errors = {};
    for (const k of Object.keys(errors)) {
      if (state.nameRows.some((r) => String(r.i) === k && r.error))
        shown[k] = errors[k];
    }
    return [
      store.set("names", names),
      store.set("nameRows", nameRowsOf(names, shown)),
    ];
  }

  confirm(_msg: Message, state: FlightTicketState): Effect[] {
    const errors = validateNames(state.names);
    if (Object.keys(errors).length > 0)
      return [store.set("nameRows", nameRowsOf(state.names, errors))];
    if (!state.chosen) return [];
    return [
      store.set("ticket", ticketFor(formOf(state), state.chosen, state.names)),
      ...goto("ticket"),
    ];
  }

  back(_msg: Message, state: FlightTicketState): Effect[] {
    const to: Step =
      state.step === "ticket"
        ? "details"
        : state.step === "details"
          ? "results"
          : "search";
    return goto(to);
  }

  restart(): Effect[] {
    return [
      store.set("names", []),
      store.set("nameRows", []),
      store.set("flights", []),
      store.set("selectedId", ""),
      store.set("chosen", null),
      store.set("ticket", null),
      store.set("errors", {}),
      ...goto("search"),
    ];
  }
}

export const page = new FlightTicket();
