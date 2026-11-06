export type Labels = Record<string, string | number | boolean>;

const DEFAULT_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

interface Counter {
  kind: "counter";
  help?: string;
  series: Map<string, { labels: Labels; value: number }>;
}
interface Hist {
  kind: "histogram";
  help?: string;
  buckets: number[];
  series: Map<
    string,
    { labels: Labels; counts: number[]; sum: number; count: number }
  >;
}

const labelKey = (l: Labels) =>
  Object.keys(l)
    .sort()
    .map((k) => `${k}=${String(l[k])}`)
    .join("\u0000");

const esc = (v: string) =>
  v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
const fmtLabels = (l: Labels, extra?: [string, string]) => {
  const parts = Object.keys(l)
    .sort()
    .map((k) => `${k}="${esc(String(l[k]))}"`);
  if (extra) parts.push(`${extra[0]}="${extra[1]}"`);
  return parts.length ? `{${parts.join(",")}}` : "";
};
const num = (n: number) => (n === Infinity ? "+Inf" : String(n));

function checkName(name: string) {
  if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name))
    throw new Error(`metrics: bad metric name "${name}"`);
}

/** In-memory counters and histograms with a Prometheus text exposition. */
export class Metrics {
  #m = new Map<string, Counter | Hist>();

  inc(name: string, labels: Labels = {}, by = 1): void {
    checkName(name);
    let m = this.#m.get(name);
    if (!m) this.#m.set(name, (m = { kind: "counter", series: new Map() }));
    if (m.kind !== "counter")
      throw new Error(`metrics: "${name}" is a histogram`);
    const k = labelKey(labels);
    const s = m.series.get(k);
    if (s) s.value += by;
    else m.series.set(k, { labels, value: by });
  }

  observe(
    name: string,
    value: number,
    labels: Labels = {},
    buckets?: number[],
  ): void {
    checkName(name);
    let m = this.#m.get(name);
    if (!m)
      this.#m.set(
        name,
        (m = {
          kind: "histogram",
          buckets: [...(buckets ?? DEFAULT_BUCKETS)].sort((a, b) => a - b),
          series: new Map(),
        }),
      );
    if (m.kind !== "histogram")
      throw new Error(`metrics: "${name}" is a counter`);
    const k = labelKey(labels);
    let s = m.series.get(k);
    if (!s)
      m.series.set(
        k,
        (s = { labels, counts: m.buckets.map(() => 0), sum: 0, count: 0 }),
      );
    m.buckets.forEach((b, i) => {
      if (value <= b) s!.counts[i]!++;
    });
    s.sum += value;
    s.count++;
  }

  describe(name: string, help: string): void {
    const m = this.#m.get(name);
    if (m) m.help = help;
  }

  /** Current value of a counter series (0 when unknown). */
  value(name: string, labels: Labels = {}): number {
    const m = this.#m.get(name);
    return m?.kind === "counter"
      ? (m.series.get(labelKey(labels))?.value ?? 0)
      : 0;
  }

  reset(): void {
    this.#m.clear();
  }

  /** Prometheus text exposition format. */
  text(): string {
    const out: string[] = [];
    for (const [name, m] of [...this.#m].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      if (m.help) out.push(`# HELP ${name} ${m.help.replace(/\n/g, "\\n")}`);
      out.push(`# TYPE ${name} ${m.kind}`);
      if (m.kind === "counter") {
        for (const s of m.series.values())
          out.push(`${name}${fmtLabels(s.labels)} ${s.value}`);
      } else {
        for (const s of m.series.values()) {
          m.buckets.forEach((b, i) =>
            out.push(
              `${name}_bucket${fmtLabels(s.labels, ["le", num(b)])} ${s.counts[i]}`,
            ),
          );
          out.push(
            `${name}_bucket${fmtLabels(s.labels, ["le", "+Inf"])} ${s.count}`,
          );
          out.push(`${name}_sum${fmtLabels(s.labels)} ${s.sum}`);
          out.push(`${name}_count${fmtLabels(s.labels)} ${s.count}`);
        }
      }
    }
    return out.length ? out.join("\n") + "\n" : "";
  }
}
