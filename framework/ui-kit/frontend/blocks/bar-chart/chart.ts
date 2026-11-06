import type { Tone } from "../admin-shell/shell.ts";

export interface BarInput {
  id: string;
  label: string;
  value: number;
  tone?: Tone;
  /** Print the value above the bar. */
  show?: boolean;
}

export interface Column {
  id: string;
  label: string;
  /** The text above the bar, or empty. */
  value: string;
  tip: string;
  /** Height in percent of the plot. */
  h: number;
  tone: Tone;
}

/** Pure: input values to columns scaled to `max` (default: the biggest value). */
export function columns(
  input: BarInput[],
  max = Math.max(1, ...input.map((b) => b.value)),
  unit = "",
): Column[] {
  return input.map((b) => ({
    id: b.id,
    label: b.label,
    value: b.show ? `${b.value}${unit}` : "",
    tip: `${b.label}: ${b.value}${unit}`,
    h:
      b.value <= 0
        ? 2
        : Math.max(4, Math.min(100, Math.round((b.value / max) * 100))),
    tone: b.tone ?? "default",
  }));
}
