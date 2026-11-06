import type { Tone } from "../admin-shell/shell.ts";
import {
  type Month,
  monthCells,
  titleOf,
  WEEKDAYS,
} from "../../lib/calendar.ts";
import {
  addDays,
  dowOf,
  shortDate,
  weekdayOf,
} from "../month-archive/dates.ts";

/** Which days of the week a habit is due: its frequency. */
export type Freq = "daily" | "weekdays" | "weekends" | "mwf";

/** Days are numbered Monday 0 to Sunday 6. */
export const FREQS: { id: Freq; label: string; days: number[] }[] = [
  { id: "daily", label: "Every day", days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "weekdays", label: "Weekdays", days: [0, 1, 2, 3, 4] },
  { id: "weekends", label: "Weekends", days: [5, 6] },
  { id: "mwf", label: "Mon, Wed, Fri", days: [0, 2, 4] },
];

export interface Habit {
  id: string;
  name: string;
  /** An emoji. */
  icon: string;
  tone: Tone;
  freq: Freq;
}

/** The days each habit was done: habit id to ISO dates. */
export type Checks = Record<string, string[]>;

export const freqLabel = (freq: Freq): string =>
  FREQS.find((f) => f.id === freq)?.label ?? "";

/** Pure: is a habit due on a date? */
export function isDue(freq: Freq, iso: string): boolean {
  const days = FREQS.find((f) => f.id === freq)?.days ?? [];
  return days.includes(dowOf(iso));
}

export const isDone = (checks: Checks, id: string, iso: string): boolean =>
  (checks[id] ?? []).includes(iso);

/** Pure: the checks with one day turned on or off. */
export function toggleCheck(checks: Checks, id: string, iso: string): Checks {
  const days = checks[id] ?? [];
  const next = days.includes(iso)
    ? days.filter((d) => d !== iso)
    : [...days, iso].sort();
  return { ...checks, [id]: next };
}

/**
 * Pure: the streak, counted in days the habit was due and done, going back
 * from today. Days it was not due do not break it; today does not break it
 * while it is still open.
 */
export function currentStreak(
  dates: string[],
  freq: Freq,
  today: string,
): number {
  const done = new Set(dates);
  let streak = 0;
  for (let i = 0; i < 800; i++) {
    const iso = addDays(today, -i);
    if (done.has(iso)) {
      if (isDue(freq, iso)) streak += 1;
    } else if (isDue(freq, iso) && i > 0) {
      break;
    }
  }
  return streak;
}

/** Pure: the longest streak ever (from the first check until today). */
export function bestStreak(dates: string[], freq: Freq, today: string): number {
  if (dates.length === 0) return 0;
  const done = new Set(dates);
  const first = [...dates].sort()[0];
  let best = 0;
  let run = 0;
  for (let iso = first; iso <= today; iso = addDays(iso, 1)) {
    if (!isDue(freq, iso)) continue;
    run = done.has(iso) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Pure: the share (percent) of due days done between two dates, both included. */
export function completionRate(
  dates: string[],
  freq: Freq,
  from: string,
  to: string,
): number {
  const done = new Set(dates);
  let due = 0;
  let hit = 0;
  for (let iso = from; iso <= to; iso = addDays(iso, 1)) {
    if (!isDue(freq, iso)) continue;
    due += 1;
    if (done.has(iso)) hit += 1;
  }
  return due === 0 ? 0 : Math.round((hit / due) * 100);
}

/** Pure: the Monday of the week of a date. */
export const weekStart = (iso: string): string => addDays(iso, -dowOf(iso));

export type CellState = "done" | "missed" | "today" | "off" | "future";

export interface GridCell {
  key: string;
  iso: string;
  state: CellState;
  label: string;
}

export interface GridDay {
  iso: string;
  name: string;
  num: number;
  today: boolean;
}

export interface GridRow {
  id: string;
  name: string;
  icon: string;
  tone: Tone;
  freqText: string;
  streak: number;
  streakText: string;
  weekText: string;
  cells: GridCell[];
}

/** Pure: the state of one cell of the grid. */
export function cellState(
  freq: Freq,
  done: boolean,
  iso: string,
  today: string,
): CellState {
  if (iso > today) return "future";
  if (done) return "done";
  if (!isDue(freq, iso)) return "off";
  return iso === today ? "today" : "missed";
}

/** Pure: the seven days of the week of `today`, Monday first. */
export function weekDays(today: string): GridDay[] {
  const start = weekStart(today);
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(start, i);
    return {
      iso,
      name: weekdayOf(iso).slice(0, 3),
      num: Number(iso.slice(8)),
      today: iso === today,
    };
  });
}

/** Pure: a row per habit with its week of cells and its streak. */
export function weekRows(
  habits: Habit[],
  checks: Checks,
  today: string,
): GridRow[] {
  const days = weekDays(today);
  return habits.map((h) => {
    const cells = days.map((d) => {
      const done = isDone(checks, h.id, d.iso);
      const state = cellState(h.freq, done, d.iso, today);
      const word =
        state === "done"
          ? "done"
          : state === "missed"
            ? "missed"
            : state === "today"
              ? "to do today"
              : state === "off"
                ? "rest day"
                : "later";
      return {
        key: `${h.id}-${d.iso}`,
        iso: d.iso,
        state,
        label: `${h.name}, ${d.name} ${shortDate(d.iso)}: ${word}`,
      };
    });
    const due = days.filter(
      (d) => isDue(h.freq, d.iso) && d.iso <= today,
    ).length;
    const hit = cells.filter(
      (c) => c.state === "done" && isDue(h.freq, c.iso),
    ).length;
    const streak = currentStreak(checks[h.id] ?? [], h.freq, today);
    return {
      id: h.id,
      name: h.name,
      icon: h.icon,
      tone: h.tone,
      freqText: freqLabel(h.freq),
      streak,
      streakText: streak > 0 ? `🔥 ${streak}` : "–",
      weekText: `${hit}/${due} this week`,
      cells,
    };
  });
}

// ---- the monthly heatmap ----------------------------------------------------

export interface HeatCell {
  key: string;
  day: number;
  blank: boolean;
  future: boolean;
  off: boolean;
  /** 0 (nothing done) to 4 (everything due was done). */
  level: number;
  tip: string;
}

export interface HeatWeek {
  key: string;
  cells: HeatCell[];
}

/** Pure: 0..4 from how many habits were done out of how many were due. */
export function heatLevel(done: number, due: number): number {
  if (done <= 0) return 0;
  const ratio = Math.min(1, done / Math.max(1, due));
  if (ratio >= 1) return 4;
  if (ratio >= 0.67) return 3;
  if (ratio >= 0.34) return 2;
  return 1;
}

/** Pure: a month as weeks of boxes, each as dark as the day was productive. */
export function heatWeeks(
  habits: Habit[],
  checks: Checks,
  month: Month,
  today: string,
): HeatWeek[] {
  const cells: HeatCell[] = monthCells(month).map((c) => {
    if (!c.iso) {
      return {
        key: c.key,
        day: 0,
        blank: true,
        future: false,
        off: false,
        level: 0,
        tip: "",
      };
    }
    const due = habits.filter((h) => isDue(h.freq, c.iso)).length;
    const done = habits.filter((h) => isDone(checks, h.id, c.iso)).length;
    const future = c.iso > today;
    return {
      key: c.key,
      day: c.day,
      blank: false,
      future,
      off: !future && due === 0 && done === 0,
      level: future ? 0 : heatLevel(done, due),
      tip: future
        ? shortDate(c.iso)
        : `${shortDate(c.iso)}: ${done} of ${due} done`,
    };
  });
  while (cells.length % 7 !== 0) {
    cells.push({
      key: `tail-${cells.length}`,
      day: 0,
      blank: true,
      future: false,
      off: false,
      level: 0,
      tip: "",
    });
  }
  const weeks: HeatWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push({ key: `w${i / 7}`, cells: cells.slice(i, i + 7) });
  }
  return weeks;
}

export const heatTitle = (m: Month): string => titleOf(m);
export const HEAT_WEEKDAYS = WEEKDAYS;

// ---- numbers for the stats ----------------------------------------------------

export interface HabitStats {
  /** The longest streak of any habit, and which one. */
  bestStreak: number;
  bestHabit: string;
  /** The longest streak running now. */
  liveStreak: number;
  liveHabit: string;
  /** Percent of due days done in the last 30 days, all habits together. */
  rate30: number;
  totalChecks: number;
  todayDone: number;
  todayDue: number;
}

export function habitStats(
  habits: Habit[],
  checks: Checks,
  today: string,
): HabitStats {
  let best = 0;
  let bestHabit = "";
  let live = 0;
  let liveHabit = "";
  let due = 0;
  let hit = 0;
  let total = 0;
  let todayDone = 0;
  let todayDue = 0;
  const from = addDays(today, -29);
  for (const h of habits) {
    const dates = checks[h.id] ?? [];
    total += dates.length;
    const b = bestStreak(dates, h.freq, today);
    if (b > best) {
      best = b;
      bestHabit = h.name;
    }
    const c = currentStreak(dates, h.freq, today);
    if (c > live) {
      live = c;
      liveHabit = h.name;
    }
    for (let iso = from; iso <= today; iso = addDays(iso, 1)) {
      if (!isDue(h.freq, iso)) continue;
      due += 1;
      if (dates.includes(iso)) hit += 1;
    }
    if (isDue(h.freq, today)) {
      todayDue += 1;
      if (dates.includes(today)) todayDone += 1;
    }
  }
  return {
    bestStreak: best,
    bestHabit,
    liveStreak: live,
    liveHabit,
    rate30: due === 0 ? 0 : Math.round((hit / due) * 100),
    totalChecks: total,
    todayDone,
    todayDue,
  };
}
