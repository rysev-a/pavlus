/** The numbers the achievements are worked out from. */
export interface BadgeInput {
  bestStreak: number;
  totalChecks: number;
  habits: number;
  /** Weeks (Monday to Sunday) in which every due day of every habit was done. */
  perfectWeeks: number;
  /** Percent of due days done in the last 30 days. */
  rate30: number;
}

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  hint: string;
  earned: boolean;
  /** Progress to the goal, 0 to 100. */
  pct: number;
  progressText: string;
}

interface Rule {
  id: string;
  emoji: string;
  title: string;
  hint: string;
  value: (i: BadgeInput) => number;
  goal: number;
  unit: string;
}

const RULES: Rule[] = [
  {
    id: "spark",
    emoji: "🔥",
    title: "First spark",
    hint: "Reach a 3 day streak",
    value: (i) => i.bestStreak,
    goal: 3,
    unit: "days",
  },
  {
    id: "week",
    emoji: "🗓️",
    title: "Seven in a row",
    hint: "Reach a 7 day streak",
    value: (i) => i.bestStreak,
    goal: 7,
    unit: "days",
  },
  {
    id: "fortnight",
    emoji: "⚡",
    title: "Fortnight",
    hint: "Reach a 14 day streak",
    value: (i) => i.bestStreak,
    goal: 14,
    unit: "days",
  },
  {
    id: "month",
    emoji: "🏔️",
    title: "Iron month",
    hint: "Reach a 30 day streak",
    value: (i) => i.bestStreak,
    goal: 30,
    unit: "days",
  },
  {
    id: "fifty",
    emoji: "✅",
    title: "Fifty check-ins",
    hint: "Check in 50 times",
    value: (i) => i.totalChecks,
    goal: 50,
    unit: "check-ins",
  },
  {
    id: "hundred",
    emoji: "💯",
    title: "One hundred",
    hint: "Check in 100 times",
    value: (i) => i.totalChecks,
    goal: 100,
    unit: "check-ins",
  },
  {
    id: "juggler",
    emoji: "🤹",
    title: "Juggler",
    hint: "Track 5 habits at once",
    value: (i) => i.habits,
    goal: 5,
    unit: "habits",
  },
  {
    id: "perfect",
    emoji: "🌟",
    title: "Perfect week",
    hint: "Do everything due in a week",
    value: (i) => i.perfectWeeks,
    goal: 1,
    unit: "weeks",
  },
  {
    id: "steady",
    emoji: "🎯",
    title: "Steady hands",
    hint: "Keep 80% over 30 days",
    value: (i) => i.rate30,
    goal: 80,
    unit: "%",
  },
];

/** Pure: every achievement with its progress, the earned ones first. */
export function badgeList(input: BadgeInput): Badge[] {
  return RULES.map((r, index) => {
    const value = r.value(input);
    const earned = value >= r.goal;
    return {
      index,
      id: r.id,
      emoji: r.emoji,
      title: r.title,
      hint: r.hint,
      earned,
      pct: Math.min(100, Math.round((value / r.goal) * 100)),
      progressText: earned ? "Earned" : `${value} / ${r.goal} ${r.unit}`,
    };
  })
    .sort((a, b) => Number(b.earned) - Number(a.earned) || a.index - b.index)
    .map(({ index: _index, ...badge }) => badge);
}
