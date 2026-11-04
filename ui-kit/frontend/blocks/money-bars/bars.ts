import type { Tone } from "../admin-shell/shell.ts";

/** One value of one month: `id` names the series (`income`). */
export interface MoneyValue {
  id: string;
  value: number;
  tone: Tone;
}

export interface MoneyRow {
  id: string;
  label: string;
  values: MoneyValue[];
}

export interface MoneyBar {
  id: string;
  /** Percent of the half-height of the plot (0 to 100). */
  h: number;
  /** The bar grows down from the zero line. */
  neg: boolean;
  tone: Tone;
  tip: string;
}

export interface MoneyMonth {
  id: string;
  label: string;
  bars: MoneyBar[];
}

export interface LegendItem {
  id: string;
  label: string;
  tone: Tone;
}

/**
 * Pure: values to grouped bars. One scale for every bar (the biggest absolute
 * value is 100), so a bar of 0 stays a hairline and a negative value grows down.
 */
export function moneyBars(
  rows: MoneyRow[],
  format: (value: number) => string = String,
  max?: number,
): MoneyMonth[] {
  const top =
    max ??
    Math.max(1, ...rows.flatMap((r) => r.values.map((v) => Math.abs(v.value))));
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    bars: row.values.map((v) => ({
      id: v.id,
      h:
        v.value === 0
          ? 1
          : Math.max(3, Math.min(100, Math.round((Math.abs(v.value) / top) * 100))),
      neg: v.value < 0,
      tone: v.tone,
      tip: `${row.label}, ${v.id}: ${format(v.value)}`,
    })),
  }));
}
