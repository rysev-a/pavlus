import {
  addDays,
  clockOf,
  durationText,
  longDay,
} from "../week-calendar/dates.ts";

export interface AgendaIn {
  id: string;
  title: string;
  sub: string;
  tone: string;
  day: string;
  /** Minutes from midnight. */
  start: number;
  dur: number;
  /** Optional: ticked off by the person. */
  done?: boolean;
}

export type AgendaState = "past" | "now" | "next" | "later" | "done";

export interface AgendaItem {
  id: string;
  title: string;
  sub: string;
  tone: string;
  start: string;
  end: string;
  dur: string;
  state: AgendaState;
  done: boolean;
}

export interface AgendaDay {
  id: string;
  label: string;
  items: AgendaItem[];
}

/** Pure: `Today`, `Tomorrow`, or `Wed, Nov 4`. */
export function dayLabel(day: string, today: string): string {
  if (day === today) return `Today, ${longDay(day).split(", ")[1]}`;
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  return longDay(day);
}

/** Pure: where an item stands against the clock (only today has a clock). */
export function stateOf(
  it: AgendaIn,
  today: string,
  nowMin: number,
  nextId: string,
): AgendaState {
  if (it.done) return "done";
  if (it.day < today) return "past";
  if (it.day > today) return "later";
  if (it.start + it.dur <= nowMin) return "past";
  if (it.start <= nowMin) return "now";
  return it.id === nextId ? "next" : "later";
}

/** Pure: the id of the first item still to come today ("" when none). */
export function nextToday(
  items: AgendaIn[],
  today: string,
  nowMin: number,
): string {
  const upcoming = items
    .filter((i) => i.day === today && !i.done && i.start > nowMin)
    .sort((a, b) => a.start - b.start);
  return upcoming[0]?.id ?? "";
}

/** Pure: the items grouped by day and sorted by start time. */
export function agendaOf(
  items: AgendaIn[],
  today: string,
  nowMin: number,
): AgendaDay[] {
  const next = nextToday(items, today, nowMin);
  const days = [...new Set(items.map((i) => i.day))].sort();
  return days.map((day) => ({
    id: day,
    label: dayLabel(day, today),
    items: items
      .filter((i) => i.day === day)
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
      .map(
        (i): AgendaItem => ({
          id: i.id,
          title: i.title,
          sub: i.sub,
          tone: i.tone,
          start: clockOf(i.start),
          end: clockOf(i.start + i.dur),
          dur: durationText(i.dur),
          state: stateOf(i, today, nowMin, next),
          done: Boolean(i.done),
        }),
      ),
  }));
}
