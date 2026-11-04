/**
 * One-off audit: finds strokes (line/polyline) that cut through text runs in
 * the two concept svgs — the class of visual error where a connector crosses
 * a label. Approximate: text width = chars * size * 0.6, height = size + 4.
 * Usage: npx tsx docs/site/scripts/check-line-text.ts
 */
import { readFileSync } from "node:fs";

type Box = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
};

const svgOf = (f: string): string => readFileSync(`docs/diagrams/${f}`, "utf8");

/** Bounding boxes of text elements (anchored start/middle/end). */
const textBoxes = (svg: string): Box[] =>
  [...svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map((m) => {
    const attrs = m[1];
    const get = (n: string): number =>
      Number((attrs.match(new RegExp(`${n}="([^"]+)"`)) ?? [])[1] ?? 0);
    const anchor = (attrs.match(/text-anchor="([^"]+)"/) ?? [])[1] ?? "start";
    const size = get("font-size") || 11;
    const t = m[2];
    const w = [...t].length * size * 0.6;
    const x = get("x");
    const x1 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
    return { x1, y1: get("y") - size, x2: x1 + w, y2: get("y") + 3, label: t };
  });

const strokeBoxes = (svg: string): Box[] => {
  const out: Box[] = [];
  for (const m of svg.matchAll(/<line ([^>]*)\/?>(?:<\/line>)?/g)) {
    const a = m[1];
    const g = (n: string): number =>
      Number((a.match(new RegExp(`${n}="([^"]+)"`)) ?? [])[1] ?? 0);
    out.push({
      x1: Math.min(g("x1"), g("x2")),
      y1: Math.min(g("y1"), g("y2")),
      x2: Math.max(g("x1"), g("x2")),
      y2: Math.max(g("y1"), g("y2")),
      label: "line",
    });
  }
  for (const m of svg.matchAll(/<path d="([^"]+)"[^>]*\/>/g)) {
    const nums = (m[1].match(/-?[\d.]+/g) ?? []).map(Number);
    for (let i = 0; i + 3 < nums.length; i += 2)
      out.push({
        x1: Math.min(nums[i], nums[i + 2]),
        y1: Math.min(nums[i + 1], nums[i + 3]),
        x2: Math.max(nums[i], nums[i + 2]),
        y2: Math.max(nums[i + 1], nums[i + 3]),
        label: "path",
      });
  }
  for (const m of svg.matchAll(/<polyline ([^>]*)\/?>(?:<\/polyline>)?/g)) {
    const pts = ((m[1].match(/points="([^"]+)"/) ?? [])[1] ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    for (let i = 0; i + 3 < pts.length; i += 2)
      out.push({
        x1: Math.min(pts[i], pts[i + 2]),
        y1: Math.min(pts[i + 1], pts[i + 3]),
        x2: Math.max(pts[i], pts[i + 2]),
        y2: Math.max(pts[i + 1], pts[i + 3]),
        label: "poly",
      });
  }
  return out;
};

/** True when the stroke's spine passes through the text box (not just bboxes). */
const hits = (s: Box, t: Box): boolean => {
  const horiz = s.y2 - s.y1 < 1;
  const vert = s.x2 - s.x1 < 1;
  if (horiz) {
    const y = s.y1;
    if (y < t.y1 || y > t.y2) return false;
    return s.x1 < t.x2 && s.x2 > t.x1;
  }
  if (vert) {
    const x = s.x1;
    if (x < t.x1 || x > t.x2) return false;
    return s.y1 < t.y2 && s.y2 > t.y1;
  }
  // diagonal: sample the segment against the box
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const x = s.x1 + (s.x2 - s.x1) * f;
    const y = s.y1 + (s.y2 - s.y1) * f;
    if (x >= t.x1 && x <= t.x2 && y >= t.y1 && y <= t.y2) return true;
  }
  return false;
};

let failures = 0;
for (const file of ["pure-concept.svg", "pure-concept-flow.svg"]) {
  const svg = svgOf(file);
  const texts = textBoxes(svg);
  const strokes = strokeBoxes(svg);
  for (const s of strokes)
    for (const t of texts)
      if (hits(s, t)) {
        failures++;
        console.log(
          `FAIL ${file}: stroke [${s.x1},${s.y1}]-[${s.x2},${s.y2}] crosses "${t.label}" (${Math.round(t.x1)},${Math.round(t.y1)})`,
        );
      }
  console.log(`${file}: ${texts.length} texts, ${strokes.length} strokes`);
}
if (failures === 0) console.log("no line-text crossings");
else process.exitCode = 1;
