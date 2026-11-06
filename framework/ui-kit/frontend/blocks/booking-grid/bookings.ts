import type { Tone } from "../admin-shell/shell.ts";

/** `expected` (not here yet), `in` (in the house), `out` (has left). */
export type Stay = "expected" | "in" | "out";

export interface Booking {
  id: string;
  room: string;
  guest: string;
  /** Day index of the first night (0 = the first day of the grid; may be negative). */
  from: number;
  nights: number;
  status: Stay;
  note: string;
}

export interface Room {
  id: string;
  name: string;
  kind: string;
  floor: number;
}

export interface Day {
  i: number;
  /** `Mon` */
  dow: string;
  /** `3` */
  num: number;
  /** `Nov` */
  month: string;
  weekend: boolean;
  today: boolean;
}

export interface Seg {
  key: string;
  kind: "free" | "booking";
  /** Day index where it starts. */
  day: number;
  span: number;
  /** A booking's id (empty for a free cell). */
  id: string;
  label: string;
  sub: string;
  tone: Tone;
  cutLeft: boolean;
  cutRight: boolean;
  /** A free day: `today`, `weekend` or empty. */
  mark: string;
}

export interface GridRow {
  id: string;
  name: string;
  kind: string;
  segs: Seg[];
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
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

/** Pure: `n` days from a start date (month 1-12); `today` is a day index. */
export function daysFrom(
  year: number,
  month: number,
  day: number,
  n: number,
  today: number,
): Day[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, day + i));
    const wd = d.getUTCDay();
    return {
      i,
      dow: DOW[wd],
      num: d.getUTCDate(),
      month: MONTH[d.getUTCMonth()],
      weekend: wd === 0 || wd === 6,
      today: i === today,
    };
  });
}

/** Pure: the mark of every day (`today`, `weekend` or empty). */
export const marksOf = (days: Day[]): string[] =>
  days.map((d) => (d.today ? "today" : d.weekend ? "weekend" : ""));

/** Pure: the label of a day index (`Tue 3 Nov`). */
export function dayLabel(days: Day[], i: number): string {
  const d = days.find((x) => x.i === i);
  return d ? `${d.dow} ${d.num} ${d.month}` : `day ${i}`;
}

export const toneOf = (status: Stay): Tone =>
  status === "in" ? "success" : status === "out" ? "muted" : "info";

export const STAY_LABEL: Record<Stay, string> = {
  expected: "Expected",
  in: "Checked in",
  out: "Checked out",
};

/** Pure: do two stays in one room overlap? The day of leaving is free. */
export const overlaps = (
  a: { from: number; nights: number },
  b: { from: number; nights: number },
): boolean => a.from < b.from + b.nights && b.from < a.from + a.nights;

/** Pure: can `nights` nights from `from` be booked in `room` (ignoring one booking)? */
export function isFree(
  bookings: Booking[],
  room: string,
  from: number,
  nights: number,
  ignoreId = "",
): boolean {
  return !bookings.some(
    (b) =>
      b.room === room && b.id !== ignoreId && overlaps(b, { from, nights }),
  );
}

/** Pure: how many nights are free from `from`, up to `limit` (0 when taken). */
export function freeNights(
  bookings: Booking[],
  room: string,
  from: number,
  limit: number,
  nDays: number,
  ignoreId = "",
): number {
  let n = 0;
  while (
    n < limit &&
    from + n < nDays &&
    isFree(bookings, room, from + n, 1, ignoreId)
  ) {
    n += 1;
  }
  return n;
}

/** Pure: the next free id (`b1`, `b2`...). */
export function nextBookingId(bookings: Booking[]): string {
  const max = bookings.reduce(
    (m, b) => Math.max(m, Number(b.id.replace(/\D/g, "")) || 0),
    0,
  );
  return `b${max + 1}`;
}

/**
 * Pure: one room's row as cells: free days of one cell each and a bar for each
 * booking that spans its nights. Bookings are clipped to `0..nDays`.
 */
export function layoutRoom(
  room: string,
  bookings: Booking[],
  nDays: number,
  marks: string[] = [],
): Seg[] {
  const mine = bookings
    .filter((b) => b.room === room && b.from < nDays && b.from + b.nights > 0)
    .sort((a, b) => a.from - b.from);
  const segs: Seg[] = [];
  let cursor = 0;
  const free = (to: number) => {
    for (let d = cursor; d < to; d++) {
      segs.push({
        key: `${room}:f${d}`,
        kind: "free",
        day: d,
        span: 1,
        id: "",
        label: "",
        sub: "",
        tone: "default",
        cutLeft: false,
        cutRight: false,
        mark: marks[d] ?? "",
      });
    }
  };
  for (const b of mine) {
    const start = Math.max(b.from, 0, cursor);
    const end = Math.min(b.from + b.nights, nDays);
    if (end <= start) continue;
    free(start);
    segs.push({
      key: `${room}:${b.id}`,
      kind: "booking",
      day: start,
      span: end - start,
      id: b.id,
      label: b.guest,
      sub: `${b.nights} night${b.nights === 1 ? "" : "s"}`,
      tone: toneOf(b.status),
      cutLeft: b.from < 0,
      cutRight: b.from + b.nights > nDays,
      mark: "",
    });
    cursor = end;
  }
  free(nDays);
  return segs;
}

/** Pure: every room's row. */
export function gridRows(
  rooms: Room[],
  bookings: Booking[],
  nDays: number,
  marks: string[] = [],
): GridRow[] {
  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    segs: layoutRoom(r.id, bookings, nDays, marks),
  }));
}

/** Pure: how many rooms are taken on a night. */
export function occupiedOn(bookings: Booking[], day: number): number {
  return new Set(
    bookings
      .filter((b) => b.from <= day && day < b.from + b.nights)
      .map((b) => b.room),
  ).size;
}

/** Pure: occupancy of a night as a percentage of the rooms. */
export function occupancy(
  bookings: Booking[],
  rooms: number,
  day: number,
): number {
  return rooms <= 0 ? 0 : Math.round((occupiedOn(bookings, day) / rooms) * 100);
}
