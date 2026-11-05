import { expect } from "vitest";
import { compileToView, type Parser } from "../compiler/mod.ts";
import type { View } from "../runtime/vnode.ts";
import { toHtml } from "../runtime/vnode.ts";

/**
 * The contract of every syntax: `source` (in the syntax under test) and
 * `native` (the same template in the native `.pavlus` syntax) must produce the
 * same HTML for every state, and the same patches between every pair of states.
 */
export function expectSameAs(
  parser: Parser,
  source: string,
  native: string,
  states: unknown[],
  components: Record<string, View> = {},
): void {
  const a = compileToView(source, { parser, components });
  const b = compileToView(native, { components });
  for (const s of states) {
    expect(toHtml(a.render(s))).toBe(toHtml(b.render(s)));
  }
  for (const p of states)
    for (const n of states) {
      expect(a.diff(p, n)).toEqual(b.diff(p, n));
    }
}
