import type { Attr, ElementNode, EventBinding } from "../../template/ast.ts";
import { isStr } from "./shared.ts";

export function isStaticAttr(a: Attr): boolean {
  return a.value === null || a.value.every(isStr);
}

export interface ElementInfo {
  staticAttrs: Record<string, string>;
  dynAttrs: Attr[];
  classAttr: Attr | undefined;
  classDynamic: boolean;
  dynEvents: EventBinding[];
  hasId: boolean;
}

export function elementInfo(el: ElementNode): ElementInfo {
  const classAttr = el.attrs.find((a) => a.name === "class");
  const classDynamic =
    el.toggles.length > 0 ||
    (classAttr !== undefined && !isStaticAttr(classAttr));
  const staticAttrs: Record<string, string> = {};
  const dynAttrs: Attr[] = [];
  for (const a of el.attrs) {
    if (a.name === "class") continue;
    if (isStaticAttr(a))
      staticAttrs[a.name] = a.value === null ? "" : a.value.join("");
    else dynAttrs.push(a);
  }
  if (!classDynamic) {
    const cls = [...el.classes, ...((classAttr?.value ?? []) as string[])]
      .join(" ")
      .trim();
    if (cls) staticAttrs.class = cls;
  }
  const dynEvents = el.events.filter((e) => e.args.length > 0);
  return {
    staticAttrs,
    dynAttrs,
    classAttr,
    classDynamic,
    dynEvents,
    hasId: dynAttrs.length > 0 || classDynamic || dynEvents.length > 0,
  };
}
