import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

/**
 * Every block's stylesheet is loaded on every page, so two blocks defining the
 * same bare class (`.k-stats { ... }`) would restyle each other, and which one
 * wins depends on the load order. A template may restyle a block under its own
 * parent selector; a block may not share a class name with another block.
 */
const root = new URL("../blocks", import.meta.url).pathname;

function bareClasses(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  for (const rule of clean.matchAll(/(?:^|\})\s*([^{}]+)\{/g)) {
    for (const sel of rule[1].split(",")) {
      const m = /^\.(k-[\w-]+)(?:[:[][^ ]*)?$/.exec(sel.trim());
      if (m) found.push(m[1]);
    }
  }
  return found;
}

test("no two blocks define the same class", () => {
  const owners = new Map<string, Set<string>>();
  for (const block of readdirSync(root)) {
    for (const file of readdirSync(join(root, block))) {
      if (!file.endsWith(".css")) continue;
      for (const cls of bareClasses(
        readFileSync(join(root, block, file), "utf8"),
      )) {
        owners.set(cls, (owners.get(cls) ?? new Set()).add(block));
      }
    }
  }
  const clashes = [...owners]
    .filter(([, blocks]) => blocks.size > 1)
    .map(([cls, blocks]) => `${cls}: ${[...blocks].sort().join(", ")}`);
  expect(clashes).toEqual([]);
});
