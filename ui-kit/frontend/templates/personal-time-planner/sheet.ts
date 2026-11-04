import type { Category } from "../../blocks/category-manager/cats.ts";
import {
  button,
  type Field,
  field,
  selectField,
  type SheetButton,
  valuesOf,
} from "../../blocks/record-sheet/sheet.ts";
import { clockOf } from "../../blocks/week-calendar/dates.ts";
import { REPEATS } from "../../blocks/week-calendar/week.ts";
import { type BlockDraft, DURATIONS, TODAY } from "./plan.ts";

export interface SheetState {
  open: boolean;
  /** The id of the block being edited; empty for a new one. */
  id: string;
  title: string;
  description: string;
  fields: Field[];
  buttons: SheetButton[];
}

/** Every half hour of the day. */
export const STARTS: [string, string][] = Array.from({ length: 48 }, (_, i) => {
  const t = clockOf(i * 30);
  return [t, t];
});

export const newDraft = (cat: string, day = TODAY, hour = 9): BlockDraft => ({
  title: "",
  cat,
  day,
  start: clockOf(hour * 60),
  dur: "60",
  repeat: "none",
  note: "",
});

/** Pure: the form of a block, with the errors by field. */
export function blockSheet(
  cats: Category[],
  d: BlockDraft,
  id: string,
  errors: Record<string, string> = {},
): SheetState {
  // a start that is not on the half hour still has to be a choice
  const starts: [string, string][] = STARTS.some(([v]) => v === d.start)
    ? STARTS
    : [[d.start, d.start], ...STARTS];
  const fields: Field[] = [
    field("title", "Title", d.title, { placeholder: "What are you doing?" }),
    selectField(
      "cat",
      "Category",
      d.cat,
      cats.map((c) => [c.id, c.name]),
    ),
    field("day", "Day", d.day, { kind: "date" }),
    selectField("start", "Starts at", d.start, starts),
    selectField(
      "dur",
      "Length",
      d.dur,
      DURATIONS.some(([v]) => v === d.dur)
        ? DURATIONS
        : [[d.dur, `${d.dur} minutes`], ...DURATIONS],
    ),
    selectField(
      "repeat",
      "Repeat",
      d.repeat,
      REPEATS.map(([v, l]) => [v, l]),
    ),
    field("note", "Note", d.note, {
      kind: "textarea",
      placeholder: "Optional",
    }),
  ].map((f) => ({ ...f, error: errors[f.id] ?? "" }));
  return {
    open: true,
    id,
    title: id ? "Edit block" : "New block",
    description: id
      ? "Changes apply to every repeat of this block."
      : "It goes into your week at the time you choose.",
    fields,
    buttons: id
      ? [button("delete", "Delete", "destructive"), button("save", "Save")]
      : [button("save", "Add to my week")],
  };
}

export const closedSheet = (cats: Category[]): SheetState => ({
  ...blockSheet(cats, newDraft(cats[0].id), ""),
  open: false,
});

export function draftFrom(fields: Field[]): BlockDraft {
  const v = valuesOf(fields);
  return {
    title: v.title,
    cat: v.cat,
    day: v.day,
    start: v.start,
    dur: v.dur,
    repeat: v.repeat,
    note: v.note,
  };
}
