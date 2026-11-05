import { createContext, effect, html, signal } from "../../src/mod.ts";
import type { Child, Signal } from "../../src/mod.ts";

export type Theme = "light" | "dark";

/** The context value is a signal, so consumers react to changes without re-providing. */
export const ThemeContext = createContext<Signal<Theme>>(
  signal<Theme>("light"),
);

export function useTheme() {
  const theme = ThemeContext.use();
  return {
    theme,
    toggle: () => theme.update((t) => (t === "dark" ? "light" : "dark")),
  };
}

/**
 * Provide a theme to `children`. The initial value comes from storage, then
 * from the system preference. Changes are written back and reflected on `root`.
 */
export function ThemeProvider(props: {
  children: () => Child;
  storage?: Pick<Storage, "getItem" | "setItem">;
  prefersDark?: () => boolean;
  root?: HTMLElement;
}) {
  const storage = props.storage;
  const stored = storage?.getItem("theme");
  const initial: Theme =
    stored === "dark" || stored === "light"
      ? stored
      : props.prefersDark?.()
        ? "dark"
        : "light";
  const theme = signal<Theme>(initial);
  const root = props.root ?? document.documentElement;
  effect(() => {
    root.dataset.theme = theme();
    storage?.setItem("theme", theme());
  });
  return ThemeContext.provide(theme, props.children);
}

export function ThemeButton() {
  const { theme, toggle } = useTheme();
  return html`<button @click=${toggle}>theme: ${theme}</button>`;
}
