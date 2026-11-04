import type { Tone } from "../admin-shell/shell.ts";

/** A place as the data has it: degrees. */
export interface GeoInput {
  id: string;
  label: string;
  sub: string;
  lat: number;
  lng: number;
  tone: Tone;
}

/** A point ready for the view: `x` and `y` are percents of the frame. */
export interface GeoPoint {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  tone: Tone;
  active: boolean;
  /** The label card opens to the left (the point is near the right edge). */
  flipX: boolean;
  /** The label card opens below (the point is near the top edge). */
  flipY: boolean;
}

export interface GeoTick {
  id: string;
  label: string;
  /** Percent from the left (longitude) or from the bottom (latitude). */
  pos: number;
}

export interface GeoLegendItem {
  id: string;
  label: string;
  tone: Tone;
}

export interface GeoBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface GeoPlot {
  points: GeoPoint[];
  legend: GeoLegendItem[];
  /** `lng` lines run up (labels under the frame), `lat` lines run across. */
  ticks: { lng: GeoTick[]; lat: GeoTick[] };
  box: GeoBox;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Pure: a step of 1, 2, 5 or 10 times a power of ten that gives about `want` lines over `span`. */
export function niceStep(span: number, want = 5): number {
  if (span <= 0) return 1;
  const raw = span / want;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) {
    if (raw <= m * pow) return m * pow;
  }
  return 10 * pow;
}

/** Pure: `-33.9` as `33.9°S`, `151.2` as `151.2°E`. */
export function degrees(value: number, axis: "lat" | "lng"): string {
  const hemi =
    axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  const abs = Math.abs(Math.round(value * 100) / 100);
  return `${abs}°${abs === 0 ? "" : hemi}`;
}

/** Pure: the box around the points, widened by `margin` (a share of each side) and never thinner than `minSpan` degrees. */
export function boxOf(
  points: Array<{ lat: number; lng: number }>,
  margin = 0.1,
  minSpan = 2,
): GeoBox {
  if (points.length === 0) {
    return { minLat: -60, maxLat: 80, minLng: -180, maxLng: 180 };
  }
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const grow = (lo: number, hi: number): [number, number] => {
    const span = Math.max(minSpan, hi - lo);
    const mid = (lo + hi) / 2;
    const half = (span * (1 + 2 * margin)) / 2;
    return [mid - half, mid + half];
  };
  const [minLat, maxLat] = grow(Math.min(...lats), Math.max(...lats));
  const [minLng, maxLng] = grow(Math.min(...lngs), Math.max(...lngs));
  return { minLat, maxLat, minLng, maxLng };
}

function ticksOf(
  lo: number,
  hi: number,
  axis: "lat" | "lng",
): GeoTick[] {
  const step = niceStep(hi - lo, 5);
  const out: GeoTick[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    const value = Math.round(v * 1e6) / 1e6;
    out.push({
      id: `${axis}${value}`,
      label: degrees(value, axis),
      pos: r1(((value - lo) / (hi - lo)) * 100),
    });
  }
  return out;
}

/**
 * Pure: places to a plot. The area is the box of the points with a margin
 * (equirectangular: x from longitude, y from latitude), so shops can be passed
 * straight in. `picked` is the id of the highlighted point (or null). The
 * legend lists each tone in `names` (a map of tone to a label, e.g. the shop
 * categories) that some point uses, in the order of first use.
 */
export function geoPlot(
  places: GeoInput[],
  picked: string | null = null,
  names: Array<{ tone: Tone; label: string }> = [],
  margin = 0.1,
): GeoPlot {
  const box = boxOf(places, margin);
  const w = box.maxLng - box.minLng;
  const h = box.maxLat - box.minLat;
  const points = places.map((p): GeoPoint => {
    const x = r1(((p.lng - box.minLng) / w) * 100);
    const y = r1(((p.lat - box.minLat) / h) * 100);
    return {
      id: p.id,
      label: p.label,
      sub: p.sub,
      x,
      y,
      tone: p.tone,
      active: p.id === picked,
      flipX: x > 60,
      flipY: y > 75,
    };
  });
  const used = new Set(places.map((p) => p.tone));
  const legend = names
    .filter((n) => used.has(n.tone))
    .map((n) => ({ id: `${n.tone}-${n.label}`, label: n.label, tone: n.tone }));
  return {
    points,
    legend,
    ticks: {
      lng: ticksOf(box.minLng, box.maxLng, "lng"),
      lat: ticksOf(box.minLat, box.maxLat, "lat"),
    },
    box,
  };
}
