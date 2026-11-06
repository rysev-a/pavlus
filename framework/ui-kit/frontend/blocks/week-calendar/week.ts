import { clockOf, DAY_NAMES, rangeText, weekdayOf, weekOf } from "./dates.ts";

/** The tones a category can have: chart colours and two brand colours. */
export const TONES = ["c1", "c2", "c3", "c4", "c5", "pr", "de"] as const;
export type CatTone = (typeof TONES)[number];

/** What the calendar draws: a block of time on a day. */
export interface CalItem {
  id: string;
  title: string;
  tone: string;
  /** `2026-11-03` */
  day: string;
  /** Minutes from midnight. */
  start: number;
  /** Minutes. */
  dur: number;
  sub: string;
}

export interface Placed {
  id: string;
  title: string;
  tone: string;
  time: string;
  /** Percent of the day column. */
  top: number;
  height: number;
  left: number;
  width: number;
  /** Too low to print the time under the title. */
  short: boolean;
  sub: string;
}

export interface Cell {
  key: string;
  hour: number;
  label: string;
}

export interface DayColumn {
  iso: string;
  name: string;
  num: number;
  today: boolean;
  items: Placed[];
  cells: Cell[];
  /** Percent from the top for the "now" line, or -1. */
  nowTop: number;
}

export interface HourMark {
  label: string;
  top: number;
}

export interface CalendarView {
  days: DayColumn[];
  hours: HourMark[];
  rows: number;
}

const pct = (n: number): number => Math.round(n * 100) / 100;

interface Clipped {
  it: CalItem;
  start: number;
  end: number;
}

/**
 * Pure: the blocks of one day placed in the grid. Blocks that overlap in time
 * are laid side by side: each cluster of overlapping blocks gets as many
 * columns as it needs. Blocks outside `from`..`to` (hours) are clipped or
 * dropped.
 */
export function layoutDay(
  items: CalItem[],
  from: number,
  to: number,
): Placed[] {
  const lo = from * 60;
  const hi = to * 60;
  const span = hi - lo;
  const clipped: Clipped[] = items
    .map((it) => ({
      it,
      start: Math.max(lo, it.start),
      end: Math.min(hi, it.start + it.dur),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: Placed[] = [];
  let cluster: { c: Clipped; col: number }[] = [];
  let ends: number[] = [];
  let clusterEnd = -1;
  const flush = (): void => {
    const cols = Math.max(1, ends.length);
    for (const { c, col } of cluster) {
      out.push({
        id: c.it.id,
        title: c.it.title,
        tone: c.it.tone,
        time: rangeText(c.it.start, c.it.dur),
        top: pct(((c.start - lo) / span) * 100),
        height: pct(((c.end - c.start) / span) * 100),
        left: pct((col / cols) * 100),
        width: pct(100 / cols),
        short: c.end - c.start < 50 || cols > 2,
        sub: c.it.sub,
      });
    }
    cluster = [];
    ends = [];
  };
  for (const c of clipped) {
    if (c.start >= clusterEnd && cluster.length > 0) flush();
    let col = ends.findIndex((e) => e <= c.start);
    if (col < 0) {
      col = ends.length;
      ends.push(c.end);
    } else {
      ends[col] = c.end;
    }
    cluster.push({ c, col });
    clusterEnd = Math.max(clusterEnd, c.end);
  }
  flush();
  return out;
}

/** `7 AM`, `12 PM` ... */
export function hourLabel(h: number): string {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/** One mark per hour except the first. */
export function hoursOf(from: number, to: number): HourMark[] {
  const marks: HourMark[] = [];
  for (let h = from + 1; h < to; h++) {
    marks.push({
      label: hourLabel(h),
      top: pct(((h - from) / (to - from)) * 100),
    });
  }
  return marks;
}

/**
 * Pure: the week that holds `anyDay`: seven columns with their blocks placed,
 * the hour marks, a click cell for every hour, and the now line on today.
 */
export function weekView(
  items: CalItem[],
  anyDay: string,
  today: string,
  nowMin: number,
  from = 6,
  to = 22,
): CalendarView {
  const rows = to - from;
  const days = weekOf(anyDay).map((iso, i): DayColumn => {
    const cells: Cell[] = [];
    for (let h = from; h < to; h++) {
      cells.push({ key: `${iso}-${h}`, hour: h, label: clockOf(h * 60) });
    }
    const inRange = nowMin >= from * 60 && nowMin < to * 60;
    return {
      iso,
      name: DAY_NAMES[i],
      num: Number(iso.slice(8)),
      today: iso === today,
      items: layoutDay(
        items.filter((x) => x.day === iso),
        from,
        to,
      ),
      cells,
      nowTop:
        iso === today && inRange
          ? pct(((nowMin - from * 60) / (rows * 60)) * 100)
          : -1,
    };
  });
  return { days, hours: hoursOf(from, to), rows };
}

export type Repeat = "none" | "daily" | "weekdays" | "weekly";

export const REPEATS: [Repeat, string][] = [
  ["none", "Does not repeat"],
  ["daily", "Every day"],
  ["weekdays", "Every weekday"],
  ["weekly", "Every week"],
];

/** Pure: does a block that starts on `origin` with this repeat fall on `day`? */
export function occursOn(origin: string, repeat: Repeat, day: string): boolean {
  if (day < origin) return false;
  if (day === origin) return true;
  switch (repeat) {
    case "daily":
      return true;
    case "weekdays":
      return weekdayOf(day) < 5;
    case "weekly":
      return weekdayOf(day) === weekdayOf(origin);
    default:
      return false;
  }
}

/** A block of time with a repeat rule, as the planner stores it. */
export interface Repeating extends CalItem {
  repeat: Repeat;
}

/** Pure: the repeating blocks as plain calendar items on the given days. */
export function expand(items: Repeating[], days: string[]): CalItem[] {
  const out: CalItem[] = [];
  for (const day of days) {
    for (const it of items) {
      if (occursOn(it.day, it.repeat, day)) {
        out.push({
          id: it.id,
          title: it.title,
          tone: it.tone,
          day,
          start: it.start,
          dur: it.dur,
          sub: it.sub,
        });
      }
    }
  }
  return out;
}
