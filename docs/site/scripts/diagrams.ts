/**
 * The SVG diagrams for the pavlus documentation.
 *
 * Task 1: per-example "template compiling" diagrams — what you write, the
 *         middle data (AST + dependencies), the target functions, and what
 *         render/diff really return when the build runs them.
 * Task 2: the pure-concept diagrams — the application as a 100% pure function
 *         between plugins (core, dom, http, store) and the browser.
 */

import {
  C,
  Svg,
  charW,
  drawTree,
  drawTreeH,
  fit,
  layoutTree,
  layoutTreeH,
  type SeqStep,
  type TreeNode,
} from "./svg.ts";
import { type Compiled } from "./run.ts";
import { parse } from "../../../framework/src/template/parser.ts";
import { nodeDeps } from "../../../framework/src/compiler/analyze.ts";
import { compileTemplate } from "../../../framework/src/compiler/mod.ts";
import type { Node } from "../../../framework/src/template/ast.ts";
import { exprSrc } from "./ast-view.ts";
import { pavlusTokens, tsTokens, tok, type Tok } from "./highlight.ts";

const W = 1240;

/* ------------------------------------------------------------------ */
/* helpers                                                             */

/** Truncates token text so the line fits `max` characters. */
function fitToks(toks: Tok[], max: number): Tok[] {
  const out: Tok[] = [];
  let n = 0;
  for (const t of toks) {
    if (n >= max) break;
    const room = max - n;
    if (t.t.length <= room) {
      out.push(t);
      n += t.t.length;
    } else {
      out.push({ t: t.t.slice(0, Math.max(0, room - 1)) + "…", c: t.c });
      break;
    }
  }
  return out;
}

function abridgeCode(code: string, perFn: number): string[] {
  const lines = code.split("\n");
  const at = lines.findIndex((l) => l.startsWith("function diff"));
  return [
    ...pick(lines.slice(0, at), perFn),
    "",
    ...pick(lines.slice(at), perFn),
  ];

  function pick(src: string[], budget: number): string[] {
    const keep = src.filter((l) => {
      if (/^(function render|function diff)/.test(l)) return true;
      if (/const meta =/.test(l)) return true;
      if (/if \(prev === next\)/.test(l)) return true;
      if (/return (nodes|patches);/.test(l)) return true;
      if (/^  if \((prev|state)\./.test(l) && /!==/.test(l)) return true; // guard
      if (/patches\.push|diffKeyedList|prevBranch|nextBranch/.test(l))
        return true;
      if (/marker|t: "el"|t: "text"|setAttr\(|events: \{|toText\(/.test(l))
        return true;
      if (/line \d+:/.test(l)) return true;
      return false;
    });
    return keep.slice(0, budget);
  }
}

/* ------------------------------------------------------------------ */
/* Task 1 — the generic compile pipeline                               */

export function compilePipelineSvg(): Svg {
  const svg = new Svg(W, 10); // height is finalized once the last panel is placed
  svg.text(24, 34, "How a .pavlus file becomes two pure functions", {
    size: 16,
    bold: true,
  });
  svg.caption(
    W - 24,
    34,
    "the Vite plugin runs this on every import — DevTools shows the generated module",
    "end",
  );

  // every stage shows the REAL output of the real compiler for this template
  const SRC = ["ul.users", "  for u in users", "    li {u.name}"].join("\n");
  const src = SRC.split("\n");
  const srcLine = (n: { line?: number; pos?: { line: number } }): string =>
    (src[(n.pos ? n.pos.line : (n.line ?? 0)) - 1] ?? "").trim();
  const ast = parse(SRC);
  const rows: { n: Node; depth: number }[] = [];
  const collect = (n: Node, depth: number): void => {
    rows.push({ n, depth });
    if (n.type === "element" || n.type === "for")
      for (const c of n.children) collect(c, depth + 1);
  };
  ast.nodes.forEach((n) => collect(n, 0));
  const label = (n: Node): Tok[] => {
    if (n.type === "text")
      return n.parts.map((p) =>
        typeof p === "string" ? tok(p) : tok(`{${exprSrc(p)}}`, "expr"),
      );
    return [tok(srcLine(n))];
  };

  // stage 2 — the AST as a tree: one box per node, parent left of its children
  const plain = (n: Node): string => {
    if (n.type === "text")
      return (
        "text " +
        n.parts
          .map((p) => (typeof p === "string" ? p : `{${exprSrc(p)}}`))
          .join("")
      );
    const l = srcLine(n);
    return n.type === "element" ? l.split("{")[0].trim() : l;
  };
  const toT = (n: Node): TreeNode => ({
    title: plain(n),
    sub: `nid ${(n as { nid: number }).nid}`,
    children:
      n.type === "element" || n.type === "for"
        ? n.children.map(toT)
        : undefined,
  });
  const tree = layoutTreeH({
    title: "template",
    virtual: true,
    children: ast.nodes.map(toT),
  });

  // stage 3 — the real dependency set of every node
  const depLines: Tok[][] = rows.map(({ n }) => [
    tok(`#${n.nid}`, "ln"),
    tok(" "),
    ...label(n),
    tok(" → ", "ln"),
    tok([...nodeDeps(n)].sort().join(", ") || "—", "str"),
  ]);

  // stages 4 + 5 — the real generated module
  const gen = compileTemplate(SRC, { filename: "users.pavlus" }).split("\n");
  const pick = (re: RegExp): Tok[] => {
    const l = gen.find((l) => re.test(l));
    return l ? (tsTokens(l)[0] ?? []) : [];
  };
  const at = gen.findIndex((l) => /^ {2}\/\/ line 1: <ul\.users>$/.test(l));
  const renderSlice = (at < 0 ? [] : gen.slice(at, at + 13)).map(
    (l) => tsTokens(l)[0] ?? [],
  );
  const genLine = (re: RegExp): { no: number; text: string } | null => {
    const i = gen.findIndex((l) => re.test(l));
    return i < 0 ? null : { no: i + 1, text: gen[i] };
  };

  const zx = 324; // panels put the prose on the left, the code on the right
  const LH = 15;
  const GAP = 30; // between stacked panels; holds the connecting arrow
  let y = 64;

  const nextPanel = (h: number, arrowLabel?: string): number => {
    const top = y;
    y += h;
    if (arrowLabel !== undefined) {
      svg.arrow(W / 2, top + h + 4, W / 2, top + h + GAP - 4, {
        stroke: C.faint,
        sw: 1.5,
      });
      svg.text(W / 2 + 14, top + h + GAP / 2 + 4, arrowLabel, {
        size: 10,
        fill: C.faint,
        italic: true,
      });
      y += GAP;
    }
    return top;
  };
  const stageTitle = (
    top: number,
    title: string,
    sub: string[],
    dark = false,
  ): void => {
    svg.text(42, top + 26, title, {
      size: 12.5,
      bold: true,
      mono: true,
      fill: dark ? C.codeText : C.ink,
    });
    sub.forEach((l, j) =>
      svg.text(42, top + 46 + j * 16, l, {
        size: 10.5,
        fill: dark ? C.codeDim : C.muted,
      }),
    );
  };
  const panelRect = (top: number, h: number, dark = false): void => {
    svg.rect(24, top, W - 48, h, {
      fill: dark ? C.codeBg : C.panel,
      stroke: dark ? "#1e293b" : C.border,
      rx: 10,
    });
  };
  const codeRow = (top: number, i: number, toks: Tok[]): void => {
    svg.textToks(zx, top + 34 + i * LH, fitToks(toks, 100), {
      size: 10.5,
      mono: true,
    });
  };

  // 1 — what you write
  {
    const h = 34 + (src.length - 1) * LH + 16;
    const top = nextPanel(h, "read");
    panelRect(top, h);
    stageTitle(top, "1 · users.pavlus", [
      "what you write:",
      "an indentation tree",
    ]);
    src.forEach((l, i) =>
      codeRow(top, i, [
        tok(`${String(i + 1).padStart(3)}  `, "ln"),
        ...(pavlusTokens(l)[0] ?? []),
      ]),
    );
  }

  // 2 — the AST, as a tree
  {
    const h = 20 + tree.h + 16;
    const top = nextPanel(h, "walk");
    panelRect(top, h);
    stageTitle(top, "2 · parser.parse()", [
      "lines → TemplateAst,",
      "nodes get numbers (nid)",
    ]);
    drawTreeH(svg, tree, zx, top + 20);
  }

  // 3 — what each subtree reads
  {
    const lines: Tok[][] = [
      ...depLines,
      [tok("")],
      [tok("// a node's deps = the reads of its whole subtree", "com")],
    ];
    const h = 34 + (lines.length - 1) * LH + 16;
    const top = nextPanel(h, "emit");
    panelRect(top, h);
    stageTitle(top, "3 · analyze.nodeDeps()", [
      "the state roots",
      "each subtree reads",
    ]);
    lines.forEach((toks, i) => codeRow(top, i, toks));
  }

  // 4 — the generated source, verbatim
  {
    const lines: Tok[][] = [
      ...renderSlice,
      [tok("")],
      [tok("  …")],
      [tok("")],
      pick(/^ {2}return nodes;$/),
      [tok("")],
      pick(/^ {2}if \(prev === next\) return patches;$/),
      pick(/^ {2}\/\/ line 1: <ul\.users> \(reads: users\)$/),
      pick(/^ {2}if \(prev\.users !== next\.users\) \{$/),
      [tok("")],
      [tok("      … // keyed-list diff: per-item guards, leaf patches", "com")],
      [tok("")],
      pick(/^ {2}return patches;$/),
    ];
    const h = 34 + (lines.length - 1) * LH + 16;
    const top = nextPanel(h, "import");
    panelRect(top, h);
    stageTitle(top, "4 · codegen.generate()", [
      "readable JS source:",
      "guards + patches",
    ]);
    lines.forEach((toks, i) => codeRow(top, i, toks));
  }

  // 5 — the module the app imports, with its real line numbers
  {
    const lines = [
      /^\/\/ Generated by pavlus/,
      /^import \{ diffKeyedList/,
      /^const meta =/,
      /^$/,
      /^\/\*\* The template for a state/,
      /^function render\(/,
      /^ {2}return nodes;$/,
      /^$/,
      /^\/\*\* The DOM patches/,
      /^function diff\(/,
      /^ {2}if \(prev === next\) return patches;/,
      /^ {2}return patches;$/,
      /^$/,
      /^export \{ render, diff, meta \};/,
      /^export default/,
    ].map((re) => (re.source === "^$" ? null : genLine(re)));
    const h = 34 + (lines.length - 1) * LH + 16;
    const top = nextPanel(h);
    panelRect(top, h, true);
    stageTitle(
      top,
      "5 · view module",
      ["the compiled module —", "what the app imports"],
      true,
    );
    lines.forEach((r, i) => {
      if (!r) return;
      const dim = /^\/(\/|\*\*)/.test(r.text);
      svg.text(zx, top + 34 + i * LH, String(r.no).padStart(3), {
        size: 10.5,
        mono: true,
        fill: C.codeNum,
      });
      svg.text(zx + 40, top + 34 + i * LH, fit(r.text, 74), {
        size: 10.5,
        mono: true,
        fill: dim ? C.codeDim : C.codeText,
      });
    });
  }

  svg.caption(
    24,
    y + 18,
    "render(state) → VNodes — the template for a state, as plain data.  diff(prev, next) → patches — the DOM effects that turn prev into next.",
  );
  svg.caption(
    24,
    y + 40,
    "Both are pure: same input, same output, no side effects. Only the DOM plugin interprets the results.",
  );
  svg.h = y + 56;
  return svg;
}

/* ------------------------------------------------------------------ */
/* Task 1 — the per-example diagram                                    */

export function templatePipelineSvg(c: Compiled): Svg {
  const ex = c.ex;
  const tplToks = pavlusTokens(ex.template);

  // --- measure the AST tree
  const tree = layoutTree(c.astTree);

  // --- measure the abridged code
  const codeLines = abridgeCode(c.code, 15);

  const pad = 24;
  const titleY = 34;
  const row1Y = 60;
  const ax = pad;
  const aw = 330;
  const arrowGap = 46;
  const bx = ax + aw + arrowGap;
  const bw = W - pad - bx; // middle data takes the whole rest of the row
  const treeScale = tree.w > bw - 28 ? (bw - 28) / tree.w : 1;

  const tplH = 46 + tplToks.length * 17 + 14;
  const treeH = 46 + tree.h + 14;
  const codeH = 46 + codeLines.length * 15 + 14;
  const row1H = Math.max(tplH, treeH);

  // row 2 content
  const vnodeLines = c.vnodesTree.split("\n").slice(0, 16);
  const vnodeMore = c.vnodesTree.split("\n").length - 16;
  const htmlLines = wrap(c.html, 82).slice(0, 3);
  const step = c.steps[0];
  const patchLines = (step ? step.oneLine.split("\n") : []).slice(0, 9);
  const patchMore = (step ? step.oneLine.split("\n") : []).length - 9;

  // row 2 — the target functions get their own full-width band
  const fnY = row1Y + row1H + 58;
  const row2Y = fnY + codeH + 58;
  const dH =
    46 +
    vnodeLines.length * 15 +
    (vnodeMore > 0 ? 15 : 0) +
    12 +
    htmlLines.length * 14 +
    26;
  const eH = 46 + patchLines.length * 15 + (patchMore > 0 ? 15 : 0) + 30;
  const row2H = Math.max(dH, eH);
  const H = row2Y + row2H + 24;

  const svg = new Svg(W, H);
  svg.text(pad, titleY, ex.title, { size: 16, bold: true });
  svg.caption(
    W - pad,
    titleY,
    `${ex.id}.pavlus — compiled and run by the build with the real compiler`,
    "end",
  );

  /* ---- row 1 */

  const a = svg.panel(ax, row1Y, aw, row1H, "1 · the pavlus template", {
    sub: "what you write",
  });
  tplToks.forEach((toks, i) => {
    svg.textToks(
      a.x,
      a.y + 6 + i * 17,
      fitToks([{ t: `${String(i + 1).padStart(2)}  `, c: "ln" }, ...toks], 44),
      { size: 11.5, mono: true },
    );
  });

  const b = svg.panel(
    bx,
    row1Y,
    bw,
    row1H,
    "2 · middle data — AST + dependencies",
    {
      sub: "parser.parse() → analyze.nodeDeps()",
    },
  );
  // drawTree with scaling: wrap in <g>
  const treeG = new Svg(Math.ceil(tree.w * treeScale), Math.ceil(tree.h));
  drawTree(treeG, tree, 0, 0);
  svg.raw(
    `<g transform="translate(${b.x - 6} ${b.y - 2}) scale(${treeScale})">${treeG
      .toString()
      .replace(/^<svg[^>]*>\n/, "")
      .replace(/<\/svg>$/, "")
      .replace(/^<rect[^>]*\/>\n?/, "")}</g>`,
  );
  if (treeScale < 1)
    svg.caption(
      b.x,
      row1Y + row1H - 8,
      "(scaled to fit — every box quotes its template line and its dependency set)",
    );

  const cc = svg.panel(pad, fnY, W - pad * 2, codeH, "3 · target functions", {
    sub: "codegen.generate()",
    dark: true,
  });
  svg.code(cc.x, cc.y + 4, codeLines, {
    size: 10.5,
    lh: 15,
    maxChars: Math.floor((W - pad * 2 - 28) / charW(10.5)),
    dim: (l) => /^\s*\/\//.test(l),
  });
  svg.caption(
    cc.x,
    fnY + codeH - 8,
    "full module below — this is the code the browser runs",
  );

  // arrows between panels
  svg.arrow(ax + aw + 6, row1Y + row1H / 2, bx - 6, row1Y + row1H / 2, {
    stroke: C.faint,
  });
  svg.caption(
    ax + aw + arrowGap / 2,
    row1Y + row1H / 2 - 10,
    "parse()",
    "middle",
  );
  svg.arrow(bx + bw / 2, row1Y + row1H + 4, bx + bw / 2, fnY - 4, {
    stroke: C.faint,
  });
  svg.caption(bx + bw / 2 + 14, row1Y + row1H + 34, "analyze + codegen");

  /* ---- row 2 */

  const dx = pad;
  const dw = 560;
  const ex2 = dx + dw + 56;
  const ew = W - pad - ex2;

  const d = svg.panel(dx, row2Y, dw, row2H, "render(state) → VNodes", {
    sub: "real output",
    dark: true,
  });
  let y = svg.code(d.x, d.y + 2, vnodeLines, {
    size: 10.5,
    lh: 15,
    maxChars: Math.floor((dw - 28) / charW(10.5)),
    dim: (l) => /^\s*(attrs|events)/.test(l),
  });
  if (vnodeMore > 0) {
    svg.code(d.x, y, [`… ${vnodeMore} more lines`], {
      size: 10.5,
      lh: 15,
      fill: C.codeDim,
    });
    y += 15;
  }
  y += 10;
  svg.text(d.x, y, "→ DOM plugin build(vnodes) creates the nodes:", {
    size: 10.5,
    fill: C.dom,
    bold: true,
  });
  svg.code(d.x, y + 16, htmlLines, {
    size: 10.5,
    lh: 14,
    fill: C.dom,
    maxChars: Math.floor((dw - 28) / charW(10.5)),
  });

  const e = svg.panel(ex2, row2Y, ew, row2H, `diff(prev, next) → patches`, {
    sub: step ? `step: ${fit(step.label, 44)}` : "real output",
    dark: true,
  });
  const ey = svg.code(e.x, e.y + 2, patchLines, {
    size: 10.5,
    lh: 15,
    maxChars: Math.floor((ew - 28) / charW(10.5)),
    dim: () => false,
  });
  if (patchMore > 0)
    svg.code(e.x, ey, [`… ${patchMore} more patches`], { size: 10.5, lh: 15 });
  svg.caption(
    e.x,
    row2Y + row2H - 10,
    "→ DOM plugin apply(patches) touches only these nodes — the DOM effects",
  );

  // arrows from functions to results
  svg.arrow(dx + 260, fnY + codeH + 4, dx + 120, row2Y - 4, {
    stroke: C.msg,
    dash: "5 3",
  });
  svg.caption(dx + 274, fnY + codeH + 34, "view.render(state)");
  svg.arrow(ex2 + 260, fnY + codeH + 4, ex2 + 140, row2Y - 4, {
    stroke: C.effect,
    dash: "5 3",
  });
  svg.caption(ex2 + 274, fnY + codeH + 34, "view.diff(prev, next)");

  return svg;
}

/** naive word-wrap for display */
function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(/(?<=[> ])/)) {
    if (line.length + word.length > width) {
      out.push(line);
      line = "";
    }
    line += word;
  }
  if (line) out.push(line);
  return out;
}

/* ------------------------------------------------------------------ */
/* Task 2 — sequence diagram engine                                    */

export interface SeqActor {
  id: string;
  label: string;
  sub?: string;
}

export interface SeqCfg {
  title: string;
  sub?: string;
  actors: SeqActor[];
  steps: (SeqStep & { tick?: number; tickLabel?: string })[];
}

const kindColor: Record<string, string> = {
  msg: C.msg,
  effect: C.effect,
  state: C.state,
  dom: C.dom,
  net: C.net,
  note: C.muted,
  return: C.muted,
};

export function sequenceSvg(cfg: SeqCfg): Svg {
  const pad = 20;
  const n = cfg.actors.length;
  const xs: number[] = [];
  for (let i = 0; i < n; i++)
    xs.push(pad + 90 + ((W - 2 * pad - 180) * i) / (n - 1));

  // first pass: compute step geometry
  const labelH = 14;
  interface Geo {
    step: SeqCfg["steps"][number];
    top: number;
    h: number;
    arrowY?: number;
  }
  let y = 140;
  const geos: Geo[] = [];
  let prevTick: number | undefined;
  for (const s of cfg.steps) {
    const tick = (s as { tick?: number }).tick;
    if (tick !== undefined) {
      if (tick !== prevTick) y += 30; // headroom so each band label clears prior content
      prevTick = tick;
    }
    const lines = s.label.split("\n");
    if (s.kind === "note") {
      const h = lines.length * 16 + 8;
      geos.push({ step: s, top: y, h });
      y += h + 10;
      continue;
    }
    if (s.self) {
      const h = lines.length * 13 + 16;
      geos.push({ step: s, top: y, h });
      y += h + 14;
      continue;
    }
    const ai = cfg.actors.findIndex((a) => a.id === s.from);
    const bi = cfg.actors.findIndex((a) => a.id === s.to);
    const arrowY = y + lines.length * labelH + 4;
    geos.push({ step: s, top: y, h: lines.length * labelH + 22, arrowY });
    y = arrowY + 20;
  }
  const bottom = y + 16;

  // tick bands
  const bands: { tick: number; label?: string; top: number; bottom: number }[] =
    [];
  for (const g of geos) {
    const t = (g.step as { tick?: number }).tick;
    if (t === undefined) continue;
    const last = bands[bands.length - 1];
    if (last && last.tick === t) last.bottom = g.top + g.h;
    else
      bands.push({
        tick: t,
        label: (g.step as { tickLabel?: string }).tickLabel,
        top: g.top,
        bottom: g.top + g.h,
      });
  }

  const H = Math.max(bottom + 30, 260);
  const svg = new Svg(W, H);

  // bands first (background)
  for (const b of bands) {
    svg.rect(pad - 6, b.top - 8, W - 2 * pad + 12, b.bottom - b.top + 16, {
      fill: b.tick % 2 === 0 ? "rgba(37,99,235,0.05)" : "rgba(124,58,237,0.05)",
      rx: 12,
    });
    svg.text(pad + 2, b.top - 12, b.label ?? `tick ${b.tick}`, {
      size: 10,
      bold: true,
      fill: C.faint,
    });
  }

  // lifelines
  for (const x of xs)
    svg.line(x, 104, x, H - 20, { stroke: C.border, dash: "3 4" });

  // actor boxes
  cfg.actors.forEach((a, i) => {
    const bw = Math.min(
      200,
      Math.max(
        110,
        Math.max(a.label.length, a.sub?.length ?? 0) * charW(11) + 24,
      ),
    );
    const x = xs[i];
    svg.rect(x - bw / 2, 52, bw, 44, {
      fill: C.panel,
      stroke: C.border,
      rx: 8,
    });
    svg.text(x, 70, a.label, { size: 12, bold: true, anchor: "middle" });
    if (a.sub)
      svg.text(x, 86, a.sub, {
        size: 9.5,
        mono: true,
        fill: C.muted,
        anchor: "middle",
      });
  });

  // steps
  for (const g of geos) {
    const s = g.step;
    const color = kindColor[s.kind ?? "msg"] ?? C.ink;
    const lines = s.label.split("\n");
    if (s.kind === "note") {
      svg.caption(W / 2, g.top + 16, s.label, "middle");
      continue;
    }
    if (s.self) {
      const ai = cfg.actors.findIndex((a) => a.id === s.self);
      const x = xs[ai];
      const bw = Math.max(...lines.map((l) => l.length)) * charW(10.5) + 20;
      const bx = Math.min(x + 14, W - pad - bw);
      svg.rect(bx, g.top + 2, bw, g.h, { fill: C.panel, stroke: color, rx: 6 });
      lines.forEach((l, i) =>
        svg.text(bx + 10, g.top + 18 + i * 13, fit(l, 64), {
          size: 10.5,
          mono: true,
          fill: C.ink,
        }),
      );
      svg.line(x, g.top + g.h / 2, bx, g.top + g.h / 2, {
        stroke: color,
        dash: "2 3",
      });
      continue;
    }
    const ai = cfg.actors.findIndex((a) => a.id === s.from);
    const bi = cfg.actors.findIndex((a) => a.id === s.to);
    const x1 = xs[ai];
    const x2 = xs[bi];
    const ay = g.arrowY!;
    lines.forEach((l, i) =>
      svg.text((x1 + x2) / 2, g.top + 10 + i * labelH, fit(l, 56), {
        size: 11,
        mono: true,
        fill: color,
        anchor: "middle",
      }),
    );
    svg.arrow(x1, ay, x2, ay, {
      stroke: color,
      sw: 1.6,
      dash: s.kind === "return" || s.kind === "net" ? "6 3" : undefined,
    });
  }

  svg.text(pad, 34, cfg.title, { size: 16, bold: true });
  if (cfg.sub) svg.caption(W - pad, 34, cfg.sub, "end");
  return svg;
}

/* ------------------------------------------------------------------ */
/* Task 2 — the pure-concept architecture diagram                      */

export function pureConceptSvg(): Svg {
  const H = 700;
  const svg = new Svg(W, H);
  svg.text(
    24,
    34,
    "One application, six actors — only the center talks to the app",
    {
      size: 16,
      bold: true,
    },
  );
  svg.caption(W - 24, 34, "messages in → pure app → effects out", "end");

  // pure island
  svg.rect(404, 52, 432, 150, {
    fill: C.pure,
    stroke: "#6366f1",
    dash: "6 4",
    rx: 14,
  });
  svg.text(420, 76, "100% PURE — same message + same state ⇒ same effects", {
    size: 10.5,
    bold: true,
    fill: "#4f46e5",
  });

  // application
  svg.rect(430, 88, 380, 96, {
    fill: C.panel,
    stroke: "#6366f1",
    rx: 10,
    sw: 1.6,
  });
  svg.text(620, 112, "application", { size: 14, bold: true, anchor: "middle" });
  svg.text(620, 132, "app(message, state) → Effect[]", {
    size: 11.5,
    mono: true,
    anchor: "middle",
    fill: C.effect,
  });
  svg.text(620, 152, "no Date.now(), no Math.random(),", {
    size: 10.5,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(620, 166, "no fetch(), no DOM — handlers are pure", {
    size: 10.5,
    anchor: "middle",
    fill: C.muted,
  });

  // core
  svg.rect(430, 288, 380, 112, { fill: C.panel, stroke: C.border, rx: 10 });
  svg.text(620, 312, "core — createApp()", {
    size: 14,
    bold: true,
    anchor: "middle",
  });
  svg.text(620, 334, "queue of messages → app(msg, state)", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(620, 350, "effects → plugins, in order", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(620, 366, "state changed → onState(next) to all", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(620, 386, "the only code that calls the app", {
    size: 10,
    italic: true,
    anchor: "middle",
    fill: C.faint,
  });

  // dom plugin
  svg.rect(90, 268, 250, 150, {
    fill: C.panel,
    stroke: C.dom,
    rx: 10,
    sw: 1.4,
  });
  svg.text(215, 292, "dom plugin", {
    size: 13.5,
    bold: true,
    anchor: "middle",
    fill: C.dom,
  });
  svg.text(215, 314, "build(vnodes) → DOM", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(215, 330, "apply(patches) → DOM", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(215, 346, "owns every listener", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(215, 362, "re-renders on onState", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(215, 386, "all DOM mutation lives here", {
    size: 10,
    italic: true,
    anchor: "middle",
    fill: C.faint,
  });

  // http plugin
  svg.rect(930, 268, 250, 150, {
    fill: C.panel,
    stroke: C.net,
    rx: 10,
    sw: 1.4,
  });
  svg.text(1055, 292, "http plugin", {
    size: 13.5,
    bold: true,
    anchor: "middle",
    fill: C.net,
  });
  svg.text(1055, 314, "request(id, url, onSuccess…)", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(1055, 330, "same id cancels the previous", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(1055, 346, "cancel(id)", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(1055, 362, "reply → ctx.dispatch(msg)", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(1055, 386, "all network lives here", {
    size: 10,
    italic: true,
    anchor: "middle",
    fill: C.faint,
  });

  // store plugin
  svg.rect(430, 500, 380, 112, {
    fill: C.panel,
    stroke: C.state,
    rx: 10,
    sw: 1.4,
  });
  svg.text(620, 524, "store plugin — the state", {
    size: 13.5,
    bold: true,
    anchor: "middle",
    fill: C.state,
  });
  svg.text(620, 546, "set · merge · remove · undo · restoreTo", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(620, 562, "immutable updates, structural sharing", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(620, 578, "history of { effect, restoreEffect }", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(620, 598, "the first plugin with getState() wins", {
    size: 10,
    italic: true,
    anchor: "middle",
    fill: C.faint,
  });

  // browser
  svg.rect(90, 500, 250, 112, { fill: C.panel, stroke: C.border, rx: 10 });
  svg.text(215, 524, "browser", { size: 13.5, bold: true, anchor: "middle" });
  svg.text(215, 546, "DOM tree · user events", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(215, 562, "network (fetch)", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(215, 582, "the outside world", {
    size: 10,
    italic: true,
    anchor: "middle",
    fill: C.faint,
  });

  // arrows
  // browser -> dom (user events)
  svg.arrow(160, 500, 160, 418, { stroke: C.msg, sw: 1.6 });
  svg.caption(150, 470, "click / input / key", "end");
  // dom -> browser
  svg.arrow(270, 418, 270, 500, { stroke: C.dom, sw: 1.6 });
  svg.caption(280, 470, "build / apply(patches)");
  // dom -> core (dispatch)
  svg.arrow(340, 330, 430, 330, { stroke: C.msg, sw: 1.6 });
  svg.caption(385, 318, "dispatch({id…})", "middle");
  // core -> dom (onState)
  svg.arrow(430, 372, 340, 372, { stroke: C.state, sw: 1.6 });
  svg.caption(385, 392, "onState(next)", "middle");
  // core -> app
  svg.arrow(560, 288, 560, 184, { stroke: C.msg, sw: 1.6 });
  svg.caption(550, 244, "app(msg, state)", "end");
  // app -> core (effects)
  svg.arrow(690, 184, 690, 288, { stroke: C.effect, sw: 1.6 });
  svg.caption(700, 244, "Effect[] — plain data");
  // core -> store
  svg.arrow(520, 400, 520, 500, { stroke: C.effect, sw: 1.6 });
  svg.caption(510, 462, "handle(store.set…)", "end");
  // store -> core
  svg.arrow(730, 500, 730, 400, { stroke: C.state, sw: 1.6 });
  svg.caption(740, 462, "new state (identity changes)");
  // core -> http
  svg.arrow(810, 330, 930, 330, { stroke: C.effect, sw: 1.6 });
  svg.caption(870, 318, "handle(request)", "middle");
  // http -> core
  svg.arrow(930, 372, 810, 372, { stroke: C.msg, sw: 1.6 });
  svg.caption(870, 392, "dispatch(loaded/failed)", "middle");
  // http <-> browser network (dashed, routed along the bottom)
  svg.poly(
    [
      [1055, 418],
      [1055, 646],
      [215, 646],
      [215, 612],
    ],
    { stroke: C.net, dash: "6 4", sw: 1.4 },
  );
  svg.caption(
    635,
    640,
    "fetch() — the network also lives in the browser",
    "middle",
  );

  // legend
  const legend: [string, string][] = [
    [C.msg, "message (in)"],
    [C.effect, "effect (out)"],
    [C.state, "state change"],
    [C.dom, "DOM work"],
    [C.net, "network"],
  ];
  legend.forEach(([color, label], i) => {
    const x = 930 + (i % 3) * 90;
    const yy = 460 + Math.floor(i / 3) * 18;
    svg.line(x, yy - 4, x + 24, yy - 4, { stroke: color, sw: 2 });
    svg.text(x + 30, yy, label, { size: 10, fill: C.muted });
  });

  return svg;
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* The interactive flow: six actors, one tiny admin session as data.   */

export interface FlowStep {
  from: string;
  to: string;
  /** Waypoints the packet travels through, in SVG coordinates. */
  pts?: [number, number][];
  /**
   * Legs between SVG points (`p`) and HTML anchors (`e`: "url" = the toy
   * browser's URL bar, "srv" = the server box). Steps with `fly` move a dot
   * across the whole stage — the packet crosses from the diagram into the
   * toy browser and back — instead of the in-SVG packet.
   */
  fly?: { p?: [number, number]; e?: string }[];
  color: string;
  /** The data on the wire (mono line under the diagram). */
  label: string;
  /** What happens (caption under the diagram). */
  caption: string;
  /** Walkthrough phase — chip in the controls; dots regroup when it changes. */
  phase: string;
  /** Flash the server's green LED: this traffic passes through it. */
  flash?: boolean;
  /** Toy-browser sync frame: partial updates for url, view and devbar. */
  browser?: {
    url?: string;
    view?: string;
    dbg?: { t: string; m: string };
    /** Store change, shown in the toy devtools store tab. */
    store?: string;
  };
}

/** Segment geometries, shared by every step. */
const E: Record<string, [number, number][]> = {
  c2a: [
    [185, 278],
    [185, 218],
  ],
  a2c: [
    [265, 218],
    [265, 278],
  ],
  c2d: [
    [365, 319],
    [460, 319],
    [460, 130],
    [520, 130],
  ],
  d2c: [
    [520, 160],
    [470, 160],
    [470, 394],
    [365, 394],
  ],
  c2s: [
    [365, 319],
    [480, 319],
    [480, 258],
    [520, 258],
  ],
  s2c: [
    [520, 276],
    [440, 276],
    [440, 394],
    [365, 394],
  ],
  c2h: [
    [365, 319],
    [500, 319],
    [500, 370],
    [520, 370],
  ],
  h2c: [
    [520, 390],
    [490, 390],
    [490, 394],
    [365, 394],
  ],
};

const P1 = "open the start page";
const P2 = "open the users page";
const P3 = "edit Ada";
const P4 = "remove Alan";

/**
 * The story of a tiny admin session, as data: open the start page, open the
 * users page, edit one user, remove one user. Phase 2 walks every hop of the
 * loop; later phases compress repeated hops and say so in the caption — the
 * model never bends. The toy browser in the hero reads `browser` frames to
 * stay in sync with the packet.
 */
export const FLOW_STEPS: FlowStep[] = [
  {
    from: "server",
    to: "dom",
    color: C.msg,
    fly: [{ e: "srv" }, { e: "url" }],
    flash: true,
    label: 'open "/" — SSR HTML arrives',
    caption:
      "First paint needs no loop at all: the server ran the same render(state), and the finished HTML flies over the wire into the toy browser, already painted. The dom plugin mounts it and owns every listener.",
    phase: P1,
    browser: {
      url: "/",
      view: "home",
      dbg: { t: "ssr", m: "render(state) ran on the server" },
      store: "init — overview (SSR)",
    },
  },
  {
    from: "dom",
    to: "core",
    color: C.msg,
    fly: [
      { e: "url" },
      { p: [840, 136] },
      { p: [520, 136] },
      { p: [365, 394] },
    ],
    label: 'dispatch({ id: "mounted" })',
    caption:
      "The toy browser hands the event to the dom plugin, and it says hello the only way it can: one message — mounted. Nobody calls the application directly.",
    phase: P1,
    browser: { dbg: { t: "msg", m: "mounted" } },
  },
  {
    from: "core",
    to: "app",
    color: C.msg,
    pts: E.c2a,
    label: 'app({ id: "mounted" }, state)',
    caption:
      "The core — the only code that ever calls the app — invokes the pure handler.",
    phase: P1,
    browser: { dbg: { t: "app", m: "app(mounted, state)" } },
  },
  {
    from: "app",
    to: "core",
    color: C.effect,
    pts: E.a2c,
    label: "[ ] — no effects",
    caption:
      "The overview is already on the page, so the handler returns nothing. Deterministic: same message in, same (empty) answer out.",
    phase: P1,
    browser: { dbg: { t: "fx", m: "[] — nothing to do" } },
  },
  {
    from: "dom",
    to: "core",
    color: C.msg,
    pts: E.d2c,
    label: '@click "users" → dispatch({ id: "users.load" })',
    caption:
      "The user opens the Users page. The click becomes a message — the only way into the application.",
    phase: P2,
    browser: { url: "/users", dbg: { t: "msg", m: "users.load" } },
  },
  {
    from: "core",
    to: "app",
    color: C.msg,
    pts: E.c2a,
    label: 'app({ id: "users.load" }, state)',
    caption:
      "Same rule as always: the core calls the handler with the message and the state.",
    phase: P2,
    browser: { dbg: { t: "app", m: "app(users.load, state)" } },
  },
  {
    from: "app",
    to: "core",
    color: C.effect,
    pts: E.a2c,
    label: '[ store.merge("users.loading", true), http.request(…) ]',
    caption:
      "Two effects, plain data: flip to loading, then fetch. No promises, no callbacks.",
    phase: P2,
    browser: { dbg: { t: "fx", m: "store.merge · http.request" } },
  },
  {
    from: "core",
    to: "store",
    color: C.effect,
    pts: E.c2s,
    label: 'handle(store.merge("users.loading", true))',
    caption:
      "The store applies the merge immutably — a new state object with loading flipped.",
    phase: P2,
    browser: {
      view: "users-loading",
      dbg: { t: "state", m: "loading = true" },
      store: "users.loading ← true",
    },
  },
  {
    from: "core",
    to: "http",
    color: C.effect,
    pts: E.c2h,
    label: 'handle(http.request({ url: "/api/users" }))',
    caption:
      "The http plugin owns fetch — application code never touches the network.",
    phase: P2,
    browser: { dbg: { t: "fx", m: "GET /api/users" } },
  },
  {
    from: "http",
    to: "server",
    color: C.net,
    fly: [{ p: [840, 378] }, { e: "url" }, { e: "srv" }],
    flash: true,
    label: 'fetch("/api/users")',
    caption:
      "The request hops into the toy browser, which passes it down to the server — watch the light flash green.",
    phase: P2,
    browser: { dbg: { t: "net", m: "→ GET /api/users" } },
  },
  {
    from: "server",
    to: "http",
    color: C.net,
    fly: [{ e: "srv" }, { e: "url" }, { p: [840, 378] }],
    flash: true,
    label: "HTTP 200 · 3 users · 12 ms",
    caption:
      "The reply leaves the server and re-enters through the toy browser — in the real admin-app, Postgres behind an API.",
    phase: P2,
    browser: { dbg: { t: "net", m: "← 200 · 3 users" } },
  },
  {
    from: "http",
    to: "core",
    color: C.msg,
    pts: E.h2c,
    label: 'dispatch({ id: "users.loaded", payload })',
    caption:
      "The http plugin turns the reply into what the app understands: a message. The app never saw a promise.",
    phase: P2,
    browser: { dbg: { t: "msg", m: "users.loaded" } },
  },
  {
    from: "core",
    to: "app",
    color: C.msg,
    pts: E.c2a,
    label: 'app({ id: "users.loaded" }, state)',
    caption: "Second lap — same rule, same purity.",
    phase: P2,
    browser: { dbg: { t: "app", m: "app(users.loaded, state)" } },
  },
  {
    from: "app",
    to: "core",
    color: C.effect,
    pts: E.a2c,
    label: '[ store.set("users", rows) ]',
    caption:
      "The handler computes the new state shape and asks the store to set it.",
    phase: P2,
    browser: { dbg: { t: "fx", m: "store.set users" } },
  },
  {
    from: "core",
    to: "store",
    color: C.effect,
    pts: E.c2s,
    label: 'handle(store.set("users", rows))',
    caption:
      "The store replaces the branch immutably; untouched branches keep their identity.",
    phase: P2,
    browser: {
      store: "users ← rows (3)",
      dbg: { t: "state", m: "users[3] committed" },
    },
  },
  {
    from: "store",
    to: "core",
    color: C.state,
    pts: E.s2c,
    label: "new state — identity changed",
    caption:
      "A new object comes back. Nothing was mutated — that is why diff can trust ===.",
    phase: P2,
    browser: { dbg: { t: "state", m: "state #3" } },
  },
  {
    from: "core",
    to: "dom",
    color: C.state,
    pts: E.c2d,
    label: "onState(next) → diff(prev, next)",
    caption:
      "State identity changed, so every plugin is notified. For the dom plugin that means: diff.",
    phase: P2,
    browser: { dbg: { t: "state", m: "onState → diff" } },
  },
  {
    from: "dom",
    to: "browser",
    color: C.dom,
    fly: [{ p: [840, 136] }, { e: "url" }],
    label: "apply(3 patches) — the table paints",
    caption:
      "Three patch ops fly out of the diagram into the toy browser and swap the skeleton for the table. The loop is closed — until the next event.",
    phase: P2,
    browser: { view: "users", dbg: { t: "dom", m: "Δ 3 patches" } },
  },
  {
    from: "dom",
    to: "core",
    color: C.msg,
    pts: E.d2c,
    label: '@click=edit(1) → dispatch({ id: "users.edit" })',
    caption:
      "Now the user clicks edit on Ada's row. Same door as always: a message.",
    phase: P3,
    browser: { dbg: { t: "msg", m: "users.edit" } },
  },
  {
    from: "core",
    to: "app",
    color: C.msg,
    pts: E.c2a,
    label: 'app({ id: "users.edit" }, state)',
    caption: "The row id rides in the payload; the handler reads it from data.",
    phase: P3,
    browser: { dbg: { t: "app", m: "app(users.edit, state)" } },
  },
  {
    from: "app",
    to: "core",
    color: C.effect,
    pts: E.a2c,
    label: '[ store.set("users.editing", 1) ]',
    caption: "Which row is being edited is just state — nothing else changes.",
    phase: P3,
    browser: { dbg: { t: "fx", m: "store.set editing" } },
  },
  {
    from: "dom",
    to: "browser",
    color: C.dom,
    fly: [{ p: [840, 136] }, { e: "url" }],
    label: "the row becomes a form",
    caption:
      "The same three hops as the last phase, compressed: handle → new state → onState — two patches turn the row into an input.",
    phase: P3,
    browser: {
      view: "users-edit",
      store: "users.editing ← 1",
      dbg: { t: "dom", m: "Δ 2 patches" },
    },
  },
  {
    from: "dom",
    to: "core",
    color: C.msg,
    pts: E.d2c,
    label: '@click=save → dispatch({ id: "users.save", payload })',
    caption: "Save clicked — the new name rides along in the payload.",
    phase: P3,
    browser: { dbg: { t: "msg", m: "users.save" } },
  },
  {
    from: "core",
    to: "app",
    color: C.msg,
    pts: E.c2a,
    label: 'app({ id: "users.save" }, state)',
    caption: "The handler validates — pure code — and asks for the write.",
    phase: P3,
    browser: { dbg: { t: "app", m: "app(users.save, state)" } },
  },
  {
    from: "app",
    to: "core",
    color: C.effect,
    pts: E.a2c,
    label: '[ http.request({ method: "PATCH", url: "/api/users/1" }) ]',
    caption:
      "One effect: persist. Writing is a side effect, so it belongs to a plugin.",
    phase: P3,
    browser: { dbg: { t: "fx", m: "PATCH /api/users/1" } },
  },
  {
    from: "core",
    to: "http",
    color: C.effect,
    pts: E.c2h,
    label: "handle(http.request(…))",
    caption: "The http plugin sends the PATCH.",
    phase: P3,
    browser: { dbg: { t: "fx", m: "→ PATCH /api/users/1" } },
  },
  {
    from: "http",
    to: "server",
    color: C.net,
    fly: [{ p: [840, 378] }, { e: "url" }, { e: "srv" }],
    flash: true,
    label: 'PATCH /api/users/1 · { name: "Ada Lovelace" }',
    caption:
      "The write hops through the toy browser and leaves the island — in the real app it lands in Postgres.",
    phase: P3,
    browser: { dbg: { t: "net", m: "→ PATCH · { name }" } },
  },
  {
    from: "server",
    to: "http",
    color: C.net,
    fly: [{ e: "srv" }, { e: "url" }, { p: [840, 378] }],
    flash: true,
    label: "HTTP 200 · saved",
    caption: "The database confirms the row.",
    phase: P3,
    browser: { dbg: { t: "net", m: "← 200 · saved" } },
  },
  {
    from: "http",
    to: "core",
    color: C.msg,
    pts: E.h2c,
    label: 'dispatch({ id: "users.saved" })',
    caption: "The confirmation re-enters the loop as a message.",
    phase: P3,
    browser: { dbg: { t: "msg", m: "users.saved" } },
  },
  {
    from: "core",
    to: "app",
    color: C.msg,
    pts: E.c2a,
    label: 'app({ id: "users.saved" }, state)',
    caption: "The handler closes the editor and reshapes the rows.",
    phase: P3,
    browser: { dbg: { t: "app", m: "app(users.saved, state)" } },
  },
  {
    from: "app",
    to: "core",
    color: C.effect,
    pts: E.a2c,
    label: '[ store.set(users, rows′), store.set("users.editing", null) ]',
    caption: "New rows with the new name, editor closed — two store effects.",
    phase: P3,
    browser: { dbg: { t: "fx", m: "store.set ×2" } },
  },
  {
    from: "dom",
    to: "browser",
    color: C.dom,
    fly: [{ p: [840, 136] }, { e: "url" }],
    label: "\u201cAda L.\u201d → \u201cAda Lovelace\u201d",
    caption:
      "Same compressed ending: handle → state → onState — two text patches, no navigation, the form is gone.",
    phase: P3,
    browser: {
      view: "users-edited",
      store: "users ← rows′ · editing ← null",
      dbg: { t: "dom", m: "Δ 2 patches" },
    },
  },
  {
    from: "dom",
    to: "core",
    color: C.msg,
    pts: E.d2c,
    label: '@click=remove(3) → dispatch({ id: "users.remove" })',
    caption: "Last interaction: the user removes Alan. One click, one message.",
    phase: P4,
    browser: { dbg: { t: "msg", m: "users.remove" } },
  },
  {
    from: "core",
    to: "app",
    color: C.msg,
    pts: E.c2a,
    label: 'app({ id: "users.remove" }, state)',
    caption: "The handler asks for the delete — it does not perform it.",
    phase: P4,
    browser: { dbg: { t: "app", m: "app(users.remove, state)" } },
  },
  {
    from: "app",
    to: "core",
    color: C.effect,
    pts: E.a2c,
    label: '[ http.request({ method: "DELETE", url: "/api/users/3" }) ]',
    caption: "Data out: one DELETE effect, plain data.",
    phase: P4,
    browser: { dbg: { t: "fx", m: "DELETE /api/users/3" } },
  },
  {
    from: "core",
    to: "http",
    color: C.effect,
    pts: E.c2h,
    label: "handle(http.request(…))",
    caption: "The http plugin sends the DELETE.",
    phase: P4,
    browser: { dbg: { t: "fx", m: "→ DELETE /api/users/3" } },
  },
  {
    from: "http",
    to: "server",
    color: C.net,
    fly: [{ p: [840, 378] }, { e: "url" }, { e: "srv" }],
    flash: true,
    label: "DELETE /api/users/3",
    caption: "The delete hops through the browser down to the server.",
    phase: P4,
    browser: { dbg: { t: "net", m: "→ DELETE /api/users/3" } },
  },
  {
    from: "server",
    to: "http",
    color: C.net,
    fly: [{ e: "srv" }, { e: "url" }, { p: [840, 378] }],
    flash: true,
    label: "HTTP 200 · deleted",
    caption: "Postgres drops the row and confirms.",
    phase: P4,
    browser: { dbg: { t: "net", m: "← 200 · deleted" } },
  },
  {
    from: "http",
    to: "core",
    color: C.msg,
    pts: E.h2c,
    label: 'dispatch({ id: "users.removed" })',
    caption: "Back into the loop as a message.",
    phase: P4,
    browser: { dbg: { t: "msg", m: "users.removed" } },
  },
  {
    from: "core",
    to: "app",
    color: C.msg,
    pts: E.c2a,
    label: 'app({ id: "users.removed" }, state)',
    caption:
      "The handler filters the row out of the state — a pure computation.",
    phase: P4,
    browser: { dbg: { t: "app", m: "app(users.removed, state)" } },
  },
  {
    from: "app",
    to: "core",
    color: C.effect,
    pts: E.a2c,
    label: '[ store.set("users", rows.filter(…)) ]',
    caption: "The new users list simply doesn't contain Alan anymore.",
    phase: P4,
    browser: { dbg: { t: "fx", m: "store.set users" } },
  },
  {
    from: "dom",
    to: "browser",
    color: C.dom,
    fly: [{ p: [840, 136] }, { e: "url" }],
    label: "the row is gone",
    caption:
      "One removeRow patch. Reload later and the server agrees — state, DOM and database tell the same story.",
    phase: P4,
    browser: {
      view: "users-after",
      store: "users − Alan → (2)",
      dbg: { t: "dom", m: "Δ 1 patch" },
    },
  },
];

/** Actor rects that get a data-node attribute for the walkthrough player. */
const FLOW_NODE_MARKERS: [string, string][] = [
  ["app", '<rect x="85" y="96" width="280" height="118"'],
  ["core", '<rect x="85" y="282" width="280" height="128"'],
  ["dom", '<rect x="520" y="92" width="320" height="88"'],
  ["store", '<rect x="520" y="214" width="320" height="88"'],
  ["http", '<rect x="520" y="336" width="320" height="88"'],
  ["logger", '<rect x="520" y="458" width="320" height="88"'],
];

/**
 * The walkthrough diagram for the hero, drawn from scratch (the static
 * pureConceptSvg keeps the six-actor ring for the docs). Three zones: your
 * application as one island on the left (app + core), the plugin column in
 * the middle, and on the right a dashed rail — the browser's edge. Every
 * plugin touches exactly two neighbours: the core (left) and the browser
 * (right). The toy browser rendered beside this svg on the page IS the
 * browser actor, and the server lives under it in the page — only the
 * browser talks to the server, no plugin ever does.
 */
export function pureConceptFlowSvg(id = "flowviz-svg"): string {
  const svg = new Svg(W, 700);
  svg.text(24, 34, "One pure application — plugins do every dirty thing", {
    size: 16,
    bold: true,
  });
  svg.caption(W - 24, 34, "messages in → effects out", "end");

  // -- your application: app + core in one pure island ------------------
  svg.rect(60, 56, 330, 372, {
    fill: C.pure,
    stroke: "#6366f1",
    dash: "6 4",
    rx: 14,
  });
  svg.text(76, 80, "YOUR APPLICATION", {
    size: 10.5,
    bold: true,
    fill: "#4f46e5",
  });

  svg.rect(85, 96, 280, 118, {
    fill: C.panel,
    stroke: "#6366f1",
    rx: 10,
    sw: 1.6,
  });
  svg.text(225, 122, "application", { size: 14, bold: true, anchor: "middle" });
  svg.text(225, 144, "app(message, state) → Effect[]", {
    size: 11.5,
    mono: true,
    anchor: "middle",
    fill: C.effect,
  });
  svg.text(225, 164, "no Date.now(), no fetch(),", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(225, 180, "no DOM — handlers are pure", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(225, 202, "the only code you write", {
    size: 10,
    italic: true,
    anchor: "middle",
    fill: C.faint,
  });

  svg.rect(85, 282, 280, 128, { fill: C.panel, stroke: C.border, rx: 10 });
  svg.text(225, 308, "core — createApp()", {
    size: 14,
    bold: true,
    anchor: "middle",
  });
  svg.text(225, 330, "queue → app(msg, state)", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(225, 346, "effects → plugins, in order", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(225, 362, "state changed → onState(all)", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(225, 390, "the only code that calls the app", {
    size: 10,
    italic: true,
    anchor: "middle",
    fill: C.faint,
  });

  // core <-> app
  svg.arrow(185, 278, 185, 218, { stroke: C.msg, sw: 1.6 });
  svg.caption(175, 252, "app(msg, state)", "end");
  svg.arrow(265, 218, 265, 278, { stroke: C.effect, sw: 1.6 });
  svg.caption(275, 252, "Effect[] — data");

  // -- the plugin column ------------------------------------------------
  svg.caption(680, 80, "plugins — all the dirty work", "middle");

  svg.rect(520, 92, 320, 88, { fill: C.panel, stroke: C.dom, rx: 10, sw: 1.4 });
  svg.text(680, 118, "dom plugin", {
    size: 13.5,
    bold: true,
    anchor: "middle",
    fill: C.dom,
  });
  svg.text(680, 140, "build(vnodes) · apply(patches)", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(680, 156, "owns every listener", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(680, 174, "all DOM mutation lives here", {
    size: 10,
    italic: true,
    anchor: "middle",
    fill: C.faint,
  });

  svg.rect(520, 214, 320, 88, {
    fill: C.panel,
    stroke: C.state,
    rx: 10,
    sw: 1.4,
  });
  svg.text(680, 240, "store plugin — the state", {
    size: 13.5,
    bold: true,
    anchor: "middle",
    fill: C.state,
  });
  svg.text(680, 262, "set · merge · undo · restoreTo", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(680, 278, "immutable, structural sharing", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(680, 296, "a new object on every commit", {
    size: 10,
    italic: true,
    anchor: "middle",
    fill: C.faint,
  });

  svg.rect(520, 336, 320, 88, {
    fill: C.panel,
    stroke: C.net,
    rx: 10,
    sw: 1.4,
  });
  svg.text(680, 362, "http plugin", {
    size: 13.5,
    bold: true,
    anchor: "middle",
    fill: C.net,
  });
  svg.text(680, 384, "request(id, url…) · cancel(id)", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(680, 400, "reply → ctx.dispatch(msg)", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(680, 418, "all network lives here", {
    size: 10,
    italic: true,
    anchor: "middle",
    fill: C.faint,
  });

  svg.rect(520, 458, 320, 88, {
    fill: C.panel,
    stroke: C.muted,
    rx: 10,
    sw: 1.4,
  });
  svg.text(680, 484, "logger plugin", {
    size: 13.5,
    bold: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(680, 506, "every message · every effect", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(680, 522, "history with undo markers", {
    size: 10.5,
    mono: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.text(680, 540, "feeds the debug panel", {
    size: 10,
    italic: true,
    anchor: "middle",
    fill: C.faint,
  });

  // -- trunks between the island and the column (they land in the gaps
  // between plugin boxes, so they read as "core ↔ the column", not one box)
  svg.arrow(365, 319, 520, 319, { stroke: C.effect, sw: 1.6 });
  svg.caption(442, 307, "handle(effects)", "middle");
  svg.poly(
    [
      [520, 441],
      [430, 441],
      [430, 394],
      [365, 394],
    ],
    { stroke: C.msg, sw: 1.6 },
  );
  svg.caption(442, 461, "dispatch(msg)", "middle");

  // -- every plugin also touches the browser on the right: four arrows
  // land on a dashed rail — the browser's edge. The toy browser rendered
  // beside this svg on the page IS that rail; the server lives under it
  // (in the page), and only the browser talks to the server.
  svg.line(1210, 92, 1210, 546, { stroke: C.muted, sw: 1.2, dash: "4 3" });
  svg.text(1210, 82, "browser", {
    size: 10.5,
    bold: true,
    anchor: "middle",
    fill: C.muted,
  });
  svg.arrow(840, 136, 1200, 136, { stroke: C.dom, sw: 1.4 });
  svg.caption(1020, 124, "build · apply(patches)", "middle");
  svg.arrow(840, 258, 1200, 258, { stroke: C.state, sw: 1.4 });
  svg.caption(1020, 246, "the store tab", "middle");
  svg.arrow(840, 378, 1200, 378, { stroke: C.net, sw: 1.4 });
  svg.caption(1020, 366, "fetch()", "middle");
  svg.arrow(840, 502, 1200, 502, { stroke: C.muted, sw: 1.4 });
  svg.caption(1020, 490, "the pavlus tab", "middle");

  // legend
  const legend: [string, string][] = [
    [C.msg, "message (in)"],
    [C.effect, "effect (out)"],
    [C.state, "state change"],
    [C.dom, "DOM work"],
    [C.net, "network"],
  ];
  legend.forEach(([color, label], i) => {
    const x = 70 + i * 115;
    svg.line(x, 576, x + 24, 576, { stroke: color, sw: 2 });
    svg.text(x + 30, 580, label, { size: 10, fill: C.muted });
  });

  let s = svg.toString();
  for (const [node, marker] of FLOW_NODE_MARKERS) {
    if (!s.includes(marker))
      throw new Error(`pureConceptFlowSvg: marker for ${node} not found`);
    s = s.replace(
      marker,
      marker.replace("<rect ", `<rect data-node="${node}" `),
    );
  }
  const style =
    "<style>rect[data-node]{transition:stroke-width .25s ease}rect[data-node].lit{stroke-width:3.4;filter:drop-shadow(0 0 5px rgba(79,70,229,0.35))}</style>";
  const packet = `<circle id="fv-packet" r="7" fill="${C.msg}" stroke="#ffffff" stroke-width="2" opacity="0"/>`;
  return s
    .replace("<svg ", `<svg id="${id}" `)
    .replace("</svg>", `${style}${packet}</svg>`);
}

/* Task 2 — the two walkthrough scenarios (real patches in the labels) */

const ACTORS = [
  { id: "browser", label: "browser", sub: "DOM · events · fetch" },
  { id: "dom", label: "dom plugin", sub: "the only DOM code" },
  { id: "core", label: "core", sub: "createApp()" },
  { id: "app", label: "application", sub: "100% pure" },
  { id: "store", label: "store plugin", sub: "state + history" },
  { id: "http", label: "http plugin", sub: "requests" },
];

/** One click on the counter: message → effects → state → patches → DOM. */
export function counterScenarioSvg(counterPatch: string): Svg {
  return sequenceSvg({
    title: "Simple: one click, one tick",
    sub: "counter app — the patches in the labels are the real diff output",
    actors: ACTORS,
    steps: [
      {
        kind: "note",
        label:
          "before this: createApp() mounted the view (render → DOM) and dispatched `mounted`",
      },
      {
        tick: 1,
        tickLabel: "tick 1 — one message, processed to the end",
        from: "browser",
        to: "dom",
        label: "user clicks Increment",
        kind: "msg",
      },
      {
        from: "dom",
        to: "core",
        label: 'dispatch { id: "inc", event: {type:"click"} }',
        kind: "msg",
      },
      {
        from: "core",
        to: "app",
        label: 'app({ id: "inc" }, { count: 0 })',
        kind: "msg",
      },
      {
        self: "app",
        label: [
          "pure computation — no side effects:",
          'return [ store.set("count", 0 + 1) ]',
        ].join("\n"),
        kind: "effect",
      },
      {
        from: "app",
        to: "core",
        label: "Effect[] — plain data",
        kind: "effect",
      },
      {
        from: "core",
        to: "store",
        label: 'handle({ plugin:"store", type:"set", path:"count", value:1 })',
        kind: "effect",
      },
      {
        self: "store",
        label: [
          "state = { ...prev, count: 1 } — a new object,",
          "untouched branches keep their identity",
        ].join("\n"),
        kind: "state",
      },
      {
        self: "core",
        label: "getState() !== state → onState(next) to every plugin",
        kind: "state",
      },
      {
        from: "core",
        to: "dom",
        label: "onState({ count: 1 })",
        kind: "state",
      },
      {
        self: "dom",
        label: ["view.diff(prev, next) →", counterPatch].join("\n"),
        kind: "dom",
      },
      {
        from: "dom",
        to: "browser",
        label: "apply(patches) → text node now reads “Count: 1”",
        kind: "dom",
      },
    ],
  });
}

/** The users app: mounted → http request → reply → state → DOM. */
export function usersScenarioSvg(
  loadingPatches: string[],
  readyPatches: string[],
  removePatches: string[],
): Svg {
  const sum = (ps: string[]): string =>
    ps.length <= 2
      ? ps.join("\n")
      : `${ps[0]}\n${ps[1]}\n… ${ps.length - 2} more patches`;
  return sequenceSvg({
    title: "Complex: mounted → HTTP → store → diff → browser",
    sub: "users app — every patch below is the real compiler output",
    actors: ACTORS,
    steps: [
      {
        tick: 1,
        tickLabel: "tick 1 — `mounted` (from createApp mount)",
        from: "core",
        to: "app",
        label: 'app({ id: "mounted" }, { status:"boot", users:[] })',
        kind: "msg",
      },
      {
        self: "app",
        label: [
          "return [",
          '  store.set("status", "loading"),',
          '  http.request({ id:"users", url:"/api/users",',
          '                 onSuccess:"loaded", onError:"failed"}) ]',
        ].join("\n"),
        kind: "effect",
      },
      {
        from: "core",
        to: "store",
        label: 'handle(store.set "status" → "loading")',
        kind: "effect",
      },
      {
        from: "core",
        to: "http",
        label: 'handle(http.request id:"users") — fetch starts',
        kind: "effect",
      },
      {
        self: "core",
        label: "state changed → onState(next)",
        kind: "state",
      },
      {
        self: "dom",
        label: ["diff → branch flip (else → if):", sum(loadingPatches)].join(
          "\n",
        ),
        kind: "dom",
      },
      {
        from: "dom",
        to: "browser",
        label: "apply → “Loading…” appears",
        kind: "dom",
      },
      {
        tick: 2,
        tickLabel: "tick 2 — outside the app: the network answers",
        self: "http",
        label: ["GET /api/users → 200 JSON", "[Ann, Bob, Clara]"].join("\n"),
        kind: "net",
      },
      {
        from: "http",
        to: "core",
        label: 'ctx.dispatch { id:"loaded", payload:{status:200, data:[…]} }',
        kind: "msg",
      },
      {
        tick: 3,
        tickLabel: "tick 3 — the reply is just another message",
        from: "core",
        to: "app",
        label: 'app({ id:"loaded", payload }, state)',
        kind: "msg",
      },
      {
        self: "app",
        label: [
          'return [ store.set("users", msg.payload.data),',
          '         store.set("status", "ready") ]',
        ].join("\n"),
        kind: "effect",
      },
      {
        from: "core",
        to: "store",
        label: "handle(set users, set status) × 2",
        kind: "effect",
      },
      {
        self: "core",
        label: "state changed → onState(next)",
        kind: "state",
      },
      {
        self: "dom",
        label: [
          "diff → branch flip (if → else), keyed list inserts:",
          sum(readyPatches),
        ].join("\n"),
        kind: "dom",
      },
      {
        from: "dom",
        to: "browser",
        label: "apply → three <li> rows rendered",
        kind: "dom",
      },
      {
        tick: 4,
        tickLabel: "tick 4 — the loop closes: a click becomes a message",
        from: "browser",
        to: "dom",
        label: "user clicks a row's ×",
        kind: "msg",
      },
      {
        from: "dom",
        to: "core",
        label: 'dispatch { id:"remove", payload: 3, event:{type:"click"} }',
        kind: "msg",
      },
      {
        from: "core",
        to: "app",
        label: 'app({ id:"remove", payload:3 }, state)',
        kind: "msg",
      },
      {
        self: "app",
        label: [
          'return [ store.set("users",',
          "           state.users.filter(u => u.id !== 3)) ]",
        ].join("\n"),
        kind: "effect",
      },
      {
        from: "core",
        to: "store",
        label: "handle(set users → two rows)",
        kind: "effect",
      },
      {
        self: "core",
        label: "state changed → onState(next)",
        kind: "state",
      },
      {
        self: "dom",
        label: ["diff (keyed list):", sum(removePatches)].join("\n"),
        kind: "dom",
      },
      {
        from: "dom",
        to: "browser",
        label: "apply → Clara's row removed",
        kind: "dom",
      },
    ],
  });
}
