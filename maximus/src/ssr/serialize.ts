/**
 * HTML serialisation of the virtual DOM. Text and attribute values are
 * escaped; raw-text elements (`script`, `style`) cannot be closed early by their content.
 *
 * @module
 */
import { VOID } from "./parse.ts";
import type { VElement, VNode, VText } from "./vdom.ts";

export function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;",
  );
}

export function escapeAttr(s: string): string {
  return s.replace(/[&"<>]/g, (c) =>
    c === "&" ? "&amp;" : c === '"' ? "&quot;" : c === "<" ? "&lt;" : "&gt;",
  );
}

/** Marker attribute carried by the root element of a template instance: `seq:hash`. */
export const INSTANCE_ATTR = "data-mx-i";

export function serialize(node: VNode): string {
  switch (node.nodeType) {
    case 1:
      return serializeElement(node as VElement, undefined);
    case 3:
      return escapeText((node as VText).data);
    case 8:
      return `<!--${(node as unknown as { data: string }).data.replace(/--!?>/g, "-- >")}-->`;
    default:
      return serializeChildren(node);
  }
}

export function serializeChildren(node: VNode, selectValue?: string): string {
  let out = "";
  const raw = node.nodeType === 1 ? (node as VElement).localName : "";
  const isRaw =
    !(node as VElement).svg && (raw === "script" || raw === "style");
  for (let c = node.firstChild; c !== null; c = c.nextSibling) {
    if (isRaw && c.nodeType === 3) {
      out += (c as VText).data.replace(
        new RegExp(`</(${raw})`, "gi"),
        "<\\/$1",
      );
    } else if (c.nodeType === 1)
      out += serializeElement(c as VElement, selectValue);
    else out += serialize(c);
  }
  return out;
}

function serializeElement(
  el: VElement,
  selectValue: string | undefined,
): string {
  let attrs = "";
  for (const [k, v] of el.attrs) {
    if (
      selectValue !== undefined &&
      el.localName === "option" &&
      k === "selected"
    )
      continue;
    attrs += ` ${k}="${escapeAttr(v)}"`;
  }
  if (selectValue !== undefined && el.localName === "option") {
    const value = el.getAttribute("value") ?? el.textContent ?? "";
    if (value === selectValue) attrs += " selected";
  }
  if (el.mx !== null) attrs += ` ${INSTANCE_ATTR}="${el.mx.seq}:${el.mx.hash}"`;
  const name = el.localName;
  if (!el.svg && VOID.has(name)) return `<${name}${attrs}>`;
  const sv = name === "select" ? el.selectValue : selectValue;
  let inner = serializeChildren(el, sv);
  if (
    !el.svg &&
    (name === "textarea" || name === "pre") &&
    inner.startsWith("\n")
  )
    inner = "\n" + inner;
  return `<${name}${attrs}>${inner}</${name}>`;
}
