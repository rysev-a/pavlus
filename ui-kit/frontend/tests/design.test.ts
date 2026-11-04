// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { buildExport, styleRulesOf } from "../export.ts";
import {
  catalog,
  defaultLook,
  parseLook,
  RADII,
  varsOf,
  withChoice,
  withTheme,
} from "../theming.ts";

const css = (name: string) => readFileSync(join(process.cwd(), "frontend", name), "utf8");

test("corners: auto leaves the style's radius, a choice wins over it", () => {
  const base = defaultLook("light");
  expect(varsOf(base)["--btn-radius"]).toBeUndefined();
  const sharp = varsOf(withChoice(base, "radius", "none"));
  expect(sharp["--radius"]).toBe("0");
  expect(sharp["--btn-radius"]).toBe("0");
  const pill = varsOf(withChoice(base, "radius", "pill"));
  expect(pill["--btn-radius"]).toBe("999px");
  expect(pill["--card-radius"]).toBe("1.25rem");
  // over a style that has its own corners
  const ant = withChoice({ ...base, radius: "lg" }, "radius", "lg");
  expect(varsOf({ ...ant, style: "ant" })["--radius"]).toBe("0.875rem");
});

test("corners: a style, or a theme with its bundle, brings its own again", () => {
  const look = withChoice(defaultLook("light"), "radius", "xl");
  expect(withChoice(look, "style", "ant").radius).toBe("auto");
  expect(withTheme(look, "zinc", "light").radius).toBe("auto");
  expect(withTheme({ ...look, bundle: false }, "zinc", "light").radius).toBe("xl");
});

test("corners: saved looks are read back, and the catalog lists them", () => {
  const fallback = defaultLook("light");
  expect(parseLook({ radius: "pill" }, fallback).radius).toBe("pill");
  expect(parseLook({ radius: "nope" }, fallback).radius).toBe("auto");
  expect(parseLook({}, fallback).radius).toBe("auto");
  expect(catalog().radii).toBe(RADII);
});

test("export: the file has the variables, the tokens and the rules, in order", () => {
  const out = buildExport({
    vars: ":root {\n  --radius: 0;\n}",
    style: "ant",
    scope: "current",
    tokens: ".ui-button { height: 1px; }",
    rules: ['html[data-style="ant"] { --btn-h: 32; }'],
  });
  expect(out.indexOf("--radius")).toBeLessThan(out.indexOf(".ui-button"));
  expect(out.indexOf(".ui-button")).toBeLessThan(out.indexOf("--btn-h"));
  expect(out).toContain('data-style="ant"');
});

test("export: rules are picked by the style named in their selector, media rules included", () => {
  const doc = document;
  const style = doc.createElement("style");
  style.textContent = `
    html[data-style="ant"] .ui-card { border-radius: 8px; }
    html[data-style="material"] .ui-card { border-radius: 12px; }
    .ui-card { color: red; }
    @media (max-width: 600px) { html[data-style="ant"] .ui-badge { padding: 0; } }`;
  doc.head.appendChild(style);
  const sheets = Array.from(doc.styleSheets);
  expect(styleRulesOf(sheets, "ant")).toHaveLength(2);
  expect(styleRulesOf(sheets, "ant").join("")).not.toContain("material");
  expect(styleRulesOf(sheets, "all")).toHaveLength(3);
});

test("design.css: the consumers come first, then the designs, and the marker splits them", () => {
  const raw = css("design.css");
  const [tokens, designs] = raw.split("/*@designs*/");
  expect(tokens).toContain(".ui-button");
  expect(tokens).not.toContain('data-style="ant"');
  expect(designs).toContain('html[data-style="ant"]');
  expect(designs).toContain('html[data-style="material"]');
});

test("design.css: every variable a design sets is one a component reads", () => {
  const raw = css("design.css");
  const [tokens, designs] = raw.split("/*@designs*/");
  const read = new Set([...tokens.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  // tokens the consumers define themselves (and the palette's own) are fine too
  const defined = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const m of designs.matchAll(/^\s*(--[\w-]+)\s*:/gm)) {
    const name = m[1];
    if (/^--(ant|md)-/.test(name) || /^--(shadow|ring)/.test(name)) continue;
    expect(read.has(name) || defined.has(name), `${name} is set by a design but read by no component`).toBe(true);
  }
});
