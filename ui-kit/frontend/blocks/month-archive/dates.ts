/**
 * Pure date helpers on ISO strings (`2026-11-03`), shared by the diary, habit
 * and freight blocks. No `Date.now()`: "today" is always passed in.
 */
import { MONTHS } from "../../lib/calendar.ts";

export const DAY_MS = 86_400_000;

const parts = (iso: string): [number, number, number] => {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
};

/** Days since 1970-01-01. */
export function dayNumber(iso: string): number {
  const [y, m, d] = parts(iso);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function isoFromDay(n: number): string {
  const d = new Date(n * DAY_MS);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const addDays = (iso: string, by: number): string =>
  isoFromDay(dayNumber(iso) + by);

/** Days from `a` to `b` (negative when `b` is earlier). */
export const daysBetween = (a: string, b: string): number =>
  dayNumber(b) - dayNumber(a);

/** Monday is 0, Sunday is 6. */
export const dowOf = (iso: string): number => (dayNumber(iso) + 3) % 7;

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const weekdayOf = (iso: string): string => WEEKDAY_NAMES[dowOf(iso)];

/** `2026-11-03` becomes `Nov 3`. */
export function shortDate(iso: string): string {
  const [, m, d] = parts(iso);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

/** `2026-11-03` becomes `Tuesday, November 3, 2026`. */
export function longDate(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${weekdayOf(iso)}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

/** `today`, `yesterday`, `3 days ago`, `2 weeks ago`, `3 months ago`. */
export function relativeDay(iso: string, today: string): string {
  const ago = daysBetween(iso, today);
  if (ago <= 0) return ago === 0 ? "today" : `in ${-ago} days`;
  if (ago === 1) return "yesterday";
  if (ago < 14) return `${ago} days ago`;
  if (ago < 60) return `${Math.floor(ago / 7)} weeks ago`;
  return `${Math.floor(ago / 30)} months ago`;
}

/** `2026-11` for a date. */
export const monthKey = (iso: string): string => iso.slice(0, 7);
