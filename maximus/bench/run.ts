/**
 * Benchmark: a 1000-row keyed table in jsdom.
 *
 *   node --experimental-strip-types bench/run.ts [rows] [iterations]
 *
 * IMPORTANT: jsdom is not a browser. It has no layout, style or paint, and its
 * DOM is plain JavaScript objects, so these numbers measure the JavaScript work
 * of Maximus plus jsdom's per-call cost. Use them to compare scenarios with
 * each other and to catch regressions, not to claim browser speed.
 *
 * Each scenario runs `iterations` times against a live mount (state alternates
 * so every timed step is a real change); the median is printed, with min/max.
 * Input data is built before the clock starts. The microtask flush is awaited
 * inside the timed region.
 *
 * @module
 */
// @ts-ignore jsdom ships no types here
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>");
const g = globalThis as unknown as Record<string, unknown>;
g.document = dom.window.document;
g.window = dom.window;

const { signal, batch, flushSync } = await import("../src/core/mod.ts");
const { html, each, render } = await import("../src/dom/mod.ts");
type Signal<T> = import("../src/core/mod.ts").Signal<T>;

const ROWS = Number(process.argv[2] ?? 1000);
const ITER = Number(process.argv[3] ?? 25);

interface Row {
  id: number;
  label: Signal<string>;
  n: number;
}

let nextId = 1;
const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, () => ({
    id: nextId++,
    label: signal("row " + nextId),
    n: nextId % 97,
  }));

const median = (xs: number[]): number =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const fmt = (ms: number): string => ms.toFixed(3).padStart(9) + " ms";

function app(rows: Signal<Row[]>, selected: Signal<number>) {
  return html`<table>
    <tbody>
      ${each(
        rows,
        (r) => r.id,
        (item) =>
          html`<tr class=${() => (selected() === item().id ? "sel" : "")}>
            <td class="id">${() => item().id}</td>
            <td class="label">${() => item().label()}</td>
            <td class="n">${() => item().n}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

interface Result {
  name: string;
  times: number[];
}
const results: Result[] = [];

/** Run `prepare` (untimed) then `step` (timed, includes the effect flush) ITER times after 3 warm-ups, then `check`. */
function scenario(
  name: string,
  step: (i: number) => void,
  check: () => void,
  prepare: (i: number) => void = () => {},
): void {
  const times: number[] = [];
  for (let i = 0; i < ITER + 3; i++) {
    prepare(i);
    flushSync();
    const t0 = performance.now();
    step(i);
    flushSync();
    const t1 = performance.now();
    if (i >= 3) times.push(t1 - t0);
  }
  check();
  results.push({ name, times });
}

function mounted(initial: Row[]) {
  const rows = signal(initial);
  const selected = signal(-1);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => app(rows, selected), host);
  return {
    rows,
    selected,
    host,
    done() {
      dispose();
      host.remove();
    },
  };
}

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error("bench check failed: " + msg);
};

{
  // create: fresh data each iteration, time only mount + flush
  let t = mounted([]);
  scenario(
    `create ${ROWS} rows`,
    () => {
      t = mounted(makeRows(ROWS));
    },
    () => assert(t.host.querySelectorAll("tr").length === ROWS, "create"),
    () => t.done(),
  );
  t.done();
}

{
  const data = makeRows(ROWS);
  const t = mounted(data);
  const mid = Math.floor(ROWS / 2);
  const labelAt = (i: number): string =>
    t.host.querySelectorAll("tr")[i]!.querySelector(".label")!.textContent!;
  scenario(
    "update one row (label signal)",
    (i) => data[mid]!.label.set("changed " + i),
    () => assert(labelAt(mid) === "changed " + (ITER + 2), "update one"),
  );
  scenario(
    `update all ${ROWS} labels (batched)`,
    (i) =>
      batch(() => data.forEach((r) => r.label.set("all " + i + " " + r.id))),
    () => assert(labelAt(5) === `all ${ITER + 2} ${data[5]!.id}`, "update all"),
  );
  scenario(
    "select row (one class binding per row re-evaluated)",
    (i) => t.selected.set(data[(i % 2 === 0 ? 1 : 2) * 3]!.id),
    () => assert(t.host.querySelectorAll("tr.sel").length === 1, "select"),
  );
  scenario(
    "swap rows 2 and N-1",
    () => {
      const next = t.rows().slice();
      [next[1], next[ROWS - 2]] = [next[ROWS - 2]!, next[1]!];
      t.rows.set(next);
    },
    () => assert(t.host.querySelectorAll("tr").length === ROWS, "swap"),
  );
  scenario(
    "remove one row (middle)",
    () => {
      const next = t.rows().slice();
      next.splice(Math.floor(next.length / 2), 1);
      t.rows.set(next);
    },
    () =>
      assert(
        t.host.querySelectorAll("tr").length === ROWS - ITER - 3,
        "remove",
      ),
  );
  scenario(
    "append 1 row",
    () => t.rows.set([...t.rows(), ...makeRows(1)]),
    () =>
      assert(
        t.host.querySelectorAll("tr").length === ROWS - ITER - 3 + ITER + 3,
        "append",
      ),
  );
  scenario(
    `clear all rows`,
    () => t.rows.set([]),
    () => assert(t.host.querySelectorAll("tr").length === 0, "clear"),
    () => t.rows.set(makeRows(ROWS)),
  );
  t.done();
}

console.log(
  `\nMaximus bench: ${ROWS} rows, ${ITER} timed iterations, node ${process.version}, jsdom (NOT a browser)`,
);
console.log(
  "scenario".padEnd(58),
  "median".padStart(11),
  "min".padStart(11),
  "max".padStart(11),
);
for (const r of results) {
  console.log(
    r.name.padEnd(58),
    fmt(median(r.times)),
    fmt(Math.min(...r.times)),
    fmt(Math.max(...r.times)),
  );
}
