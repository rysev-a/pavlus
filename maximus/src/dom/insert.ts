/**
 * Child content: regions delimited by comment markers (or by a sole parent),
 * and the machinery that keeps their content in sync with a value.
 *
 * @module
 */
import { renderEffect } from "../core/mod.ts";
import { doc, env } from "./env.ts";
import { isUnsafe } from "./safety.ts";

/** Anything that can be interpolated or returned from a component. */
export type Child =
  | Node
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | readonly Child[]
  | (() => Child)
  | { toString(): string };

/** What `html`, `show`, `each`, ... return: an Element or a DocumentFragment. */
export type View = Node;

/**
 * A slice of the DOM owned by one binding. Anchored regions own everything
 * between `start` and `end` (exclusive); a sole region owns all children of `parent`.
 */
export interface Region {
  start: Node | null;
  end: Node | null;
  parent: Node | null;
}

export function isNode(v: unknown): v is Node {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Node).nodeType === "number"
  );
}

function parentOf(r: Region): Node | null {
  return r.start !== null ? r.start.parentNode : r.parent;
}

export function clearRegion(r: Region): void {
  const p = parentOf(r);
  if (p === null) return;
  if (r.start === null) {
    p.textContent = "";
    return;
  }
  let n = r.start.nextSibling;
  while (n !== null && n !== r.end) {
    const next = n.nextSibling;
    p.removeChild(n);
    n = next;
  }
}

/** Remove `first..last` inclusive and everything between. */
export function removeRange(first: Node, last: Node): void {
  const p = first.parentNode;
  if (p === null) return;
  let n: Node | null = first;
  while (n !== null) {
    const next: Node | null = n === last ? null : n.nextSibling;
    p.removeChild(n);
    n = next;
  }
}

export function parseHtml(markup: string): Node[] {
  const t = doc().createElement("template");
  t.innerHTML = markup;
  return Array.from(t.content.childNodes);
}

/** Resolve any child value to a flat list of top-level nodes. Functions become reactive regions. */
export function toNodes(value: unknown, out: Node[] = []): Node[] {
  if (value == null || typeof value === "boolean") return out;
  if (typeof value === "function") {
    const frag = region(value as () => unknown);
    for (let n = frag.firstChild; n !== null; n = n.nextSibling) out.push(n);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) toNodes(v, out);
    return out;
  }
  if (isNode(value)) {
    if (value.nodeType === 11)
      for (let n = value.firstChild; n !== null; n = n.nextSibling) out.push(n);
    else out.push(value);
    return out;
  }
  if (isUnsafe(value)) {
    out.push(...parseHtml(value.value));
    return out;
  }
  out.push(doc().createTextNode(String(value)));
  return out;
}

/**
 * Bind `value` to a region. A function (signal, computed or `() => child`) is
 * tracked by a render effect and the region is updated in place: text reuses
 * one Text node, anything else replaces the content.
 */
export function bindChild(
  r: Region,
  value: unknown,
  adopt = false,
): void {
  let adopting = adopt;
  let text: Text | null = null;
  let filled = false;
  let cur: Node | null = null;
  let curList: Node[] | null = null;

  const clear = (): void => {
    if (filled) clearRegion(r);
    filled = false;
    text = null;
    cur = null;
    curList = null;
  };
  const put = (n: Node): void => {
    const p = parentOf(r);
    if (p !== null) p.insertBefore(n, r.end);
    filled = true;
  };

  /** Hydration: the region already holds server content; keep what matches the first value. */
  const adoptFirst = (v: unknown): boolean => {
    adopting = false;
    const p = parentOf(r);
    if (p === null) return false;
    const ex: Node[] = [];
    for (
      let n = r.start !== null ? r.start.nextSibling : p.firstChild;
      n !== null && n !== r.end;
      n = n.nextSibling
    )
      ex.push(n);
    const warn = (m: string): void => env.mismatch?.(m);
    if (v == null || typeof v === "boolean") {
      if (ex.length > 0) {
        warn("server rendered content where the client renders nothing");
        clearRegion(r);
      }
      return true;
    }
    const t = typeof v;
    if (t === "string" || t === "number" || t === "bigint") {
      const s = String(v);
      const first = ex[0];
      if (first !== undefined && first.nodeType === 3 && ex.length === 1) {
        text = first as Text;
        filled = true;
        if (text.data !== s) {
          warn(
            `text mismatch (server ${JSON.stringify(text.data.slice(0, 40))}, client ${JSON.stringify(s.slice(0, 40))})`,
          );
          text.data = s;
        }
        return true;
      }
      if (s !== "" || ex.length > 0)
        warn(`text mismatch (client ${JSON.stringify(s.slice(0, 40))}, server has ${ex.length} node(s))`);
      clearRegion(r);
      return false;
    }
    let want: Node[];
    if (isNode(v) && v.nodeType !== 11) {
      want = [v];
      cur = v;
    } else if (Array.isArray(v) && v.every(isNode)) {
      want = toNodes(v);
      curList = v as Node[];
    } else want = toNodes(v);
    const keep = new Set(want);
    for (const n of ex)
      if (!keep.has(n) && n.parentNode === p) p.removeChild(n);
    let ptr: Node | null = r.start !== null ? r.start.nextSibling : p.firstChild;
    for (const w of want) {
      if (w === ptr) ptr = ptr.nextSibling;
      else p.insertBefore(w, ptr === null ? r.end : ptr);
    }
    filled = true;
    return true;
  };

  const set = (v: unknown): void => {
    if (adopting && adoptFirst(v)) return;
    if (v == null || typeof v === "boolean") return clear();
    const t = typeof v;
    if (t === "string" || t === "number" || t === "bigint") {
      const s = String(v);
      if (text !== null && filled) {
        if (text.data !== s) text.data = s;
        return;
      }
      clear();
      put((text = doc().createTextNode(s)));
      return;
    }
    if (isNode(v) && v.nodeType !== 11) {
      if (cur === v && filled && v.parentNode === parentOf(r)) return;
      clear();
      put(v);
      cur = v;
      return;
    }
    if (Array.isArray(v) && v.every(isNode)) {
      const list = v as Node[];
      if (
        curList !== null &&
        filled &&
        curList.length === list.length &&
        curList.every((n, i) => n === list[i])
      )
        return;
      clear();
      const frag = doc().createDocumentFragment();
      for (const n of list) frag.appendChild(n);
      put(frag);
      curList = list;
      return;
    }
    const nodes = toNodes(v);
    clear();
    const frag = doc().createDocumentFragment();
    for (const n of nodes) frag.appendChild(n);
    put(frag);
  };

  if (typeof value === "function") {
    renderEffect(() => {
      let v = (value as () => unknown)();
      while (typeof v === "function") v = (v as () => unknown)();
      set(v);
    });
  } else set(value);
}

/**
 * A reactive fragment: `[start, ...content, end]` whose content follows `fn()`.
 * The foundation of show/match/errorBoundary/lazy. The effect belongs to the
 * owner that is current when called.
 */
export function region(fn: () => unknown): DocumentFragment {
  const d = doc();
  const frag = d.createDocumentFragment();
  const start = d.createComment("");
  const end = d.createComment("");
  frag.append(start, end);
  bindChild({ start, end, parent: null }, fn);
  return frag;
}
