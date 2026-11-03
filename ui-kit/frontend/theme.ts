import type { Effect, Plugin } from "@service-laboratory/pavlus";

export type Theme = "light" | "dark";

export interface ThemeEffect extends Effect {
  plugin: "theme";
  type: "set";
  theme: Theme;
}

/** Builds the effect the theme plugin handles (see `themeEffector.set`). */
export const themeEffector = {
  set: (theme: Theme): ThemeEffect => ({ plugin: "theme", type: "set", theme }),
};

const KEY = "ui-kit-theme";

/** The theme the visitor chose before, else the one the system prefers. */
export function initialTheme(win: Window = window): Theme {
  try {
    const saved = win.localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // storage blocked: fall through to the system preference
  }
  return win.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * The only code that touches `<html>` for the theme: the tokens in
 * styles.css switch on its `dark` / `light` class. The application just
 * returns `themeEffector.set(...)`.
 */
export function createThemePlugin(
  doc: Document = document,
): Plugin<ThemeEffect, unknown> {
  return {
    name: "theme",
    handle(effect) {
      if (effect.type !== "set") return;
      const root = doc.documentElement;
      root.classList.toggle("dark", effect.theme === "dark");
      root.classList.toggle("light", effect.theme === "light");
      try {
        doc.defaultView?.localStorage.setItem(KEY, effect.theme);
      } catch {
        // storage blocked: the theme just is not remembered
      }
    },
  };
}
