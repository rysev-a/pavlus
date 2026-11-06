// The colour theme of the app being designed.
//
// The editors (the bar, the panels, the diagram) wear the editor's theme: the ui-kit
// theme plugin sets it on <html>. The interface a person designs is a different
// thing: a coffee shop's front desk should have the colours of the coffee shop. The
// Visual Builder draws it in a frame (`.vb-frame`, on the design canvas and in the
// preview), so the app's theme is the same CSS variables set on that frame only,
// which every block and element inside it reads. A <style> rule survives the
// repaints of the frame, which an inline style on it would not.
import type { Effect, Plugin } from "@service-laboratory/pavlus";
import { varsOf } from "../../ui-kit/frontend/theming.ts";
import type { Look } from "../../ui-kit/frontend/theming.ts";

export type AppThemeEffect = Effect & {
  plugin: "app-theme";
  type: "apply";
  /** the variables of the theme, or null: the app wears the editor's theme */
  vars: Record<string, string> | null;
};

export const appThemeEffector = {
  /** `null` takes the theme off: the interface follows the editor's. */
  apply: (look: Look | null): AppThemeEffect => ({
    plugin: "app-theme",
    type: "apply",
    vars: look ? varsOf(look) : null,
  }),
};

/** the rule that gives a frame its theme */
export function ruleOf(vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `.vb-frame {\n${lines.join("\n")}\n}`;
}

export const STYLE_ID = "vd-app-theme";

export function createAppThemePlugin(
  doc: Document = document,
): Plugin<AppThemeEffect, unknown> {
  return {
    name: "app-theme",
    handle(effect) {
      if (effect.type !== "apply") return;
      let el = doc.getElementById(STYLE_ID);
      if (!effect.vars) {
        el?.remove();
        return;
      }
      if (!el) {
        el = doc.createElement("style");
        el.id = STYLE_ID;
        doc.head.append(el);
      }
      el.textContent = ruleOf(effect.vars);
    },
  };
}
