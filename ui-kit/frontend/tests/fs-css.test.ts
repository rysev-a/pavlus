import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("the stylesheet", () => {
  const css = readFileSync(
    new URL("../templates/flow-studio/flow-studio.css", import.meta.url),
    "utf8",
  );
  test("every class starts with fs-", () => {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const classes = [...clean.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(
      (m) => m[1],
    );
    const foreign = classes.filter(
      (c) =>
        !c.startsWith("fs") &&
        !c.startsWith("ui-") &&
        ![
          "is-sel",
          "is-seen",
          "is-idle",
          "is-cond",
          "is-current",
          "is-cancelled",
          "is-busy",
          "is-dead",
          "is-done",
          "is-work",
          "is-armed",
          "is-dashed",
          "is-passed",
          "has-bp",
          "has-fault",
        ].includes(c),
    );
    expect([...new Set(foreign)]).toEqual([]);
  });
  test("only the kit's tokens: no literal colour", () => {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(clean.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(clean.match(/\b(rgb|rgba|hsl|hsla|oklch)\(/g)).toBeNull();
  });
  test("a narrow screen has a bottom sheet and reduced motion is respected", () => {
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("position: fixed");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain('[data-reduced="true"]');
  });
});
