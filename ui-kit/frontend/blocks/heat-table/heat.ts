export const LEVELS = 6;

export interface HeatCell {
  id: string;
  text: string;
  /** 0 is empty, 1 (faint) to LEVELS (full colour). */
  level: number;
  tip: string;
}

export interface HeatRow {
  id: string;
  label: string;
  sub: string;
  cells: HeatCell[];
}

export interface HeatColumn {
  id: string;
  label: string;
}

/** Pure: the step (1 to `levels`) of a value between `min` and `max`; 0 for no value. */
export function heatLevel(
  value: number | null,
  min: number,
  max: number,
  levels = LEVELS,
): number {
  if (value === null || Number.isNaN(value)) return 0;
  if (max <= min) return levels;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return 1 + Math.round(t * (levels - 1));
}

/** Pure: the steps of the legend, `[1, 2, ... levels]`. */
export const heatSteps = (levels = LEVELS): number[] =>
  Array.from({ length: levels }, (_, i) => i + 1);

/** Pure: columns from labels (`id` is the position). */
export const columnsFrom = (labels: string[]): HeatColumn[] =>
  labels.map((label, i) => ({ id: `c${i}`, label }));

export interface HeatOptions {
  min: number;
  max: number;
  /** How a value is written in the cell. */
  format?: (value: number) => string;
}

/** Pure: a row from its values (`null` is a cell with nothing in it). */
export function heatRow(
  id: string,
  label: string,
  sub: string,
  values: (number | null)[],
  columns: HeatColumn[],
  opts: HeatOptions,
): HeatRow {
  const format = opts.format ?? String;
  return {
    id,
    label,
    sub,
    cells: values.map((v, i) => ({
      id: `${id}:${columns[i]?.id ?? i}`,
      text: v === null ? "" : format(v),
      level: heatLevel(v, opts.min, opts.max),
      tip:
        v === null ? "" : `${label}, ${columns[i]?.label ?? ""}: ${format(v)}`,
    })),
  };
}

/**
 * Pure: retention of a cohort. `active[i]` is how many of the `size` customers
 * are still there after month i (month 0 is everybody). Percentages, rounded;
 * months that did not happen yet are not given.
 */
export function retention(size: number, active: number[]): number[] {
  if (size <= 0) return active.map(() => 0);
  return active.map((n) => Math.round((n / size) * 100));
}

/** Pure: the average of each column, ignoring empty cells (`null`). */
export function columnAverages(rows: (number | null)[][]): (number | null)[] {
  const width = Math.max(0, ...rows.map((r) => r.length));
  return Array.from({ length: width }, (_, i) => {
    const seen = rows.map((r) => r[i]).filter((v): v is number => v != null);
    return seen.length === 0
      ? null
      : Math.round(seen.reduce((a, b) => a + b, 0) / seen.length);
  });
}
