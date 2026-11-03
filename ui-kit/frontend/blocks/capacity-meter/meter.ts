import { clampPct, loadTone, type Tone } from "../admin-shell/shell.ts";

/** What the view needs: everything is already worked out. */
export interface Meter {
  label: string;
  value: number;
  max: number;
  /** 0 to 100, rounded. */
  pct: number;
  /** Places left, never below zero. */
  left: number;
  tone: Tone;
  /** `42 / 60 people`. */
  text: string;
  /** `Busy`, `Full`... */
  status: string;
  /** `18 places left`, or `No place left`. */
  note: string;
}

/** Pure: the word for a load. */
export function statusOf(value: number, max: number): string {
  if (max <= 0) return "Closed";
  if (value > max) return "Over capacity";
  if (value === max) return "Full";
  const pct = (value / max) * 100;
  if (pct >= 85) return "Almost full";
  if (pct >= 60) return "Busy";
  if (pct >= 25) return "Steady";
  return "Quiet";
}

/** Pure: a meter from a count and a limit (`unit` is the plural of what is counted). */
export function meterOf(
  label: string,
  value: number,
  max: number,
  unit = "people",
): Meter {
  const left = Math.max(0, max - value);
  const pct = max <= 0 ? 0 : clampPct((value / max) * 100);
  const one = unit === "people" ? "person" : unit.replace(/s$/, "");
  return {
    label,
    value,
    max,
    pct,
    left,
    tone: value > max ? "destructive" : loadTone(pct),
    text: `${value} / ${max} ${unit}`,
    status: statusOf(value, max),
    note:
      left === 0 ? "No place left" : `${left} ${left === 1 ? one : unit} left`,
  };
}

/** Pure: can one more get in? */
export const hasRoom = (value: number, max: number): boolean => value < max;

/** Pure: the count after a change, kept between 0 and `max` unless `over` is allowed. */
export function adjust(
  value: number,
  delta: number,
  max: number,
  over = false,
): number {
  const next = Math.max(0, value + delta);
  return over ? next : Math.min(max, next);
}
