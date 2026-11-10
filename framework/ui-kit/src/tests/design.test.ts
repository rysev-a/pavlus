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
  STYLES,
  varsOf,
  withChoice,
  withTheme,
} from "../theming.ts";

const css = (name: string) =>
  readFileSync(join(process.cwd(), "src", name), "utf8");

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
  const casual = withChoice({ ...base, radius: "lg" }, "radius", "lg");
  expect(varsOf({ ...casual, style: "casual" })["--radius"]).toBe("0.875rem");
  expect(varsOf({ ...base, style: "casual" })["--radius"]).toBe("1rem");
});

test("corners: a style, or a theme with its bundle, brings its own again", () => {
  const look = withChoice(defaultLook("light"), "radius", "xl");
  expect(withChoice(look, "style", "casual").radius).toBe("auto");
  expect(withTheme(look, "zinc", "light").radius).toBe("auto");
  expect(withTheme({ ...look, bundle: false }, "zinc", "light").radius).toBe(
    "xl",
  );
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
    style: "cs",
    scope: "current",
    tokens: ".ui-button { height: 1px; }",
    rules: ['html[data-style="cs"] { --shadow-xs: none; }'],
  });
  expect(out.indexOf("--radius")).toBeLessThan(out.indexOf(".ui-button"));
  expect(out.indexOf(".ui-button")).toBeLessThan(out.indexOf("--shadow-xs"));
  expect(out).toContain('data-style="cs"');
});

test("export: rules are picked by the style named in their selector, media rules included", () => {
  const doc = document;
  const style = doc.createElement("style");
  style.textContent = `
    html[data-style="cs"] .ui-card { border-radius: 2px; }
    html[data-style="casual"] .ui-card { border-radius: 16px; }
    .ui-card { color: red; }
    @media (max-width: 600px) { html[data-style="cs"] .ui-badge { padding: 0; } }`;
  doc.head.appendChild(style);
  const sheets = Array.from(doc.styleSheets);
  expect(styleRulesOf(sheets, "cs")).toHaveLength(2);
  expect(styleRulesOf(sheets, "cs").join("")).not.toContain("casual");
  expect(styleRulesOf(sheets, "all")).toHaveLength(3);
});

test("design.css: the consumers come first, and the marker that splits them from designs is there", () => {
  const raw = css("design.css");
  const parts = raw.split("/*@designs*/");
  expect(parts).toHaveLength(2);
  expect(parts[0]).toContain(".ui-button");
  expect(parts[0]).not.toContain("data-style=");
});

test("kit.css: every style of the catalog but the default has its rules", () => {
  const kit = css("kit.css");
  for (const s of STYLES) {
    if (s.id === "default") continue;
    expect(kit, s.id).toContain(`html[data-style="${s.id}"]`);
  }
  // and no rules are left for styles that are gone
  for (const gone of ["ant", "material", "bulma", "flowbite", "radix", "mdn"]) {
    expect(kit, gone).not.toContain(`html[data-style="${gone}"]`);
  }
});
