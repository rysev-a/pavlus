/**
 * Runs every stage of the way from a template to DOM updates, with the REAL
 * parser, analyzer, code generator, runtime and DOM plugin, and keeps what
 * each stage produced, so the Template engine page can show it. It runs in
 * the browser, loaded on demand by the docs plugin.
 */
import { parse } from "../../../framework/src/template/parser.ts";
import { TemplateError } from "../../../framework/src/template/errors.ts";
import { generate } from "../../../framework/src/compiler/codegen.ts";
import { compileTemplate } from "../../../framework/src/compiler/mod.ts";
import * as runtime from "../../../framework/src/runtime/helpers.ts";
import {
  toHtml,
  type Patch,
  type View,
  type VNode,
} from "../../../framework/src/runtime/vnode.ts";
import { mountView } from "../../../framework/src/testing/mod.ts";
import { astView, exprSrc } from "../../../docs/site/scripts/ast-view.ts";
import type { Expr, Node, Part } from "../../../framework/src/template/ast.ts";
import { highlight, type Line } from "../source.ts";

/** A line of generated code, with the template line it came from (0: none). */
export type GLine = Line & { src: number };

export interface SourceLine {
  n: number;
  indent: number;
  text: string;
  kind: "blank" | "comment" | "code";
}

export interface ExprRow {
  where: string;
  src: string;
  json: string;
  line: number;
}

export interface PatchRow {
  op: string;
  text: string;
  json: string;
}

export interface Trace {
  /** The compiler's error, if the template did not compile. */
  error: string;
  errorLine: number;
  stateError: string;
  lines: SourceLine[];
  source: Line[];
  astJson: Line[];
  astList: Line[];
  exprs: ExprRow[];
  deps: Line[];
  render: GLine[];
  diff: GLine[];
  module: GLine[];
  moduleParts: { label: string; from: number; to: number }[];
  helpersUsed: string[];
  helpersAll: string[];
  newFunction: { params: string[]; body: GLine[]; chars: number };
  vnodesPrev: Line[];
  vnodesNext: Line[];
  htmlPrev: Line[];
  htmlNext: Line[];
  patches: PatchRow[];
  domBefore: Line[];
  domAfter: Line[];
  mutations: string[];
  listeners: number;
}

const plain = (text: string): Line[] =>
  text.split("\n").map((t, i) => ({
    n: i + 1,
    tokens: [{ i: 0, t, c: "plain" as const }],
  }));
const json = (v: unknown): Line[] =>
  highlight("x.ts", JSON.stringify(v, null, 2) ?? "undefined");

export function emptyTrace(): Trace {
  return {
    error: "",
    errorLine: 0,
    stateError: "",
    lines: [],
    source: [],
    astJson: [],
    astList: [],
    exprs: [],
    deps: [],
    render: [],
    diff: [],
    module: [],
    moduleParts: [],
    helpersUsed: [],
    helpersAll: [],
    newFunction: { params: [], body: [], chars: 0 },
    vnodesPrev: [],
    vnodesNext: [],
    htmlPrev: [],
    htmlNext: [],
    patches: [],
    domBefore: [],
    domAfter: [],
    mutations: [],
    listeners: 0,
  };
}

/** The lines as the parser first sees them: indentation, text, comment or blank. */
function sourceLines(source: string): SourceLine[] {
  return source.split("\n").map((raw, i) => {
    const trimmed = raw.trim();
    return {
      n: i + 1,
      indent: raw.length - raw.trimStart().length,
      text: trimmed,
      kind: !trimmed ? "blank" : trimmed.startsWith("//") ? "comment" : "code",
    };
  });
}

const isExpr = (v: unknown): v is Expr =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { k?: unknown }).k === "string";

/** Every expression of the AST, in source order, with where it sits. */
function exprsOf(nodes: Node[], out: ExprRow[]): void {
  const add = (where: string, e: Expr, line: number) =>
    out.push({ where, src: exprSrc(e), json: JSON.stringify(e), line });
  const parts = (where: string, ps: Part[] | null, line: number) => {
    for (const p of ps ?? []) if (isExpr(p)) add(where, p, line);
  };
  for (const n of nodes) {
    switch (n.type) {
      case "element":
        for (const t of n.toggles) add(`class:${t.name}`, t.test, n.pos.line);
        for (const a of n.attrs)
          parts(`attribute ${a.name}`, a.value, n.pos.line);
        for (const ev of n.events)
          ev.args.forEach((e) =>
            add(`@${ev.name} → ${ev.msg}(…)`, e, n.pos.line),
          );
        exprsOf(n.children, out);
        break;
      case "text":
        parts("text", n.parts, n.line);
        break;
      case "if":
        n.branches.forEach((b, i) => {
          if (b.test) add(i === 0 ? "if" : "else if", b.test, n.line);
          exprsOf(b.children, out);
        });
        break;
      case "for":
        add("for … in", n.of, n.line);
        if (n.key) add("for … key", n.key, n.line);
        exprsOf(n.children, out);
        break;
      case "embed":
        if (n.dynamic) add("+{view}", n.dynamic, n.pos.line);
        for (const p of n.props) {
          if ("spread" in p) add("...spread", p.spread, n.pos.line);
          else parts(`prop ${p.name}`, p.value, n.pos.line);
        }
        break;
    }
  }
}

/** Generated code lines with the template line of the nearest `// line N:` above. */
function withSources(code: string, firstLine = 1): GLine[] {
  let src = 0;
  return highlight("x.ts", code).map((l) => {
    const text = l.tokens.map((t) => t.t).join("");
    const m = /\/\/ line (\d+):/.exec(text);
    if (m) src = Number(m[1]);
    // a function starts again at 0
    if (/^(function|\/\*\*)/.test(text)) src = 0;
    return { ...l, n: l.n + firstLine - 1, src };
  });
}

const text = (lines: Line[]): string =>
  lines.map((l) => l.tokens.map((t) => t.t).join("")).join("\n");

const cut = (s: string, n = 60): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

export function explain(p: Patch): string {
  switch (p.op) {
    case "text":
      return `Set the text of node ${p.id} to ${JSON.stringify(cut(p.text))}.`;
    case "attr":
      return `Set attribute ${p.name}=${JSON.stringify(p.value)} on node ${p.id}.`;
    case "rmAttr":
      return `Remove attribute ${p.name} from node ${p.id}.`;
    case "handler":
      return `Point the ${p.event} listener of node ${p.id} at message ${p.msg.id}${p.msg.payload === undefined ? "" : `(${JSON.stringify(p.msg.payload)})`}.`;
    case "insert":
      return `Insert ${p.nodes.length} node${p.nodes.length === 1 ? "" : "s"} before node ${p.before}.`;
    case "clear":
      return `Remove everything between markers ${p.from} and ${p.to}.`;
    case "remove":
      return `Remove the nodes from ${p.from} to ${p.to}, both included.`;
    case "move":
      return `Move the nodes from ${p.from} to ${p.to} before node ${p.before}.`;
  }
}

/** `ul > li:nth-child(2)`: where a node sits, for the mutation log. */
function pathOf(node: Node | globalThis.Node, root: globalThis.Node): string {
  const parts: string[] = [];
  let cur: globalThis.Node | null = node as globalThis.Node;
  while (cur && cur !== root) {
    if (cur.nodeType === 1) {
      const el = cur as Element;
      const same = [...(el.parentNode?.children ?? [])].filter(
        (c) => c.tagName === el.tagName,
      );
      const idx = same.indexOf(el) + 1;
      parts.unshift(
        `${el.tagName.toLowerCase()}${same.length > 1 ? `:nth-of-type(${idx})` : ""}`,
      );
    }
    cur = cur.parentNode;
  }
  return parts.join(" > ") || "(root)";
}

const describeNode = (n: globalThis.Node): string =>
  n.nodeType === 1
    ? `<${(n as Element).tagName.toLowerCase()}>`
    : n.nodeType === 8
      ? `<!--${n.nodeValue}-->`
      : JSON.stringify(cut(n.nodeValue ?? "", 40));

const pretty = (html: string): string => {
  const out: string[] = [];
  let depth = 0;
  for (const tok of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) ?? []) {
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
};

export function traceTemplate(
  source: string,
  prevText: string,
  nextText: string,
): Trace {
  const t = emptyTrace();
  t.lines = sourceLines(source);
  t.source = highlight("x.pavlus", source);

  let prev: unknown = {};
  let next: unknown = {};
  try {
    prev = JSON.parse(prevText || "{}");
    next = JSON.parse(nextText || "{}");
  } catch (e) {
    t.stateError = e instanceof Error ? e.message : String(e);
  }

  let view: View;
  try {
    const ast = parse(source);
    t.astJson = json(ast);
    const av = astView(source);
    t.astList = plain(av.listing);
    t.deps = plain(av.listing);
    exprsOf(ast.nodes, t.exprs);

    const { code, helpers } = generate(ast);
    const mod = compileTemplate(source, { filename: "your-template.pavlus" });
    t.module = withSources(mod);
    t.helpersUsed = helpers;
    t.helpersAll = Object.keys(runtime);

    // where render, diff and the rest start in the generated code
    const gen = withSources(code);
    const find = (re: RegExp) => gen.findIndex((l) => re.test(text([l])));
    const r = find(/^function render\(/);
    const d = find(/^function diff\(/);
    // the doc comment above each function belongs to it
    const rStart = r > 0 && /^\/\*\*/.test(text([gen[r - 1]])) ? r - 1 : r;
    const dStart = d > 0 && /^\/\*\*/.test(text([gen[d - 1]])) ? d - 1 : d;
    const sl = (a: number, b: number): GLine[] =>
      gen.slice(a, b).map((l, i) => ({ ...l, n: i + 1 }));
    t.render = r >= 0 ? sl(rStart, dStart > rStart ? dStart : gen.length) : [];
    t.diff = d >= 0 ? sl(dStart, gen.length) : [];

    const lineNo = (re: RegExp) =>
      t.module.findIndex((l) => re.test(text([l]))) + 1;
    t.moduleParts = [
      { label: "header comment", from: 1, to: 1 },
      {
        label: "runtime import",
        from: 2,
        to: Math.max(2, lineNo(/^const meta/) - 2),
      },
      {
        label: "meta, render and diff (the generated code)",
        from: lineNo(/^const meta/),
        to: t.module.length - 3,
      },
      { label: "exports", from: t.module.length - 2, to: t.module.length - 1 },
    ];

    t.newFunction = {
      params: [...t.helpersAll, ...ast.imports.map((i) => i.local)],
      body: gen,
      chars: code.length,
    };

    const body = `${code}\nreturn { render, diff, meta };`;
    view = new Function(
      ...t.helpersAll,
      ...ast.imports.map((i) => i.local),
      body,
    )(
      ...t.helpersAll.map((n) => (runtime as Record<string, unknown>)[n]),
      ...ast.imports.map(() => ({ render: () => [], diff: () => [] })),
    ) as View;
  } catch (e) {
    t.error = e instanceof Error ? e.message : String(e);
    if (e instanceof TemplateError) t.errorLine = e.line;
    return t;
  }

  if (t.stateError) return t;
  try {
    const a: VNode[] = view.render(prev);
    const b: VNode[] = view.render(next);
    t.vnodesPrev = json(a);
    t.vnodesNext = json(b);
    t.htmlPrev = plain(pretty(toHtml(a)));
    t.htmlNext = plain(pretty(toHtml(b)));
    const patches = view.diff(prev, next);
    t.patches = patches.map((p) => ({
      op: p.op,
      text: explain(p),
      json: JSON.stringify(p),
    }));

    // the real DOM plugin, on a detached document
    const doc = document.implementation.createHTMLDocument("");
    const h = mountView(view, prev, doc);
    t.domBefore = plain(pretty(h.root.innerHTML));
    t.listeners = h.dom.stats().listeners;
    const log: string[] = [];
    const obs = new MutationObserver(() => {});
    obs.observe(h.root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true,
    });
    h.set(next);
    for (const m of obs.takeRecords()) {
      if (m.type === "attributes")
        log.push(
          `attribute ${m.attributeName} of ${pathOf(m.target, h.root)}: ${JSON.stringify(m.oldValue)} → ${JSON.stringify((m.target as Element).getAttribute(m.attributeName!))}`,
        );
      else if (m.type === "characterData")
        log.push(
          `text of ${pathOf(m.target, h.root)}: ${JSON.stringify(cut(m.oldValue ?? "", 40))} → ${JSON.stringify(cut(m.target.nodeValue ?? "", 40))}`,
        );
      else {
        for (const n of m.removedNodes)
          log.push(
            `removed ${describeNode(n)} from ${pathOf(m.target, h.root)}`,
          );
        for (const n of m.addedNodes)
          log.push(`added ${describeNode(n)} to ${pathOf(m.target, h.root)}`);
      }
    }
    obs.disconnect();
    t.mutations = log;
    t.domAfter = plain(pretty(h.root.innerHTML));
    h.unmount();
  } catch (e) {
    t.error = e instanceof Error ? e.message : String(e);
  }
  return t;
}
