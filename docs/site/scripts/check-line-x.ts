/**
 * One-off audit: reports segment-segment crossings in pure-concept-flow.svg
 * (excluding shared endpoints and the intended island-border piercings).
 * Usage: npx tsx docs/site/scripts/check-line-x.ts
 */
import { readFileSync } from "node:fs";

type Seg = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  src: string;
};

const svg = readFileSync("docs/diagrams/pure-concept-flow.svg", "utf8");

const segs: Seg[] = [];
for (const m of svg.matchAll(/<line ([^>]*)\/?>(?:<\/line>)?/g)) {
  const a = m[1];
  if (/dash/.test(a)) continue; // island border + server connector: pierced on purpose
  const g = (n: string): number =>
    Number((a.match(new RegExp(`${n}="([^"]+)"`)) ?? [])[1] ?? 0);
  segs.push({
    x1: g("x1"),
    y1: g("y1"),
    x2: g("x2"),
    y2: g("y2"),
    src: "line",
  });
}
for (const m of svg.matchAll(/<polyline ([^>]*)\/?>(?:<\/polyline>)?/g)) {
  const pts = ((m[1].match(/points="([^"]+)"/) ?? [])[1] ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const dash = /dash/.test(m[1]);
  for (let i = 0; i + 3 < pts.length; i += 2)
    if (!dash)
      segs.push({
        x1: pts[i],
        y1: pts[i + 1],
        x2: pts[i + 2],
        y2: pts[i + 3],
        src: "poly",
      });
}
for (const m of svg.matchAll(/<path d="([^"]+)"[^>]*\/>/g)) {
  if (/dash/.test(m[0])) continue; // island border: pierced on purpose
  const nums = (m[1].match(/-?[\d.]+/g) ?? []).map(Number);
  for (let i = 0; i + 3 < nums.length; i += 2)
    segs.push({
      x1: nums[i],
      y1: nums[i + 1],
      x2: nums[i + 2],
      y2: nums[i + 3],
      src: "path",
    });
}

const samePoint = (a: [number, number], b: [number, number]): boolean =>
  Math.abs(a[0] - b[0]) < 2 && Math.abs(a[1] - b[1]) < 2;

const cross = (p: [number, number][], q: [number, number][]): boolean => {
  const d = (a: [number, number], b: [number, number], c: [number, number]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const s1 = d(p[0], p[1], q[0]);
  const s2 = d(p[0], p[1], q[1]);
  const s3 = d(q[0], q[1], p[0]);
  const s4 = d(q[0], q[1], p[1]);
  return s1 * s2 < 0 && s3 * s4 < 0;
};

let n = 0;
for (let i = 0; i < segs.length; i++)
  for (let j = i + 1; j < segs.length; j++) {
    const a = segs[i];
    const b = segs[j];
    const pa: [number, number][] = [
      [a.x1, a.y1],
      [a.x2, a.y2],
    ];
    const pb: [number, number][] = [
      [b.x1, b.y1],
      [b.x2, b.y2],
    ];
    if (
      samePoint(pa[0], pb[0]) ||
      samePoint(pa[0], pb[1]) ||
      samePoint(pa[1], pb[0]) ||
      samePoint(pa[1], pb[1])
    )
      continue;
    if (cross(pa, pb)) {
      n++;
      console.log(
        `CROSS: [${a.x1},${a.y1}]-[${a.x2},${a.y2}] (${a.src}) x [${b.x1},${b.y1}]-[${b.x2},${b.y2}] (${b.src})`,
      );
    }
  }
console.log(n === 0 ? "no segment crossings" : `${n} crossing(s)`);
process.exitCode = n === 0 ? 0 : 1;
