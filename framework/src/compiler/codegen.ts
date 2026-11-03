import type { Node, TemplateAst } from "../template/ast.ts";
import { DiffEmitter } from "./emit/diff.ts";
import { json, type Ctx } from "./emit/shared.ts";

/** Writes the whole module: `meta`, `render` and `diff`. */
class Codegen extends DiffEmitter {
  generate(ast: TemplateAst): string {
    const embeds = new Set<string>();
    let outlet = false;
    const walk = (nodes: Node[]): void => {
      for (const n of nodes) {
        if (n.type === "outlet") outlet = true;
        else if (n.type === "embed") embeds.add(n.name);
        else if (n.type === "element" || n.type === "for") walk(n.children);
        else if (n.type === "if") n.branches.forEach((b) => walk(b.children));
      }
    };
    walk(ast.nodes);

    const renderCtx: Ctx = {
      scope: new Map(),
      suffix: "idSuffix",
      prefix: "messagePrefix",
      roots: { prev: "state", next: "state" },
    };
    const diffCtx: Ctx = {
      ...renderCtx,
      roots: { prev: "prev", next: "next" },
    };

    this.w.line(
      `const meta = { embeds: ${json([...embeds])}, outlet: ${outlet} };`,
    );
    this.w.line("");
    this.w.line("/** The template for a state, as virtual nodes. Pure. */");
    this.w.block(
      `function render(state, idSuffix = "", messagePrefix = "", env)`,
      () =>
        this.scoped(() => {
          this.w.line("const nodes = [];");
          this.renderNodes(ast.nodes, renderCtx, "nodes");
          this.w.line("return nodes;");
        }),
    );
    this.w.line("");
    this.w.line(
      "/** The DOM patches that turn the template of `prev` into that of `next`. Pure. */",
    );
    this.w.block(
      `function diff(prev, next, idSuffix = "", messagePrefix = "", env)`,
      () =>
        this.scoped(() => {
          this.w.line("const patches = [];");
          this.w.line("if (prev === next) return patches;");
          this.diffNodes(ast.nodes, diffCtx, null);
          this.w.line("return patches;");
        }),
    );
    return this.w.lines.join("\n");
  }
}

export interface Generated {
  /** `const meta`, `render` and `diff`, without imports or exports. */
  code: string;
  /** Runtime helpers the code refers to, sorted. */
  helpers: string[];
}

/** Generates readable JS for the template: indented, commented, named after it. */
export function generate(ast: TemplateAst): Generated {
  const gen = new Codegen(ast);
  const code = gen.generate(ast);
  return { code, helpers: [...gen.helpers].sort() };
}
