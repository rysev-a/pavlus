// The Timeline tab: a Gantt chart of one request. Rows are the places where time
// is spent (the network, each plugin effect); bars are hops, plugin work, waits
// (the backoff before a retry), and the work a cancel cut short. Pure: the trace in,
// rows out; `timelineTree` draws them with the svg plugin.
import type { SvgNode } from "@service-laboratory/pavlus/plugins/svg";
import {
  g,
  line,
  rect,
  root,
  text,
} from "@service-laboratory/pavlus/plugins/svg/h";
import { type Step, type Trace, stepsOf } from "./engine.ts";
import { type Model, findNode } from "./model.ts";

export type BarKind =
  "hop" | "work" | "wait" | "cancelled" | "error" | "timeout" | "retry";

export interface Bar {
  t0: number;
  t1: number;
  kind: BarKind;
  label: string;
  step: number;
}
export interface Mark {
  t: number;
  label: string;
  kind: "cancel" | "abort" | "rollback" | "done" | "drop" | "timeout";
  step: number;
}
export interface TRow {
  id: string;
  label: string;
  bars: Bar[];
}
export interface Timeline {
  rid: string;
  rows: TRow[];
  marks: Mark[];
  t0: number;
  t1: number;
}

export function buildTimeline(m: Model, trace: Trace, rid: string): Timeline {
  const mine = stepsOf(trace, rid);
  const rows = new Map<string, TRow>();
  const row = (id: string, label: string): TRow => {
    let r = rows.get(id);
    if (!r) {
      r = { id, label, bars: [] };
      rows.set(id, r);
    }
    return r;
  };
  row("net", "network");
  const marks: Mark[] = [];
  const nodeLabel = (id: string): string => {
    const n = findNode(m, id);
    return n
      ? `${n.title}${n.kind === "effect" && n.detail ? ` ${n.detail.slice(0, 18)}` : ""}`
      : id;
  };
  let lastRetry: Step | null = null;
  for (const s of mine) {
    const dur = s.t - s.tStart;
    switch (s.type) {
      case "work":
      case "retry": {
        const r = row(s.to, nodeLabel(s.to));
        if (lastRetry && lastRetry.to === s.to && s.tStart > lastRetry.t)
          r.bars.push({
            t0: lastRetry.t,
            t1: s.tStart,
            kind: "wait",
            label: "backoff",
            step: lastRetry.i,
          });
        r.bars.push({
          t0: s.tStart,
          t1: s.t,
          kind:
            s.type === "retry"
              ? "retry"
              : s.status === "timeout"
                ? "timeout"
                : s.status === "error"
                  ? "error"
                  : "work",
          label: s.label,
          step: s.i,
        });
        lastRetry = s.type === "retry" ? s : null;
        break;
      }
      case "cancel": {
        row(s.to, nodeLabel(s.to)).bars.push({
          t0: s.tStart,
          t1: s.t,
          kind: "cancelled",
          label: s.label,
          step: s.i,
        });
        marks.push({ t: s.t, label: "cancel", kind: "cancel", step: s.i });
        break;
      }
      case "abort":
        marks.push({
          t: s.t,
          label: "client aborts",
          kind: "abort",
          step: s.i,
        });
        break;
      case "rollback":
        marks.push({ t: s.t, label: "rollback", kind: "rollback", step: s.i });
        break;
      case "timeout":
        marks.push({ t: s.t, label: "deadline", kind: "timeout", step: s.i });
        break;
      case "drop":
        marks.push({ t: s.t, label: "dropped", kind: "drop", step: s.i });
        break;
      case "done":
        marks.push({ t: s.t, label: "done", kind: "done", step: s.i });
        break;
      default:
        if (dur >= 0.5)
          row("net", "network").bars.push({
            t0: s.tStart,
            t1: s.t,
            kind: "hop",
            label: s.label,
            step: s.i,
          });
    }
  }
  const list = [...rows.values()].filter(
    (r) => r.bars.length > 0 || r.id === "net",
  );
  const all = [
    ...list.flatMap((r) => r.bars.flatMap((b) => [b.t0, b.t1])),
    ...marks.map((k) => k.t),
  ];
  const t0 = all.length ? Math.min(...all) : 0;
  const t1 = all.length ? Math.max(...all) : 1;
  return { rid, rows: list, marks, t0, t1: Math.max(t1, t0 + 1) };
}

export interface TimelineUi {
  /** the step shown by the debugger: a cursor at its time */
  cursor: number | null;
  prefix: string;
}

const LABEL_W = 170;
const ROW_H = 30;
const TOP = 34;
const WIDTH = 900;

/** a nice step for the time axis */
export function tickStep(span: number): number {
  const raw = span / 8;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 0.01)));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}

export function timelineTree(tl: Timeline, ui: TimelineUi): SvgNode {
  const plotW = WIDTH - LABEL_W - 24;
  const span = tl.t1 - tl.t0;
  const x = (t: number): number => LABEL_W + ((t - tl.t0) / span) * plotW;
  const height = TOP + tl.rows.length * ROW_H + 40;
  const step = tickStep(span);
  const ticks: SvgNode[] = [];
  for (let t = Math.ceil(tl.t0 / step) * step; t <= tl.t1 + 1e-9; t += step)
    ticks.push(
      line({
        key: `T${t}`,
        class: "fs-tl__grid",
        x1: x(t),
        y1: TOP - 6,
        x2: x(t),
        y2: height - 30,
      }),
      text(
        {
          key: `TL${t}`,
          class: "fs-tl__tick",
          x: x(t),
          y: TOP - 12,
          "text-anchor": "middle",
        },
        `${Math.round(t * 10) / 10}ms`,
      ),
    );
  const bars = tl.rows.flatMap((r, i) =>
    r.bars.map((b, k) =>
      g(
        { key: `B${r.id}-${k}`, class: `fs-tl__bar fs-tl__bar--${b.kind}` },
        rect({
          x: x(b.t0),
          y: TOP + i * ROW_H + 4,
          width: Math.max(3, x(b.t1) - x(b.t0)),
          height: ROW_H - 10,
          rx: 3,
          on: {
            click: {
              id: `${ui.prefix}tlStep`,
              payload: { i: b.step },
              stop: true,
            },
          },
        }),
        text(
          {
            class: "fs-tl__barlabel",
            x: x(b.t0) + 4,
            y: TOP + i * ROW_H + ROW_H / 2 + 3,
          },
          b.kind === "hop" || b.kind === "wait" ? "" : b.label.slice(0, 30),
        ),
      ),
    ),
  );
  const marks = tl.marks.map((k, i) =>
    g(
      { key: `K${i}`, class: `fs-tl__mark fs-tl__mark--${k.kind}` },
      line({ x1: x(k.t), y1: TOP - 4, x2: x(k.t), y2: height - 30 }),
      text({ x: x(k.t) + 3, y: height - 16 }, k.label),
    ),
  );
  return root(
    {
      viewBox: `0 0 ${WIDTH} ${height}`,
      class: "fs-tl",
      role: "img",
      "aria-label": `Timeline of request ${tl.rid}`,
    },
    ...ticks,
    ...tl.rows.map((r, i) =>
      text(
        {
          key: `R${r.id}`,
          class: "fs-tl__row",
          x: 6,
          y: TOP + i * ROW_H + ROW_H / 2 + 3,
        },
        r.label.slice(0, 26),
      ),
    ),
    ...bars,
    ...marks,
    ui.cursor !== null && ui.cursor >= tl.t0 && ui.cursor <= tl.t1
      ? line({
          key: "cursor",
          class: "fs-tl__cursor",
          x1: x(ui.cursor),
          y1: TOP - 8,
          x2: x(ui.cursor),
          y2: height - 30,
        })
      : null,
  );
}
