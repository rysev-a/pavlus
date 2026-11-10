/**
 * Compiles every example from examples.ts with the REAL pavlus compiler and
 * runs the result with the REAL runtime, so the documentation shows exactly
 * what the framework does: the generated module, the vnodes `render` returns
 * and the patches `diff` returns.
 */

import {
  compileTemplate,
  compileToView,
} from "../../../framework/client/src/compiler/mod.ts";
import {
  type Patch,
  toHtml,
  type VNode,
} from "../../../framework/client/src/runtime/vnode.ts";
import { astView } from "./ast-view.ts";
import { type Example, examples } from "./examples.ts";
import { fit } from "./svg.ts";

export interface RunStep {
  label: string;
  /** The real patches `diff(prev, next)` returned. */
  patches: Patch[];
  json: string;
  oneLine: string;
}

export interface Compiled {
  ex: Example;
  /** Full generated module source (compileTemplate output). */
  code: string;
  astListing: string;
  astTree: ReturnType<typeof astView>["tree"];
  astAllStatic: boolean;
  /** What `render(state)` returned — real vnodes. */
  vnodes: VNode[];
  vnodesJson: string;
  vnodesTree: string;
  html: string;
  steps: RunStep[];
}

/** Indented summary of vnodes (for the SVG panels). */
export function vnodeTree(
  nodes: VNode[],
  indent = "",
  out: string[] = [],
  budget = 22,
): string[] {
  for (const n of nodes) {
    if (out.length >= budget) {
      out.push(`${indent}… more nodes`);
      return out;
    }
    if (n.t === "marker") {
      out.push(`${indent}marker ${n.id}`);
    } else if (n.t === "text") {
      out.push(
        `${indent}text ${JSON.stringify(n.text)}${n.id !== undefined ? `  · #${n.id}` : ""}`,
      );
    } else {
      const attrs = Object.entries(n.attrs)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ");
      const evs = Object.entries(n.events)
        .map(
          ([k, m]) =>
            `${k} → ${m.id}(${m.payload === undefined ? "" : JSON.stringify(m.payload)})`,
        )
        .join(" ");
      const head = `${indent}el <${n.tag}>${n.id !== undefined ? `  · #${n.id}` : ""}`;
      out.push(head);
      if (attrs) out.push(`${indent}    attrs  ${fit(attrs, 64)}`);
      if (evs) out.push(`${indent}    events ${fit(evs, 64)}`);
      vnodeTree(n.children, indent + "  ", out, budget);
    }
  }
  return out;
}

/** One-line summary of a patch (for the SVG panels). */
export function patchOneLine(p: Patch): string {
  if (p.op === "insert") {
    return `{ op: "insert", before: ${JSON.stringify(p.before)}, nodes: [${p.nodes.length} vnode${p.nodes.length === 1 ? "" : "s"}] }`;
  }
  return JSON.stringify(p);
}

export function compileExample(ex: Example): Compiled {
  const code = compileTemplate(ex.template, { filename: `${ex.id}.pavlus` });
  const view = compileToView(ex.template);
  const av = astView(ex.template);

  const vnodes = view.render(ex.state);
  const steps: RunStep[] = ex.steps.map((s) => {
    const patches = view.diff(s.prev, s.next);
    return {
      label: s.label,
      patches,
      json: JSON.stringify(patches, null, 2),
      oneLine: patches.map(patchOneLine).join("\n"),
    };
  });

  return {
    ex,
    code,
    astListing: av.listing,
    astTree: av.tree,
    astAllStatic: av.allStatic,
    vnodes,
    vnodesJson: JSON.stringify(vnodes, null, 2),
    vnodesTree: vnodeTree(vnodes).join("\n"),
    html: toHtml(vnodes),
    steps,
  };
}

export function compileAll(): Compiled[] {
  return examples.map(compileExample);
}
