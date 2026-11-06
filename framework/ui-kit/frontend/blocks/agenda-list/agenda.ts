import type { Tone } from "../admin-shell/shell.ts";
import { dayName } from "../month-grid/dates.ts";

export interface AgendaEntry {
  id: string;
  /** ISO day. */
  date: string;
  /** `10:30`. */
  time: string;
  title: string;
  sub: string;
  status: string;
  tone: Tone;
  /** The label of the button on the row, or empty for none. */
  action: string;
  done: boolean;
}

export interface AgendaDay {
  id: string;
  label: string;
  /** `Today` / `Tomorrow` / empty. */
  note: string;
  entries: AgendaEntry[];
}

/** Pure: the entries sorted by day and time. */
export function sortEntries(list: AgendaEntry[]): AgendaEntry[] {
  return [...list].sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
  );
}

/** Pure: the entries grouped by day, in order. */
export function agendaDays(
  list: AgendaEntry[],
  today: string,
  tomorrow: string,
): AgendaDay[] {
  const days: AgendaDay[] = [];
  for (const entry of sortEntries(list)) {
    const last = days[days.length - 1];
    if (last && last.id === entry.date) {
      last.entries.push(entry);
    } else {
      days.push({
        id: entry.date,
        label: dayName(entry.date),
        note:
          entry.date === today
            ? "Today"
            : entry.date === tomorrow
              ? "Tomorrow"
              : "",
        entries: [entry],
      });
    }
  }
  return days;
}
