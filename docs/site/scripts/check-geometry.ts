/**
 * Geometry sanity for the generated diagrams: everything drawn must sit
 * inside the canvas, and text must not run past the estimated width.
 * One-off helper: node docs/site/check-geometry.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "..", "diagrams");

let bad = 0;
for (const f of [
  "pipeline.svg",
  "pure-concept.svg",
  "tick-counter.svg",
  "tick-users.svg",
  ...[
    "ex-static.svg",
    "ex-text.svg",
    "ex-attributes.svg",
    "ex-if.svg",
    "ex-for.svg",
    "ex-list.svg",
    "ex-combined.svg",
  ],
]) {
  const s = readFileSync(join(dir, f), "utf8");
  const W = +s.match(/width="(\d+)"/)![1];
  const H = +s.match(/height="(\d+)"/)![1];
  // rects
  for (const m of s.matchAll(
    /<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g,
  )) {
    const [x, y, w, h] = m.slice(1).map(Number);
    if (x < -1 || y < -1 || x + w > W + 1 || y + h > H + 1) {
      console.log(
        `${f}: rect out of canvas (${x},${y},${w},${h}) canvas ${W}x${H}`,
      );
      bad++;
    }
  }
  // text overflow (mono estimate 0.62em per char, entities decoded)
  const decode = (t: string): string =>
    t.replace(/&(quot|amp|lt|gt|#\d+);/g, "x");
  for (const m of s.matchAll(
    /<text x="([-\d.]+)" y="([-\d.]+)" font-family="([^"]*)" font-size="([-\d.]+)"[^>]*text-anchor="(\w+)"[^>]*>([^<]*)<\/text>/g,
  )) {
    const [, xs, , , sizeS, anchor, content] = m;
    const x = Number(xs);
    const size = Number(sizeS);
    const est = decode(content).length * size * 0.62;
    const left =
      anchor === "middle" ? x - est / 2 : anchor === "end" ? x - est : x;
    if (left < -2 || left + est > W + 2) {
      console.log(
        `${f}: text overflow (${anchor}) x=${x} size=${size} len=${content.length} → ${Math.round(left)}..${Math.round(left + est)} canvas ${W}: ${JSON.stringify(content.slice(0, 60))}`,
      );
      bad++;
    }
  }
  // tree node boxes on the same level (same y) must not overlap
  const nodeRects: { x: number; y: number; w: number }[] = [];
  for (const m of s.matchAll(
    /<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g,
  )) {
    const [x, y, w, h] = m.slice(1).map(Number);
    if (h > 20 && h < 90) nodeRects.push({ x, y, w });
  }
  const byY = new Map<number, typeof nodeRects>();
  for (const r of nodeRects) {
    const arr = byY.get(r.y) ?? [];
    arr.push(r);
    byY.set(r.y, arr);
  }
  for (const [y, arr] of byY) {
    arr.sort((a, b) => a.x - b.x);
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const cur = arr[i];
      if (prev.x + prev.w > cur.x + 0.5) {
        console.log(
          `${f}: overlapping node rects at y=${y}: [${prev.x}..${prev.x + prev.w}] vs [${cur.x}..${cur.x + cur.w}]`,
        );
        bad++;
      }
    }
  }
  // unclosed
  const opens = (s.match(/<text /g) ?? []).length;
  const closes = (s.match(/<\/text>/g) ?? []).length;
  if (opens !== closes) {
    console.log(`${f}: <text> mismatch ${opens} vs ${closes}`);
    bad++;
  }
}
console.log(bad === 0 ? "geometry: ok" : `geometry: ${bad} problem(s)`);
