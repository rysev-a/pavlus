/** Pure, DOM-free part of the svg plugin: node types, whitelist validation, serialization. */

export const SVG_NS = "http://www.w3.org/2000/svg";
export const XLINK_NS = "http://www.w3.org/1999/xlink";
export const XML_NS = "http://www.w3.org/XML/1998/namespace";

export type SvgAttrValue = string | number | boolean | null | undefined;

/** Message sent when an event fires on the node. */
export interface SvgHandler {
  id: string;
  payload?: unknown;
  prevent?: boolean;
  stop?: boolean;
}

/** An SVG element as plain data. `text` is rendered before `children`. */
export interface SvgNode {
  tag: string;
  attrs?: Record<string, SvgAttrValue>;
  children?: SvgNode[];
  text?: string | number;
  /** Event handlers by DOM event name (see {@link SVG_EVENTS}). */
  on?: Record<string, SvgHandler>;
  /** Identity among siblings, so reordering moves elements instead of rewriting them. */
  key?: string | number;
}

/** A validated, normalized node: attribute values are strings, nothing is optional. */
export interface CleanNode {
  tag: string;
  attrs: Record<string, string>;
  text: string;
  on: Record<string, SvgHandler>;
  key: string | undefined;
  children: CleanNode[];
}

export const SVG_TAGS: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "a",
  "title",
  "desc",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
  "text",
  "tspan",
  "textPath",
  "image",
  "linearGradient",
  "radialGradient",
  "stop",
  "pattern",
  "clipPath",
  "mask",
  "marker",
  "filter",
  "feBlend",
  "feColorMatrix",
  "feComposite",
  "feDropShadow",
  "feFlood",
  "feGaussianBlur",
  "feMerge",
  "feMergeNode",
  "feOffset",
]);

export const SVG_EVENTS: ReadonlySet<string> = new Set([
  "click",
  "dblclick",
  "contextmenu",
  "mousedown",
  "mouseup",
  "mousemove",
  "mouseenter",
  "mouseleave",
  "mouseover",
  "mouseout",
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointerenter",
  "pointerleave",
  "pointerover",
  "pointerout",
  "pointercancel",
  "wheel",
  "keydown",
  "keyup",
  "focus",
  "blur",
]);

/** Plain attribute names allowed on any element (never `on*`, never `script`). */
const ATTRS: ReadonlySet<string> = new Set(
  `id class style tabindex role lang transform x y width height cx cy r rx ry x1 y1 x2 y2
   points d pathLength viewBox preserveAspectRatio dx dy rotate textLength lengthAdjust
   fill stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray
   stroke-dashoffset stroke-opacity fill-opacity fill-rule clip-rule opacity color display
   visibility overflow cursor pointer-events vector-effect shape-rendering paint-order
   font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline
   baseline-shift letter-spacing word-spacing text-decoration writing-mode
   href xlink:href target xml:space clip-path mask filter marker-start marker-mid marker-end
   gradientUnits gradientTransform spreadMethod fx fy fr offset stop-color stop-opacity
   patternUnits patternContentUnits patternTransform clipPathUnits maskUnits maskContentUnits
   markerWidth markerHeight markerUnits refX refY orient startOffset side
   stdDeviation in in2 result mode type values operator k1 k2 k3 k4 flood-color flood-opacity
   edgeMode xmlns xmlns:xlink version focusable`
    .split(/\s+/)
    .filter(Boolean),
);

const NAME_RE = /^[A-Za-z_][-A-Za-z0-9_.]*(:[A-Za-z][-A-Za-z0-9_.]*)?$/;

export class SvgTreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgTreeError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Characters browsers strip from URLs before the scheme is read. */
const normUrl = (v: string): string =>
  // eslint-disable-next-line no-control-regex
  v.replace(/[\u0000- \u007f-\u009f]+/g, "").toLowerCase();

function checkHref(tag: string, name: string, value: string, path: string) {
  const u = normUrl(value);
  if (tag === "use") {
    if (!u.startsWith("#"))
      throw new SvgTreeError(`${path}: <use> ${name} must be a #fragment`);
    return;
  }
  if (u.startsWith("#") || u.startsWith("/") || u.startsWith("./")) return;
  if (/^https?:/.test(u) || /^data:image\/(png|jpe?g|gif|webp|avif)[;,]/.test(u))
    return;
  // relative reference with no scheme at all
  if (!/^[a-z][a-z0-9+.-]*:/.test(u)) return;
  throw new SvgTreeError(`${path}: unsafe ${name} "${value.slice(0, 40)}"`);
}

function checkValue(name: string, value: string, path: string) {
  const u = normUrl(value);
  if (name === "style") {
    if (
      /javascript:|expression\(|@import|behavior:|-moz-binding/.test(u) ||
      /url\((?!['"]?#)/.test(u) ||
      value.includes("\\")
    )
      throw new SvgTreeError(`${path}: unsafe style value`);
    return;
  }
  // url(...) references in presentation attributes may only point at fragments
  if (/url\((?!['"]?#)/.test(u))
    throw new SvgTreeError(`${path}: ${name} may only reference #fragments`);
  if (/javascript:|^data:text/.test(u))
    throw new SvgTreeError(`${path}: unsafe value for ${name}`);
}

/** Normalizes one attribute map; throws {@link SvgTreeError} on anything not whitelisted. */
function cleanAttrs(
  tag: string,
  attrs: Record<string, SvgAttrValue>,
  path: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, raw] of Object.entries(attrs)) {
    if (raw === null || raw === undefined || raw === false) continue;
    if (!NAME_RE.test(name) || /^on/i.test(name))
      throw new SvgTreeError(`${path}: attribute "${name}" is not allowed`);
    if (
      !ATTRS.has(name) &&
      !name.startsWith("data-") &&
      !name.startsWith("aria-")
    )
      throw new SvgTreeError(`${path}: attribute "${name}" is not allowed`);
    let value: string;
    if (raw === true) value = "true";
    else if (typeof raw === "number") {
      if (!Number.isFinite(raw))
        throw new SvgTreeError(`${path}: attribute "${name}" must be finite`);
      value = String(raw);
    } else if (typeof raw === "string") value = raw;
    else throw new SvgTreeError(`${path}: attribute "${name}" has a bad value`);
    if (name === "href" || name === "xlink:href") checkHref(tag, name, value, path);
    else if (name === "xmlns") {
      if (value !== SVG_NS) throw new SvgTreeError(`${path}: bad xmlns`);
    } else if (name === "xmlns:xlink") {
      if (value !== XLINK_NS) throw new SvgTreeError(`${path}: bad xmlns:xlink`);
    } else checkValue(name, value, path);
    out[name] = value;
  }
  return out;
}

const MAX_DEPTH = 200;

/**
 * Validates a tree against the whitelist and returns a normalized copy. The
 * input is never mutated or trusted afterwards: only the returned copy is rendered.
 */
export function cleanTree(node: unknown, path = "tree", depth = 0): CleanNode {
  if (depth > MAX_DEPTH) throw new SvgTreeError(`${path}: tree too deep`);
  if (!isObj(node)) throw new SvgTreeError(`${path}: node must be an object`);
  const tag = node.tag;
  if (typeof tag !== "string" || !SVG_TAGS.has(tag))
    throw new SvgTreeError(`${path}: tag "${String(tag)}" is not allowed`);
  const here = `${path}<${tag}>`;

  if (node.attrs !== undefined && !isObj(node.attrs))
    throw new SvgTreeError(`${here}: attrs must be an object`);
  const attrs = cleanAttrs(
    tag,
    (node.attrs ?? {}) as Record<string, SvgAttrValue>,
    here,
  );

  let text = "";
  if (node.text !== undefined) {
    if (typeof node.text === "string") text = node.text;
    else if (typeof node.text === "number" && Number.isFinite(node.text))
      text = String(node.text);
    else throw new SvgTreeError(`${here}: text must be a string or number`);
  }

  const on: Record<string, SvgHandler> = {};
  if (node.on !== undefined) {
    if (!isObj(node.on)) throw new SvgTreeError(`${here}: on must be an object`);
    for (const [ev, h] of Object.entries(node.on)) {
      if (!SVG_EVENTS.has(ev))
        throw new SvgTreeError(`${here}: event "${ev}" is not allowed`);
      if (!isObj(h) || typeof h.id !== "string")
        throw new SvgTreeError(`${here}: handler for "${ev}" needs a string id`);
      const clean: SvgHandler = { id: h.id };
      if (h.payload !== undefined) clean.payload = h.payload;
      if (h.prevent) clean.prevent = true;
      if (h.stop) clean.stop = true;
      on[ev] = clean;
    }
  }

  let key: string | undefined;
  if (node.key !== undefined) {
    if (typeof node.key !== "string" && typeof node.key !== "number")
      throw new SvgTreeError(`${here}: key must be a string or number`);
    key = String(node.key);
  }

  const children: CleanNode[] = [];
  if (node.children !== undefined) {
    if (!Array.isArray(node.children))
      throw new SvgTreeError(`${here}: children must be an array`);
    const seen = new Set<string>();
    node.children.forEach((c, i) => {
      const cn = cleanTree(c, `${here}[${i}]`, depth + 1);
      if (cn.key !== undefined) {
        if (seen.has(cn.key))
          throw new SvgTreeError(`${here}[${i}]: duplicate key "${cn.key}"`);
        seen.add(cn.key);
      }
      children.push(cn);
    });
  }
  return { tag, attrs, text, on, key, children };
}

const escText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string): string =>
  escText(s).replace(/"/g, "&quot;").replace(/\n/g, "&#10;").replace(/\t/g, "&#9;");

function usesXlink(n: CleanNode): boolean {
  return "xlink:href" in n.attrs || n.children.some(usesXlink);
}

/**
 * Serializes a tree to SVG markup. Pure: needs no DOM. Throws
 * {@link SvgTreeError} when the tree is not allowed. Event handlers and keys are not serialized.
 */
export function serializeSvg(tree: unknown): string {
  const root = cleanTree(tree);
  const needXlink = usesXlink(root);
  const out = (n: CleanNode, isRoot: boolean): string => {
    const attrs = { ...n.attrs };
    if (isRoot && n.tag === "svg") {
      attrs.xmlns ??= SVG_NS;
      if (needXlink) attrs["xmlns:xlink"] ??= XLINK_NS;
    }
    const a = Object.entries(attrs)
      .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
      .join("");
    const inner = escText(n.text) + n.children.map((c) => out(c, false)).join("");
    return inner ? `<${n.tag}${a}>${inner}</${n.tag}>` : `<${n.tag}${a}/>`;
  };
  return out(root, true);
}
