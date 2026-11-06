/**
 * A demo is a template and the states it runs with. `runDemo` compiles it
 * with the REAL compiler and runs the result with the REAL runtime, so a docs
 * page shows what the framework does: the generated module, the AST with what
 * each node reads, the vnodes `render` returns and the patches `diff` returns.
 * It runs in the browser, loaded on demand (see plugin.ts).
 */
import {
  compileTemplate,
  compileToView,
} from "../../../framework/src/compiler/mod.ts";
import { toHtml, type Patch } from "../../../framework/src/runtime/vnode.ts";
import { astView } from "../../../docs/site/scripts/ast-view.ts";
import { highlight, type Line } from "../source.ts";

export interface DemoStep {
  /** Language-neutral, like `count 2 → 3`. */
  label: string;
  prev: unknown;
  next: unknown;
}

export interface Demo {
  template: string;
  state: unknown;
  steps?: DemoStep[];
  /** Templates the demo imports, by the local name it gives them. */
  components?: Record<string, string>;
}

export interface DemoView {
  name: string;
  openModule: boolean;
  openAst: boolean;
  openVnodes: boolean;
  error: string;
  template: Line[];
  state: Line[];
  html: Line[];
  module: Line[];
  ast: Line[];
  vnodes: Line[];
  steps: { label: string; empty: boolean; patches: Line[] }[];
}

const plain = (text: string): Line[] =>
  text.split("\n").map((t, i) => ({
    n: i + 1,
    tokens: [{ i: 0, t, c: "plain" as const }],
  }));

const json = (v: unknown): Line[] =>
  highlight("x.ts", JSON.stringify(v, null, 2) ?? "undefined");

const patchLine = (p: Patch): string =>
  p.op === "insert"
    ? `{ op: "insert", before: ${JSON.stringify(p.before)}, nodes: [${p.nodes.length} vnode${p.nodes.length === 1 ? "" : "s"}] }`
    : JSON.stringify(p);

/** Pretty HTML: one element per line, so the result is readable. */
function prettyHtml(html: string): string {
  const out: string[] = [];
  let depth = 0;
  for (const tok of html.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (tok.startsWith("</")) depth = Math.max(0, depth - 1);
    out.push("  ".repeat(depth) + tok);
    if (
      /^<[a-z]/i.test(tok) &&
      !tok.endsWith("/>") &&
      !/^<(br|hr|img|input|meta|link)\b/i.test(tok)
    )
      depth++;
  }
  return out.join("\n");
}

const viewOf = (template: string, components: Record<string, string> = {}) => {
  const views: Record<string, ReturnType<typeof compileToView>> = {};
  for (const [name, src] of Object.entries(components))
    views[name] = compileToView(src);
  return compileToView(template, { components: views });
};

export function runDemo(
  name: string,
  demo: Demo,
  open: string[] = [],
): DemoView {
  const base: DemoView = {
    name,
    openModule: open.includes("module"),
    openAst: open.includes("ast"),
    openVnodes: open.includes("vnodes"),
    error: "",
    template: highlight("x.pavlus", demo.template),
    state: json(demo.state),
    html: [],
    module: [],
    ast: [],
    vnodes: [],
    steps: [],
  };
  try {
    const code = compileTemplate(demo.template, { filename: `${name}.pavlus` });
    const view = viewOf(demo.template, demo.components);
    const vnodes = view.render(demo.state);
    base.module = highlight("x.ts", code);
    base.ast = plain(astView(demo.template).listing);
    base.vnodes = json(vnodes);
    base.html = highlight("x.txt", prettyHtml(toHtml(vnodes)));
    base.steps = (demo.steps ?? []).map((s) => {
      const patches = view.diff(s.prev, s.next);
      return {
        label: s.label,
        empty: patches.length === 0,
        patches: plain(patches.map(patchLine).join("\n") || "[]"),
      };
    });
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
  }
  return base;
}
