import type { Tone } from "../admin-shell/shell.ts";

export interface ColumnDef {
  id: string;
  title: string;
}

export interface Task {
  id: string;
  title: string;
  /** The column it is in. */
  column: string;
  project: string;
  who: string;
  due: string;
  tag: string;
  tone: Tone;
}

/** What the template shows: a card knows which way it can move. */
export interface CardView {
  id: string;
  title: string;
  sub: string;
  who: string;
  due: string;
  tag: string;
  tone: Tone;
  canLeft: boolean;
  canRight: boolean;
}

export interface ColumnView {
  id: string;
  title: string;
  count: number;
  cards: CardView[];
}

/** Pure: the column a task moves to (`left` or `right`), or the same one at the ends. */
export function targetColumn(
  columns: ColumnDef[],
  current: string,
  dir: "left" | "right",
): string {
  const i = columns.findIndex((c) => c.id === current);
  if (i < 0) return current;
  const j = dir === "left" ? i - 1 : i + 1;
  return j < 0 || j >= columns.length ? current : columns[j].id;
}

/** Pure: the tasks with one of them moved one column over (order is kept). */
export function moveTask<T extends Task>(
  tasks: T[],
  columns: ColumnDef[],
  id: string,
  dir: "left" | "right",
): T[] {
  return tasks.map((t) =>
    t.id === id ? { ...t, column: targetColumn(columns, t.column, dir) } : t,
  );
}

/** Pure: the board: each column with its cards, in the order of the list. */
export function boardOf(columns: ColumnDef[], tasks: Task[]): ColumnView[] {
  return columns.map((col, i) => {
    const cards = tasks
      .filter((t) => t.column === col.id)
      .map((t): CardView => ({
        id: t.id,
        title: t.title,
        sub: t.project,
        who: t.who,
        due: t.due,
        tag: t.tag,
        tone: t.tone,
        canLeft: i > 0,
        canRight: i < columns.length - 1,
      }));
    return { id: col.id, title: col.title, count: cards.length, cards };
  });
}
