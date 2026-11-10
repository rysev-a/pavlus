import type { Expr, Node, Part } from "../template/ast.ts";

/** Collects the root identifiers an expression reads. */
export function exprIdents(e: Expr, out: Set<string>): void {
  switch (e.k) {
    case "lit":
      return;
    case "id":
      out.add(e.name);
      return;
    case "member":
      exprIdents(e.obj, out);
      return;
    case "index":
      exprIdents(e.obj, out);
      exprIdents(e.index, out);
      return;
  }
}

function partsIdents(parts: Part[] | null, out: Set<string>): void {
  for (const p of parts ?? []) if (typeof p !== "string") exprIdents(p, out);
}

const memo = new WeakMap<Node, Set<string>>();

/**
 * Free identifiers of a subtree: everything it reads from the enclosing
 * scope (root state or an outer loop variable). This is the dependency set
 * the compiler uses to skip unchanged subtrees in `diff`.
 */
export function nodeDeps(n: Node): Set<string> {
  const cached = memo.get(n);
  if (cached) return cached;
  const s = new Set<string>();
  switch (n.type) {
    case "text":
      partsIdents(n.parts, s);
      break;
    case "element":
      n.attrs.forEach((a) => partsIdents(a.value, s));
      n.toggles.forEach((t) => exprIdents(t.test, s));
      n.events.forEach((e) => e.args.forEach((a) => exprIdents(a, s)));
      listDeps(n.children).forEach((d) => s.add(d));
      break;
    case "if":
      for (const b of n.branches) {
        if (b.test) exprIdents(b.test, s);
        listDeps(b.children).forEach((d) => s.add(d));
      }
      break;
    case "outlet":
      // "" is the marker for "always": what an outlet shows depends on the
      // route and on a child state slice the template cannot name.
      s.add("");
      break;
    case "embed":
      if (n.dynamic) exprIdents(n.dynamic, s);
      // the key feeds the events' id prefix, so a change must re-diff the
      // embed for new nodes to carry the new key
      if (n.key) exprIdents(n.key, s);
      for (const p of n.props) {
        if ("spread" in p) exprIdents(p.spread, s);
        else partsIdents(p.value, s);
      }
      break;
    case "for": {
      const inner = listDeps(n.children);
      if (n.key) exprIdents(n.key, inner);
      inner.delete(n.item);
      if (n.index) inner.delete(n.index);
      inner.forEach((d) => s.add(d));
      exprIdents(n.of, s);
      break;
    }
  }
  memo.set(n, s);
  return s;
}

export function listDeps(nodes: Node[]): Set<string> {
  const s = new Set<string>();
  for (const n of nodes) nodeDeps(n).forEach((d) => s.add(d));
  return s;
}
