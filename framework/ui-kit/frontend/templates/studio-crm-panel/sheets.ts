import {
  button,
  type Detail,
  detail,
  type Field,
  field,
  type SheetButton,
  selectField,
} from "../../blocks/record-sheet/sheet.ts";
import {
  BOARD,
  clientName,
  type CrmTask,
  dateOf,
  INVOICE_TONE,
  type Invoice,
  invoiceAction,
  PEOPLE,
  PROJECTS,
  projectName,
  START,
  TODAY,
  usd,
  viewOf,
} from "./crm.ts";

/** What the sheet holds: a task being written, or an invoice being looked at. */
export interface SheetState {
  open: boolean;
  kind: "task" | "invoice";
  /** The id of the task or the invoice; empty for a new task. */
  id: string;
  draft: TaskDraft;
  title: string;
  description: string;
  fields: Field[];
  details: Detail[];
  buttons: SheetButton[];
}

export interface TaskDraft {
  title: string;
  project: string;
  who: string;
  column: string;
  /** `2026-11-12` */
  due: string;
}

/** Pure: `2026-11-12` as a day of the timeline (NaN when it is not a date). */
export function isoToDay(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return Number.NaN;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const start = Date.UTC(START.y, START.m - 1, START.d);
  return Math.round((ms - start) / 86400000);
}

/** Pure: a day of the timeline as `2026-11-12`. */
export function dayToIso(day: number): string {
  const d = new Date(Date.UTC(START.y, START.m - 1, START.d + day));
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export const newTaskDraft = (project: string): TaskDraft => ({
  title: "",
  project,
  who: PEOPLE[0],
  column: "todo",
  due: dayToIso(TODAY + 7),
});

export const draftOfTask = (x: CrmTask): TaskDraft => ({
  title: x.title,
  project: x.project,
  who: x.who,
  column: x.column,
  due: dayToIso(x.dueDay),
});

/** Pure: what is wrong with the task form, by field. */
export function validateTask(d: TaskDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.title.trim()) errors.title = "Give the task a title.";
  if (Number.isNaN(isoToDay(d.due))) errors.due = "Pick a due date.";
  return errors;
}

/** Pure: the list with the task of the form saved (a new one when `id` is empty). */
export function saveTask(list: CrmTask[], d: TaskDraft, id: string): CrmTask[] {
  const dueDay = isoToDay(d.due);
  const old = list.find((x) => x.id === id);
  const next: CrmTask = {
    id: id || nextTaskId(list),
    title: d.title.trim(),
    column: d.column,
    project: d.project,
    who: d.who,
    due: dateOf(dueDay),
    dueDay,
    tag: old?.tag ?? "Task",
    tone: old?.tone ?? "default",
  };
  return id ? list.map((x) => (x.id === id ? next : x)) : [...list, next];
}

export function nextTaskId(list: CrmTask[]): string {
  const max = list.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0);
  return `t${max + 1}`;
}

export function taskFields(
  d: TaskDraft,
  errors: Record<string, string> = {},
): Field[] {
  const fields = [
    field("title", "Title", d.title, { placeholder: "What has to be done" }),
    selectField(
      "project",
      "Project",
      d.project,
      PROJECTS.map((p) => [p.id, p.name]),
    ),
    selectField(
      "who",
      "Owner",
      d.who,
      PEOPLE.map((p) => [p, p]),
    ),
    selectField(
      "column",
      "Column",
      d.column,
      BOARD.map((c) => [c.id, c.title]),
    ),
    field("due", "Due", d.due, { kind: "date" }),
  ];
  return fields.map((f) => ({ ...f, error: errors[f.id] ?? "" }));
}

export function taskSheet(
  id: string,
  d: TaskDraft,
  errors: Record<string, string> = {},
): SheetState {
  return {
    open: true,
    kind: "task",
    id,
    draft: d,
    title: id ? "Edit task" : "New task",
    description: id
      ? `Due ${dateOf(isoToDay(d.due) || 0)}`
      : "It goes to the column you choose.",
    fields: taskFields(d, errors),
    details: [],
    buttons: id
      ? [
          button("delete", "Delete", "destructive"),
          button("save", "Save changes"),
        ]
      : [button("save", "Add task")],
  };
}

export function invoiceSheet(i: Invoice): SheetState {
  const v = viewOf(i);
  const label = invoiceAction(i);
  return {
    open: true,
    kind: "invoice",
    id: i.id,
    draft: newTaskDraft("p1"),
    title: i.number,
    description: `${clientName(i.client)} · ${projectName(i.project, PROJECTS)}`,
    fields: [],
    details: [
      detail("Amount", usd(i.amount)),
      detail("Issued", dateOf(i.issued)),
      detail("Due", dateOf(i.due)),
      detail("Status", v, INVOICE_TONE[v]),
    ],
    buttons: label ? [button("advance", label)] : [],
  };
}

export const closedSheet = (): SheetState => ({
  ...taskSheet("", newTaskDraft("p1")),
  open: false,
});
