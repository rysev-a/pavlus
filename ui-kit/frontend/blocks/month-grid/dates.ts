/** Calendar days as ISO text (`2026-11-03`), worked out without a clock. */
export const TODAY = "2026-11-03";

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Pure: `2026-11-03` as numbers (month 1..12), or null when it is not a date. */
export function parseIso(
  iso: string,
): { y: number; m: number; d: number } | null {
  const hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!hit) return null;
  const y = Number(hit[1]);
  const m = Number(hit[2]);
  const d = Number(hit[3]);
  const back = new Date(Date.UTC(y, m - 1, d));
  const real =
    back.getUTCFullYear() === y &&
    back.getUTCMonth() === m - 1 &&
    back.getUTCDate() === d;
  return real ? { y, m, d } : null;
}

export const isIso = (iso: string): boolean => parseIso(iso) !== null;

export const toIso = (y: number, m: number, d: number): string => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

/** Pure: a day some days later (or earlier). */
export function addDays(iso: string, days: number): string {
  const p = parseIso(iso);
  return p ? toIso(p.y, p.m, p.d + days) : iso;
}

/** Pure: whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  const x = parseIso(a);
  const y = parseIso(b);
  if (!x || !y) return 0;
  return Math.round(
    (Date.UTC(y.y, y.m - 1, y.d) - Date.UTC(x.y, x.m - 1, x.d)) / 86400000,
  );
}

/** Pure: 0 for Monday ... 6 for Sunday. */
export function weekdayOf(iso: string): number {
  const p = parseIso(iso);
  if (!p) return 0;
  return (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
}

/** `2026-11-12` becomes `Nov 12`. */
export function dayLabel(iso: string): string {
  const p = parseIso(iso);
  return p ? `${MONTH_NAMES[p.m - 1].slice(0, 3)} ${p.d}` : iso;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** `2026-11-12` becomes `Thu, Nov 12`. */
export function dayName(iso: string): string {
  return `${WEEKDAYS[weekdayOf(iso)]}, ${dayLabel(iso)}`;
}

export const monthTitle = (y: number, m: number): string =>
  `${MONTH_NAMES[(((m - 1) % 12) + 12) % 12]} ${y}`;

/** Pure: the month before or after (m is 1..12). */
export function shiftMonth(
  y: number,
  m: number,
  by: number,
): { y: number; m: number } {
  const index = y * 12 + (m - 1) + by;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}
