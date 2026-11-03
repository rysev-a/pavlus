export interface AreaInput {
  id: string;
  label: string;
  value: number;
}

export interface AreaPoint {
  id: string;
  label: string;
  /** The value as text (the tip). */
  text: string;
  /** Percent from the left of the plot: the centre of the point. */
  x: number;
  /** Percent from the left of the hover column, and its width. */
  left: number;
  width: number;
  /** Percent from the bottom. */
  y: number;
}

export interface Tick {
  id: string;
  label: string;
  /** Percent from the bottom. */
  y: number;
}

export interface Area {
  points: AreaPoint[];
  ticks: Tick[];
  /** `polygon(...)` for the filled area. */
  area: string;
  /** `polygon(...)` for a thin line along the top of the area. */
  line: string;
  /** The top of the scale. */
  max: number;
}

const PAD = 3;
const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Pure: a round number at or above `value` (1, 2, 2.5, 5 or 10 times a power of ten). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (value <= m * pow) return m * pow;
  }
  return 10 * pow;
}

/** Pure: `12400` becomes `$12.4k`; keeps small numbers whole. */
export function short(value: number, prefix = "", suffix = ""): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${prefix}${r1(value / 1_000_000)}M${suffix}`;
  if (abs >= 1000) return `${prefix}${r1(value / 1000)}k${suffix}`;
  return `${prefix}${r1(value)}${suffix}`;
}

/**
 * Pure: the geometry of a chart. The scale starts at 0 and ends at the next
 * round number above the biggest value (or `max`). `format` writes a value.
 */
export function areaChart(
  input: AreaInput[],
  opts: { max?: number; format?: (v: number) => string; thick?: number } = {},
): Area {
  const format = opts.format ?? ((v: number) => String(v));
  const thick = opts.thick ?? 1.8;
  const max = opts.max ?? niceMax(Math.max(0, ...input.map((i) => i.value)));
  const n = input.length;
  const step = n > 1 ? (100 - 2 * PAD) / (n - 1) : 0;
  const points = input.map((p, i): AreaPoint => {
    const x = n > 1 ? PAD + i * step : 50;
    const y = max <= 0 ? 0 : Math.max(0, Math.min(100, (p.value / max) * 100));
    const width = n > 1 ? step : 100;
    return {
      id: p.id,
      label: p.label,
      text: format(p.value),
      x: r1(x),
      left: r1(x - width / 2),
      width: r1(width),
      y: r1(y),
    };
  });
  const top = (p: AreaPoint) => `${p.x}% ${r1(100 - p.y)}%`;
  const dip = (p: AreaPoint) => `${p.x}% ${r1(100 - p.y + thick)}%`;
  const first = points[0];
  const last = points[points.length - 1];
  const area = first
    ? `polygon(${first.x}% 100%, ${points.map(top).join(", ")}, ${last.x}% 100%)`
    : "polygon(0 100%, 100% 100%, 100% 100%)";
  const line = first
    ? `polygon(${points.map(top).join(", ")}, ${[...points].reverse().map(dip).join(", ")})`
    : "polygon(0 100%, 100% 100%, 100% 100%)";
  const ticks = [0, 25, 50, 75, 100].map((y): Tick => ({
    id: `t${y}`,
    y,
    label: format((max * y) / 100),
  }));
  return { points, ticks, area, line, max };
}

/** Pure: the change between the last two values, as a percentage (0 when there is nothing to compare). */
export function lastChange(input: AreaInput[]): number {
  if (input.length < 2) return 0;
  const prev = input[input.length - 2].value;
  const cur = input[input.length - 1].value;
  return prev === 0 ? 0 : r1(((cur - prev) / prev) * 100);
}
