import type { SvgAttrValue, SvgHandler, SvgNode } from "./tree.ts";

/** Attributes plus the two non-attribute node fields, for convenient building. */
export type SvgProps = Record<
  string,
  SvgAttrValue | SvgNode["on"] | string | number
> & {
  key?: string | number;
  on?: Record<string, SvgHandler>;
};

export type SvgChild =
  SvgNode | string | number | null | undefined | false | SvgChild[];

/**
 * Builds a node. `key` and `on` in `attrs` become node fields; strings and
 * numbers among the children are joined into the node's `text`; nulls and
 * `false` are skipped and nested arrays flattened, so `cond && child` and
 * `items.map(...)` work.
 *
 * ```ts
 * svg("g", { transform: "translate(10 10)" }, circle({ r: 5, key: 1 }))
 * ```
 */
export function svg(
  tag: string,
  attrs?: SvgProps | null,
  ...children: SvgChild[]
): SvgNode {
  const node: SvgNode = { tag };
  if (attrs) {
    const { key, on, ...rest } = attrs;
    if (Object.keys(rest).length) node.attrs = rest as SvgNode["attrs"];
    if (key !== undefined) node.key = key;
    if (on) node.on = on;
  }
  const kids: SvgNode[] = [];
  let text = "";
  const walk = (c: SvgChild): void => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(walk);
    else if (typeof c === "object") kids.push(c);
    else text += String(c);
  };
  children.forEach(walk);
  if (text) node.text = text;
  if (kids.length) node.children = kids;
  return node;
}

type Shortcut = (attrs?: SvgProps | null, ...children: SvgChild[]) => SvgNode;
const tagged =
  (tag: string): Shortcut =>
  (attrs, ...children) =>
    svg(tag, attrs, ...children);

/** The `<svg>` root element. */
export const root = tagged("svg");
export const g = tagged("g");
export const defs = tagged("defs");
export const rect = tagged("rect");
export const circle = tagged("circle");
export const ellipse = tagged("ellipse");
export const line = tagged("line");
export const polyline = tagged("polyline");
export const polygon = tagged("polygon");
export const path = tagged("path");
export const text = tagged("text");
export const tspan = tagged("tspan");
export const use = tagged("use");
export const title = tagged("title");
