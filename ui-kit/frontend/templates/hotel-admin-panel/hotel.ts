import {
  loadTone,
  money,
  share,
  type Tone,
} from "../../blocks/admin-shell/shell.ts";
import { columns, type Column } from "../../blocks/bar-chart/chart.ts";
import {
  type Booking,
  type Day,
  daysFrom,
  freeNights,
  gridRows,
  type GridRow,
  isFree,
  marksOf,
  nextBookingId,
  occupiedOn,
  type Room,
  type Stay,
  STAY_LABEL,
  toneOf,
} from "../../blocks/booking-grid/bookings.ts";
import { dateLabel } from "../../blocks/gantt-timeline/timeline.ts";
import {
  item as meterItem,
  type Item,
} from "../../blocks/progress-list/items.ts";
import {
  type Detail,
  detail,
  type Field,
  field,
  positive,
  selectField,
} from "../../blocks/record-sheet/sheet.ts";
import {
  choice,
  listAction,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";

/** The grid shows fourteen days from Sunday 1 November 2026; today is the 3rd. */
export const N = 14;
export const START = { y: 2026, m: 11, d: 1 };
export const TODAY = 2;
export const DAYS: Day[] = daysFrom(START.y, START.m, START.d, N, TODAY);
export const MARKS = marksOf(DAYS);

export const ROOMS: Room[] = [
  { id: "101", name: "101", kind: "Single", floor: 1 },
  { id: "102", name: "102", kind: "Double", floor: 1 },
  { id: "103", name: "103", kind: "Double", floor: 1 },
  { id: "104", name: "104", kind: "Twin", floor: 1 },
  { id: "105", name: "105", kind: "Single", floor: 1 },
  { id: "106", name: "106", kind: "Suite", floor: 1 },
  { id: "201", name: "201", kind: "Double", floor: 2 },
  { id: "202", name: "202", kind: "Double", floor: 2 },
  { id: "203", name: "203", kind: "Twin", floor: 2 },
  { id: "204", name: "204", kind: "Suite", floor: 2 },
  { id: "205", name: "205", kind: "Single", floor: 2 },
  { id: "206", name: "206", kind: "Deluxe", floor: 2 },
];

/** The price of a night by room type. */
export const RATE: Record<string, number> = {
  Single: 80,
  Double: 110,
  Twin: 105,
  Suite: 220,
  Deluxe: 300,
};

const b = (
  id: string,
  room: string,
  guest: string,
  from: number,
  nights: number,
  status: Stay,
): Booking => ({ id, room, guest, from, nights, status, note: "" });

export const BOOKINGS: Booking[] = [
  b("b1", "101", "Ann Lee", -2, 4, "in"),
  b("b2", "101", "Jon Park", 2, 3, "expected"),
  b("b3", "101", "Kim Soo", 6, 4, "expected"),
  b("b4", "101", "Rob Wolf", 11, 3, "expected"),
  b("b5", "102", "Eva Stone", -3, 3, "out"),
  b("b6", "102", "Max Roy", 1, 5, "in"),
  b("b7", "102", "Zoe Hart", 8, 4, "expected"),
  b("b8", "103", "Lia Chen", -5, 12, "in"),
  b("b9", "103", "Dan Fox", 9, 5, "expected"),
  b("b10", "104", "Tom Reed", 2, 2, "expected"),
  b("b11", "104", "Ivy Nash", 5, 3, "expected"),
  b("b12", "104", "Gus Lane", 10, 4, "expected"),
  b("b13", "105", "Amy Cole", 0, 3, "in"),
  b("b14", "105", "Ben Ito", 3, 5, "expected"),
  b("b15", "105", "Cara Webb", 11, 3, "expected"),
  b("b16", "106", "Pia Marsh", -1, 6, "in"),
  b("b17", "106", "Leo Park", 6, 7, "expected"),
  b("b18", "201", "Nia Quinn", 2, 4, "expected"),
  b("b19", "201", "Oz Bell", 7, 3, "expected"),
  b("b20", "202", "Pat Vine", -3, 3, "out"),
  b("b21", "202", "Sam Gray", 1, 2, "in"),
  b("b22", "202", "Uma Rao", 4, 6, "expected"),
  b("b23", "203", "Vic Moss", -4, 6, "in"),
  b("b24", "203", "Wes Lund", 3, 4, "expected"),
  b("b25", "204", "Xena Cruz", 0, 9, "in"),
  b("b26", "205", "Yan Ito", 5, 2, "expected"),
  b("b27", "206", "Hugo Vale", 2, 5, "expected"),
  b("b28", "206", "Isa Moon", 8, 6, "expected"),
];

export const STAFF = ["Maria", "Tom", "Sofia", "Ivan"];

export type CleanKind = "checkout" | "stay-over" | "deep";

export interface CleanTask {
  id: string;
  room: string;
  kind: CleanKind;
  staff: string;
  done: boolean;
}

export const CLEAN_LABEL: Record<CleanKind, string> = {
  checkout: "Checkout clean",
  "stay-over": "Stay-over clean",
  deep: "Deep clean",
};

export const CLEANING: CleanTask[] = [
  { id: "c1", room: "101", kind: "checkout", staff: "", done: false },
  { id: "c2", room: "203", kind: "checkout", staff: "", done: false },
  { id: "c3", room: "102", kind: "stay-over", staff: "Maria", done: false },
  { id: "c4", room: "204", kind: "stay-over", staff: "", done: false },
  { id: "c5", room: "205", kind: "deep", staff: "Tom", done: false },
  { id: "c6", room: "105", kind: "stay-over", staff: "", done: false },
  { id: "c7", room: "202", kind: "checkout", staff: "Sofia", done: true },
];

// ---- check-in -------------------------------------------------------------

export const dateOf = (i: number): string =>
  dateLabel(START.y, START.m, START.d, i);

export const roomOf = (id: string): Room =>
  ROOMS.find((r) => r.id === id) ?? ROOMS[0];

export const arrivalsOn = (list: Booking[], day: number): Booking[] =>
  list.filter((x) => x.from === day);

export const departuresOn = (list: Booking[], day: number): Booking[] =>
  list.filter((x) => x.from + x.nights === day);

/** Pure: the next or the previous step of a stay. */
export function stepOf(status: Stay, dir: "next" | "back"): Stay {
  if (dir === "next") return status === "expected" ? "in" : "out";
  return status === "out" ? "in" : "expected";
}

/** Pure: the bookings with one stay moved a step. */
export function advanceStay(
  list: Booking[],
  id: string,
  dir: "next" | "back",
): Booking[] {
  return list.map((x) =>
    x.id === id ? { ...x, status: stepOf(x.status, dir) } : x,
  );
}

/** Pure: a checkout leaves a room to clean (one open checkout task per room). */
export function cleaningAfterCheckout(
  tasks: CleanTask[],
  room: string,
): CleanTask[] {
  if (tasks.some((t) => t.room === room && t.kind === "checkout" && !t.done)) {
    return tasks;
  }
  const n = tasks.reduce((m, t) => Math.max(m, Number(t.id.slice(1)) || 0), 0);
  return [
    ...tasks,
    { id: `c${n + 1}`, room, kind: "checkout", staff: "", done: false },
  ];
}

const STAY_FILTERS: [string, string][] = [
  ["all", "All"],
  ["expected", "Expected"],
  ["in", "In house"],
  ["out", "Checked out"],
];
export { STAY_FILTERS };

/** Pure: the action buttons of a stay. */
export function stayActions(status: Stay) {
  if (status === "expected") {
    return [
      listAction("next", "Check in", {
        icon: "k-ai-login",
        variant: "default",
      }),
    ];
  }
  if (status === "in") {
    return [
      listAction("next", "Check out", {
        icon: "k-ai-logout",
        variant: "default",
      }),
      listAction("back", "Undo", { variant: "ghost" }),
    ];
  }
  return [listAction("back", "Reopen", { variant: "ghost" })];
}

/** Pure: one stay as a row of the status list. */
export function stayRow(x: Booking): StatusRow {
  const room = roomOf(x.room);
  return statusRow(x.id, x.guest, STAY_LABEL[x.status], toneOf(x.status), {
    sub: `Room ${room.name} · ${room.kind} · ${x.nights} night${x.nights === 1 ? "" : "s"}`,
    facts: [
      { label: "Arrives", value: dateOf(x.from) },
      { label: "Departs", value: dateOf(x.from + x.nights) },
    ],
    actions: stayActions(x.status),
    done: x.status === "out",
  });
}

/** Pure: the stays shown for a filter and a search, by arrival. */
export function stayRows(
  list: Booking[],
  filter: string,
  query: string,
): StatusRow[] {
  const q = query.trim().toLowerCase();
  return list
    .filter((x) => filter === "all" || x.status === filter)
    .filter(
      (x) => !q || x.guest.toLowerCase().includes(q) || x.room.includes(q),
    )
    .sort((a, c) => a.from - c.from || a.room.localeCompare(c.room))
    .map(stayRow);
}

// ---- cleaning -------------------------------------------------------------

export const CLEAN_FILTERS: [string, string][] = [
  ["all", "All"],
  ["todo", "To do"],
  ["done", "Done"],
];

/** Pure: the cleaning rows: a select for the staff, a button to finish. */
export function cleanRows(tasks: CleanTask[], filter: string): StatusRow[] {
  return tasks
    .filter((t) => filter === "all" || (filter === "done" ? t.done : !t.done))
    .map((t) =>
      statusRow(
        t.id,
        `Room ${t.room}`,
        t.done ? "Clean" : t.staff ? "Assigned" : "Dirty",
        t.done ? "success" : t.staff ? "info" : "warning",
        {
          sub: `${CLEAN_LABEL[t.kind]} · ${roomOf(t.room).kind}`,
          done: t.done,
          choose: t.done ? null : choice("Assign staff", STAFF, t.staff),
          actions: t.done
            ? []
            : [
                listAction("done", "Mark done", {
                  icon: "k-icon-check",
                  variant: "default",
                  disabled: !t.staff,
                }),
              ],
        },
      ),
    );
}

export const toClean = (tasks: CleanTask[]): number =>
  tasks.filter((t) => !t.done).length;

// ---- the booking form -------------------------------------------------------

export interface BookingDraft {
  guest: string;
  room: string;
  from: string;
  nights: string;
  status: string;
}

export function draftOf(x: Booking): BookingDraft {
  return {
    guest: x.guest,
    room: x.room,
    from: String(x.from),
    nights: String(x.nights),
    status: x.status,
  };
}

/** Pure: what is wrong with the form of a booking, by field. */
export function validateBooking(
  d: BookingDraft,
  list: Booking[],
  ignoreId: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.guest.trim()) errors.guest = "Enter the name of the guest.";
  const nights = positive(d.nights);
  if (nights === null || !Number.isInteger(nights) || nights > N) {
    errors.nights = `Nights: a whole number from 1 to ${N}.`;
  } else if (!isFree(list, d.room, Number(d.from), nights, ignoreId)) {
    errors.nights = `Room ${d.room} is taken in those days.`;
  }
  return errors;
}

/** Pure: the form of a booking as fields (days as a select) and its details. */
export function bookingFields(
  d: BookingDraft,
  errors: Record<string, string> = {},
): Field[] {
  const rooms: [string, string][] = ROOMS.map((r) => [
    r.id,
    `${r.name} · ${r.kind}`,
  ]);
  const days: [string, string][] = DAYS.map((x) => [
    String(x.i),
    `${x.dow} ${x.num} ${x.month}`,
  ]);
  const fields = [
    field("guest", "Guest", d.guest, { placeholder: "Full name" }),
    selectField("room", "Room", d.room, rooms),
    selectField("from", "Check-in", d.from, days),
    field("nights", "Nights", d.nights, { kind: "number" }),
    selectField("status", "Status", d.status, [
      ["expected", "Expected"],
      ["in", "Checked in"],
      ["out", "Checked out"],
    ]),
  ];
  return fields.map((f) => ({ ...f, error: errors[f.id] ?? "" }));
}

export function bookingDetails(d: BookingDraft): Detail[] {
  const nights = positive(d.nights) ?? 0;
  const from = Number(d.from);
  const rate = RATE[roomOf(d.room).kind] ?? 100;
  return [
    detail("Departs", nights > 0 ? dateOf(from + nights) : "-"),
    detail("Rate", `${money(rate, "$", 0)} a night`),
    detail("Total", nights > 0 ? money(rate * nights, "$", 0) : "-", "info"),
  ];
}

/** Pure: the list with the booking of the form saved (a new one when `id` is empty). */
export function saveBooking(
  list: Booking[],
  d: BookingDraft,
  id: string,
): Booking[] {
  const next: Booking = {
    id: id || nextBookingId(list),
    room: d.room,
    guest: d.guest.trim(),
    from: Number(d.from),
    nights: Number(d.nights),
    status: d.status as Stay,
    note: "",
  };
  return id ? list.map((x) => (x.id === id ? next : x)) : [...list, next];
}

/** Pure: the first room free for one night on a day, or "". */
export function firstFreeRoom(list: Booking[], day: number): string {
  return ROOMS.find((r) => isFree(list, r.id, day, 1))?.id ?? "";
}

// ---- the overview -----------------------------------------------------------

/** Pure: occupancy of each day as bars (green, amber, red by how full). */
export function occupancyBars(list: Booking[]): Column[] {
  return columns(
    DAYS.map((x) => {
      const pct = share(occupiedOn(list, x.i), ROOMS.length);
      return {
        id: String(x.i),
        label: String(x.num),
        value: pct,
        show: false,
        tone: loadTone(pct) as Tone,
      };
    }),
    100,
    "%",
  );
}

/** Pure: how full each floor is today. */
export function floorItems(list: Booking[], day: number): Item[] {
  return [1, 2].map((floor) => {
    const rooms = ROOMS.filter((r) => r.floor === floor);
    const busy = rooms.filter((r) =>
      list.some(
        (x) => x.room === r.id && x.from <= day && day < x.from + x.nights,
      ),
    ).length;
    return meterItem(`f${floor}`, `Floor ${floor}`, busy, rooms.length, {
      text: `${busy} of ${rooms.length} rooms`,
    });
  });
}

/** Pure: the four cards of the overview. */
export function overviewCards(
  list: Booking[],
  tasks: CleanTask[],
  day: number,
): Card[] {
  const busy = occupiedOn(list, day);
  const arriving = arrivalsOn(list, day);
  const leaving = departuresOn(list, day);
  return [
    card("occ", "Occupancy today", `${share(busy, ROOMS.length)}%`, {
      hint: `${busy} of ${ROOMS.length} rooms`,
      icon: "k-ai-bed",
      tone: "info",
      series: DAYS.slice(0, 8).map((x) => occupiedOn(list, x.i)),
    }),
    card("arr", "Arrivals today", String(arriving.length), {
      hint: `${arriving.filter((x) => x.status !== "expected").length} checked in`,
      icon: "k-ai-login",
      tone: "success",
    }),
    card("dep", "Departures today", String(leaving.length), {
      hint: `${leaving.filter((x) => x.status === "out").length} checked out`,
      icon: "k-ai-logout",
      tone: "warning",
    }),
    card("clean", "Rooms to clean", String(toClean(tasks)), {
      hint: `${tasks.filter((t) => !t.done && !t.staff).length} not assigned`,
      icon: "k-ai-sparkles",
      tone: "default",
    }),
  ];
}

export interface HotelViews {
  stats: Card[];
  occupancy: Column[];
  floors: Item[];
  arrivals: StatusRow[];
  departures: StatusRow[];
  grid: GridRow[];
  stayList: StatusRow[];
  cleanList: StatusRow[];
}

export interface HotelData {
  bookings: Booking[];
  cleaning: CleanTask[];
  stayFilter: string;
  stayQuery: string;
  cleanFilter: string;
}

/** Pure: everything the views show, worked out from the data. */
export function views(s: HotelData): HotelViews {
  return {
    stats: overviewCards(s.bookings, s.cleaning, TODAY),
    occupancy: occupancyBars(s.bookings),
    floors: floorItems(s.bookings, TODAY),
    arrivals: arrivalsOn(s.bookings, TODAY).map(stayRow),
    departures: departuresOn(s.bookings, TODAY).map(stayRow),
    grid: gridRows(ROOMS, s.bookings, N, MARKS),
    stayList: stayRows(s.bookings, s.stayFilter, s.stayQuery),
    cleanList: cleanRows(s.cleaning, s.cleanFilter),
  };
}

/** Pure: free nights from a day in a room, up to a week (the size of a new booking). */
export const defaultNights = (
  list: Booking[],
  room: string,
  day: number,
): number => Math.max(1, Math.min(2, freeNights(list, room, day, 2, N)));
