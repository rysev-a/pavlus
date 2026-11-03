import { clampPct, initials, type Tone } from "../admin-shell/shell.ts";

export interface Score {
  id: string;
  name: string;
  /** What the person earned (the ranking). */
  value: number;
  /** The goal; 0 for none. */
  target: number;
  /** A second line: `7 deals won`. */
  sub: string;
}

export interface Rank {
  id: string;
  rank: number;
  name: string;
  initials: string;
  value: string;
  sub: string;
  /** How much of the biggest score this one is, 0..100. */
  pct: number;
  /** How much of the goal is done; the text is `82% of goal`. */
  goal: string;
  tone: Tone;
}

/** Pure: the scores best first (ties keep their order). */
export const ranked = (scores: Score[]): Score[] =>
  [...scores].sort((a, b) => b.value - a.value);

/** Pure: the ranking rows; `format` words a value (`$48,000`). */
export function rankRows(
  scores: Score[],
  format: (n: number) => string,
): Rank[] {
  const sorted = ranked(scores);
  const top = Math.max(1, ...sorted.map((s) => s.value));
  return sorted.map((s, i) => {
    const done = s.target > 0 ? Math.round((s.value / s.target) * 100) : 0;
    return {
      id: s.id,
      rank: i + 1,
      name: s.name,
      initials: initials(s.name),
      value: format(s.value),
      sub: s.sub,
      pct: clampPct((s.value / top) * 100),
      goal: s.target > 0 ? `${done}% of goal` : "",
      tone: done >= 100 ? "success" : done >= 60 ? "default" : "warning",
    };
  });
}
