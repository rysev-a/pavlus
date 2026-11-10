import type { Node, Part } from "../../template/ast.ts";

export type Side = "prev" | "next";

export interface Local {
  prev: string;
  next: string;
}

export interface Ctx {
  /** Template variable (loop item, index) to the JS variable per side. */
  scope: Map<string, Local>;
  /** JS expression: id suffix of this instance (loop keys, embeds). */
  suffix: string;
  /** JS expression: message id prefix (embed instance names). */
  prefix: string;
  /** JS variable holding the whole state, per side. */
  roots: Record<Side, string>;
}

export const json = (v: unknown): string => JSON.stringify(v);
export const isStr = (p: Part): p is string => typeof p === "string";
export const cap = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);
export const camel = (s: string): string =>
  s.replace(/[^A-Za-z0-9$]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""));

/** `{ "a": "b" }` */
export const record = (r: Record<string, string>): string => {
  const entries = Object.entries(r).map(([k, v]) => `${json(k)}: ${json(v)}`);
  return entries.length ? `{ ${entries.join(", ")} }` : "{}";
};

export function lineOf(n: Node): number {
  return n.type === "element" || n.type === "embed" ? n.pos.line : n.line;
}

/** Short description of a node for the comments in the generated code. */
export function describe(n: Node): string {
  switch (n.type) {
    case "element":
      return `<${n.tag}${n.classes.map((c) => `.${c}`).join("")}>`;
    case "text":
      return "text";
    case "if":
      return "if";
    case "for":
      return `for ${n.item}${n.index ? `, ${n.index}` : ""}`;
    case "embed":
      return `+${n.component ?? "{...}"}#${n.name}`;
    case "outlet":
      return "+outlet";
  }
}
