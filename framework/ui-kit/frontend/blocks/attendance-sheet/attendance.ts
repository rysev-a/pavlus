import { initials, type Tone } from "../admin-shell/shell.ts";

export type Mark = "present" | "absent" | "late" | "";

/** The data: who is on the register and what was marked. */
export interface Pupil {
  id: string;
  name: string;
  mark: Mark;
  note: string;
}

export interface MarkButton {
  id: Exclude<Mark, "">;
  label: string;
  tone: Tone;
  active: boolean;
}

export interface AttRow {
  id: string;
  name: string;
  initials: string;
  note: string;
  mark: Mark;
  marks: MarkButton[];
}

export interface Segment {
  id: string;
  label: string;
  count: number;
  pct: number;
  tone: Tone;
}

export interface Summary {
  total: number;
  present: number;
  absent: number;
  late: number;
  unmarked: number;
  /** Present or late, as a percentage of those marked (0 when nobody is marked). */
  rate: number;
  segs: Segment[];
}

const BUTTONS: [MarkButton["id"], string, Tone][] = [
  ["present", "Present", "success"],
  ["late", "Late", "warning"],
  ["absent", "Absent", "destructive"],
];

/** Pure: the rows for the register. */
export function rowsOf(pupils: Pupil[]): AttRow[] {
  return pupils.map((p) => ({
    id: p.id,
    name: p.name,
    initials: initials(p.name),
    note: p.note,
    mark: p.mark,
    marks: BUTTONS.map(([id, label, tone]) => ({
      id,
      label,
      tone,
      active: p.mark === id,
    })),
  }));
}

/** Pure: the counts, the rate and the widths of the bar. */
export function summarize(pupils: Pupil[]): Summary {
  const count = (m: Mark) => pupils.filter((p) => p.mark === m).length;
  const total = pupils.length;
  const present = count("present");
  const late = count("late");
  const absent = count("absent");
  const unmarked = count("");
  const marked = total - unmarked;
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  return {
    total,
    present,
    late,
    absent,
    unmarked,
    rate: marked === 0 ? 0 : Math.round(((present + late) / marked) * 100),
    segs: [
      seg("present", "Present", present, pct(present), "success"),
      seg("late", "Late", late, pct(late), "warning"),
      seg("absent", "Absent", absent, pct(absent), "destructive"),
      seg("unmarked", "Not marked", unmarked, pct(unmarked), "muted"),
    ],
  };
}

const seg = (
  id: string,
  label: string,
  count: number,
  pct: number,
  tone: Tone,
): Segment => ({ id, label, count, pct: Math.round(pct * 10) / 10, tone });

/** Pure: mark one pupil; pressing the same mark again clears it. */
export function setMark(pupils: Pupil[], id: string, mark: Mark): Pupil[] {
  return pupils.map((p) =>
    p.id === id ? { ...p, mark: p.mark === mark ? "" : mark } : p,
  );
}

/** Pure: mark everybody who is not marked yet. */
export function markRest(pupils: Pupil[], mark: Mark): Pupil[] {
  return pupils.map((p) => (p.mark === "" ? { ...p, mark } : p));
}

/** Pure: clear all marks. */
export const clearMarks = (pupils: Pupil[]): Pupil[] =>
  pupils.map((p) => ({ ...p, mark: "" }));
