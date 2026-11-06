import type { Tone } from "../admin-shell/shell.ts";
import { clampPct } from "../admin-shell/shell.ts";

/** One line of a pick list: take `qty` of a product from a place. */
export interface PickLine {
  id: string;
  /** `A-02-05`. */
  loc: string;
  sku: string;
  name: string;
  qty: number;
  picked: boolean;
}

export interface PickProgress {
  lines: number;
  done: number;
  units: number;
  unitsDone: number;
  pct: number;
  tone: Tone;
  /** `3 of 8 lines, 41 of 120 units`. */
  text: string;
  complete: boolean;
}

export interface PickLineView extends PickLine {
  /** `x 12`. */
  qtyText: string;
}

/** Pure: how far a pick list is. */
export function progressOf(lines: PickLine[]): PickProgress {
  const done = lines.filter((l) => l.picked).length;
  const units = lines.reduce((n, l) => n + l.qty, 0);
  const unitsDone = lines
    .filter((l) => l.picked)
    .reduce((n, l) => n + l.qty, 0);
  const pct = lines.length === 0 ? 0 : clampPct((done / lines.length) * 100);
  return {
    lines: lines.length,
    done,
    units,
    unitsDone,
    pct,
    tone: pct === 100 ? "success" : pct >= 50 ? "info" : "default",
    text: `${done} of ${lines.length} lines, ${unitsDone} of ${units} units`,
    complete: lines.length > 0 && done === lines.length,
  };
}

/** Pure: a line ticked or unticked. */
export function togglePick(lines: PickLine[], id: string): PickLine[] {
  return lines.map((l) => (l.id === id ? { ...l, picked: !l.picked } : l));
}

/** Pure: every line ticked, or every line unticked when all were done. */
export function tickAll(lines: PickLine[]): PickLine[] {
  const all = lines.length > 0 && lines.every((l) => l.picked);
  return lines.map((l) => ({ ...l, picked: !all }));
}

/** Pure: the lines in walking order (by place), with the text of the quantity. */
export function walkOrder(lines: PickLine[]): PickLineView[] {
  return [...lines]
    .sort((a, b) => a.loc.localeCompare(b.loc) || a.name.localeCompare(b.name))
    .map((l) => ({ ...l, qtyText: `x ${l.qty}` }));
}

/** Pure: the next line to pick, in walking order, or null. */
export function nextLine(lines: PickLine[]): PickLine | null {
  return walkOrder(lines).find((l) => !l.picked) ?? null;
}
