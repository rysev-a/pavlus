import type { Tone } from "../admin-shell/shell.ts";
import { FREQS, type Freq, type Habit } from "../habit-grid/habits.ts";

/** What the form holds. */
export interface HabitDraft {
  name: string;
  tone: Tone;
  icon: string;
  freq: Freq;
}

export const TONES: { id: Tone; label: string }[] = [
  { id: "default", label: "Violet" },
  { id: "success", label: "Green" },
  { id: "info", label: "Blue" },
  { id: "warning", label: "Amber" },
  { id: "destructive", label: "Red" },
];

export const ICONS = [
  "📖",
  "🏃",
  "💧",
  "🧘",
  "✍️",
  "🥗",
  "😴",
  "🎸",
  "💊",
  "🧹",
  "🚴",
  "🌿",
];

export const MAX_NAME = 32;

export const emptyHabit = (): HabitDraft => ({
  name: "",
  tone: "success",
  icon: "🌿",
  freq: "daily",
});

export const draftOfHabit = (h: Habit): HabitDraft => ({
  name: h.name,
  tone: h.tone,
  icon: h.icon,
  freq: h.freq,
});

/** Pure: the errors by field; an empty object means it can be saved. */
export function validateHabit(
  d: HabitDraft,
  habits: Habit[],
  editingId: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = d.name.trim();
  if (!name) errors.name = "Name the habit.";
  else if (name.length > MAX_NAME) {
    errors.name = `At most ${MAX_NAME} characters (now ${name.length}).`;
  } else if (
    habits.some(
      (h) => h.id !== editingId && h.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = "You already track a habit with this name.";
  }
  return errors;
}

/** Pure: the next free habit id (`h7`). */
export function nextHabitId(habits: Habit[]): string {
  const n = habits.reduce((m, h) => Math.max(m, Number(h.id.slice(1)) || 0), 0);
  return `h${n + 1}`;
}

/** Pure: the habit list with a habit added (empty id) or replaced. */
export function saveHabit(
  habits: Habit[],
  d: HabitDraft,
  editingId: string,
): Habit[] {
  const clean = {
    name: d.name.trim(),
    tone: d.tone,
    icon: d.icon,
    freq: d.freq,
  };
  if (!editingId) return [...habits, { id: nextHabitId(habits), ...clean }];
  return habits.map((h) => (h.id === editingId ? { ...h, ...clean } : h));
}

export interface Choice<T extends string> {
  id: T;
  label: string;
  active: boolean;
}

export const toneChoices = (active: Tone): Choice<Tone>[] =>
  TONES.map((t) => ({ ...t, active: t.id === active }));

export const iconChoices = (active: string): Choice<string>[] =>
  ICONS.map((i) => ({ id: i, label: i, active: i === active }));

export const freqChoices = (active: Freq): Choice<Freq>[] =>
  FREQS.map((f) => ({ id: f.id, label: f.label, active: f.id === active }));
