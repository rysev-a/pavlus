import type { Tone } from "../admin-shell/shell.ts";
import { daysBetween, monthTitle, toIso, weekdayOf } from "./dates.ts";

export interface CalendarEvent {
  id: string;
  /** ISO day. */
  date: string;
  label: string;
  tone: Tone;
}

export interface Cell {
  id: string;
  day: number;
  /** A day of the neighbouring months. */
  muted: boolean;
  today: boolean;
  selected: boolean;
  events: CalendarEvent[];
  /** How many events do not fit the cell. */
  more: number;
}

export interface MonthView {
  title: string;
  weekdays: string[];
  cells: Cell[];
}

export const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Pure: the cells of a month grid, weeks starting on Monday. Whole weeks only,
 * so 28 to 42 cells. Each cell keeps up to `limit` events and counts the rest.
 */
export function monthCells(
  y: number,
  m: number,
  events: CalendarEvent[],
  today: string,
  selected = "",
  limit = 2,
): MonthView {
  const first = toIso(y, m, 1);
  const lead = weekdayOf(first);
  const length = daysBetween(first, toIso(y, m + 1, 1));
  const total = Math.ceil((lead + length) / 7) * 7;
  const cells: Cell[] = [];
  for (let i = 0; i < total; i++) {
    const iso = toIso(y, m, 1 - lead + i);
    const day = Number(iso.slice(8));
    const mine = events.filter((e) => e.date === iso);
    cells.push({
      id: iso,
      day,
      muted: iso.slice(0, 7) !== first.slice(0, 7),
      today: iso === today,
      selected: iso === selected,
      events: mine.slice(0, limit),
      more: Math.max(0, mine.length - limit),
    });
  }
  return { title: monthTitle(y, m), weekdays: WEEKDAY_NAMES, cells };
}
