import { initials, type Tone } from "../admin-shell/shell.ts";

/** The data: one thing somebody did. */
export interface LogEntry {
  id: string;
  actor: string;
  /** `changed the plan of`, `posted`... */
  verb: string;
  /** What it was done to. */
  target: string;
  /** An optional line under the sentence. */
  text: string;
  /** The day it belongs to (`Today`, `Yesterday`...). */
  day: string;
  time: string;
  tone: Tone;
  /** A small label (`Billing`, `Security`), or empty. */
  tag: string;
}

export interface LogItem extends LogEntry {
  initials: string;
}

export interface LogGroup {
  id: string;
  label: string;
  items: LogItem[];
}

export function entry(
  id: string,
  actor: string,
  verb: string,
  target: string,
  day: string,
  time: string,
  opts: { text?: string; tone?: Tone; tag?: string } = {},
): LogEntry {
  return {
    id,
    actor,
    verb,
    target,
    day,
    time,
    text: opts.text ?? "",
    tone: opts.tone ?? "default",
    tag: opts.tag ?? "",
  };
}

/** Pure: entries grouped by day, in the order the days first appear. */
export function groupByDay(entries: LogEntry[]): LogGroup[] {
  const groups: LogGroup[] = [];
  for (const e of entries) {
    let group = groups.find((g) => g.label === e.day);
    if (!group) {
      group = { id: `d${groups.length}`, label: e.day, items: [] };
      groups.push(group);
    }
    group.items.push({ ...e, initials: initials(e.actor) });
  }
  return groups;
}

/** Pure: the entries that match a tag (`all` matches every one) and a text query. */
export function matching(
  entries: LogEntry[],
  tag: string,
  query: string,
): LogEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter(
    (e) =>
      (tag === "all" || e.tag === tag) &&
      (!q ||
        `${e.actor} ${e.verb} ${e.target} ${e.text}`.toLowerCase().includes(q)),
  );
}

/** Pure: the distinct tags, in order of first use. */
export function tagsOf(entries: LogEntry[]): string[] {
  const tags: string[] = [];
  for (const e of entries) if (e.tag && !tags.includes(e.tag)) tags.push(e.tag);
  return tags;
}

/** Pure: a new entry goes on top of the list. */
export const prepend = (entries: LogEntry[], one: LogEntry): LogEntry[] => [
  one,
  ...entries,
];
