import type { Tone } from "../admin-shell/shell.ts";

export type Trend = "up" | "down" | "flat";

export interface Bar {
  h: number;
  last: boolean;
}

export interface Card {
  id: string;
  label: string;
  value: string;
  /** `+12.5%`, or empty. */
  delta: string;
  trend: Trend;
  hint: string;
  /** An icon class: `k-ai-bed`. */
  icon: string;
  tone: "default" | "success" | "warning" | "destructive" | "info" | "teal";
  bars: Bar[];
}

/** Pure: values to bar heights in percent (the biggest is 100, never below 8). */
export function bars(values: number[]): Bar[] {
  const max = Math.max(1, ...values);
  return values.map((v, i) => ({
    h: Math.max(8, Math.round((v / max) * 100)),
    last: i === values.length - 1,
  }));
}

/** Pure: the change from `prev` to `cur` as text and a direction. */
export function change(
  cur: number,
  prev: number,
): { delta: string; trend: Trend } {
  if (prev === 0) return { delta: "", trend: "flat" };
  const pct = ((cur - prev) / prev) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return { delta: "0%", trend: "flat" };
  return {
    delta: `${rounded > 0 ? "+" : ""}${rounded}%`,
    trend: rounded > 0 ? "up" : "down",
  };
}

/** Pure: a card, with the bars built from a series. */
export function card(
  id: string,
  label: string,
  value: string,
  opts: Partial<Omit<Card, "id" | "label" | "value" | "bars">> & {
    series?: number[];
  } = {},
): Card {
  const { series, ...rest } = opts;
  return {
    delta: "",
    trend: "flat",
    hint: "",
    icon: "k-ai-chart",
    tone: "default",
    ...rest,
    id,
    label,
    value,
    bars: series ? bars(series) : [],
  };
}

export type { Tone };
