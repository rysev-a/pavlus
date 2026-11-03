import { expect, test } from "vitest";
import { build } from "vite";

/**
 * jsdom ignores CSS, so a stylesheet that never reaches the bundle passes
 * every other test and ships an unstyled page. This builds the real bundle
 * and checks the one stylesheet (`styles.css`: the ui_kit plus the app) is in.
 */
test("the production bundle has the styles of every page", async () => {
  const result = await build({
    root: new URL("../..", import.meta.url).pathname,
    logLevel: "silent",
    build: { write: false },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) =>
    "output" in r ? r.output : [],
  );
  const css = outputs
    .filter((o) => o.type === "asset" && o.fileName.endsWith(".css"))
    .map((o) => String((o as { source: string | Uint8Array }).source))
    .join("\n");

  const selectors = [
    ":root", // tokens
    ".ui-shell-header", // shell
    ".ui-tabs-trigger", // dashboard tabs
    ".ui-card", // pages
    ".ui-table", // users table, roles
    ".ui-button", // actions
    ".users__item--selected", // app rules
    ".top-menu__link--active",
  ];
  for (const selector of selectors) {
    expect(css, `no style for ${selector}`).toContain(selector);
  }
}, 20_000);
