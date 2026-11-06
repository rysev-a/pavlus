import type { Tone } from "../admin-shell/shell.ts";

export interface Skill {
  id: string;
  label: string;
  hint: string;
}

/** A rating from 1 to 5 per skill id; `0` or missing means not rated. */
export type Ratings = Record<string, number>;

export const MAX_RATING = 5;

/** Pure: the average of the skills that were rated (one decimal), or null. */
export function average(skills: Skill[], ratings: Ratings): number | null {
  const given = skills
    .map((s) => ratings[s.id] ?? 0)
    .filter((v) => v >= 1 && v <= MAX_RATING);
  if (given.length === 0) return null;
  const sum = given.reduce((a, b) => a + b, 0);
  return Math.round((sum / given.length) * 10) / 10;
}

export function ratedCount(skills: Skill[], ratings: Ratings): number {
  return skills.filter((s) => (ratings[s.id] ?? 0) >= 1).length;
}

/** Pure: clicking the rating a skill already has clears it. */
export function setRating(
  ratings: Ratings,
  skill: string,
  value: number,
): Ratings {
  const v = Math.max(0, Math.min(MAX_RATING, Math.round(value)));
  return { ...ratings, [skill]: ratings[skill] === v ? 0 : v };
}

export interface Verdict {
  label: string;
  tone: Tone;
}

/** Pure: what an average means. */
export function verdictOf(avg: number | null): Verdict {
  if (avg === null) return { label: "Not rated yet", tone: "muted" };
  if (avg >= 4.2) return { label: "Strong yes", tone: "success" };
  if (avg >= 3.4) return { label: "Yes", tone: "success" };
  if (avg >= 2.6) return { label: "Maybe", tone: "warning" };
  return { label: "No", tone: "destructive" };
}

export interface ScoreRow {
  id: string;
  label: string;
  hint: string;
  value: number;
  dots: { n: number; on: boolean }[];
}

export interface ScoreView {
  rows: ScoreRow[];
  average: string;
  pct: number;
  rated: string;
  verdict: string;
  tone: Tone;
}

/** Pure: the props of the view. */
export function scoreView(skills: Skill[], ratings: Ratings): ScoreView {
  const avg = average(skills, ratings);
  const verdict = verdictOf(avg);
  return {
    rows: skills.map((s) => {
      const value = ratings[s.id] ?? 0;
      return {
        id: s.id,
        label: s.label,
        hint: s.hint,
        value,
        dots: [1, 2, 3, 4, 5].map((n) => ({ n, on: n <= value })),
      };
    }),
    average: avg === null ? "-" : avg.toFixed(1),
    pct: avg === null ? 0 : Math.round((avg / MAX_RATING) * 100),
    rated: `${ratedCount(skills, ratings)} of ${skills.length} rated`,
    verdict: verdict.label,
    tone: verdict.tone,
  };
}
