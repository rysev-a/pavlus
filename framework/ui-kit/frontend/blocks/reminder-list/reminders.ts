import type { Habit } from "../habit-grid/habits.ts";

/** One reminder per habit: `time` is `HH:MM`. */
export interface Reminder {
  id: string;
  habitId: string;
  time: string;
  on: boolean;
}

export interface TimeOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface ReminderRow {
  id: string;
  icon: string;
  name: string;
  time: string;
  on: boolean;
  options: TimeOption[];
}

export const TIMES = [
  "06:30",
  "07:00",
  "07:30",
  "08:00",
  "09:00",
  "12:30",
  "15:00",
  "18:00",
  "19:30",
  "21:00",
  "22:00",
];

/** Pure: minutes after midnight for `HH:MM`. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export const toggleReminder = (list: Reminder[], id: string): Reminder[] =>
  list.map((r) => (r.id === id ? { ...r, on: !r.on } : r));

export const setReminderTime = (
  list: Reminder[],
  id: string,
  time: string,
): Reminder[] => list.map((r) => (r.id === id ? { ...r, time } : r));

/** Pure: a reminder for a new habit, off until the person turns it on. */
export function reminderFor(list: Reminder[], habitId: string): Reminder[] {
  if (list.some((r) => r.habitId === habitId)) return list;
  const n = list.reduce((m, r) => Math.max(m, Number(r.id.slice(1)) || 0), 0);
  return [...list, { id: `r${n + 1}`, habitId, time: "08:00", on: false }];
}

/** Pure: the reminders of habits that still exist. */
export const reminderRows = (
  list: Reminder[],
  habits: Habit[],
): ReminderRow[] =>
  list
    .map((r) => ({ r, h: habits.find((x) => x.id === r.habitId) }))
    .filter((x): x is { r: Reminder; h: Habit } => x.h !== undefined)
    .sort((a, b) => minutesOf(a.r.time) - minutesOf(b.r.time))
    .map(({ r, h }) => ({
      id: r.id,
      icon: h.icon,
      name: h.name,
      time: r.time,
      on: r.on,
      options: (TIMES.includes(r.time) ? TIMES : [...TIMES, r.time].sort()).map(
        (t) => ({ value: t, label: t, selected: t === r.time }),
      ),
    }));

/** Pure: the next reminder that is on after `now` (minutes), wrapping to tomorrow. */
export function nextReminder(
  list: Reminder[],
  now: number,
): { reminder: Reminder; tomorrow: boolean } | undefined {
  const on = list
    .filter((r) => r.on)
    .sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
  const later = on.find((r) => minutesOf(r.time) > now);
  if (later) return { reminder: later, tomorrow: false };
  return on.length > 0 ? { reminder: on[0], tomorrow: true } : undefined;
}

/** Pure: a sentence about the next reminder. */
export function nextText(
  list: Reminder[],
  habits: Habit[],
  now: number,
): string {
  const next = nextReminder(list, now);
  if (!next) return "All reminders are off.";
  const habit = habits.find((h) => h.id === next.reminder.habitId);
  return `Next: ${habit?.name ?? "a habit"} at ${next.reminder.time}${next.tomorrow ? " tomorrow" : ""}.`;
}
