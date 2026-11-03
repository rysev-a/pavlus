/**
 * Tiny SVG builder for the pavlus docs diagrams.
 * Everything textual goes through `esc()`, so the output stays well-formed.
 */

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const MONO =
  "ui-monospace, Menlo, Consolas, 'Liberation Mono', monospace";
export const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Shared palette (docs site CSS uses the same colors). */
export const C = {
  canvas: "#f6f8fa",
  panel: "#ffffff",
  border: "#d4d9e0",
  ink: "#1f2430",
  muted: "#667085",
  faint: "#98a2b3",
  codeBg: "#0f172a",
  codeText: "#e2e8f0",
  codeDim: "#7d8ca6",
  codeNum: "#52607a",
  msg: "#2563eb", // messages flowing into the app
  effect: "#7c3aed", // effects flowing out
  state: "#059669", // state changes
  dom: "#d97706", // DOM / browser work
  net: "#0ea5e9", // network
  pure: "#eef2ff",
};

export interface TextOpts {
  size?: number;
  fill?: string;
  anchor?: "start" | "middle" | "end";
  mono?: boolean;
  bold?: boolean;
  italic?: boolean;
  opacity?: number;
}

/**
 * Pavlus token colors for light (white) panels — darker variants of the page
 * CSS hues so they stay readable on white.
 */
export const PAVLUS_COLORS: Record<string, string> = {
  kw: "#7c3aed",
  evt: "#7c3aed",
  tag: "#1d4ed8",
  fn: "#1d4ed8",
  key: "#1d4ed8",
  attr: "#b45309",
  type: "#b45309",
  str: "#15803d",
  num: "#c2410c",
  expr: "#dc2626",
  punc: "#64748b",
  com: "#64748b",
  ln: "#98a2b3",
};

/** Approximate width of one character of monospace text at `size` px. */
export const charW = (size: number): number => size * 0.6;

/** Truncate for display. */
export function fit(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)) + "…";
}

export interface BoxOpts {
  fill?: string;
  stroke?: string;
  rx?: number;
  dash?: string;
  sw?: number;
}

export class Svg {
  private parts: string[] = [];
  w: number;
  h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  raw(s: string): this {
    this.parts.push(s);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, o: BoxOpts = {}): this {
    const attrs = [
      `x="${x}"`,
      `y="${y}"`,
      `width="${Math.max(0, w)}"`,
      `height="${Math.max(0, h)}"`,
      o.rx !== undefined ? `rx="${o.rx}"` : `rx="8"`,
      o.fill ? `fill="${o.fill}"` : `fill="none"`,
      o.stroke ? `stroke="${o.stroke}"` : "",
      o.sw ? `stroke-width="${o.sw}"` : "",
      o.dash ? `stroke-dasharray="${o.dash}"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return this.raw(`<rect ${attrs}/>`);
  }

  /** Text with per-token fills (see PAVLUS_COLORS). */
  textToks(
    x: number,
    y: number,
    toks: { t: string; c?: string }[],
    o: TextOpts = {},
  ): this {
    return this.emitText(x, y, toks, o);
  }

  text(x: number, y: number, s: string, o: TextOpts = {}): this {
    return this.emitText(x, y, [{ t: s }], o);
  }

  private emitText(
    x: number,
    y: number,
    parts: { t: string; c?: string }[],
    o: TextOpts,
  ): this {
    const size = o.size ?? 12;
    const attrs = [
      `x="${x}"`,
      `y="${y}"`,
      `font-family="${o.mono ? MONO : SANS}"`,
      `font-size="${size}"`,
      `fill="${o.fill ?? C.ink}"`,
      o.anchor ? `text-anchor="${o.anchor}"` : "",
      o.bold ? `font-weight="600"` : "",
      o.italic ? `font-style="italic"` : "",
      o.opacity !== undefined ? `opacity="${o.opacity}"` : "",
      `xml:space="preserve"`,
    ]
      .filter(Boolean)
      .join(" ");
    // merge adjacent same-class tokens into one tspan
    const spans: string[] = [];
    let cur: { t: string; c?: string } | null = null;
    const flush = (): void => {
      if (!cur) return;
      spans.push(
        cur.c
          ? `<tspan fill="${PAVLUS_COLORS[cur.c] ?? C.ink}">${esc(cur.t)}</tspan>`
          : esc(cur.t),
      );
    };
    for (const p of parts) {
      if (cur && cur.c === p.c) cur.t += p.t;
      else {
        flush();
        cur = { ...p };
      }
    }
    flush();
    return this.raw(`<text ${attrs}>${spans.join("")}</text>`);
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    o: { stroke?: string; sw?: number; dash?: string } = {},
  ): this {
    const attrs = [
      `x1="${x1}"`,
      `y1="${y1}"`,
      `x2="${x2}"`,
      `y2="${y2}"`,
      `stroke="${o.stroke ?? C.border}"`,
      o.sw ? `stroke-width="${o.sw}"` : "",
      o.dash ? `stroke-dasharray="${o.dash}"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return this.raw(`<line ${attrs}/>`);
  }

  /** Straight arrow; head drawn as a filled triangle. */
  arrow(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    o: { stroke?: string; sw?: number; dash?: string; head?: boolean } = {},
  ): this {
    const stroke = o.stroke ?? C.ink;
    const sw = o.sw ?? 1.5;
    this.line(x1, y1, x2, y2, { stroke, sw, dash: o.dash });
    if (o.head !== false) {
      const a = Math.atan2(y2 - y1, x2 - x1);
      const s = 9;
      const w = 4;
      const bx = x2 - s * Math.cos(a);
      const by = y2 - s * Math.sin(a);
      const pts = [
        [x2, y2],
        [bx + w * Math.sin(a), by - w * Math.cos(a)],
        [bx - w * Math.sin(a), by + w * Math.cos(a)],
      ]
        .map((p) => p.map((n) => Math.round(n * 10) / 10).join(","))
        .join(" ");
      this.raw(`<polygon points="${pts}" fill="${stroke}"/>`);
    }
    return this;
  }

  /** Polyline through `points`, optional head on the last segment. */
  poly(
    points: [number, number][],
    o: { stroke?: string; sw?: number; dash?: string; head?: boolean } = {},
  ): this {
    const stroke = o.stroke ?? C.ink;
    const d = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`)
      .join(" ");
    this.raw(
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${o.sw ?? 1.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`,
    );
    if (o.head !== false) {
      const [ax, ay] = points[points.length - 2];
      const [bx, by] = points[points.length - 1];
      this.arrow(ax, ay, bx, by, {
        stroke,
        sw: o.sw,
        dash: o.dash,
        head: true,
      });
      // the second arrow would double-draw the last segment; harmless overlap
    }
    return this;
  }

  /**
   * A titled panel. Returns the origin of the content area.
   */
  panel(
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    o: { fill?: string; stroke?: string; sub?: string; dark?: boolean } = {},
  ): { x: number; y: number } {
    const dark = o.dark ?? false;
    this.rect(x, y, w, h, {
      fill: o.fill ?? (dark ? C.codeBg : C.panel),
      stroke: o.stroke ?? (dark ? "#1e293b" : C.border),
      rx: 10,
    });
    this.text(x + 14, y + 23, title, {
      size: 12.5,
      bold: true,
      fill: dark ? C.codeText : C.ink,
      mono: dark,
    });
    if (o.sub)
      this.text(x + w - 14, y + 23, o.sub, {
        size: 11,
        fill: dark ? C.codeDim : C.muted,
        anchor: "end",
        mono: dark,
      });
    return { x: x + 14, y: y + 40 };
  }

  /**
   * Monospace lines inside a (dark) panel. Returns the y below the last line.
   */
  code(
    x: number,
    y: number,
    lines: string[],
    o: {
      size?: number;
      lh?: number;
      fill?: string;
      maxChars?: number;
      dim?: (line: string) => boolean;
    } = {},
  ): number {
    const size = o.size ?? 11.5;
    const lh = o.lh ?? 17;
    const maxChars = o.maxChars ?? 84;
    lines.forEach((ln, i) => {
      const t = fit(ln, maxChars);
      const fill = o.dim?.(ln) ? C.codeDim : C.codeText;
      this.text(x, y + i * lh, t === "" ? " " : t, { size, mono: true, fill });
    });
    return y + lines.length * lh;
  }

  caption(
    x: number,
    y: number,
    s: string,
    anchor: "start" | "middle" | "end" = "start",
  ): this {
    return this.text(x, y, s, {
      size: 11.5,
      fill: C.muted,
      italic: true,
      anchor,
    });
  }

  toString(): string {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}" font-family="${SANS}">`,
      `<rect x="0" y="0" width="${this.w}" height="${this.h}" fill="${C.canvas}"/>`,
      ...this.parts,
      `</svg>`,
    ].join("\n");
  }
}

/* ------------------------------------------------------------------ */
/* Trees (used for the AST panel)                                      */

export interface TreeNode {
  /** First line (mono, bold). */
  title: string;
  /** Second line (dim), e.g. `nid 3`. */
  sub?: string;
  /** Third line (accent), e.g. `reads: user, busy`. */
  dep?: string;
  children?: TreeNode[];
  /** Branch wrappers etc.: dashed border, no fill. */
  virtual?: boolean;
}

/** One step of a sequence diagram (see diagrams.sequenceSvg). */
export interface SeqStep {
  from?: string;
  to?: string;
  self?: string;
  label: string;
  kind?: "msg" | "effect" | "state" | "dom" | "net" | "note" | "return";
}

export interface LaidNode {
  n: TreeNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaidTree {
  nodes: LaidNode[];
  edges: { px: number; py: number; cx: number; cy: number }[];
  w: number;
  h: number;
}

const nodeH = (n: TreeNode): number =>
  24 + (n.sub ? 13 : 0) + (n.dep ? 13 : 0) + 6;

/**
 * Tidy tree layout: parents centered over children, leaves left-to-right.
 */
export function layoutTree(root: TreeNode, gapX = 18, gapY = 40): LaidTree {
  const nodes: LaidNode[] = [];
  const edges: LaidTree["edges"] = [];

  const size = (n: TreeNode): { w: number; h: number } => {
    const chars = Math.max(
      n.title.length,
      n.sub?.length ?? 0,
      n.dep?.length ?? 0,
    );
    return { w: Math.max(76, chars * charW(11) + 22), h: nodeH(n) };
  };

  interface Placed {
    /** Center of this subtree's root, in the parent's coordinate space. */
    cx: number;
    /** Width of the whole subtree block. */
    w: number;
    /** Every node and edge of this subtree, root included. */
    members: LaidNode[];
    memberEdges: LaidTree["edges"];
    /** Shift the whole subtree by dx. */
    shift: (dx: number) => void;
  }

  const place = (n: TreeNode, depth: number): Placed => {
    const { w, h } = size(n);
    const y = depth * (gapY + 64);
    if (!n.children?.length) {
      const node: LaidNode = { n, x: 0, y, w, h };
      nodes.push(node);
      const members = [node];
      return {
        cx: w / 2,
        w,
        members,
        memberEdges: [],
        shift: (dx) => {
          for (const m of members) m.x += dx;
        },
      };
    }
    const kids = n.children.map((c) => place(c, depth + 1));
    const childY = y + gapY + 64;
    const centers: number[] = [];
    let cursor = 0;
    for (const k of kids) {
      k.shift(cursor);
      centers.push(cursor + k.cx);
      cursor += k.w + gapX;
    }
    const blockW = cursor - gapX;
    const parentX = blockW / 2 - w / 2;
    const node: LaidNode = { n, x: parentX, y, w, h };
    nodes.push(node);
    const before = edges.length;
    for (const cx of centers) {
      edges.push({ px: parentX + w / 2, py: y + h, cx, cy: childY });
    }
    const members = [node, ...kids.flatMap((k) => k.members)];
    const memberEdges = [
      ...kids.flatMap((k) => k.memberEdges),
      ...edges.slice(before),
    ];
    return {
      cx: parentX + w / 2,
      w: Math.max(w, blockW),
      members,
      memberEdges,
      shift: (dx) => {
        for (const m of members) m.x += dx;
        for (const e of memberEdges) {
          e.px += dx;
          e.cx += dx;
        }
      },
    };
  };

  place(root, 0);

  // normalize x to >= 0 and compute total size
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  for (const n of nodes) n.x -= minX;
  for (const e of edges) {
    e.px -= minX;
    e.cx -= minX;
  }
  return { nodes, edges, w: maxX - minX, h: maxY };
}

function drawTreeNode(svg: Svg, nd: LaidNode, ox: number, oy: number): void {
  const x = ox + nd.x;
  const y = oy + nd.y;
  svg.rect(x, y, nd.w, nd.h, {
    fill: nd.n.virtual ? "none" : C.panel,
    stroke: nd.n.virtual ? C.faint : C.border,
    dash: nd.n.virtual ? "4 3" : undefined,
    rx: 6,
  });
  let ty = y + 17;
  svg.text(x + nd.w / 2, ty, fit(nd.n.title, 30), {
    size: 11,
    bold: true,
    mono: true,
    anchor: "middle",
    fill: C.ink,
  });
  ty += 13;
  if (nd.n.sub) {
    svg.text(x + nd.w / 2, ty, fit(nd.n.sub, 30), {
      size: 10,
      mono: true,
      anchor: "middle",
      fill: C.codeNum,
    });
    ty += 13;
  }
  if (nd.n.dep) {
    svg.text(x + nd.w / 2, ty, fit(nd.n.dep, 30), {
      size: 10,
      mono: true,
      anchor: "middle",
      fill: C.state,
    });
  }
}

/** Draw a laid tree at (ox, oy). */
export function drawTree(svg: Svg, t: LaidTree, ox: number, oy: number): void {
  for (const e of t.edges) {
    const px = ox + e.px;
    const py = oy + e.py;
    const cx = ox + e.cx;
    const cy = oy + e.cy;
    const mid = (py + cy) / 2;
    svg.raw(
      `<path d="M ${px} ${py} C ${px} ${mid}, ${cx} ${mid}, ${cx} ${cy}" fill="none" stroke="${C.faint}" stroke-width="1.2"/>`,
    );
  }
  for (const nd of t.nodes) drawTreeNode(svg, nd, ox, oy);
}

/**
 * Left-to-right tidy layout for shallow trees: x by depth, children stacked
 * vertically, parent centered on its children. Same output shape as
 * `layoutTree`, but wide instead of tall — draw with `drawTreeH`.
 */
export function layoutTreeH(root: TreeNode, gapY = 12): LaidTree {
  const nodes: LaidNode[] = [];
  const edges: LaidTree["edges"] = [];

  const size = (n: TreeNode): { w: number; h: number } => {
    const chars = Math.max(
      n.title.length,
      n.sub?.length ?? 0,
      n.dep?.length ?? 0,
    );
    return { w: Math.max(76, chars * charW(11) + 22), h: nodeH(n) };
  };

  // the step between depths must clear the widest box
  let maxW = 0;
  const measure = (n: TreeNode): void => {
    maxW = Math.max(maxW, size(n).w);
    n.children?.forEach(measure);
  };
  measure(root);
  const step = maxW + 18;

  interface Placed {
    /** Center y of this subtree's root, relative to the block top. */
    cy: number;
    /** Height of the whole subtree block. */
    h: number;
    members: LaidNode[];
    memberEdges: LaidTree["edges"];
    shift: (dy: number) => void;
  }

  const place = (n: TreeNode, depth: number): Placed => {
    const { w, h } = size(n);
    const node: LaidNode = { n, x: depth * step, y: 0, w, h };
    if (!n.children?.length) {
      nodes.push(node);
      const members = [node];
      return {
        cy: h / 2,
        h,
        members,
        memberEdges: [],
        shift: (dy) => {
          for (const m of members) m.y += dy;
        },
      };
    }
    const kids = n.children.map((c) => place(c, depth + 1));
    let cursor = 0;
    const centers: number[] = [];
    for (const k of kids) {
      k.shift(cursor);
      centers.push(cursor + k.cy);
      cursor += k.h + gapY;
    }
    const blockH = Math.max(cursor - gapY, h);
    node.y = blockH / 2 - h / 2;
    nodes.push(node);
    const before = edges.length;
    for (const cy of centers) {
      edges.push({
        px: node.x + w,
        py: node.y + h / 2,
        cx: node.x + step,
        cy,
      });
    }
    const members = [node, ...kids.flatMap((k) => k.members)];
    const memberEdges = [
      ...kids.flatMap((k) => k.memberEdges),
      ...edges.slice(before),
    ];
    return {
      cy: blockH / 2,
      h: blockH,
      members,
      memberEdges,
      shift: (dy) => {
        for (const m of members) m.y += dy;
        for (const e of memberEdges) {
          e.py += dy;
          e.cy += dy;
        }
      },
    };
  };

  place(root, 0);

  // normalize y to >= 0 and compute total size
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + n.w));
  const maxY = Math.max(...nodes.map((n) => n.y + n.h));
  for (const n of nodes) n.y -= minY;
  for (const e of edges) {
    e.py -= minY;
    e.cy -= minY;
  }
  return { nodes, edges, w: maxX, h: maxY - minY };
}

/** Draw a laid tree left-to-right at (ox, oy) (see layoutTreeH). */
export function drawTreeH(svg: Svg, t: LaidTree, ox: number, oy: number): void {
  for (const e of t.edges) {
    const px = ox + e.px;
    const py = oy + e.py;
    const cx = ox + e.cx;
    const cy = oy + e.cy;
    const mid = (px + cx) / 2;
    svg.raw(
      `<path d="M ${px} ${py} C ${mid} ${py}, ${mid} ${cy}, ${cx} ${cy}" fill="none" stroke="${C.faint}" stroke-width="1.2"/>`,
    );
  }
  for (const nd of t.nodes) drawTreeNode(svg, nd, ox, oy);
}
