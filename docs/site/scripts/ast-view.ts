/**
 * Turns a parsed template AST into display structures: a labeled tree for the
 * SVG diagrams and an indented listing for the page. Node labels quote the
 * original template line; the `reads:` line is the real dependency set the
 * compiler computes (`analyze.nodeDeps`) — the thing that makes `diff` cheap.
 */

import { nodeDeps } from "../../../framework/frontend/src/compiler/analyze.ts";
import type {
  Expr,
  Node,
} from "../../../framework/frontend/src/template/ast.ts";
import { parse } from "../../../framework/frontend/src/template/parser.ts";
import { fit, type TreeNode } from "./svg.ts";

/** Reconstructs expression source from the expression AST. */
export function exprSrc(e: Expr): string {
  switch (e.k) {
    case "lit":
      return typeof e.value === "string"
        ? JSON.stringify(e.value)
        : String(e.value);
    case "id":
      return e.name;
    case "member":
      return `${exprSrc(e.obj)}.${e.prop}`;
    case "index":
      return `${exprSrc(e.obj)}[${exprSrc(e.index)}]`;
    case "call":
      return `${exprSrc(e.callee)}(${e.args.map(exprSrc).join(", ")})`;
    case "unary":
      return `${e.op}${exprSrc(e.arg)}`;
    case "binary":
      return `${wrap(e.left)} ${e.op} ${wrap(e.right)}`;
    case "cond":
      return `${wrap(e.test)} ? ${wrap(e.then)} : ${wrap(e.else)}`;
    case "array":
      return `[${e.items.map(exprSrc).join(", ")}]`;
  }
}

const wrap = (e: Expr): string =>
  e.k === "binary" || e.k === "cond" ? `(${exprSrc(e)})` : exprSrc(e);

const depsOf = (n: Node): string => {
  const deps = [...nodeDeps(n)].sort();
  if (deps.includes("")) return "* (an outlet reads everything)";
  if (deps.length === 0) return "— (reads nothing)";
  return deps.join(", ");
};

const lineAt = (src: string[], line: number): string =>
  (src[line - 1] ?? "").trim();

/** One-line source of the node, for labels. */
function nodeSrc(n: Node, src: string[]): string {
  switch (n.type) {
    case "element":
      return lineAt(src, n.pos.line);
    case "text": {
      const line = lineAt(src, n.line);
      if (line.startsWith("|")) return line;
      // inline text shares the element's line; show the parts instead
      return n.parts
        .map((p) => (typeof p === "string" ? p : `{${exprSrc(p)}}`))
        .join("");
    }
    case "if": {
      const t = n.branches[0]?.test;
      return t ? `if ${exprSrc(t)}` : "if";
    }
    case "for":
      return `for ${n.item}${n.index ? `, ${n.index}` : ""} in ${exprSrc(n.of)}${n.key ? ` key ${exprSrc(n.key)}` : ""}`;
    case "embed":
      return `+${n.component ?? `{${n.dynamic ? exprSrc(n.dynamic) : ""}}`}#${n.name}`;
    case "outlet":
      return "+outlet";
  }
}

const kindOf = (n: Node): string => {
  switch (n.type) {
    case "element":
      return "el";
    case "text":
      return "text";
    case "if":
      return "if";
    case "for":
      return "for";
    case "embed":
      return "embed";
    case "outlet":
      return "outlet";
  }
};

function toTree(n: Node, src: string[], depth: number): TreeNode {
  const title = fit(`${kindOf(n)}  ${nodeSrc(n, src)}`, 34);
  const nid =
    n.type === "element" ||
    n.type === "text" ||
    n.type === "if" ||
    n.type === "for" ||
    n.type === "embed" ||
    n.type === "outlet"
      ? (n as { nid: number }).nid
      : null;
  const t: TreeNode = {
    title,
    sub: nid !== null ? `nid ${nid}` : undefined,
    dep: `reads: ${depsOf(n)}`,
  };
  const kids: TreeNode[] = [];
  if (n.type === "element") {
    for (const c of n.children) kids.push(toTree(c, src, depth + 1));
  } else if (n.type === "if") {
    n.branches.forEach((b, i) => {
      const head = b.test
        ? i === 0
          ? `then — ${exprSrc(b.test)}`
          : `else if — ${exprSrc(b.test)}`
        : "else";
      kids.push({
        title: fit(head, 34),
        virtual: true,
        children: b.children.map((c) => toTree(c, src, depth + 2)),
      });
    });
  } else if (n.type === "for") {
    for (const c of n.children) kids.push(toTree(c, src, depth + 1));
  }
  t.children = kids.length ? kids : undefined;
  return t;
}

/** Indented listing of the AST for an HTML <pre>. */
function toLines(
  nodes: Node[],
  src: string[],
  indent: string,
  out: string[],
): void {
  for (const n of nodes) {
    const title = fit(`${kindOf(n)}  ${nodeSrc(n, src)}`, 44);
    const nid = (n as { nid?: number }).nid;
    out.push(
      `${indent}${title.padEnd(48)}${nid !== undefined ? `#${nid}` : ""}   reads: ${depsOf(n)}`,
    );
    if (n.type === "element") toLines(n.children, src, indent + "  ", out);
    else if (n.type === "if") {
      n.branches.forEach((b, i) => {
        const head = b.test ? (i === 0 ? "then" : "else if") : "else";
        out.push(`${indent}  ┌ ${head}${b.test ? ` ${exprSrc(b.test)}` : ""}`);
        toLines(b.children, src, indent + "  │ ", out);
      });
    } else if (n.type === "for") toLines(n.children, src, indent + "  ", out);
  }
}

export interface AstView {
  /** Tree for the SVG diagram (with a virtual root). */
  tree: TreeNode;
  /** Indented listing for the page. */
  listing: string;
  /** True if every node reads nothing (the static example). */
  allStatic: boolean;
}

export function astView(template: string): AstView {
  const src = template.split("\n");
  const ast = parse(template);
  const root: TreeNode = {
    title: "template",
    virtual: true,
    children: ast.nodes.map((n) => toTree(n, src, 0)),
  };
  const lines: string[] = [];
  toLines(ast.nodes, src, "", lines);
  return {
    tree: root,
    listing: lines.join("\n"),
    allStatic: lines.every((l) => l.includes("reads: —")),
  };
}
