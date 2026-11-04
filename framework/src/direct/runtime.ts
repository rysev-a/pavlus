/**
 * Runtime of the `direct` pipeline: the helpers compiled direct templates
 * import. A direct template is ONE function that builds DOM from a cloned
 * static skeleton and returns a {@link Block} whose `u(state)` touches the DOM
 * only where a bound value changed. There are no vnodes, node ids or patches.
 *
 * Application code does not need these; the compiler imports what it uses.
 *
 * @module
 */
import type { Message } from "../core/types.ts";
import {
  asRoute,
  matchRoute,
  routeComponent,
  routedState,
} from "../routing/mod.ts";

export { childEnv } from "../routing/mod.ts";
export { joinClasses, toAttr, toText } from "../runtime/helpers.ts";

/* ------------------------------------------------------------------ types */

/** What the host (the plugin) provides to every block of a mount. */
export interface Rt {
  doc: Document;
  /** Feeds a message to the application. */
  send(message: Message): void;
  /** Reports an error of one binding; the rest of the update goes on. */
  err(error: unknown): void;
  /** Event listeners currently attached (for leak checks). */
  l: number;
}

/** What one view instance knows about where it lives. */
export interface Env {
  rt: Rt;
  /** Message id prefix (`"list.row."`). */
  ns: string;
  /** The component that owns the view; `+outlet` reads its `routing`. */
  o: unknown;
}

/** One instance of a template (or of a branch / a loop item of it). */
export interface Block<S = any> {
  /** The only top-level node, or `null` when there are several or a region. */
  e: Node | null;
  /** To insert the block: the node itself or a fragment holding its nodes. */
  f: Node;
  /** Shows `state` (and the loop variables of the scope): writes what changed. */
  u(state: S, ...scope: unknown[]): void;
  /** Pushes the current top-level DOM nodes, in order (when `e` is null). */
  n?(out: Node[]): void;
  /** Removes listeners and destroys children. Does not touch the DOM nodes. */
  d(): void;
}

/** A compiled direct template. */
export interface DirectView<S = any> {
  create(env: Env, state: S): Block<S>;
  /** Instance names of the children this template embeds. */
  meta?: { embeds: string[]; outlet?: boolean };
}

/** Misconfiguration (not a data problem): thrown through, not reported. */
export class FatalError extends Error {}

/* ---------------------------------------------------------------- basics */

/** "Never seen": the initial value of every change-detection variable. */
export const UNSET: unique symbol = Symbol("pavlus.unset");

export const noop = (): void => {};

/** Reports a binding error, or rethrows a {@link FatalError}. */
export function fail(env: Env, e: unknown): void {
  if (e instanceof FatalError) throw e;
  env.rt.err(e);
}

type Spec = string | 0 | [string, string[], ...Spec[]];

function build(doc: Document, spec: Spec): Node {
  if (typeof spec === "string") return doc.createTextNode(spec);
  if (spec === 0) return doc.createComment("");
  const el = doc.createElement(spec[0]);
  const attrs = spec[1];
  for (let i = 0; i < attrs.length; i += 2)
    el.setAttribute(attrs[i], attrs[i + 1]);
  for (let i = 2; i < spec.length; i++)
    el.appendChild(build(doc, spec[i] as Spec));
  return el;
}

/**
 * The static skeleton of a block, built once per document with DOM calls
 * (never parsed from HTML, so the HTML parser's restructuring and escaping
 * rules cannot change the shape the compiled paths rely on). `single`: one
 * root node, cloned on its own; otherwise a fragment.
 */
export function skel(roots: Spec[], single: boolean): (doc: Document) => Node {
  let doc: Document | undefined;
  let node: Node;
  return (d) => {
    if (d !== doc) {
      doc = d;
      if (single) node = build(d, roots[0]);
      else {
        node = d.createDocumentFragment();
        for (const r of roots) node.appendChild(build(d, r));
      }
    }
    return node;
  };
}

/** A list value as an array; anything that is not list-like is empty. */
export function toList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v == null || typeof v !== "object") return [];
  if (typeof (v as Iterable<unknown>)[Symbol.iterator] === "function") {
    return Array.from(v as Iterable<unknown>);
  }
  return typeof (v as { length?: unknown }).length === "number"
    ? Array.from(v as ArrayLike<unknown>)
    : [];
}

/* ----------------------------------------------------- attributes / forms */

/** Sets an attribute, or removes it for `null`. */
export function setAttr(el: Element, name: string, v: string | null): void {
  if (v === null) el.removeAttribute(name);
  else el.setAttribute(name, v);
}

/** The attribute seeds the default; the property is the live value. */
export function setValue(el: Element, v: string | null): void {
  setAttr(el, "value", v);
  const target = el as HTMLInputElement;
  const live = v ?? "";
  if ("value" in target && target.value !== live) target.value = live;
}

export function setChecked(el: Element, v: string | null): void {
  setAttr(el, "checked", v);
  if ("checked" in el) (el as HTMLInputElement).checked = v !== null;
}

export function setSelected(el: Element, v: string | null): void {
  setAttr(el, "selected", v);
  if ("selected" in el) (el as HTMLOptionElement).selected = v !== null;
}

const UNSAFE_URL = /^(?:javascript|vbscript|data\s*:\s*text\/html)/i;

/**
 * A URL attribute value (`href`, `src`, `action`...) from data: script URLs
 * are replaced by `about:blank`. Whitespace and control characters, which
 * browsers ignore inside the scheme, are stripped before checking.
 */
export function safeUrl(v: string | null): string | null {
  if (v === null) return null;
  // eslint-disable-next-line no-control-regex
  const probe = v.replace(/[\u0000- \u007f-\u009f]+/g, "");
  return UNSAFE_URL.test(probe) ? "about:blank" : v;
}

/* ---------------------------------------------------------------- events */

/** Serializable summary of a DOM event (the same the vdom dom plugin sends). */
export function snapshot(ev: Event): Message["event"] {
  const t = ev.target as HTMLInputElement | null;
  const info: NonNullable<Message["event"]> = { type: ev.type };
  if (t && "value" in t && typeof t.value === "string") info.value = t.value;
  if (t && "checked" in t && typeof t.checked === "boolean")
    info.checked = t.checked;
  if ("key" in ev) info.key = (ev as KeyboardEvent).key;
  return info;
}

/** Adds a listener and records it in `ls` (the block's list) for removal. */
export function on(
  rt: Rt,
  ls: unknown[],
  el: Element,
  type: string,
  fn: (ev: Event) => void,
): void {
  el.addEventListener(type, fn);
  ls.push(el, type, fn);
  rt.l++;
}

/** Removes every listener `on` added to `ls`. */
export function off(rt: Rt, ls: unknown[]): void {
  for (let i = 0; i < ls.length; i += 3) {
    (ls[i] as Element).removeEventListener(
      ls[i + 1] as string,
      ls[i + 2] as EventListener,
    );
    rt.l--;
  }
  ls.length = 0;
}

/** Sends the message of an event. */
export function send(env: Env, id: string, payload: unknown, ev: Event): void {
  env.rt.send({ id: env.ns + id, payload, event: snapshot(ev) });
}

/* ---------------------------------------------------------------- blocks */

/** Inserts a freshly created block before `ref`. */
export function attach(b: Block, parent: Node, ref: Node | null): void {
  parent.insertBefore(b.f, ref);
}

/** Pushes the current top-level nodes of a block. */
export function pushNodes(b: Block, out: Node[]): void {
  if (b.e) out.push(b.e);
  else b.n!(out);
}

function nodesOf(b: Block): Node[] {
  if (b.e) return [b.e];
  const out: Node[] = [];
  b.n!(out);
  return out;
}

function firstNode(b: Block): Node | undefined {
  return b.e ?? nodesOf(b)[0];
}

function moveBefore(b: Block, parent: Node, ref: Node | null): void {
  if (b.e) parent.insertBefore(b.e, ref);
  else for (const n of nodesOf(b)) parent.insertBefore(n, ref);
}

/** Removes a block's nodes from the DOM and destroys it. */
export function drop(b: Block): void {
  if (b.e) b.e.parentNode?.removeChild(b.e);
  else for (const n of nodesOf(b)) n.parentNode?.removeChild(n);
  b.d();
}

/* ------------------------------------------------------------- the lists */

/** Longest increasing subsequence of `src` (ignoring -1): which positions stay. */
function stayOf(src: Int32Array): Uint8Array {
  const n = src.length;
  const stay = new Uint8Array(n);
  const prev = new Int32Array(n);
  const tails: number[] = [];
  for (let p = 0; p < n; p++) {
    const v = src[p];
    if (v < 0) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (src[tails[mid]] < v) lo = mid + 1;
      else hi = mid;
    }
    prev[p] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = p;
  }
  let p = tails.length ? tails[tails.length - 1] : -1;
  while (p >= 0) {
    stay[p] = 1;
    p = prev[p];
  }
  return stay;
}

/**
 * The items of a `for`: blocks placed before the comment `a`. Keyed lists
 * reconcile in place: common prefix and suffix are only updated, a pure
 * append or tail removal is one pass, anything else matches the middle by key
 * and moves the items outside a longest increasing subsequence. Unkeyed lists
 * match by index. Keys compare with `===` (a number and its string are two
 * keys). A list with duplicate keys is reported and left as it was.
 */
class List {
  /** Anchor comment; the items sit right before it. */
  a: Node;
  rt: Rt;
  keys: unknown[] = [];
  bs: Block[] = [];

  constructor(rt: Rt, a: Node) {
    this.rt = rt;
    this.a = a;
  }

  /** Nodes of all items, in order. */
  n(out: Node[]): void {
    for (const b of this.bs) {
      if (b.e) out.push(b.e);
      else b.n!(out);
    }
  }

  d(): void {
    for (const b of this.bs) b.d();
    this.bs = [];
    this.keys = [];
  }

  /** Creates blocks `from..to` of `xs` and inserts them before `ref`. */
  private add(
    xs: unknown[],
    from: number,
    to: number,
    mk: (x: any, i: number) => Block,
    out: Block[],
    parent: Node,
    ref: Node | null,
  ): void {
    if (to - from === 1) {
      const b = mk(xs[from], from);
      parent.insertBefore(b.f, ref);
      out.push(b);
      return;
    }
    const frag = this.rt.doc.createDocumentFragment();
    for (let i = from; i < to; i++) {
      const b = mk(xs[i], i);
      frag.appendChild(b.f);
      out.push(b);
    }
    parent.insertBefore(frag, ref);
  }

  /** Shows `xs`. `key` null: by index. */
  r(
    xs: unknown[],
    key: ((x: any, i: number) => unknown) | null,
    mk: (x: any, i: number) => Block,
    up: (b: Block, x: any, i: number) => void,
  ): void {
    const bs = this.bs;
    const m = bs.length;
    const n = xs.length;
    const parent = this.a.parentNode as Node;

    if (key === null) {
      const c = m < n ? m : n;
      for (let i = 0; i < c; i++) up(bs[i], xs[i], i);
      if (n > m) this.add(xs, m, n, mk, bs, parent, this.a);
      else if (n < m) {
        for (let i = n; i < m; i++) drop(bs[i]);
        bs.length = n;
      }
      return;
    }

    const keys = this.keys;
    const nk = new Array<unknown>(n);
    for (let i = 0; i < n; i++) nk[i] = key(xs[i], i);

    let a = 0;
    let oe = m - 1;
    let ne = n - 1;
    while (a <= oe && a <= ne && keys[a] === nk[a]) {
      up(bs[a], xs[a], a);
      a++;
    }
    if (a > oe && a > ne) return; // same keys in the same order
    // From here the keys change: they must be unique before anything moves.
    if (new Set(nk).size !== n) {
      this.rt.err(
        new Error("pavlus: duplicate key in a `for`; list not updated"),
      );
      return;
    }
    while (oe >= a && ne >= a && keys[oe] === nk[ne]) {
      up(bs[oe], xs[ne], ne);
      oe--;
      ne--;
    }

    // The first node after the unchanged suffix (or the anchor).
    let ref: Node | null = this.a;
    for (let i = oe + 1; i < m; i++) {
      const f = firstNode(bs[i]);
      if (f) {
        ref = f;
        break;
      }
    }

    if (a > oe) {
      // only insertions
      if (oe + 1 === m) {
        this.add(xs, a, ne + 1, mk, bs, parent, ref); // append: bs grows in place
      } else {
        const made: Block[] = [];
        this.add(xs, a, ne + 1, mk, made, parent, ref);
        this.bs = bs.slice(0, a).concat(made, bs.slice(oe + 1));
      }
    } else if (a > ne) {
      // only removals
      for (let i = a; i <= oe; i++) drop(bs[i]);
      if (oe + 1 === m) bs.length = a;
      else this.bs = bs.slice(0, a).concat(bs.slice(oe + 1));
    } else {
      const at = new Map<unknown, number>();
      for (let j = a; j <= ne; j++) at.set(nk[j], j);
      const src = new Int32Array(ne - a + 1).fill(-1);
      for (let i = a; i <= oe; i++) {
        const j = at.get(keys[i]);
        if (j === undefined) drop(bs[i]);
        else src[j - a] = i;
      }
      let sorted = true;
      for (let p = 0, last = -1; p < src.length; p++) {
        if (src[p] < 0) continue;
        if (src[p] < last) {
          sorted = false;
          break;
        }
        last = src[p];
      }
      const stay = sorted ? null : stayOf(src);
      const nb = new Array<Block>(n);
      for (let i = 0; i < a; i++) nb[i] = bs[i];
      for (let i = oe + 1, j = ne + 1; i < m; i++, j++) nb[j] = bs[i];
      for (let j = ne; j >= a; j--) {
        const from = src[j - a];
        let b: Block;
        if (from < 0) {
          b = mk(xs[j], j);
          parent.insertBefore(b.f, ref);
        } else {
          b = bs[from];
          up(b, xs[j], j);
          if (stay !== null && stay[j - a] === 0) moveBefore(b, parent, ref);
        }
        nb[j] = b;
        const f = firstNode(b);
        if (f) ref = f;
      }
      this.bs = nb;
    }
    this.keys = nk;
  }
}

/** The items of a `for` before `a`; see the class for the algorithm. */
export const list = (rt: Rt, a: Node): ListBlock => new List(rt, a);

export type ListBlock = List;

/* ------------------------------------------------- dynamic embed / outlet */

/**
 * The view behind the value of a dynamic embed (`+{expr}`): a direct view
 * itself, or a component that has one. `null` for "nothing".
 */
export function asDirectView(value: unknown): DirectView | null {
  if (value == null) return null;
  const view = (value as { view?: DirectView }).view ?? (value as DirectView);
  if (typeof view.create !== "function") {
    throw new Error(
      "pavlus/direct: +{...} needs a direct view or a component with one",
    );
  }
  return view;
}

/** The direct view of a component or a view; `undefined` when it has none. */
export function directViewOf(c: unknown): DirectView | undefined {
  if (typeof c !== "object" || c === null) return undefined;
  const v = c as { create?: unknown; view?: unknown };
  if (typeof v.create === "function") return c as DirectView;
  const inner = v.view as { create?: unknown } | undefined;
  return inner && typeof inner.create === "function"
    ? (inner as DirectView)
    : undefined;
}

export interface OutletMatch {
  name: string;
  view: DirectView;
  component: unknown;
  state: unknown;
}

/**
 * What `+outlet` shows for `state`: the `routing` entry of `env.o` that
 * matches `state.route` (same matching and child state as the vdom
 * pipeline's `resolveOutlet`, but the page must be a direct view).
 */
export function outlet(env: Env, state: unknown): OutletMatch | null {
  const o = env.o as { routing?: Record<string, any> } | undefined;
  if (!o || typeof o !== "object" || !o.routing) {
    throw new FatalError(
      "pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view",
    );
  }
  const route = asRoute((state as { route?: unknown })?.route);
  if (!route) return null;
  const match = matchRoute(o.routing, route);
  if (!match) return null;
  const component = routeComponent(match.spec, state);
  const view =
    (match.spec.view as DirectView | undefined) ?? directViewOf(component);
  if (!view || typeof view.create !== "function") {
    throw new FatalError(
      `pavlus: routing entry "${match.pattern}" has neither a direct view nor a component with one`,
    );
  }
  return {
    name: match.name,
    view,
    component,
    state: routedState(match.spec, state, match.route),
  };
}
