// The Catalog tab: every message id and every effect type of the design, who
// produces it, who consumes it, its payload schema and which generated tests play
// it. Pure: model in, rows out.
import { simulate, variantsOf } from "./engine.ts";
import {
  type EdgeKind,
  type FlowEdge,
  type PayloadField,
  type Model,
  findNode,
} from "./model.ts";

export interface CatalogRow {
  kind: "message" | "effect";
  id: string;
  /** titles of the nodes that send it */
  producers: string[];
  /** titles of the nodes that receive it */
  consumers: string[];
  /** the edge kinds it travels as */
  edgeKinds: EdgeKind[];
  fields: PayloadField[];
  /** the ids of the edges, for the click-to-focus */
  edges: string[];
  /** the titles of the generated tests that play it */
  tests: string[];
}

/** Which test plays which label: the happy path and each fault path are simulated. */
export function coverage(m: Model): Map<string, string[]> {
  const cov = new Map<string, string[]>();
  for (const v of variantsOf(m)) {
    const trace = simulate(m, v.scenario, v.scenario.seed);
    for (const s of trace) {
      if (!s.edge || s.edge.includes(":")) continue;
      const list = cov.get(s.label) ?? [];
      if (!list.includes(v.title)) list.push(v.title);
      cov.set(s.label, list);
    }
  }
  return cov;
}

const uniq = (xs: string[]): string[] => [...new Set(xs)];

export function catalogOf(m: Model, withTests = true): CatalogRow[] {
  const cov = withTests ? coverage(m) : new Map<string, string[]>();
  const groups = new Map<string, FlowEdge[]>();
  for (const e of m.edges) {
    const key = `${e.kind === "effect" ? "effect" : "message"}:${e.msg}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const rows: CatalogRow[] = [];
  for (const [key, edges] of groups) {
    const kind = key.startsWith("effect:") ? "effect" : "message";
    const fields: PayloadField[] = [];
    for (const e of edges)
      for (const f of e.payload)
        if (!fields.some((x) => x.name === f.name)) fields.push(f);
    rows.push({
      kind,
      id: edges[0].msg,
      producers: uniq(edges.map((e) => findNode(m, e.from)?.title ?? e.from)),
      consumers: uniq(edges.map((e) => findNode(m, e.to)?.title ?? e.to)),
      edgeKinds: [...new Set(edges.map((e) => e.kind))],
      fields,
      edges: edges.map((e) => e.id),
      tests: cov.get(edges[0].msg) ?? [],
    });
  }
  return rows.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "message" ? -1 : 1) ||
      a.id.localeCompare(b.id),
  );
}

export const schemaText = (fields: PayloadField[]): string =>
  fields.length
    ? fields.map((f) => `${f.name}: ${f.type}`).join(", ")
    : "(forwarded as it came)";
