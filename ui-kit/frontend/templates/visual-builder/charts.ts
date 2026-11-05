// Charts of the Chart element: SVG drawn from data with the framework's svg
// plugin (a template cannot contain SVG). Colours are CSS classes, so the kit's
// tokens (`--chart-1` ...) and the dark mode apply.
import type { SvgNode } from "@service-laboratory/pavlus/plugins/svg";
import {
  circle,
  g,
  line,
  path,
  rect,
  root,
  text,
} from "@service-laboratory/pavlus/plugins/svg/h";
import { getPath, listOf, type Scope, toText, truthy } from "./bind.ts";
import type { El } from "./model.ts";

export interface Point {
  label: string;
  value: number;
}

const num = (x: unknown): number => {
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
};

/** The points of a chart element from the live state. */
export function chartPoints(el: El, scope: Scope): Point[] {
  const rows = listOf(el.props.source ?? "", scope).filter((r) =>
    el.props.filter
      ? truthy(el.props.filter, { ...scope, row: r }, true)
      : true,
  );
  const lf = el.props.labelField || "label";
  const vf = el.props.valueField || "value";
  return rows.map((r, i) => {
    if (r !== null && typeof r === "object")
      return {
        label: toText(getPath(r, lf)) || String(i + 1),
        value: num(getPath(r, vf)),
      };
    return { label: String(i + 1), value: num(r) };
  });
}

export const W = 320;
export const H = 200;
const PAD = { l: 34, r: 10, t: 12, b: 28 };

const niceMax = (v: number): number => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

const fmt = (n: number): string =>
  Math.abs(n) >= 1000
    ? `${Math.round(n / 100) / 10}k`
    : String(Math.round(n * 10) / 10);

const clip = (s: string, n = 8): string =>
  s.length > n ? s.slice(0, n - 1) + "…" : s;

function axes(max: number): SvgNode[] {
  const out: SvgNode[] = [];
  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + ((H - PAD.t - PAD.b) * (4 - i)) / 4;
    out.push(
      line({
        key: `g${i}`,
        class: "vb-ch__grid",
        x1: PAD.l,
        x2: W - PAD.r,
        y1: y,
        y2: y,
      }),
      text(
        {
          key: `t${i}`,
          class: "vb-ch__tick",
          x: PAD.l - 4,
          y: y + 3,
          "text-anchor": "end",
        },
        fmt((max * i) / 4),
      ),
    );
  }
  return out;
}

export function chartTree(kind: string, pts: Point[]): SvgNode {
  const svgRoot = (...kids: (SvgNode | false | null)[]): SvgNode =>
    root(
      {
        viewBox: `0 0 ${W} ${H}`,
        class: "vb-ch",
        role: "img",
        "aria-label": `${kind} chart`,
      },
      ...kids,
    );
  if (pts.length === 0)
    return svgRoot(
      text(
        { class: "vb-ch__empty", x: W / 2, y: H / 2, "text-anchor": "middle" },
        "No data",
      ),
    );
  if (kind === "pie") return pie(pts, svgRoot);
  const max = niceMax(Math.max(...pts.map((p) => p.value), 0));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const step = iw / pts.length;
  if (kind === "line") {
    const xy = pts.map((p, i) => ({
      x: PAD.l + step * (i + 0.5),
      y: PAD.t + ih - (Math.max(0, p.value) / max) * ih,
    }));
    const d = xy
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    return svgRoot(
      ...axes(max),
      path({
        class: "vb-ch__area",
        d: `${d} L${xy[xy.length - 1].x.toFixed(1)} ${PAD.t + ih} L${xy[0].x.toFixed(1)} ${PAD.t + ih} Z`,
      }),
      path({ class: "vb-ch__line", d, fill: "none" }),
      ...xy.map((p, i) =>
        circle({ key: `p${i}`, class: "vb-ch__dot", cx: p.x, cy: p.y, r: 3.5 }),
      ),
      ...pts.map((p, i) =>
        text(
          {
            key: `l${i}`,
            class: "vb-ch__label",
            x: xy[i].x,
            y: H - 10,
            "text-anchor": "middle",
          },
          clip(p.label),
        ),
      ),
    );
  }
  const bw = Math.max(4, Math.min(48, step * 0.6));
  return svgRoot(
    ...axes(max),
    ...pts.map((p, i) => {
      const h = (Math.max(0, p.value) / max) * ih;
      const x = PAD.l + step * (i + 0.5) - bw / 2;
      return g(
        { key: `b${i}` },
        rect({
          class: "vb-ch__bar",
          x,
          y: PAD.t + ih - h,
          width: bw,
          height: h,
          rx: 3,
        }),
        text(
          {
            class: "vb-ch__label",
            x: x + bw / 2,
            y: H - 10,
            "text-anchor": "middle",
          },
          clip(p.label),
        ),
      );
    }),
  );
}

function pie(pts: Point[], wrap: (...k: SvgNode[]) => SvgNode): SvgNode {
  const total = pts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const cx = 100;
  const cy = H / 2;
  const r = 78;
  if (total <= 0)
    return wrap(
      text(
        { class: "vb-ch__empty", x: W / 2, y: H / 2, "text-anchor": "middle" },
        "No data",
      ),
    );
  let a0 = -Math.PI / 2;
  const slices = pts.map((p, i) => {
    const frac = Math.max(0, p.value) / total;
    const a1 = a0 + frac * Math.PI * 2;
    const big = frac > 0.5 ? 1 : 0;
    const full = frac >= 0.9999;
    const d = full
      ? `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0Z`
      : `M${cx} ${cy} L${(cx + r * Math.cos(a0)).toFixed(2)} ${(cy + r * Math.sin(a0)).toFixed(2)} A${r} ${r} 0 ${big} 1 ${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)}Z`;
    a0 = a1;
    return path({ key: `s${i}`, class: `vb-ch__slice vb-ch__s${i % 6}`, d });
  });
  const legend = pts.slice(0, 8).flatMap((p, i) => [
    rect({
      key: `k${i}`,
      class: `vb-ch__s${i % 6} vb-ch__key`,
      x: 198,
      y: 24 + i * 20,
      width: 10,
      height: 10,
      rx: 2,
    }),
    text(
      { key: `n${i}`, class: "vb-ch__label", x: 214, y: 33 + i * 20 },
      `${clip(p.label, 10)} ${Math.round((Math.max(0, p.value) / total) * 100)}%`,
    ),
  ]);
  return wrap(...slices, ...legend);
}

/** The text the chart reads for a screen reader / the design canvas. */
export function chartSummary(pts: Point[]): string {
  return pts.map((p) => `${p.label}: ${fmt(p.value)}`).join(", ");
}
