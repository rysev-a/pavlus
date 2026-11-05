/**
 * Three SVG charts drawn straight from signals with the `svg` tag. Each chart
 * is a function that runs once; the paths, bar widths and arc lengths are
 * bindings, so a new data point updates a few attributes and nothing else.
 */
import { computed, each, html, svg } from "../../src/mod.ts";
import type { Accessor, Child } from "../../src/mod.ts";

/** Colour-blind-safe categorical palette (Okabe-Ito order), defined as CSS variables in index.html. */
export const series = (i: number): string => `var(--series-${i % 6})`;

export interface Slice {
  key: string;
  value: number;
}

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export const fmt = (n: number): string => compact.format(Math.round(n));

/** "Nice" axis maximum: 1, 2, 5 times a power of ten. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

// ------------------------------------------------------------------ line

const W = 640;
const H = 190;
const BW = 480; // bar chart width
const PAD = { l: 44, r: 12, t: 12, b: 22 };

export function LineChart(props: {
  values: Accessor<readonly number[]>;
  label: string;
  /** How many points fit across the width. */
  span: number;
}): Child {
  const top = computed(() => niceMax(Math.max(0, ...props.values())));
  const x = (i: number): number =>
    PAD.l + (i / (props.span - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number): number =>
    PAD.t + (1 - v / top()) * (H - PAD.t - PAD.b);
  // the newest point sits at the right edge; a short series starts there too
  const pts = computed(() => {
    const v = props.values();
    const off = props.span - v.length;
    return v.map((n, i) => [x(i + off), y(n)] as const);
  });
  const line = computed(() =>
    pts()
      .map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`)
      .join(""),
  );
  const area = computed(() => {
    const p = pts();
    if (p.length === 0) return "";
    return `${line()}L${p[p.length - 1]![0].toFixed(1)} ${H - PAD.b}L${p[0]![0].toFixed(1)} ${H - PAD.b}Z`;
  });
  const last = computed(() => pts()[pts().length - 1]);
  const ticks = computed(() => [0, 0.5, 1].map((f) => f * top()));

  return html`<svg
    viewBox=${`0 0 ${W} ${H}`}
    class="chart"
    role="img"
    aria-label=${() =>
      `${props.label}: latest ${fmt(props.values()[props.values().length - 1] ?? 0)}, peak ${fmt(Math.max(0, ...props.values()))}`}
  >
    ${each(
      ticks,
      (t) => t,
      (t) => svg`<g class="grid">
        <line x1=${PAD.l} x2=${W - PAD.r} y1=${() => y(t())} y2=${() => y(t())} />
        <text x=${PAD.l - 6} y=${() => y(t()) + 4} text-anchor="end">${() => fmt(t())}</text>
      </g>`,
    )}
    <path class="area" d=${area} fill=${series(0)} />
    <path class="line" d=${line} stroke=${series(0)} fill="none" />
    ${() =>
      last()
        ? svg`<circle cx=${last()![0]} cy=${last()![1]} r="4" fill=${series(0)} />`
        : null}
  </svg>`;
}

// ------------------------------------------------------------------- bar

export function BarChart(props: {
  data: Accessor<readonly Slice[]>;
  label: string;
}): Child {
  const top = computed(() =>
    niceMax(Math.max(0, ...props.data().map((d) => d.value))),
  );
  const rowH = 34;
  return html`<svg
    viewBox=${() => `0 0 ${BW} ${props.data().length * rowH + 8}`}
    class="chart"
    role="img"
    aria-label=${() =>
      `${props.label}: ${props
        .data()
        .map((d) => `${d.key} ${fmt(d.value)}`)
        .join(", ")}`}
  >
    ${each(
      props.data,
      (d) => d.key,
      (d, i) => {
        const w = computed(() => (d().value / top()) * (BW - 150));
        return svg`<g transform=${() => `translate(0 ${i() * rowH + 4})`} class="bar">
          <text x="0" y="19" class="name">${() => d().key}</text>
          <rect x="84" y="4" height="22" rx="4" width=${w} fill=${() => series(i())} />
          <text x="0" y="20" class="value" style=${() => ({ transform: `translateX(${84 + w() + 6}px)` })}>${() => fmt(d().value)}</text>
        </g>`;
      },
    )}
  </svg>`;
}

// ----------------------------------------------------------------- donut

export function DonutChart(props: {
  data: Accessor<readonly Slice[]>;
  label: string;
}): Child {
  const R = 60;
  const C = 2 * Math.PI * R;
  const total = computed(() => props.data().reduce((n, d) => n + d.value, 0));
  const arcs = computed(() => {
    let acc = 0;
    const t = total() || 1;
    return props.data().map((d) => {
      const len = (d.value / t) * C;
      const a = { key: d.key, len, offset: -acc };
      acc += len;
      return a;
    });
  });
  const share = (key: string): string => {
    const d = props.data().find((x) => x.key === key);
    return total() ? `${Math.round(((d?.value ?? 0) / total()) * 100)}%` : "0%";
  };
  return html`<div class="donut">
    <svg
      viewBox="0 0 160 160"
      class="chart"
      role="img"
      aria-label=${() =>
        `${props.label}: ${props
          .data()
          .map((d) => `${d.key} ${share(d.key)}`)
          .join(", ")}`}
    >
      <g transform="rotate(-90 80 80)">
        ${each(
          arcs,
          (a) => a.key,
          (a, i) => svg`<circle
            cx="80" cy="80" r=${R} fill="none" stroke-width="22"
            stroke=${() => series(i())}
            stroke-dasharray=${() => `${Math.max(0, a().len - 1).toFixed(2)} ${C.toFixed(2)}`}
            stroke-dashoffset=${() => a().offset.toFixed(2)} />`,
        )}
      </g>
      <text x="80" y="84" text-anchor="middle" class="big">
        ${() => fmt(total())}
      </text>
    </svg>
    <ul class="legend">
      ${each(
        () => props.data(),
        (d) => d.key,
        (d, i) =>
          html`<li>
            <span
              class="swatch"
              style=${() => ({ background: series(i()) })}
            ></span>
            ${() => d().key} <b>${() => share(d().key)}</b>
          </li>`,
      )}
    </ul>
  </div>`;
}
