// @vitest-environment jsdom
/**
 * The header of the public site: the burger menu and the language switch.
 *
 * The burger is the header's own state (`site.burger`): the button toggles
 * it, the template turns it into the `open` class and the `aria-expanded`,
 * and a click outside the menu closes it (the shell's `closeMenu`).
 *
 * The language switch is a link to the backend (`/api/lang/:code`): the
 * server writes the cookie and sends the visitor back to the page — the
 * original did it with a cookie and a reload.
 */

import { createApp, paintOnWrite } from "@pavlus/frontend";
import {
  createHttpPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import { describe, expect, test } from "vitest";
import { app as shell } from "../app/app.ts";
import { type AppState, initialState } from "../app/state.ts";

/** The shell in a jsdom page (the backend is never asked in this test). */
function mount(): { state: () => AppState } {
  document.body.innerHTML = '<div id="app"></div>';
  const store = createStorePlugin<AppState>({
    ...initialState,
    site: {
      ...initialState.site,
      locales: [
        { code: "en", name: "English", active: true },
        { code: "ru", name: "Русский", active: false },
      ],
    },
  });
  const dom = new DomPlugin();
  // nothing answers here: the pages stay as they are
  const http = createHttpPlugin({
    fetch: () => new Promise(() => {}),
  });
  const router = createRouterPlugin();
  createApp({
    app: paintOnWrite(shell),
    plugins: [store, dom, http, router],
    mount: "#app",
  });
  return { state: () => store.getState() };
}

/** A click on `el` (it bubbles, like a real one). */
const click = (el: Element): void => {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

describe("the header of the public site", () => {
  test("the burger opens and closes the menu", () => {
    const { state } = mount();
    const toggle = document.querySelector("#menu-toggle");
    const menu = document.querySelector("#menu-container");
    expect(toggle).not.toBeNull();
    expect(menu).not.toBeNull();

    // the menu is closed to begin with
    expect(state().site.burger).toBe(false);
    expect(menu?.classList.contains("open")).toBe(false);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");

    // the button opens it
    click(toggle as Element);
    expect(state().site.burger).toBe(true);
    expect(menu?.classList.contains("open")).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    // and closes it again
    click(toggle as Element);
    expect(state().site.burger).toBe(false);
    expect(menu?.classList.contains("open")).toBe(false);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  });

  test("a click outside the menu closes it", () => {
    const { state } = mount();
    const toggle = document.querySelector("#menu-toggle");
    const menu = document.querySelector("#menu-container");
    const shellEl = document.querySelector(".shell");
    expect(toggle).not.toBeNull();
    expect(menu).not.toBeNull();

    click(toggle as Element);
    expect(state().site.burger).toBe(true);

    // a click inside the menu keeps it open (the original did too)
    click(menu as Element);
    expect(state().site.burger).toBe(true);

    // a click outside closes it
    click(shellEl as Element);
    expect(state().site.burger).toBe(false);
    expect(menu?.classList.contains("open")).toBe(false);
  });

  test("the language switch is a link to the backend", () => {
    mount();
    const links = [...document.querySelectorAll(".lang-switch__btn")];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("/api/lang/")).toBe(true);
      expect(href).toContain("next=");
    }
  });
});
