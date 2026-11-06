import { durationText } from "../week-calendar/dates.ts";

export interface CatIn {
  id: string;
  name: string;
  tone: string;
}

export interface Span {
  cat: string;
  day: string;
  dur: number;
}

export interface SummaryRow {
  id: string;
  name: string;
  tone: string;
  minutes: number;
  text: string;
  /** Share of all tracked time, percent. */
  share: number;
  /** Bar length relative to the longest category (or its target), percent. */
  bar: number;
  /** The target as text, or empty. */
  target: string;
  /** Percent of the bar where the target sits, or -1. */
  mark: number;
  over: boolean;
}

export interface SummaryView {
  title: string;
  total: string;
  stack: { id: string; tone: string; width: number; name: string }[];
  rows: SummaryRow[];
}

/** Pure: minutes per category over the given days (unknown categories are dropped). */
export function totals(
  spans: Span[],
  cats: CatIn[],
  days: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cats) out[c.id] = 0;
  for (const s of spans) {
    if (days.includes(s.day) && s.cat in out) out[s.cat] += s.dur;
  }
  return out;
}

/**
 * Pure: the summary of a period. `targets` is minutes per category for the
 * whole period (a missing or zero target draws no mark). Categories with no
 * time and no target are left out.
 */
export function summaryView(
  title: string,
  minutes: Record<string, number>,
  cats: CatIn[],
  targets: Record<string, number> = {},
): SummaryView {
  const total = cats.reduce((n, c) => n + (minutes[c.id] ?? 0), 0);
  const kept = cats.filter(
    (c) => (minutes[c.id] ?? 0) > 0 || (targets[c.id] ?? 0) > 0,
  );
  const scale = Math.max(
    1,
    ...kept.map((c) => Math.max(minutes[c.id] ?? 0, targets[c.id] ?? 0)),
  );
  return {
    title,
    total: durationText(total),
    stack: kept
      .filter((c) => (minutes[c.id] ?? 0) > 0)
      .map((c) => ({
        id: c.id,
        tone: c.tone,
        name: c.name,
        width: Math.round(((minutes[c.id] ?? 0) / total) * 1000) / 10,
      })),
    rows: [...kept]
      .sort((a, b) => (minutes[b.id] ?? 0) - (minutes[a.id] ?? 0))
      .map((c) => {
        const m = minutes[c.id] ?? 0;
        const t = targets[c.id] ?? 0;
        return {
          id: c.id,
          name: c.name,
          tone: c.tone,
          minutes: m,
          text: durationText(m),
          share: total === 0 ? 0 : Math.round((m / total) * 100),
          bar: Math.round((m / scale) * 100),
          target: t > 0 ? `of ${durationText(t)}` : "",
          mark: t > 0 ? Math.round((t / scale) * 100) : -1,
          over: t > 0 && m > t,
        };
      }),
  };
}
