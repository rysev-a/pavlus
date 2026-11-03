// @vitest-environment jsdom
import { expect, test } from "vitest";

/**
 * The stateful demos, driven through the real DOM like a visitor would:
 * a click is a message, the component answers with effects, the DOM plugin
 * patches the page.
 */
const text = (sel: string) => document.querySelector(sel)?.textContent;
const all = (sel: string) =>
  [...document.querySelectorAll(sel)].map((e) => e.textContent);
const click = (sel: string, nth = 0) =>
  (document.querySelectorAll(sel)[nth] as HTMLElement).click();

async function visit(path: string): Promise<void> {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  await new Promise((r) => setTimeout(r, 0));
}

test("tabs, dialog, calendar, data table and the theme respond to clicks", async () => {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  document.body.innerHTML = `<div id="app"></div>`;
  window.history.replaceState(null, "", "/tabs");
  const { store } = await import("../main.ts");

  // tabs
  expect(text(".ui-card-title")).toBe("Account");
  click(".ui-tabs-trigger", 1);
  expect(text(".ui-card-title")).toBe("Password");
  expect(store.getState().tabs).toMatchObject({ active: "password" });

  // dialog: in the DOM only while `open`
  await visit("/dialog");
  expect(document.querySelector(".ui-dialog")).toBeNull();
  click(".k-preview button");
  expect(text(".ui-dialog-title")).toBe("Edit profile");
  click(".ui-dialog-close");
  expect(document.querySelector(".ui-dialog")).toBeNull();

  // calendar
  await visit("/calendar");
  expect(text(".ui-calendar-title")).toBe("November 2026");
  click('[aria-label="Next month"]');
  expect(text(".ui-calendar-title")).toBe("December 2026");
  click(".ui-calendar-day", 14);
  expect(text(".k-state")).toBe("December 15, 2026");

  // data table: sorted by name, then the next page
  await visit("/data-table");
  expect(all(".ui-person-name")[0]).toBe("Ann Lee");
  click(".ui-resource-sort", 0);
  click(".ui-resource-sort", 0);
  expect(all(".ui-person-name")[0]).toBe("Liam Byrne");
  click(".ui-resource-pager button", 1);
  expect(text(".ui-data-footer-controls span")).toBe("Page 2 of 3");

  // the look is a plugin's work: the state says it, the plugin sets the class
  expect(document.documentElement.classList.contains("light")).toBe(true);
  click('[aria-label="Toggle light and dark"]');
  expect(store.getState().look).toMatchObject({ mode: "dark" });
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(document.documentElement.classList.contains("light")).toBe(false);
}, 30_000);
