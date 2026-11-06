import {
  type Month,
  monthCells,
  titleOf,
  WEEKDAYS,
} from "../../lib/calendar.ts";
import { monthKey } from "./dates.ts";

export interface ArchiveCell {
  key: string;
  day: number;
  iso: string;
  blank: boolean;
  count: number;
  /** One item per entry of the day, at most 3: the dots under the number. */
  dots: number[];
  today: boolean;
  selected: boolean;
}

export interface ArchiveView {
  title: string;
  weekdays: string[];
  cells: ArchiveCell[];
  total: number;
  totalText: string;
}

/** Pure: how many entries each day has. */
export function countByDay(dates: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const iso of dates) counts[iso] = (counts[iso] ?? 0) + 1;
  return counts;
}

/** Pure: the entries inside one month. */
export function monthTotal(counts: Record<string, number>, m: Month): number {
  const key = `${m.year}-${String(m.month + 1).padStart(2, "0")}`;
  return Object.entries(counts)
    .filter(([iso]) => monthKey(iso) === key)
    .reduce((sum, [, n]) => sum + n, 0);
}

/** Pure: the grid of a month with a dot for every entry (at most three). */
export function archiveCells(
  m: Month,
  counts: Record<string, number>,
  selected: string,
  today: string,
): ArchiveCell[] {
  return monthCells(m).map((c) => {
    const count = c.iso ? (counts[c.iso] ?? 0) : 0;
    return {
      key: c.key,
      day: c.day,
      iso: c.iso,
      blank: c.day === 0,
      count,
      dots: Array.from({ length: Math.min(count, 3) }, (_, i) => i),
      today: c.iso === today,
      selected: c.iso !== "" && c.iso === selected,
    };
  });
}

export function archiveView(
  m: Month,
  counts: Record<string, number>,
  selected: string,
  today: string,
): ArchiveView {
  const total = monthTotal(counts, m);
  return {
    title: titleOf(m),
    weekdays: WEEKDAYS,
    cells: archiveCells(m, counts, selected, today),
    total,
    totalText: `${total} ${total === 1 ? "entry" : "entries"}`,
  };
}
