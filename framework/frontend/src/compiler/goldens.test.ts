/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { parse } from "../template/parser.ts";
import type { Node } from "../template/ast.ts";
import { compileTemplate } from "./mod.ts";

/**
 * Golden files: the exact JavaScript the compiler generates for a set of
 * templates that together use every feature. `output.test.ts` asserts
 * *properties* of the output (readable names, comments, imports); these pin
 * the *bytes*, so a refactor of the compiler can prove it changed nothing.
 *
 * Changed the output on purpose? Run `npx vitest run -u` and review the diff
 * of `__goldens__/`.
 */
const sources = import.meta.glob("./__fixtures__/*.pavlus", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const fixtures = Object.entries(sources)
  .map(([path, source]) => ({
    name: path.slice(path.lastIndexOf("/") + 1, -".pavlus".length),
    source,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

describe("generated code is pinned byte for byte", () => {
  for (const { name, source } of fixtures) {
    test(name, async () => {
      const code = compileTemplate(source, { filename: `${name}.pavlus` });
      await expect(code).toMatchFileSnapshot(`./__goldens__/${name}.js`);
    });
  }

  test("the fixtures together use every kind of node and embed", () => {
    const kinds = new Set<string>();
    const walk = (nodes: Node[]): void => {
      for (const n of nodes) {
        kinds.add(n.type);
        if (n.type === "embed")
          kinds.add(n.component ? "embed:static" : "embed:dynamic");
        if (n.type === "for") kinds.add(n.key ? "for:keyed" : "for:unkeyed");
        if (n.type === "if" && n.branches.length > 2) kinds.add("if:else-if");
        if (n.type === "if" && n.branches.at(-1)?.test === null)
          kinds.add("if:else");
        if (n.type === "element") {
          if (n.toggles.length) kinds.add("element:class-toggle");
          if (n.events.some((e) => e.prevent)) kinds.add("event:prevent");
          if (n.events.some((e) => e.stop)) kinds.add("event:stop");
          if (n.events.some((e) => e.args.length > 1))
            kinds.add("event:many-args");
          walk(n.children);
        }
        if (n.type === "for") walk(n.children);
        if (n.type === "if") n.branches.forEach((b) => walk(b.children));
      }
    };
    for (const { source } of fixtures) walk(parse(source).nodes);
    expect([...kinds].sort()).toEqual(
      [
        "element",
        "text",
        "if",
        "if:else",
        "if:else-if",
        "for",
        "for:keyed",
        "for:unkeyed",
        "embed",
        "embed:static",
        "embed:dynamic",
        "outlet",
        "element:class-toggle",
        "event:prevent",
        "event:stop",
        "event:many-args",
      ].sort(),
    );
  });
});
