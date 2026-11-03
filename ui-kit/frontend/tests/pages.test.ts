// @vitest-environment jsdom
import { expect, test } from "vitest";
import { entries } from "../registry.ts";

/**
 * Boots the whole site like the browser does (main.ts, real plugins, real
 * router) and visits every component's page: it must render, under its own
 * title, with at least one demo, without a message nobody understands.
 */
const matches = (): MediaQueryList =>
  ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;

async function visit(path: string): Promise<void> {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  await new Promise((r) => setTimeout(r, 0));
}

test("every component has a page that renders", async () => {
  window.matchMedia = matches;
  document.body.innerHTML = `<div id="app"></div>`;
  window.history.replaceState(null, "", "/");
  await import("../main.ts");

  expect(document.querySelector(".ui-page-title")?.textContent).toBe(
    "Components",
  );
  expect(document.querySelectorAll(".home__card")).toHaveLength(entries.length);

  const broken: string[] = [];
  for (const entry of entries) {
    await visit(`/${entry.slug}`);
    const title = document.querySelector(".ui-page-title")?.textContent;
    const demos = document.querySelectorAll(".k-demo").length;
    if (title !== entry.title || demos === 0) {
      broken.push(`${entry.slug}: title ${title}, ${demos} demos`);
    }
  }
  expect(broken).toEqual([]);

  await visit("/no-such-component");
  expect(document.querySelector(".not-found")?.textContent).toContain(
    "/no-such-component",
  );
}, 30_000);
