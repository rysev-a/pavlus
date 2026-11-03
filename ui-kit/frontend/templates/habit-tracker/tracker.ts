// The data and the pure logic of the habit tracker. Everything the page shows
// is worked out from one `Core` by `derive`.
import type { Month } from "../../lib/calendar.ts";
import type { Tone } from "../../blocks/admin-shell/shell.ts";
import {
  item as meterItem,
  type Item,
} from "../../blocks/progress-list/items.ts";
import { card, type Card } from "../../blocks/stat-cards/cards.ts";
import {
  listAction,
  statusRow,
  type StatusRow,
} from "../../blocks/status-list/rows.ts";
import { type Badge, badgeList } from "../../blocks/badge-shelf/badges.ts";
import {
  type Choice,
  type HabitDraft,
  draftOfHabit,
  freqChoices,
  iconChoices,
  toneChoices,
  emptyHabit,
} from "../../blocks/habit-form/form.ts";
import {
  type Checks,
  completionRate,
  currentStreak,
  bestStreak,
  freqLabel,
  type Freq,
  type GridDay,
  type GridRow,
  type Habit,
  type HeatWeek,
  HEAT_WEEKDAYS,
  habitStats,
  heatTitle,
  heatWeeks,
  isDue,
  weekDays,
  weekRows,
  weekStart,
} from "../../blocks/habit-grid/habits.ts";
import { addDays } from "../../blocks/month-archive/dates.ts";
import {
  nextText,
  type Reminder,
  type ReminderRow,
  reminderRows,
} from "../../blocks/reminder-list/reminders.ts";

export const TODAY = "2026-11-03";
/** 14:20, in minutes. */
export const NOW = 14 * 60 + 20;

export const HABITS: Habit[] = [
  { id: "h1", name: "Read 20 pages", icon: "📖", tone: "info", freq: "daily" },
  { id: "h2", name: "Run 5 km", icon: "🏃", tone: "success", freq: "mwf" },
  {
    id: "h3",
    name: "Write in the journal",
    icon: "✍️",
    tone: "warning",
    freq: "weekdays",
  },
  {
    id: "h4",
    name: "Drink two litres of water",
    icon: "💧",
    tone: "default",
    freq: "daily",
  },
  {
    id: "h5",
    name: "Long bike ride",
    icon: "🚴",
    tone: "destructive",
    freq: "weekends",
  },
];

export const REMINDERS: Reminder[] = [
  { id: "r1", habitId: "h1", time: "21:00", on: true },
  { id: "r2", habitId: "h2", time: "07:00", on: true },
  { id: "r3", habitId: "h3", time: "22:00", on: false },
  { id: "r4", habitId: "h4", time: "12:30", on: true },
  { id: "r5", habitId: "h5", time: "09:00", on: false },
];

/** Pure and seeded: a believable history, no randomness. */
export function seedChecks(habits: Habit[], today: string, days = 75): Checks {
  const hit = [92, 72, 84, 66, 80];
  const run = [12, 3, 6, 0, 2];
  const checks: Checks = {};
  habits.forEach((h, i) => {
    const dates: string[] = [];
    for (let k = 0; k < days; k++) {
      const iso = addDays(today, -k);
      if (!isDue(h.freq, iso)) continue;
      const forced = k >= 1 && k <= run[i];
      const missed = k === run[i] + 1;
      const roll = (k * 37 + i * 53 + 11) % 100;
      const done = k === 0 ? i % 2 === 0 : forced || (!missed && roll < hit[i]);
      if (done) dates.push(iso);
    }
    checks[h.id] = dates.sort();
  });
  return checks;
}

export interface Core {
  habits: Habit[];
  checks: Checks;
  reminders: Reminder[];
  month: Month;
  /** The habit being edited ("" with `formOpen` means a new one). */
  formOpen: boolean;
  editingId: string;
  draft: HabitDraft;
  errors: Record<string, string>;
}

export const startCore = (): Core => ({
  habits: HABITS,
  checks: seedChecks(HABITS, TODAY),
  reminders: REMINDERS,
  month: { year: 2026, month: 10 },
  formOpen: false,
  editingId: "",
  draft: emptyHabit(),
  errors: {},
});

/** Pure: weeks (Monday to Sunday, up to today) in which every due habit was done each due day. */
export function perfectWeeks(
  habits: Habit[],
  checks: Checks,
  today: string,
  weeks = 12,
): number {
  let count = 0;
  const thisWeek = weekStart(today);
  for (let w = 1; w <= weeks; w++) {
    const start = addDays(thisWeek, -7 * w);
    let due = 0;
    let done = 0;
    for (let d = 0; d < 7; d++) {
      const iso = addDays(start, d);
      for (const h of habits) {
        if (!isDue(h.freq, iso)) continue;
        due += 1;
        if ((checks[h.id] ?? []).includes(iso)) done += 1;
      }
    }
    if (due > 0 && due === done) count += 1;
  }
  return count;
}

export interface Derived {
  days: GridDay[];
  rows: GridRow[];
  stats: Card[];
  rates: Item[];
  heatTitle: string;
  weekdays: string[];
  weeks: HeatWeek[];
  habitRows: StatusRow[];
  badges: Badge[];
  reminderRows: ReminderRow[];
  summary: string;
  tones: Choice<Tone>[];
  icons: Choice<string>[];
  freqs: Choice<Freq>[];
  editing: boolean;
  todayLine: string;
}

const tone30 = (rate: number): Tone =>
  rate >= 80 ? "success" : rate >= 55 ? "warning" : "destructive";

/** Pure: the status rows of the habits screen. */
export function habitRowsOf(habits: Habit[], checks: Checks): StatusRow[] {
  const from = addDays(TODAY, -29);
  return habits.map((h) => {
    const dates = checks[h.id] ?? [];
    const streak = currentStreak(dates, h.freq, TODAY);
    return statusRow(
      h.id,
      `${h.icon}  ${h.name}`,
      streak > 0 ? `🔥 ${streak}` : "No streak",
      h.tone,
      {
        sub: freqLabel(h.freq),
        facts: [
          {
            label: "Best streak",
            value: `${bestStreak(dates, h.freq, TODAY)} days`,
          },
          {
            label: "Last 30 days",
            value: `${completionRate(dates, h.freq, from, TODAY)}%`,
          },
          { label: "Check-ins", value: String(dates.length) },
        ],
        actions: [
          listAction("edit", "Edit"),
          listAction("delete", "Delete", { variant: "ghost" }),
        ],
      },
    );
  });
}

export function derive(core: Core): Derived {
  const { habits, checks } = core;
  const s = habitStats(habits, checks, TODAY);
  const from = addDays(TODAY, -29);
  return {
    days: weekDays(TODAY),
    rows: weekRows(habits, checks, TODAY),
    stats: [
      card("today", "Done today", `${s.todayDone} of ${s.todayDue}`, {
        icon: "k-ai-clipboard",
        tone: s.todayDone === s.todayDue ? "success" : "info",
        hint:
          s.todayDone === s.todayDue ? "All done, well played" : "Still to go",
      }),
      card("live", "Streak now", `${s.liveStreak} days`, {
        icon: "k-ai-sparkles",
        tone: "warning",
        hint: s.liveHabit,
      }),
      card("best", "Best streak", `${s.bestStreak} days`, {
        icon: "k-ai-flag",
        tone: "success",
        hint: s.bestHabit,
      }),
      card("rate", "Completion, 30 days", `${s.rate30}%`, {
        icon: "k-ai-chart",
        tone: tone30(s.rate30) === "destructive" ? "destructive" : "default",
        hint: `${s.totalChecks} check-ins in all`,
      }),
    ],
    rates: habits.map((h) => {
      const rate = completionRate(checks[h.id] ?? [], h.freq, from, TODAY);
      return meterItem(h.id, `${h.icon}  ${h.name}`, rate, 100, {
        tone: tone30(rate),
        text: `${rate}%`,
        sub: freqLabel(h.freq),
      });
    }),
    heatTitle: heatTitle(core.month),
    weekdays: HEAT_WEEKDAYS,
    weeks: heatWeeks(habits, checks, core.month, TODAY),
    habitRows: habitRowsOf(habits, checks),
    badges: badgeList({
      bestStreak: s.bestStreak,
      totalChecks: s.totalChecks,
      habits: habits.length,
      perfectWeeks: perfectWeeks(habits, checks, TODAY),
      rate30: s.rate30,
    }),
    reminderRows: reminderRows(core.reminders, habits),
    summary: nextText(core.reminders, habits, NOW),
    tones: toneChoices(core.draft.tone),
    icons: iconChoices(core.draft.icon),
    freqs: freqChoices(core.draft.freq),
    editing: core.editingId !== "",
    todayLine: `${s.todayDone} of ${s.todayDue} habits done today`,
  };
}

export { draftOfHabit };
