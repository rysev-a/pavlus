import { clockOf, durationText } from "../week-calendar/dates.ts";

export interface Cat {
  id: string;
  name: string;
  tone: string;
}

/** The timer: `elapsed` counts seconds of work; `nowMin` is the clock of the day. */
export interface Tracker {
  running: boolean;
  elapsed: number;
  cat: string;
  note: string;
  /** Demo speed: a tick of one second counts as a minute. */
  fast: boolean;
  /** The time of day in minutes, moved on by the tracker. */
  nowMin: number;
  startMin: number;
}

export interface Entry {
  id: string;
  title: string;
  cat: string;
  /** Minutes from midnight. */
  start: number;
  dur: number;
}

export const newTracker = (nowMin: number, cat: string): Tracker => ({
  running: false,
  elapsed: 0,
  cat,
  note: "",
  fast: false,
  nowMin,
  startMin: nowMin,
});

/** `0:07:05` */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${m < 10 ? "0" : ""}${m}:${r < 10 ? "0" : ""}${r}`;
}

/** Pure: how many seconds one tick adds. */
export const stepOf = (t: Tracker): number => (t.fast ? 60 : 1);

export function startTracker(t: Tracker): Tracker {
  return t.running
    ? t
    : { ...t, running: true, elapsed: 0, startMin: t.nowMin };
}

/** Pure: one tick later; the clock of the day follows the minutes worked. */
export function tickTracker(t: Tracker): Tracker {
  if (!t.running) return t;
  const elapsed = t.elapsed + stepOf(t);
  return { ...t, elapsed, nowMin: t.startMin + Math.floor(elapsed / 60) };
}

/** Pure: whole minutes of the running timer, at least one once it ran at all. */
export const minutesWorked = (t: Tracker): number =>
  t.elapsed <= 0 ? 0 : Math.max(1, Math.round(t.elapsed / 60));

/** Pure: stop; `entry` is what to log (null when nothing ran). */
export function stopTracker(
  t: Tracker,
  id: string,
  fallbackTitle: string,
): { tracker: Tracker; entry: Entry | null } {
  const dur = minutesWorked(t);
  const entry: Entry | null =
    t.running && dur > 0
      ? {
          id,
          title: t.note.trim() || fallbackTitle,
          cat: t.cat,
          start: t.startMin,
          dur,
        }
      : null;
  return {
    tracker: {
      ...t,
      running: false,
      elapsed: 0,
      note: "",
      nowMin: t.startMin + dur,
      startMin: t.startMin + dur,
    },
    entry,
  };
}

export interface TrackerView {
  running: boolean;
  clock: string;
  now: string;
  note: string;
  fast: boolean;
  categories: (Cat & { active: boolean })[];
  entries: {
    id: string;
    title: string;
    tone: string;
    time: string;
    dur: string;
    cat: string;
  }[];
  total: string;
}

/** Pure: the props of the view; `entries` newest first. */
export function trackerView(
  t: Tracker,
  cats: Cat[],
  entries: Entry[],
): TrackerView {
  const byId = (id: string): Cat | undefined => cats.find((c) => c.id === id);
  const sum = entries.reduce((n, e) => n + e.dur, 0);
  return {
    running: t.running,
    clock: clockText(t.elapsed),
    now: clockOf(t.nowMin),
    note: t.note,
    fast: t.fast,
    categories: cats.map((c) => ({ ...c, active: c.id === t.cat })),
    entries: [...entries]
      .sort((a, b) => b.start - a.start)
      .map((e) => ({
        id: e.id,
        title: e.title,
        tone: byId(e.cat)?.tone ?? "pr",
        cat: byId(e.cat)?.name ?? "",
        time: `${clockOf(e.start)} - ${clockOf(e.start + e.dur)}`,
        dur: durationText(e.dur),
      })),
    total: durationText(sum),
  };
}
