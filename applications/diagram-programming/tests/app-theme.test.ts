// @vitest-environment jsdom
// The theme of the app: a rule for the frame of the designed interface, not <html>.
import { describe, expect, it } from "vitest";
import {
  defaultLook,
  withTheme,
} from "../../../framework/ui-kit/src/theming.ts";
import {
  appThemeEffector,
  createAppThemePlugin,
  ruleOf,
  STYLE_ID,
} from "../frontend/app-theme.ts";

const ocean = withTheme(defaultLook("dark"), "ocean", "dark");

function setup() {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("style");
  document.documentElement.className = "";
  const doc = document;
  const plugin = createAppThemePlugin(doc);
  const ctx = { dispatch() {}, getState: () => ({}), dispatchEffect() {} };
  return {
    doc,
    apply: (l: Parameters<typeof appThemeEffector.apply>[0]) =>
      plugin.handle(appThemeEffector.apply(l), ctx),
  };
}

describe("the app theme", () => {
  it("sets the variables of the theme on the frame, and nothing on <html>", () => {
    const { doc, apply } = setup();
    apply(ocean);
    const css = doc.getElementById(STYLE_ID)?.textContent ?? "";
    expect(css.startsWith(".vb-frame {")).toBe(true);
    expect(css).toContain("--background: hsl(205 ");
    expect(doc.documentElement.getAttribute("style")).toBeNull();
    expect(doc.documentElement.className).toBe("");
  });

  it("changing the theme rewrites the one rule", () => {
    const { doc, apply } = setup();
    apply(ocean);
    apply(withTheme(defaultLook("dark"), "rose", "dark"));
    expect(doc.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1);
    expect(doc.getElementById(STYLE_ID)?.textContent).not.toContain("hsl(205 ");
  });

  it("null takes it off: the app follows the editor again", () => {
    const { doc, apply } = setup();
    apply(ocean);
    apply(null);
    expect(doc.getElementById(STYLE_ID)).toBeNull();
    apply(null);
  });

  it("is a rule of declarations", () => {
    expect(ruleOf({ "--a": "1", "--b": "2" })).toBe(
      ".vb-frame {\n  --a: 1;\n  --b: 2;\n}",
    );
  });
});
