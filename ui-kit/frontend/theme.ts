import type { Effect, Plugin } from "@service-laboratory/pavlus";
import {
  defaultLook,
  type Look,
  type LookPreset,
  parseLook,
  varsOf,
} from "./theming.ts";

/** What the application asks of the page: show this look. */
export interface ThemeEffect extends Effect {
  plugin: "theme";
  type: "apply";
  look: Look;
  /** The CSS variables of the look (computed by the pure `varsOf`). */
  vars: Record<string, string>;
  /** Remember it for the next visit (a template's own look is not remembered). */
  persist: boolean;
}

export const themeEffector = {
  apply: (look: Look, persist = true): ThemeEffect => ({
    plugin: "theme",
    type: "apply",
    look,
    vars: varsOf(look),
    persist,
  }),
};

/** where the look the visitor chose is remembered */
export const LOOK_KEY = "ui-kit-look";
const KEY = LOOK_KEY;

/** The look the visitor chose before, else the system's light or dark. */
export function initialLook(win: Window = window): Look {
  const dark = win.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const fallback = defaultLook(dark ? "dark" : "light");
  try {
    const saved = win.localStorage.getItem(KEY);
    if (saved) return parseLook(JSON.parse(saved), fallback);
  } catch {
    // storage blocked or not JSON: the default
  }
  return fallback;
}

/** A template's look: the defaults, then what the template sets. */
export const presetLook = (
  preset: LookPreset | undefined,
  mode: Look["mode"],
): Look => parseLook({ ...defaultLook(mode), ...preset }, defaultLook(mode));

/**
 * The only code that touches `<html>` for the look: the `dark` / `light`
 * class, the CSS variables, `data-style`. The application just returns
 * `themeEffector.apply(look)`.
 */
export function createThemePlugin(
  doc: Document = document,
): Plugin<ThemeEffect, unknown> {
  let set = new Set<string>();
  return {
    name: "theme",
    handle(effect) {
      if (effect.type !== "apply") return;
      const root = doc.documentElement;
      for (const name of set) {
        if (!(name in effect.vars)) root.style.removeProperty(name);
      }
      for (const [name, value] of Object.entries(effect.vars)) {
        root.style.setProperty(name, value);
      }
      set = new Set(Object.keys(effect.vars));
      root.classList.toggle("dark", effect.look.mode === "dark");
      root.classList.toggle("light", effect.look.mode === "light");
      root.dataset.style = effect.look.style;
      if (!effect.persist) return;
      try {
        doc.defaultView?.localStorage.setItem(KEY, JSON.stringify(effect.look));
      } catch {
        // storage blocked: the look is just not remembered
      }
    },
  };
}
