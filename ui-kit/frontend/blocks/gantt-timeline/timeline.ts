import type { Tone } from "../admin-shell/shell.ts";

export interface Milestone {
  /** Day index (0 = the first day of the timeline). */
  at: number;
  label: string;
  done: boolean;
}

export interface Span {
  id: string;
  name: string;
  sub: string;
  start: number;
  end: number;
  /** 0 to 100. */
  progress: number;
  tone: Tone;
  milestones: Milestone[];
}

export interface Mark {
  left: number;
  label: string;
  done: boolean;
}

export interface TimelineRow {
  id: string;
  name: string;
  sub: string;
  left: number;
  width: number;
  pct: number;
  tone: Tone;
  marks: Mark[];
}

export interface Week {
  label: string;
  left: number;
  width: number;
}

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

/** Pure: where a day falls on a scale of `days` days, in percent (kept inside 0..100). */
export const pctOf = (day: number, days: number): number =>
  Math.max(0, Math.min(100, (day / days) * 100));

/** Pure: the left edge and the width of a bar from day `start` to day `end` (inclusive). */
export function place(
  start: number,
  end: number,
  days: number,
): { left: number; width: number } {
  const from = Math.max(0, Math.min(start, days));
  const to = Math.max(from, Math.min(end + 1, days));
  return {
    left: pctOf(from, days),
    width: Math.max(1.2, pctOf(to - from, days)),
  };
}

/** Pure: the rows of the timeline. */
export function timelineRows(spans: Span[], days: number): TimelineRow[] {
  return spans.map((s) => ({
    id: s.id,
    name: s.name,
    sub: s.sub,
    ...place(s.start, s.end, days),
    pct: s.progress,
    tone: s.tone,
    marks: s.milestones.map((m) => ({
      left: pctOf(m.at + 0.5, days),
      label: m.label,
      done: m.done,
    })),
  }));
}

/** Pure: a heading for every week (`Nov 2`) of a scale that starts on a given date. */
export function weeksFrom(
  year: number,
  month: number,
  day: number,
  days: number,
  every = 1,
): Week[] {
  const weeks: Week[] = [];
  for (let d = 0; d < days; d += 7) {
    const date = new Date(Date.UTC(year, month - 1, day + d));
    weeks.push({
      label:
        (d / 7) % every === 0
          ? `${MONTH[date.getUTCMonth()]} ${date.getUTCDate()}`
          : "",
      left: pctOf(d, days),
      width: pctOf(Math.min(7, days - d), days),
    });
  }
  return weeks;
}

/** Pure: a date as `Nov 12`, for a day index. */
export function dateLabel(
  year: number,
  month: number,
  day: number,
  i: number,
): string {
  const date = new Date(Date.UTC(year, month - 1, day + i));
  return `${MONTH[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
