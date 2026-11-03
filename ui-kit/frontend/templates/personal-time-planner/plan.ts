import type { AgendaIn } from "../../blocks/agenda-list/agenda.ts";
import type { Category } from "../../blocks/category-manager/cats.ts";
import { type Task as ListTask } from "../../blocks/checklist/list.ts";
import type { Span } from "../../blocks/time-summary/summary.ts";
import { dayOf, minutesOf, TODAY } from "../../blocks/week-calendar/dates.ts";
import {
  occursOn,
  type Repeat,
  type Repeating,
} from "../../blocks/week-calendar/week.ts";

export { TODAY };

// -------------------------------------------------------------- categories

export const CATEGORIES: Category[] = [
  { id: "work", name: "Work", tone: "c1" },
  { id: "study", name: "Study", tone: "c2" },
  { id: "sport", name: "Sport", tone: "c3" },
  { id: "family", name: "Family", tone: "c4" },
  { id: "hobby", name: "Hobbies", tone: "c5" },
  { id: "errands", name: "Errands", tone: "de" },
  { id: "sleep", name: "Sleep", tone: "pr" },
];

export const toneOf = (cats: Category[], id: string): string =>
  cats.find((c) => c.id === id)?.tone ?? "pr";

export const nameOf = (cats: Category[], id: string): string =>
  cats.find((c) => c.id === id)?.name ?? "";

// ------------------------------------------------------------------ blocks

/** A block of time in the planner. */
export interface Block {
  id: string;
  title: string;
  cat: string;
  /** The first (or only) day, `2026-11-03`. */
  day: string;
  /** Minutes from midnight. */
  start: number;
  dur: number;
  note: string;
  repeat: Repeat;
}

const H = (hour: number, min = 0): number => hour * 60 + min;

const b = (
  id: string,
  title: string,
  cat: string,
  day: string,
  start: number,
  dur: number,
  repeat: Repeat = "none",
  note = "",
): Block => ({ id, title, cat, day, start, dur, note, repeat });

export const BLOCKS: Block[] = [
  b("b1", "Sleep", "sleep", "2026-10-26", H(23), 480, "daily"),
  b(
    "b2",
    "Morning run",
    "sport",
    "2026-10-26",
    H(7),
    40,
    "weekly",
    "5 km by the river",
  ),
  b("b3", "Standup", "work", "2026-10-26", H(9, 30), 30, "weekdays"),
  b(
    "b4",
    "Deep work",
    "work",
    "2026-10-26",
    H(10),
    150,
    "weekdays",
    "No messages",
  ),
  b("b5", "Lunch", "family", "2026-10-26", H(13), 60, "weekdays"),
  b(
    "b6",
    "Project proposal",
    "work",
    "2026-11-03",
    H(14),
    120,
    "none",
    "First draft for Thursday",
  ),
  b(
    "b7",
    "Spanish class",
    "study",
    "2026-10-27",
    H(17),
    60,
    "weekly",
    "Online, with Carmen",
  ),
  b("b8", "Dinner with the family", "family", "2026-10-26", H(19), 90, "daily"),
  b("b9", "Guitar practice", "hobby", "2026-10-27", H(20, 30), 45, "weekly"),
  b("b10", "Gym", "sport", "2026-10-26", H(18), 60, "weekly", "Legs and core"),
  b("b11", "Read a chapter", "study", "2026-10-26", H(21, 30), 30, "weekdays"),
  b(
    "b12",
    "Dentist",
    "errands",
    "2026-11-05",
    H(15),
    60,
    "none",
    "Dr. Okafor, bring the form",
  ),
  b("b13", "Groceries", "errands", "2026-11-03", H(17, 30), 45, "none"),
  b(
    "b14",
    "Weekend hike",
    "sport",
    "2026-11-07",
    H(8),
    240,
    "none",
    "Sintra loop",
  ),
  b("b15", "Call with parents", "family", "2026-11-08", H(11), 45, "weekly"),
  b("b16", "Design review", "work", "2026-11-03", H(16), 60, "none"),
  b("b17", "Photo walk", "hobby", "2026-11-07", H(14), 120, "none"),
  b(
    "b18",
    "Statistics course",
    "study",
    "2026-11-04",
    H(16),
    90,
    "none",
    "Module 4",
  ),
  b("b19", "Pottery class", "hobby", "2026-11-06", H(18, 30), 120, "none"),
  b("b20", "Team offsite prep", "work", "2026-11-06", H(14), 90, "none"),
  b(
    "t1",
    "Email triage",
    "work",
    "2026-11-03",
    H(8, 15),
    30,
    "none",
    "Tracked",
  ),
  b(
    "t2",
    "Podcast notes",
    "hobby",
    "2026-11-03",
    H(12, 10),
    25,
    "none",
    "Tracked",
  ),
];

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
};

/** Pure: the blocks as the calendar wants them (a tone instead of a category). */
export function repeating(blocks: Block[], cats: Category[]): Repeating[] {
  return blocks.map((x) => ({
    id: x.id,
    title: x.title,
    tone: toneOf(cats, x.cat),
    day: x.day,
    start: x.start,
    dur: x.dur,
    sub: x.note,
    repeat: x.repeat,
  }));
}

/** Pure: every occurrence of the blocks on the given days, as time spans. */
export function spansOf(blocks: Block[], days: string[]): Span[] {
  const out: Span[] = [];
  for (const day of days) {
    for (const x of blocks) {
      if (occursOn(x.day, x.repeat, day)) {
        out.push({ cat: x.cat, day, dur: x.dur });
      }
    }
  }
  return out;
}

/** Pure: minutes per category over the given days. */
export function minutesPerCat(
  blocks: Block[],
  cats: Category[],
  days: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cats) out[c.id] = 0;
  for (const s of spansOf(blocks, days)) {
    if (s.cat in out) out[s.cat] += s.dur;
  }
  return out;
}

/** Pure: minutes ever planned per category (what stops a category being removed). */
export function usedMinutes(
  blocks: Block[],
  cats: Category[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cats) {
    out[c.id] = blocks
      .filter((x) => x.cat === c.id)
      .reduce((n, x) => n + x.dur, 0);
  }
  return out;
}

/** Pure: the occurrences on one day as agenda items; `done` holds the ticked ids. */
export function dayAgenda(
  blocks: Block[],
  cats: Category[],
  day: string,
  done: string[],
): AgendaIn[] {
  return blocks
    .filter((x) => occursOn(x.day, x.repeat, day) && x.cat !== "sleep")
    .map((x) => ({
      id: x.id,
      title: x.title,
      sub: `${nameOf(cats, x.cat)}${x.note ? `, ${x.note}` : ""}`,
      tone: toneOf(cats, x.cat),
      day,
      start: x.start,
      dur: x.dur,
      done: done.includes(x.id),
    }));
}

// -------------------------------------------------------- the block form

export interface BlockDraft {
  title: string;
  cat: string;
  day: string;
  start: string;
  dur: string;
  repeat: string;
  note: string;
}

export const DURATIONS: [string, string][] = [
  ["15", "15 minutes"],
  ["30", "30 minutes"],
  ["45", "45 minutes"],
  ["60", "1 hour"],
  ["90", "1 hour 30"],
  ["120", "2 hours"],
  ["180", "3 hours"],
  ["240", "4 hours"],
  ["480", "8 hours"],
];

export function draftOf(x: Block): BlockDraft {
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return {
    title: x.title,
    cat: x.cat,
    day: x.day,
    start: `${pad(Math.floor(x.start / 60))}:${pad(x.start % 60)}`,
    dur: String(x.dur),
    repeat: x.repeat,
    note: x.note,
  };
}

/** Pure: what is wrong with the block form, by field. */
export function validateBlock(
  d: BlockDraft,
  cats: Category[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (d.title.trim() === "") errors.title = "Give the block a title.";
  else if (d.title.length > 40)
    errors.title = "Keep the title under 40 letters.";
  if (!cats.some((c) => c.id === d.cat)) errors.cat = "Choose a category.";
  if (Number.isNaN(dayOf(d.day))) errors.day = "Pick a date.";
  const start = minutesOf(d.start);
  if (Number.isNaN(start)) errors.start = "Choose a start time.";
  const dur = Number(d.dur);
  if (!Number.isFinite(dur) || dur < 5)
    errors.dur = "Choose how long it lasts.";
  else if (!errors.start && start + dur > 24 * 60 + 8 * 60) {
    errors.dur =
      "A block cannot run past eight in the morning of the next day.";
  }
  if (d.note.length > 80) errors.note = "Keep the note under 80 letters.";
  return errors;
}

export function nextBlockId(list: Block[]): string {
  const max = list.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0);
  return `b${max + 1}`;
}

/** Pure: the list with the block of the form saved (a new one when `id` is empty). */
export function saveBlock(list: Block[], d: BlockDraft, id: string): Block[] {
  const next: Block = {
    id: id || nextBlockId(list),
    title: d.title.trim(),
    cat: d.cat,
    day: d.day,
    start: minutesOf(d.start),
    dur: Number(d.dur),
    note: d.note.trim(),
    repeat: d.repeat as Repeat,
  };
  return id ? list.map((x) => (x.id === id ? next : x)) : [...list, next];
}

// ------------------------------------------------------------------- goals

export interface Goal {
  id: string;
  title: string;
  cat: string;
  /** Count the blocks (`sessions`) or add up their time (`minutes`). */
  kind: "sessions" | "minutes";
  target: number;
}

export const GOALS: Goal[] = [
  {
    id: "g1",
    title: "Train three times a week",
    cat: "sport",
    kind: "sessions",
    target: 3,
  },
  {
    id: "g2",
    title: "Study six hours a week",
    cat: "study",
    kind: "minutes",
    target: 360,
  },
  {
    id: "g3",
    title: "Family time, 18 hours",
    cat: "family",
    kind: "minutes",
    target: 1080,
  },
  {
    id: "g4",
    title: "Four hobby sessions",
    cat: "hobby",
    kind: "sessions",
    target: 4,
  },
  {
    id: "g5",
    title: "Work, 25 hours",
    cat: "work",
    kind: "minutes",
    target: 1500,
  },
];

/** Pure: how far a goal is over the given days. */
export function goalProgress(
  g: Goal,
  blocks: Block[],
  days: string[],
): { value: number; pct: number } {
  const spans = spansOf(blocks, days).filter((s) => s.cat === g.cat);
  const value =
    g.kind === "sessions" ? spans.length : spans.reduce((n, s) => n + s.dur, 0);
  return {
    value,
    pct:
      g.target <= 0 ? 0 : Math.min(100, Math.round((value / g.target) * 100)),
  };
}

// ------------------------------------------------------------------- tasks

export type Priority = "high" | "medium" | "low";

export const PRIORITIES: [Priority, string][] = [
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
];

export const TASKS: ListTask[] = [
  {
    id: "k1",
    group: "high",
    title: "Send the tax documents",
    owner: "",
    due: "2026-11-02",
    done: false,
    tag: "Errands",
    tagTone: "default",
  },
  {
    id: "k2",
    group: "high",
    title: "Finish the proposal draft",
    owner: "",
    due: "2026-11-03",
    done: false,
    tag: "Work",
    tagTone: "default",
  },
  {
    id: "k3",
    group: "high",
    title: "Book the dentist follow-up",
    owner: "",
    due: "2026-11-04",
    done: true,
    tag: "Errands",
    tagTone: "default",
  },
  {
    id: "k4",
    group: "medium",
    title: "Buy a birthday gift for Mum",
    owner: "",
    due: "2026-11-06",
    done: false,
    tag: "Family",
    tagTone: "default",
  },
  {
    id: "k5",
    group: "medium",
    title: "Renew the library card",
    owner: "",
    due: "",
    done: false,
    tag: "Errands",
    tagTone: "default",
  },
  {
    id: "k6",
    group: "low",
    title: "Re-string the guitar",
    owner: "",
    due: "",
    done: false,
    tag: "Hobbies",
    tagTone: "default",
  },
  {
    id: "k7",
    group: "low",
    title: "Sort the photos from the hike",
    owner: "",
    due: "",
    done: false,
    tag: "Hobbies",
    tagTone: "default",
  },
];

export interface TaskDraft {
  title: string;
  priority: string;
  cat: string;
}

export function validateTask(
  d: TaskDraft,
  list: ListTask[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const t = d.title.trim();
  if (t === "") errors.title = "Write what has to be done.";
  else if (t.length > 60) errors.title = "Keep it under 60 letters.";
  else if (
    list.some((x) => !x.done && x.title.toLowerCase() === t.toLowerCase())
  ) {
    errors.title = "This task is already on the list.";
  }
  return errors;
}

export function addTask(
  list: ListTask[],
  d: TaskDraft,
  cats: Category[],
): ListTask[] {
  const max = list.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0);
  return [
    ...list,
    {
      id: `k${max + 1}`,
      group: d.priority,
      title: d.title.trim(),
      owner: "",
      due: "",
      done: false,
      tag: nameOf(cats, d.cat),
      tagTone: "default",
    },
  ];
}

export const clearDone = (list: ListTask[]): ListTask[] =>
  list.filter((t) => !t.done);
