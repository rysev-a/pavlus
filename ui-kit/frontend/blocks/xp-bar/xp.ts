/** XP, levels and the cost of hints: pure rules for a learning app. */

/** What one hint costs, in XP. */
export const HINT_COST = 3;

/** The XP a learner needs in total to reach a level (level 1 is 0). */
export const xpAt = (level: number): number => 25 * (level - 1) * level;

/** Pure: the level for a total of XP. */
export function levelOf(xp: number): number {
  let level = 1;
  while (xp >= xpAt(level + 1)) level++;
  return level;
}

const TITLES = [
  "Newcomer",
  "Explorer",
  "Practitioner",
  "Power user",
  "Hacker",
  "Wizard",
  "Guru",
];

export const levelTitle = (level: number): string =>
  TITLES[Math.min(level, TITLES.length) - 1];

/**
 * Pure: the XP an exercise gives. Every hint costs HINT_COST and every wrong
 * check 1 XP; it never falls below a quarter of the base (at least 1).
 */
export function awardXp(
  base: number,
  hintsUsed: number,
  wrongChecks: number,
): number {
  const floor = Math.max(1, Math.ceil(base / 4));
  return Math.max(floor, base - hintsUsed * HINT_COST - wrongChecks);
}

export interface XpProps {
  level: number;
  title: string;
  xp: number;
  /** XP earned inside this level, and the size of the level. */
  into: number;
  need: number;
  pct: number;
  streak: number;
  /** `3 days` / `1 day` / `No streak yet`. */
  streakLabel: string;
  /** XP still missing for the next level. */
  toNext: number;
}

/** Pure: everything the bar shows, from the total XP and the streak. */
export function xpProps(xp: number, streak: number): XpProps {
  const level = levelOf(xp);
  const from = xpAt(level);
  const need = xpAt(level + 1) - from;
  const into = xp - from;
  return {
    level,
    title: levelTitle(level),
    xp,
    into,
    need,
    pct: Math.min(100, Math.round((into / need) * 100)),
    streak,
    streakLabel:
      streak <= 0
        ? "No streak yet"
        : `${streak} ${streak === 1 ? "day" : "days"}`,
    toNext: need - into,
  };
}
