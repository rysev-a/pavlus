/**
 * Pure date helpers for the planner and HR blocks. A day is an ISO string
 * (`2026-11-03`), a time of day is a number of minutes from midnight.
 * Nothing reads the clock: "today" always comes from the state.
 */
export const TODAY = "2026-11-03";

const MS_DAY = 86_400_000;
const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_NAMES = [
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

/** `2026-11-03` as a day number (NaN when it is not a date). */
export function dayOf(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return Number.NaN;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const back = new Date(ms);
  if (
    back.getUTCMonth() !== Number(m[2]) - 1 ||
    back.getUTCDate() !== Number(m[3])
  ) {
    return Number.NaN;
  }
  return Math.round(ms / MS_DAY);
}

export function isoOfDay(day: number): string {
  const d = new Date(day * MS_DAY);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const addDays = (iso: string, n: number): string =>
  isoOfDay(dayOf(iso) + n);

/** Days from `a` to `b` (negative when `b` is earlier). */
export const daysBetween = (a: string, b: string): number =>
  dayOf(b) - dayOf(a);

/** 0 = Monday ... 6 = Sunday. */
export function weekdayOf(iso: string): number {
  return (((dayOf(iso) + 3) % 7) + 7) % 7;
}

export const weekStart = (iso: string): string => addDays(iso, -weekdayOf(iso));

export function weekOf(iso: string): string[] {
  const start = weekStart(iso);
  return DAY_NAMES.map((_, i) => addDays(start, i));
}

/** `Nov 3` */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1] ?? "?"} ${d}`;
}

/** `Tue, Nov 3` */
export const longDay = (iso: string): string =>
  `${DAY_NAMES[weekdayOf(iso)]}, ${shortDate(iso)}`;

/** `Nov 2 - 8` or `Oct 26 - Nov 1` for the week that holds `iso`. */
export function weekTitle(iso: string): string {
  const days = weekOf(iso);
  const a = shortDate(days[0]);
  const b = shortDate(days[6]);
  const same = days[0].slice(5, 7) === days[6].slice(5, 7);
  return same ? `${a} - ${b.split(" ")[1]}` : `${a} - ${b}`;
}

/** 570 becomes `09:30`. */
export function clockOf(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}

/** `09:30` becomes 570 (NaN when it is not a time). */
export function minutesOf(text: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return Number.NaN;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h > 23 || mm > 59 ? Number.NaN : h * 60 + mm;
}

/** 90 becomes `1h 30m`, 45 `45m`, 120 `2h`. */
export function durationText(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** `09:30 - 11:00` */
export const rangeText = (start: number, dur: number): string =>
  `${clockOf(start)} - ${clockOf(start + dur)}`;
