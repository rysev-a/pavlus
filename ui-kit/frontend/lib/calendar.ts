/**
 * The pure part of the calendar and the date picker: the grid of a month.
 * No `Date.now()`: the demo starts on a fixed month and the visitor moves.
 */
export interface Cell {
  /** Unique in the grid: the ISO date, or `blank-<i>` before the 1st. */
  key: string;
  /** Day of the month, `0` for the blank cells before the 1st. */
  day: number;
  /** `YYYY-MM-DD`, empty for a blank cell. */
  iso: string;
}

export interface Month {
  year: number;
  /** 0 = January. */
  month: number;
}

export const MONTHS = [
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

export const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const pad = (n: number): string => String(n).padStart(2, "0");

export const isoOf = (year: number, month: number, day: number): string =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

/** The cells of a month, weeks starting on Monday. */
export function monthCells({ year, month }: Month): Cell[] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Cell[] = [];
  for (let i = 0; i < lead; i++) {
    cells.push({ key: `blank-${i}`, day: 0, iso: "" });
  }
  for (let day = 1; day <= days; day++) {
    const iso = isoOf(year, month, day);
    cells.push({ key: iso, day, iso });
  }
  return cells;
}

/** The month `by` months away (negative: back), the year carried over. */
export function shiftMonth({ year, month }: Month, by: number): Month {
  const index = year * 12 + month + by;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

export const titleOf = ({ year, month }: Month): string =>
  `${MONTHS[month]} ${year}`;

/** `2026-11-03` → `November 3, 2026`. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
