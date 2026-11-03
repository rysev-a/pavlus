/** What the learner has done: XP, the streak and the exercises solved, as pure steps. */
import type { Solved } from "../../blocks/lesson-outline/outline.ts";
import { levelOf } from "../../blocks/xp-bar/xp.ts";

export interface Progress {
  xp: number;
  /** Days in a row; it grows by one the first time something is solved today. */
  streak: number;
  /** Something was solved today: the streak already counts it. */
  today: boolean;
  /** The ids of the solved exercises, by lesson id. */
  solved: Record<string, string[]>;
}

export const freshProgress = (): Progress => ({
  xp: 0,
  streak: 0,
  today: false,
  solved: {},
});

export const isSolved = (
  p: Progress,
  lessonId: string,
  exId: string,
): boolean => (p.solved[lessonId] ?? []).includes(exId);

export interface Gain {
  progress: Progress;
  /** The XP actually added: nothing for an exercise solved before. */
  gained: number;
  /** The new level when this gain crossed a level, else 0. */
  levelUp: number;
  /** The streak grew by this solve. */
  streakUp: boolean;
}

/** Pure: an exercise was solved for `xp`. Solving it again gives nothing. */
export function solve(
  p: Progress,
  lessonId: string,
  exId: string,
  xp: number,
): Gain {
  if (isSolved(p, lessonId, exId))
    return { progress: p, gained: 0, levelUp: 0, streakUp: false };
  const streakUp = !p.today;
  const next: Progress = {
    xp: p.xp + xp,
    streak: streakUp ? p.streak + 1 : p.streak,
    today: true,
    solved: { ...p.solved, [lessonId]: [...(p.solved[lessonId] ?? []), exId] },
  };
  const before = levelOf(p.xp);
  const after = levelOf(next.xp);
  return {
    progress: next,
    gained: xp,
    levelUp: after > before ? after : 0,
    streakUp,
  };
}

/** Pure: how many exercises are solved in each lesson (for the outline). */
export function solvedCounts(p: Progress): Solved {
  const counts: Solved = {};
  for (const [lesson, ids] of Object.entries(p.solved))
    counts[lesson] = ids.length;
  return counts;
}
