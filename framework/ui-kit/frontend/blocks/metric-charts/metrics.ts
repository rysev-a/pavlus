/**
 * Metrics for a machine as small box charts. The numbers are not measured:
 * `series` makes a believable, repeatable curve from a seed, so the same
 * machine and range always draw the same chart.
 */
import { type Tone, loadTone } from "../admin-shell/shell.ts";

export type RangeId = "1h" | "6h" | "24h";

export interface Axis {
  start: string;
  mid: string;
  end: string;
}

export const RANGES: {
  id: RangeId;
  label: string;
  points: number;
  axis: Axis;
}[] = [
  {
    id: "1h",
    label: "1 hour",
    points: 30,
    axis: { start: "1 h ago", mid: "30 min", end: "now" },
  },
  {
    id: "6h",
    label: "6 hours",
    points: 36,
    axis: { start: "6 h ago", mid: "3 h", end: "now" },
  },
  {
    id: "24h",
    label: "24 hours",
    points: 48,
    axis: { start: "24 h ago", mid: "12 h", end: "now" },
  },
];

export type Unit = "%" | "MB/s" | "Mbit/s" | "IOPS";

export interface MetricDef {
  id: string;
  title: string;
  unit: Unit;
  seed: number;
  /** The usual level and how far it swings, in the unit. */
  base: number;
  amp: number;
  /** The top of the scale; percentages use 100. */
  max: number;
}

/** Pure: a small seeded random generator. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Pure: `n` values near `base`, swinging by about `amp`, never below 0 or above `max`. */
export function series(
  seed: number,
  n: number,
  base: number,
  amp: number,
  max: number,
): number[] {
  const rand = rng(seed);
  const values: number[] = [];
  let drift = 0;
  for (let i = 0; i < n; i++) {
    drift = drift * 0.7 + (rand() - 0.5) * amp;
    const wave = Math.sin((i / n) * Math.PI * 2 + seed) * amp * 0.35;
    values.push(Math.min(max, Math.max(0, base + drift + wave)));
  }
  return values;
}

export interface Bar {
  id: number;
  /** Height in percent of the scale. */
  h: number;
  tip: string;
  last: boolean;
  hot: boolean;
}

export interface Chart {
  id: string;
  title: string;
  current: string;
  detail: string;
  tone: Tone;
  bars: Bar[];
  axis: Axis;
}

export function formatValue(value: number, unit: Unit): string {
  if (unit === "%") return `${Math.round(value)}%`;
  if (unit === "IOPS") return `${Math.round(value)} IOPS`;
  return `${(Math.round(value * 10) / 10).toFixed(1)} ${unit}`;
}

/** Pure: one chart for a metric and a range. A stopped machine draws an empty chart. */
export function chartOf(
  def: MetricDef,
  range: RangeId,
  running: boolean,
): Chart {
  const r = RANGES.find((x) => x.id === range) ?? RANGES[0];
  const idx = RANGES.indexOf(r);
  const values = running
    ? series(def.seed + idx * 131, r.points, def.base, def.amp, def.max)
    : r.points > 0
      ? Array.from({ length: r.points }, () => 0)
      : [];
  const peak = Math.max(0, ...values);
  const avg = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0;
  const current = values.length ? values[values.length - 1] : 0;
  const hotAt = def.unit === "%" ? 85 : def.max * 0.85;
  return {
    id: def.id,
    title: def.title,
    current: running ? formatValue(current, def.unit) : "offline",
    detail: running
      ? `peak ${formatValue(peak, def.unit)} · average ${formatValue(avg, def.unit)}`
      : "the machine is not running",
    tone: !running
      ? "muted"
      : def.unit === "%"
        ? loadTone((current / def.max) * 100)
        : "default",
    axis: r.axis,
    bars: values.map((v, i) => ({
      id: i,
      h: running ? Math.max(3, Math.round((v / def.max) * 100)) : 2,
      tip: formatValue(v, def.unit),
      last: i === values.length - 1,
      hot: v >= hotAt,
    })),
  };
}

export const DEFAULT_METRICS: MetricDef[] = [
  { id: "cpu", title: "CPU", unit: "%", seed: 11, base: 38, amp: 40, max: 100 },
  {
    id: "mem",
    title: "Memory",
    unit: "%",
    seed: 23,
    base: 62,
    amp: 12,
    max: 100,
  },
  {
    id: "net",
    title: "Network out",
    unit: "Mbit/s",
    seed: 37,
    base: 24,
    amp: 30,
    max: 100,
  },
  {
    id: "disk",
    title: "Disk IO",
    unit: "IOPS",
    seed: 41,
    base: 340,
    amp: 380,
    max: 1200,
  },
];

/** Pure: a seed for a machine from its id, so every machine has its own curves. */
export function seedOf(id: string): number {
  let h = 7;
  for (const ch of id) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h % 997;
}

/** Pure: the charts of a machine for a range. */
export function chartsFor(
  machineId: string,
  range: RangeId,
  running: boolean,
  metrics: MetricDef[] = DEFAULT_METRICS,
): Chart[] {
  const salt = seedOf(machineId);
  return metrics.map((m) =>
    chartOf({ ...m, seed: m.seed + salt }, range, running),
  );
}
