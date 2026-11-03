/** Message descriptor attached to a DOM event in the template. */
export interface EventMsg {
  id: string;
  payload?: unknown;
  prevent?: boolean;
  stop?: boolean;
}

export interface ElementVNode {
  t: "el";
  /** Present only when the element is later patched. */
  id?: string;
  tag: string;
  attrs: Record<string, string>;
  events: Record<string, EventMsg>;
  children: VNode[];
}

export interface TextVNode {
  t: "text";
  id?: string;
  text: string;
}

/** Empty comment node that delimits an `if` / `for` block. */
export interface MarkerVNode {
  t: "marker";
  id: string;
}

export type VNode = ElementVNode | TextVNode | MarkerVNode;

/**
 * DOM changes produced by `diff`. Patches are plain data: the DOM plugin is
 * the only code that applies them.
 */
export type Patch =
  | { op: "text"; id: string; text: string }
  | { op: "attr"; id: string; name: string; value: string }
  | { op: "rmAttr"; id: string; name: string }
  | { op: "handler"; id: string; event: string; msg: EventMsg }
  /** Insert `nodes` before the existing node `before`. */
  | { op: "insert"; before: string; nodes: VNode[] }
  /** Remove everything strictly between markers `from` and `to`. */
  | { op: "clear"; from: string; to: string }
  /** Remove the sibling range `from`..`to`, both included. */
  | { op: "remove"; from: string; to: string }
  /** Move the sibling range `from`..`to` before node `before`. */
  | { op: "move"; from: string; to: string; before: string };

/**
 * A compiled template. Both functions are pure.
 *
 * `sfx` (node id suffix) and `ns` (message id prefix) are passed by a parent
 * view that embeds this one; a top-level view uses the defaults. `env` is the
 * component that owns the view, which `+outlet` needs for its `routing`.
 */
export interface View<S = any> {
  render(state: S, sfx?: string, ns?: string, env?: unknown): VNode[];
  diff(prev: S, next: S, sfx?: string, ns?: string, env?: unknown): Patch[];
  /** Instance names of the children this template embeds. */
  meta?: { embeds: string[]; outlet?: boolean };
}

/** The comments the DOM plugin (and `renderToString`) put around a render. */
export const RENDER_START = "pavlus";
export const RENDER_END = "/pavlus";

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Serializes vnodes to HTML. Block markers are dropped unless asked for. */
export function toHtml(
  nodes: VNode[],
  opts: { markers?: boolean } = {},
): string {
  let out = "";
  for (const n of nodes) {
    if (n.t === "text") out += esc(n.text);
    else if (n.t === "marker") {
      if (opts.markers) out += `<!--${n.id}-->`;
    } else {
      out += `<${n.tag}`;
      for (const [k, v] of Object.entries(n.attrs)) {
        out += ` ${k}="${esc(v).replace(/"/g, "&quot;")}"`;
      }
      out += ">";
      if (!VOID.has(n.tag)) {
        out += toHtml(n.children, opts) + `</${n.tag}>`;
      }
    }
  }
  return out;
}
