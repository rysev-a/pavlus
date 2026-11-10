import {
  type Cell,
  isoOf,
  longDate,
  type Month,
  monthCells,
  titleOf,
} from "./calendar.ts";

/**
 * The pure part of the range calendar: picking a start and an end, which
 * cells are inside, the hover preview, and the presets. Dates are ISO strings
 * (`2026-11-03`), compared as text; there is no clock: "today" is a value.
 */
export interface Range {
  /** `""` while nothing is picked. */
  start: string;
  /** `""` while only the start is picked. */
  end: string;
}

export const emptyRange: Range = { start: "", end: "" };

/** A click on `iso`: the first click starts a range, the second ends it (in either order). */
export function pick(range: Range, iso: string): Range {
  if (!range.start || range.end) return { start: iso, end: "" };
  return iso < range.start
    ? { start: iso, end: range.start }
    : { start: range.start, end: iso };
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

/** How many days a range covers, both ends included (`0` while it is not complete). */
export function daysIn(range: Range): number {
  if (!range.start || !range.end) return 0;
  const [a, b] = [range.start, range.end].map((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000) + 1;
}

export interface Preset {
  id: string;
  label: string;
  range: Range;
}

const lastDay = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** The quick ranges, relative to `today`. */
export function presetsOf(today: string): Preset[] {
  const [y, m] = today.split("-").map(Number);
  const month = m - 1;
  const prev = month === 0 ? { y: y - 1, m: 11 } : { y, m: month - 1 };
  return [
    { id: "today", label: "Today", range: { start: today, end: today } },
    {
      id: "7",
      label: "Last 7 days",
      range: { start: addDays(today, -6), end: today },
    },
    {
      id: "30",
      label: "Last 30 days",
      range: { start: addDays(today, -29), end: today },
    },
    {
      id: "month",
      label: "This month",
      range: {
        start: isoOf(y, month, 1),
        end: isoOf(y, month, lastDay(y, month)),
      },
    },
    {
      id: "last-month",
      label: "Last month",
      range: {
        start: isoOf(prev.y, prev.m, 1),
        end: isoOf(prev.y, prev.m, lastDay(prev.y, prev.m)),
      },
    },
  ];
}

export const sameRange = (a: Range, b: Range): boolean =>
  a.start === b.start && a.end === b.end;

/** `Nov 10 – Nov 17, 2026 (8 days)`, or what is still missing. */
export function describe(range: Range): string {
  if (!range.start) return "Pick a start date";
  if (!range.end) return `${longDate(range.start)} – pick an end date`;
  const n = daysIn(range);
  return range.start === range.end
    ? longDate(range.start)
    : `${longDate(range.start)} – ${longDate(range.end)} (${n} days)`;
}

/**
 * The classes of one day button. With a complete range: the ends are selected
 * and rounded on the outside, the days between are tinted. With a start only,
 * the days from the start to the hovered day are a lighter preview.
 */
export function cellClass(
  iso: string,
  range: Range,
  hover: string,
  today: string,
): string {
  const c = ["ui-calendar-day"];
  const { start, end } = range;
  if (start && end) {
    if (iso === start && iso === end) c.push("ui-calendar-day-selected");
    else if (iso === start)
      c.push("ui-calendar-day-selected", "ui-calendar-day-range-start");
    else if (iso === end)
      c.push("ui-calendar-day-selected", "ui-calendar-day-range-end");
    else if (iso > start && iso < end) c.push("ui-calendar-day-in-range");
  } else if (start) {
    if (iso === start) c.push("ui-calendar-day-selected");
    else if (hover && hover !== start) {
      const [lo, hi] = hover < start ? [hover, start] : [start, hover];
      if (iso === hover) c.push("ui-calendar-day-preview-edge");
      else if (iso > lo && iso < hi) c.push("ui-calendar-day-preview");
    }
  }
  if (iso === today) c.push("k-today");
  return c.join(" ");
}

export interface RangeCell extends Cell {
  cls: string;
}

export interface MonthView {
  title: string;
  cells: RangeCell[];
}

export function monthView(
  month: Month,
  range: Range,
  hover: string,
  today: string,
): MonthView {
  return {
    title: titleOf(month),
    cells: monthCells(month).map((c) => ({
      ...c,
      cls: c.iso ? cellClass(c.iso, range, hover, today) : "",
    })),
  };
}
