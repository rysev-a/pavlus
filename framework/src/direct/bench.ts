/**
 * Benchmark: the vdom pipeline (compileToView + DomPlugin) against the
 * direct one (compileDirectToView + createDirectDomPlugin) on a 1000-row
 * table, in jsdom.
 *
 *   node --experimental-strip-types src/direct/bench.ts [rows] [iterations]
 *
 * jsdom is not a browser: it has no layout, style or paint, and its DOM
 * operations are plain JavaScript (a Map-and-linked-list tree), so the numbers
 * measure the JavaScript work of each pipeline plus jsdom's cost per DOM
 * call, not what a user would see. Treat ratios as indicative of the work
 * done, and re-measure in the browsers you ship to.
 *
 * Each scenario runs against one mount, alternating states so every timed
 * step is a real change; the median of the timed steps is printed (min and
 * max in the second line). State objects are built before the clock starts.
 *
 * @module
 */
import { compileToView } from "../compiler/mod.ts";
import { compileDirectToView } from "./mod.ts";
import { DomPlugin } from "../plugins/dom/mod.ts";
import { createDirectDomPlugin } from "../plugins/direct/mod.ts";
import type { PluginContext } from "../core/types.ts";

// @ts-ignore jsdom ships no types here
const { JSDOM } = await import("jsdom");
const dom = new JSDOM("<!doctype html><body></body>");
const doc: Document = dom.window.document;

const ROWS = Number(globalThis.process?.argv?.[2] ?? 1000);
const ITER = Number(globalThis.process?.argv?.[3] ?? 25);

const SOURCE = `table.t
  tbody
    for r in rows key r.id
      tr(class:sel={r.id === selected})
        td.id {r.id}
        td.label {r.label}
        td.n {r.n}
        td.act(@click=select(r.id)) x`;

interface Row {
  id: number;
  label: string;
  n: number;
}
interface State {
  rows: Row[];
  selected: number;
}

const make = (n: number, from = 0): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: from + i,
    label: `row ${from + i}`,
    n: (from + i) % 7,
  }));

let seed = 12345;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const shuffled = <T>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

interface Driver {
  name: string;
  /** Mounts into a fresh container; returns update and unmount. */
  mount(state: State): {
    update(next: State): void;
    unmount(): void;
    html(): string;
  };
}

function driver(name: "vdom" | "direct"): Driver {
  const view: any =
    name === "vdom"
      ? compileToView<State>(SOURCE)
      : compileDirectToView<State>(SOURCE);
  return {
    name,
    mount(state) {
      let current = state;
      const plugin: any =
        name === "vdom"
          ? new DomPlugin({ document: doc })
          : createDirectDomPlugin({ document: doc });
      const ctx: PluginContext<State> = {
        dispatch() {},
        getState: () => current,
        dispatchEffect() {},
      };
      plugin.init(ctx);
      const root = doc.createElement("div");
      doc.body.appendChild(root);
      plugin.handle({ plugin: "dom", type: "mount", target: root, view }, ctx);
      return {
        update(next) {
          const prev = current;
          current = next;
          plugin.handle({ plugin: "dom", type: "update", prev, next }, ctx);
        },
        unmount() {
          plugin.handle({ plugin: "dom", type: "unmount", target: root }, ctx);
          root.remove();
        },
        html: () => root.innerHTML.replace(/<!--[\s\S]*?-->/g, ""),
      };
    },
  };
}

const ms = (f: () => void): number => {
  const t = performance.now();
  f();
  return performance.now() - t;
};
const median = (xs: number[]): number =>
  [...xs].sort((a, b) => a - b)[xs.length >> 1];

interface Result {
  med: number;
  min: number;
  max: number;
}
const stat = (xs: number[]): Result => ({
  med: median(xs),
  min: Math.min(...xs),
  max: Math.max(...xs),
});

/** A scenario: the timed steps to run on a mount, as a list of states. */
interface Scenario {
  name: string;
  /** Initial state; `steps` are applied in order, each one timed. */
  base: State;
  steps: State[];
  /** Which steps to report (the others only restore the state). */
  report?: (i: number) => boolean;
  note?: string;
}

const base: State = { rows: make(ROWS), selected: -1 };
const mid = Math.floor(ROWS / 2);
const edited = (rows: Row[], i: number, label: string): Row[] => {
  const r = [...rows];
  r[i] = { ...r[i], label };
  return r;
};

const scenarios: Scenario[] = [];
{
  const steps: State[] = [];
  const reported: boolean[] = [];
  for (let i = 0; i < ITER; i++) {
    steps.push({ rows: edited(base.rows, mid, `edited ${i}`), selected: -1 });
  }
  scenarios.push({ name: "update 1 cell", base, steps });
}
{
  const steps: State[] = [];
  for (let i = 0; i < ITER; i++) {
    steps.push({
      rows: base.rows.map((r) => ({
        ...r,
        label: `gen ${i} ${r.id}`,
        n: r.n + i,
      })),
      selected: -1,
    });
  }
  scenarios.push({ name: "update every cell", base, steps });
}
{
  const steps: State[] = [];
  for (let i = 0; i < ITER; i++)
    steps.push({ rows: shuffled(base.rows), selected: -1 });
  scenarios.push({ name: "keyed shuffle (random permutation)", base, steps });
}
{
  const steps: State[] = [];
  let cur = base.rows;
  for (let i = 0; i < ITER; i++) {
    cur = [...cur].reverse();
    steps.push({ rows: cur, selected: -1 });
  }
  scenarios.push({ name: "keyed reverse", base, steps });
}
{
  // base -> +100 appended -> back (remove 100 from the tail) -> ...
  const grown: State = {
    rows: [...base.rows, ...make(100, ROWS)],
    selected: -1,
  };
  const steps: State[] = [];
  for (let i = 0; i < ITER; i++) steps.push(i % 2 === 0 ? grown : base);
  scenarios.push({
    name: "append 100 rows",
    base,
    steps,
    report: (i) => i % 2 === 0,
  });
  scenarios.push({
    name: "remove 100 rows (tail)",
    base,
    steps,
    report: (i) => i % 2 === 1,
  });
}
{
  // remove 100 from the middle, and put them back
  const cut: State = {
    rows: [...base.rows.slice(0, mid), ...base.rows.slice(mid + 100)],
    selected: -1,
  };
  const steps: State[] = [];
  for (let i = 0; i < ITER; i++) steps.push(i % 2 === 0 ? cut : base);
  scenarios.push({
    name: "remove 100 rows (middle)",
    base,
    steps,
    report: (i) => i % 2 === 0,
  });
  scenarios.push({
    name: "insert 100 rows (middle)",
    base,
    steps,
    report: (i) => i % 2 === 1,
  });
}
{
  const steps: State[] = [];
  for (let i = 0; i < ITER; i++)
    steps.push({ rows: base.rows, selected: (i * 37) % ROWS });
  scenarios.push({ name: "select a row (class toggle)", base, steps });
}

const drivers = [driver("vdom"), driver("direct")];

function run(d: Driver, s: Scenario): { r: Result; html: string } {
  const m = d.mount(s.base);
  const times: number[] = [];
  // two warm-up steps are applied but not timed
  m.update(s.steps[0]);
  m.update(s.steps[1] ?? s.base);
  s.steps.slice(2).forEach((st, i) => {
    const t = ms(() => m.update(st));
    if (!s.report || s.report(i + 2)) times.push(t);
  });
  const html = m.html();
  m.unmount();
  return { r: stat(times), html };
}

const rows: string[][] = [];
function initial(d: Driver): Result {
  // warm-up
  for (let i = 0; i < 3; i++) d.mount(base).unmount();
  const times: number[] = [];
  for (let i = 0; i < ITER; i++) {
    let m!: ReturnType<Driver["mount"]>;
    times.push(ms(() => (m = d.mount(base))));
    m.unmount();
  }
  return stat(times);
}

const fmt = (n: number): string => n.toFixed(n < 10 ? 2 : 1).padStart(8);
const line = (name: string, a: Result, b: Result): string[] => [
  name.padEnd(36),
  fmt(a.med),
  fmt(b.med),
  `${(a.med / b.med).toFixed(2)}x`.padStart(8),
  `  vdom ${a.min.toFixed(2)}..${a.max.toFixed(2)}  direct ${b.min.toFixed(2)}..${b.max.toFixed(2)}`,
];

// Alternate the order between scenarios so neither pipeline always runs second.
rows.push(
  line(
    `initial render, ${ROWS} rows`,
    initial(drivers[0]),
    initial(drivers[1]),
  ),
);
scenarios.forEach((s, i) => {
  const order = i % 2 === 0 ? [0, 1] : [1, 0];
  const out: { r: Result; html: string }[] = [];
  for (const k of order) out[k] = run(drivers[k], s);
  if (out[0].html !== out[1].html) {
    throw new Error(`bench: the two pipelines disagree in "${s.name}"`);
  }
  rows.push(line(s.name, out[0].r, out[1].r));
});

console.log(
  `rows=${ROWS} iterations=${ITER} node=${globalThis.process?.version} jsdom (not a browser)`,
);
console.log(
  `${"scenario".padEnd(36)}${"vdom ms".padStart(8)} ${"direct ms".padStart(8)} ${"vdom/dir".padStart(8)}  (median; min..max of the timed steps)`,
);
for (const r of rows) console.log(`${r[0]}${r[1]} ${r[2]} ${r[3]}${r[4]}`);
