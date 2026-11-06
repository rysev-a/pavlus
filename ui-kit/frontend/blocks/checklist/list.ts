import type { Tone } from "../admin-shell/shell.ts";
import { shortDate } from "../week-calendar/dates.ts";

/** A task as the owner of the data stores it. */
export interface Task {
  id: string;
  title: string;
  /** The id of its group. */
  group: string;
  /** A person or a team: `IT`, `Ana K.`. Empty for none. */
  owner: string;
  /** `2026-11-05`, or empty. */
  due: string;
  done: boolean;
  /** A short label (`High`, `Form`), or empty. */
  tag: string;
  tagTone: Tone;
}

export interface GroupDef {
  id: string;
  title: string;
  hint: string;
}

export type TaskState = "open" | "done" | "overdue" | "today";

export interface TaskView {
  id: string;
  title: string;
  owner: string;
  due: string;
  done: boolean;
  state: TaskState;
  tag: string;
  tagTone: Tone;
}

export interface GroupView {
  id: string;
  title: string;
  hint: string;
  done: number;
  total: number;
  pct: number;
  tone: Tone;
  items: TaskView[];
}

export interface Progress {
  done: number;
  total: number;
  pct: number;
}

/** Pure: how many tasks are done, as a count and a rounded percentage. */
export function progress(tasks: Task[]): Progress {
  const done = tasks.filter((t) => t.done).length;
  const total = tasks.length;
  return {
    done,
    total,
    pct: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** Pure: a task is overdue when it is not done and its due day has passed. */
export const isOverdue = (task: Task, today: string): boolean =>
  !task.done && task.due !== "" && task.due < today;

export const overdueCount = (tasks: Task[], today: string): number =>
  tasks.filter((t) => isOverdue(t, today)).length;

export function stateOf(task: Task, today: string): TaskState {
  if (task.done) return "done";
  if (isOverdue(task, today)) return "overdue";
  return task.due === today ? "today" : "open";
}

/** Pure: the tone of a group's bar: all done is green, something late is red. */
export function groupTone(tasks: Task[], today: string): Tone {
  if (tasks.length > 0 && tasks.every((t) => t.done)) return "success";
  if (overdueCount(tasks, today) > 0) return "destructive";
  return "default";
}

/** Pure: the tasks with one of them ticked or unticked. */
export function toggleTask(tasks: Task[], id: string): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}

/** Pure: the groups, each with its tasks (in the order given) and its progress. */
export function checklistOf(
  tasks: Task[],
  defs: GroupDef[],
  today: string,
): GroupView[] {
  return defs.map((def) => {
    const mine = tasks.filter((t) => t.group === def.id);
    const p = progress(mine);
    return {
      id: def.id,
      title: def.title,
      hint: def.hint,
      done: p.done,
      total: p.total,
      pct: p.pct,
      tone: groupTone(mine, today),
      items: mine.map(
        (t): TaskView => ({
          id: t.id,
          title: t.title,
          owner: t.owner,
          due: t.due ? shortDate(t.due) : "",
          done: t.done,
          state: stateOf(t, today),
          tag: t.tag,
          tagTone: t.tagTone,
        }),
      ),
    };
  });
}

/** A task by hand, for seeds. */
export function task(
  id: string,
  group: string,
  title: string,
  owner: string,
  due: string,
  done = false,
  tag = "",
  tagTone: Tone = "default",
): Task {
  return { id, group, title, owner, due, done, tag, tagTone };
}
