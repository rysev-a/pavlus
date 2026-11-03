import { expect, test } from "vitest";
import { build } from "vite";

/**
 * jsdom ignores CSS, so a stylesheet that never reaches the bundle passes
 * every other test and ships an unstyled site. This builds the real bundle
 * (as the Pages workflow does, under a base path) and checks the styles and
 * the 404.html GitHub Pages needs to serve a direct load of /pavlus/button.
 */
test("the production bundle has the styles and the Pages fallback", async () => {
  const result = await build({
    root: new URL("../..", import.meta.url).pathname,
    base: "/pavlus/",
    logLevel: "silent",
    build: { write: false },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) =>
    "output" in r ? r.output : [],
  );
  const asset = (name: string) =>
    outputs.find((o) => o.type === "asset" && o.fileName === name) as
      { source: string | Uint8Array } | undefined;

  const css = outputs
    .filter((o) => o.type === "asset" && o.fileName.endsWith(".css"))
    .map((o) => String((o as { source: string | Uint8Array }).source))
    .join("\n");
  for (const selector of [
    ":root", // tokens, from the admin-app stylesheet
    ".ui-shell-header", // shell
    ".ui-sidebar-button", // the navigation
    ".ui-data-table", // a component of the kit
    ".k-demo", // the kit's own rules
    ".k-icon-check", // the icons
  ]) {
    expect(css, `no style for ${selector}`).toContain(selector);
  }

  const index = String(asset("index.html")?.source);
  const fallback = String(asset("404.html")?.source);
  expect(fallback).toBe(index);
  expect(index).toContain('src="/pavlus/assets/');
}, 30_000);
