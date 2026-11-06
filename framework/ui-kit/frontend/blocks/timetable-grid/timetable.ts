import type { Tone } from "../admin-shell/shell.ts";

/** A column: a weekday, a doctor. */
export interface TtCol {
  id: string;
  label: string;
  sub: string;
  /** Highlight the column (today). */
  today: boolean;
}

/** A row: a period or a time slot. A break has a note and no cells. */
export interface TtSlot {
  id: string;
  label: string;
  sub: string;
  /** Text of a break row; empty for a normal slot. */
  note: string;
}

/** Something placed in a column, from `slot` for `span` slots. */
export interface TtEntry {
  id: string;
  col: string;
  slot: string;
  span: number;
  title: string;
  sub: string;
  tone: Tone;
}

export type TtCellKind = "empty" | "entry" | "cont";

export interface TtCell {
  key: string;
  kind: TtCellKind;
  col: string;
  slot: string;
  /** The entry that fills the cell (empty text for none). */
  id: string;
  title: string;
  sub: string;
  tone: Tone;
  today: boolean;
  /** The last slot an entry covers (the entry rounds its corners here). */
  last: boolean;
}

export interface TtRow extends TtSlot {
  isBreak: boolean;
  cells: TtCell[];
}

export const col = (
  id: string,
  label: string,
  sub = "",
  today = false,
): TtCol => ({ id, label, sub, today });

export const slot = (
  id: string,
  label: string,
  sub = "",
  note = "",
): TtSlot => ({ id, label, sub, note });

export function entry(
  id: string,
  colId: string,
  slotId: string,
  title: string,
  opts: { sub?: string; tone?: Tone; span?: number } = {},
): TtEntry {
  return {
    id,
    col: colId,
    slot: slotId,
    title,
    sub: opts.sub ?? "",
    tone: opts.tone ?? "default",
    span: Math.max(1, opts.span ?? 1),
  };
}

/** Pure: the entry that covers a cell, and whether the cell is its first slot. */
export function coverOf(
  entries: TtEntry[],
  slots: TtSlot[],
  colId: string,
  slotIndex: number,
): { entry: TtEntry; first: boolean; last: boolean } | null {
  for (const e of entries) {
    if (e.col !== colId) continue;
    const start = slots.findIndex((s) => s.id === e.slot);
    if (start < 0) continue;
    if (slotIndex >= start && slotIndex < start + e.span) {
      return {
        entry: e,
        first: slotIndex === start,
        last: slotIndex === start + e.span - 1,
      };
    }
  }
  return null;
}

/** Pure: the grid rows, one cell per column in each slot. The first entry wins an overlap. */
export function buildGrid(
  cols: TtCol[],
  slots: TtSlot[],
  entries: TtEntry[],
): TtRow[] {
  return slots.map((s, i) => ({
    ...s,
    isBreak: s.note !== "",
    cells: s.note
      ? []
      : cols.map((c): TtCell => {
          const cover = coverOf(entries, slots, c.id, i);
          const base = {
            key: `${c.id}:${s.id}`,
            col: c.id,
            slot: s.id,
            today: c.today,
          };
          if (!cover) {
            return {
              ...base,
              kind: "empty",
              id: "",
              title: "",
              sub: "",
              tone: "default",
              last: true,
            };
          }
          const e = cover.entry;
          return {
            ...base,
            kind: cover.first ? "entry" : "cont",
            id: e.id,
            title: e.title,
            sub: e.sub,
            tone: e.tone,
            last: cover.last,
          };
        }),
  }));
}

/** Pure: would an entry of `span` slots from `slotId` in `colId` collide with one already there? */
export function collides(
  entries: TtEntry[],
  slots: TtSlot[],
  colId: string,
  slotId: string,
  span: number,
  ignoreId = "",
): boolean {
  const start = slots.findIndex((s) => s.id === slotId);
  if (start < 0 || start + span > slots.length) return true;
  const others = entries.filter((e) => e.id !== ignoreId);
  for (let i = start; i < start + span; i++) {
    if (slots[i].note) return true;
    if (coverOf(others, slots, colId, i)) return true;
  }
  return false;
}

/** Pure: how many slots are used out of all the slots that can be used. */
export function fill(
  entries: TtEntry[],
  cols: TtCol[],
  slots: TtSlot[],
): { used: number; total: number; pct: number } {
  const total = cols.length * slots.filter((s) => !s.note).length;
  const used = entries.reduce((n, e) => n + e.span, 0);
  return {
    used,
    total,
    pct: total === 0 ? 0 : Math.round((used / total) * 100),
  };
}

/** Pure: slots from a start to an end, every `step` minutes: `09:00`, `09:30`... */
export function timeSlots(
  fromMin: number,
  toMin: number,
  step: number,
): TtSlot[] {
  const out: TtSlot[] = [];
  for (let t = fromMin; t < toMin; t += step) {
    out.push(slot(clock(t), clock(t), ""));
  }
  return out;
}

/** Pure: minutes after midnight as `09:05`. */
export function clock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
}
