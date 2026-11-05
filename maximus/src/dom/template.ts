/**
 * `html` and `svg` tagged templates.
 *
 * The static parts of a template literal are scanned once (cached by the
 * identity of the `strings` array), turned into markup with placeholders, and
 * parsed once into a `<template>`. Each call clones that template and binds the
 * holes to nodes that are located by their position in a tree walk, never by
 * querying. Hole kinds:
 *
 *   text position      <!--$mx$--><!--/$mx$-->  (start/end of a region; omitted when the hole is the only child)
 *   attribute          name=${v}  name="a ${v} b"   (marked element gets `data-mx`, removed after parsing)
 *   .prop ?bool @event ref   by prefix/name
 *   spread / directive `...${obj}` or a bare `${obj}` in a tag
 *
 * @module
 */
import {
  bindAttr,
  bindBool,
  bindComposite,
  bindEvent,
  bindProp,
  bindRef,
  bindSpread,
} from "./attrs.ts";
import { bindChild } from "./insert.ts";
import { doc, env } from "./env.ts";
import type { Region, View } from "./insert.ts";

const MARK = "$mx$";
const MARK_END = "/$mx$";
const K_CHILD = 0;
const K_ATTR = 1;
const K_PROP = 2;
const K_BOOL = 3;
const K_EVENT = 4;
const K_REF = 5;
const K_SPREAD = 6;
const K_COMPOSITE = 7;

interface RawPart {
  kind: number;
  name: string;
  /** hole indexes into the values array */
  values: number[];
  /** static pieces around the holes (attribute parts) */
  strings: string[];
  /** ordinal among tags with dynamic attributes, or among child holes */
  ordinal: number;
}

interface Part {
  kind: number;
  name: string;
  values: number[];
  strings: string[];
  /** walk index of the target element / start marker / sole parent */
  node: number;
  sole: boolean;
}

interface Compiled {
  strings: readonly string[];
  tpl: HTMLTemplateElement;
  parts: Part[];
  maxNode: number;
  /** content is exactly one Element: return it instead of a fragment */
  single: boolean;
}

const S_TEXT = 0;
const S_TAGNAME = 1;
const S_BEFORE_ATTR = 2;
const S_ATTR_NAME = 3;
const S_AFTER_NAME = 4;
const S_BEFORE_VALUE = 5;
const S_UNQ = 6;
const S_DQ = 7;
const S_SQ = 8;
const S_COMMENT = 9;
const S_RAW = 10;
const S_CLOSE = 11;

const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);

function isSpace(c: string): boolean {
  return c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f";
}

function isAlpha(c: string | undefined): boolean {
  return c !== undefined && /[a-zA-Z]/.test(c);
}

/** Turn the static strings into markup plus a description of every hole. */
export function scan(strings: readonly string[]): {
  markup: string;
  parts: RawPart[];
  tagCount: number;
  childCount: number;
} {
  let out = "";
  let state = S_TEXT;
  let tagName = "";
  let rawName = "";
  let tagDynamic = false;
  let selfClose = false;
  let tagCount = 0;
  let childCount = 0;
  let attrName = "";
  let quote = "";
  let curStr = "";
  let hasValue = false;
  let vStrings: string[] = [];
  let vHoles: number[] = [];
  const parts: RawPart[] = [];

  const finishAttr = (): void => {
    if (vHoles.length === 0) {
      if (attrName !== "")
        out += " " + attrName + (hasValue ? "=" + quote + curStr + quote : "");
    } else {
      vStrings.push(curStr);
      let kind = K_ATTR;
      let name = attrName;
      const c = name[0];
      const single =
        vHoles.length === 1 && vStrings[0] === "" && vStrings[1] === "";
      if (c === "@" || c === "." || c === "?") {
        if (!single)
          throw new Error(
            `Maximus: "${name}" must be bound as a whole value: ${name}=\${...}`,
          );
        kind = c === "@" ? K_EVENT : c === "." ? K_PROP : K_BOOL;
        name = name.slice(1);
      } else if (name === "ref") {
        if (!single)
          throw new Error(
            "Maximus: ref must be bound as a whole value: ref=${...}",
          );
        kind = K_REF;
      } else if (!single) kind = K_COMPOSITE;
      if (name === "")
        throw new Error("Maximus: empty attribute name in binding");
      parts.push({
        kind,
        name,
        values: vHoles,
        strings: vStrings,
        ordinal: tagCount,
      });
      tagDynamic = true;
    }
    attrName = "";
    quote = "";
    curStr = "";
    hasValue = false;
    vStrings = [];
    vHoles = [];
  };

  const finishTag = (): void => {
    out += (tagDynamic ? " data-mx" : "") + (selfClose ? "/" : "") + ">";
    if (tagDynamic) tagCount++;
    tagDynamic = false;
    const lower = tagName.toLowerCase();
    if (RAW_TEXT.has(lower) && !selfClose) {
      state = S_RAW;
      rawName = lower;
    } else state = S_TEXT;
    selfClose = false;
  };

  const startAttr = (c: string): void => {
    selfClose = false;
    attrName = c;
    state = S_ATTR_NAME;
  };

  for (let i = 0; i < strings.length; i++) {
    const s = strings[i]!;
    for (let j = 0; j < s.length; j++) {
      const c = s[j]!;
      switch (state) {
        case S_TEXT:
          if (c === "<") {
            const n = s[j + 1];
            if (n === undefined)
              throw new Error(
                "Maximus: a hole cannot follow '<' (dynamic tag names are not supported)",
              );
            if (isAlpha(n)) {
              state = S_TAGNAME;
              tagName = "";
              out += c;
            } else if (n === "!" && s.startsWith("<!--", j)) {
              state = S_COMMENT;
              out += "<!--";
              j += 3;
            } else {
              state = S_CLOSE;
              out += c;
            }
          } else out += c;
          break;
        case S_TAGNAME:
          if (isSpace(c)) {
            state = S_BEFORE_ATTR;
            out += c;
          } else if (c === ">") finishTag();
          else if (c === "/") {
            selfClose = true;
            state = S_BEFORE_ATTR;
          } else {
            tagName += c;
            out += c;
          }
          break;
        case S_BEFORE_ATTR:
          if (isSpace(c)) break;
          if (c === ">") finishTag();
          else if (c === "/") selfClose = true;
          else startAttr(c);
          break;
        case S_ATTR_NAME:
          if (isSpace(c)) state = S_AFTER_NAME;
          else if (c === "=") {
            state = S_BEFORE_VALUE;
            hasValue = true;
          } else if (c === ">") {
            finishAttr();
            finishTag();
          } else if (c === "/" && s[j + 1] === ">") {
            finishAttr();
            selfClose = true;
            state = S_BEFORE_ATTR;
          } else attrName += c;
          break;
        case S_AFTER_NAME:
          if (isSpace(c)) break;
          if (c === "=") {
            state = S_BEFORE_VALUE;
            hasValue = true;
          } else if (c === ">") {
            finishAttr();
            finishTag();
          } else {
            finishAttr();
            if (c === "/") {
              selfClose = true;
              state = S_BEFORE_ATTR;
            } else startAttr(c);
          }
          break;
        case S_BEFORE_VALUE:
          if (isSpace(c)) break;
          if (c === '"' || c === "'") {
            quote = c;
            state = c === '"' ? S_DQ : S_SQ;
          } else if (c === ">") {
            finishAttr();
            finishTag();
          } else {
            curStr = c;
            state = S_UNQ;
          }
          break;
        case S_UNQ:
          if (isSpace(c)) {
            finishAttr();
            state = S_BEFORE_ATTR;
          } else if (c === ">") {
            finishAttr();
            finishTag();
          } else if (c === "/" && s[j + 1] === ">") {
            // unlike the HTML spec, an unquoted value ends at "/>" (so d=${x}/> works)
            finishAttr();
            selfClose = true;
            state = S_BEFORE_ATTR;
          } else curStr += c;
          break;
        case S_DQ:
        case S_SQ:
          if (c === quote) {
            finishAttr();
            state = S_BEFORE_ATTR;
          } else curStr += c;
          break;
        case S_COMMENT:
          out += c;
          if (c === ">" && out.endsWith("-->")) state = S_TEXT;
          break;
        case S_RAW:
          if (
            c === "<" &&
            s.slice(j, j + rawName.length + 2).toLowerCase() === "</" + rawName
          ) {
            state = S_CLOSE;
            out += c;
          } else out += c;
          break;
        case S_CLOSE:
          out += c;
          if (c === ">") state = S_TEXT;
          break;
      }
    }
    if (i === strings.length - 1) break;
    // the hole between strings[i] and strings[i + 1]
    switch (state) {
      case S_TEXT:
        out += `<!--${MARK}--><!--${MARK_END}-->`;
        parts.push({
          kind: K_CHILD,
          name: "",
          values: [i],
          strings: [],
          ordinal: childCount++,
        });
        break;
      case S_BEFORE_ATTR:
      case S_AFTER_NAME:
        if (state === S_AFTER_NAME) finishAttr();
        parts.push({
          kind: K_SPREAD,
          name: "",
          values: [i],
          strings: [],
          ordinal: tagCount,
        });
        tagDynamic = true;
        state = S_BEFORE_ATTR;
        break;
      case S_ATTR_NAME:
        if (attrName !== "...")
          throw new Error(
            `Maximus: unexpected hole after attribute name "${attrName}" (did you forget "="?)`,
          );
        attrName = "";
        parts.push({
          kind: K_SPREAD,
          name: "",
          values: [i],
          strings: [],
          ordinal: tagCount,
        });
        tagDynamic = true;
        state = S_BEFORE_ATTR;
        break;
      case S_BEFORE_VALUE:
        vStrings.push("");
        vHoles.push(i);
        curStr = "";
        state = S_UNQ;
        break;
      case S_UNQ:
      case S_DQ:
      case S_SQ:
        vStrings.push(curStr);
        vHoles.push(i);
        curStr = "";
        break;
      case S_COMMENT:
        break; // values inside HTML comments are ignored
      case S_RAW:
        throw new Error(
          `Maximus: holes inside <${rawName}> are not supported (use .textContent=\${...} or a style binding)`,
        );
      default:
        throw new Error(
          "Maximus: a hole is not allowed in a tag name or a closing tag",
        );
    }
  }
  return { markup: out.trim(), parts, tagCount, childCount };
}

function walkAll(root: Node, visit: (n: Node, index: number) => void): void {
  const w = doc().createTreeWalker(root, 129 /* SHOW_ELEMENT | SHOW_COMMENT */);
  let i = -1;
  for (let n = w.nextNode(); n !== null; n = w.nextNode()) visit(n, ++i);
}

function trimWhitespace(root: Node): void {
  const w = doc().createTreeWalker(root, 4 /* SHOW_TEXT */);
  const drop: Node[] = [];
  for (let n = w.nextNode(); n !== null; n = w.nextNode()) {
    const data = (n as Text).data;
    if (data.includes("\n") && data.trim() === "") {
      const tag = (n.parentNode as Element | null)?.localName;
      if (tag !== "pre" && tag !== "textarea") drop.push(n);
    }
  }
  for (const n of drop) n.parentNode!.removeChild(n);
}

function compile(strings: readonly string[], isSvg: boolean): Compiled {
  const { markup, parts: raw, tagCount, childCount } = scan(strings);
  const tpl = doc().createElement("template");
  tpl.innerHTML = isSvg ? `<svg>${markup}</svg>` : markup;
  if (isSvg) {
    const wrapper = tpl.content.firstChild!;
    while (wrapper.firstChild) tpl.content.appendChild(wrapper.firstChild);
    tpl.content.removeChild(wrapper);
  }
  const content = tpl.content;
  trimWhitespace(content);

  const marked: Element[] = [];
  const markers: Comment[] = [];
  walkAll(content, (n) => {
    if (n.nodeType === 1) {
      if ((n as Element).hasAttribute("data-mx")) marked.push(n as Element);
    } else if ((n as Comment).data === MARK || (n as Comment).data === MARK_END)
      markers.push(n as Comment);
  });
  if (marked.length !== tagCount || markers.length !== childCount * 2) {
    throw new Error(
      "Maximus: the HTML parser rearranged this template, so bindings could not be located (is a binding on a tag the parser drops, or content in an invalid place such as a <tr> inside a <div>?)\n" +
        strings.join("${}"),
    );
  }

  const soleParent: (Node | null)[] = [];
  for (let k = 0; k < childCount; k++) {
    const s = markers[2 * k]!;
    const e = markers[2 * k + 1]!;
    const p = s.parentNode!;
    if (s.previousSibling === null && e.nextSibling === null && p !== content) {
      soleParent[k] = p;
      p.removeChild(s);
      p.removeChild(e);
    } else soleParent[k] = null;
  }

  const wanted = new Set<Node>();
  for (const p of raw) {
    if (p.kind === K_CHILD)
      wanted.add(soleParent[p.ordinal] ?? markers[2 * p.ordinal]!);
    else wanted.add(marked[p.ordinal]!);
  }
  const indexOf = new Map<Node, number>();
  walkAll(content, (n, i) => {
    if (wanted.has(n)) indexOf.set(n, i);
  });
  for (const el of marked) el.removeAttribute("data-mx");

  let maxNode = -1;
  const parts: Part[] = raw.map((p) => {
    const sole = p.kind === K_CHILD && soleParent[p.ordinal] !== null;
    const target =
      p.kind === K_CHILD
        ? (soleParent[p.ordinal] ?? markers[2 * p.ordinal]!)
        : marked[p.ordinal]!;
    const node = indexOf.get(target)!;
    if (node + (p.kind === K_CHILD && !sole ? 1 : 0) > maxNode)
      maxNode = node + (p.kind === K_CHILD && !sole ? 1 : 0);
    return {
      kind: p.kind,
      name: p.name,
      values: p.values,
      strings: p.strings,
      node,
      sole,
    };
  });

  const first = content.firstChild;
  const single =
    content.childNodes.length === 1 && first !== null && first.nodeType === 1;
  return { strings, tpl, parts, maxNode, single };
}

// templates compiled against the virtual server DOM must not leak into a real document (and vice versa)
const htmlCache = [
  new WeakMap<readonly string[], Compiled>(),
  new WeakMap<readonly string[], Compiled>(),
];
const svgCache = [
  new WeakMap<readonly string[], Compiled>(),
  new WeakMap<readonly string[], Compiled>(),
];

function instantiate(c: Compiled, values: readonly unknown[]): View {
  const claim = env.claim !== null ? env.claim(c) : null;
  let content: DocumentFragment | null = null;
  let nodes: Node[];
  if (claim !== null) nodes = claim.nodes;
  else {
    content = c.tpl.content.cloneNode(true) as DocumentFragment;
    nodes = [];
    if (c.parts.length > 0) {
      const w = doc().createTreeWalker(content, 129);
      for (let i = 0; i <= c.maxNode; i++) nodes[i] = w.nextNode()!;
    }
  }
  const parts = c.parts;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    const target = nodes[p.node]!;
    switch (p.kind) {
      case K_CHILD: {
        const region: Region = p.sole
          ? { start: null, end: null, parent: target }
          : { start: target, end: nodes[p.node + 1]!, parent: null };
        bindChild(region, values[p.values[0]!], claim !== null);
        break;
      }
      case K_ATTR:
        bindAttr(target as Element, p.name, values[p.values[0]!]);
        break;
      case K_PROP:
        bindProp(target as Element, p.name, values[p.values[0]!]);
        break;
      case K_BOOL:
        bindBool(target as Element, p.name, values[p.values[0]!]);
        break;
      case K_EVENT:
        bindEvent(target as Element, p.name, values[p.values[0]!]);
        break;
      case K_REF:
        bindRef(target as Element, values[p.values[0]!]);
        break;
      case K_SPREAD:
        bindSpread(target as Element, values[p.values[0]!]);
        break;
      default:
        bindComposite(
          target as Element,
          p.name,
          p.strings,
          p.values.map((v) => values[v]),
        );
    }
  }
  if (claim !== null) return claim.finish();
  let result: View;
  if (c.single) {
    const el = content!.firstChild!;
    content!.removeChild(el);
    result = el;
  } else result = content!;
  return env.tag !== null ? env.tag(c, result) : result;
}

/**
 * Build DOM from a template literal. Returns an Element when the template has
 * a single root element, otherwise a DocumentFragment. Components run once, so
 * each `html` call creates real nodes and the effects that keep them current.
 */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): View {
  const cache = htmlCache[env.server ? 1 : 0]!;
  let c = cache.get(strings);
  if (c === undefined) cache.set(strings, (c = compile(strings, false)));
  return instantiate(c, values);
}

/** Like {@link html} for SVG fragments (parsed in the SVG namespace). */
export function svg(strings: TemplateStringsArray, ...values: unknown[]): View {
  const cache = svgCache[env.server ? 1 : 0]!;
  let c = cache.get(strings);
  if (c === undefined) cache.set(strings, (c = compile(strings, true)));
  return instantiate(c, values);
}
