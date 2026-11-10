import type { Effect, Plugin } from "@pavlus/client";

/**
 * Export of the look as a stylesheet. The application only asks
 * (`exportEffector.css`) with the look's variables as CSS; this plugin is the
 * code that may read the page's stylesheets, put a file on the visitor's disk
 * and the text on the clipboard, and it answers with a message.
 */

export interface ExportEffect extends Effect {
  plugin: "export";
  type: "css";
  /** The look's variables, from `cssOf(look)`. */
  vars: string;
  /** The style on screen: `ant`... */
  style: string;
  /** This style only, or every style the kit has. */
  scope: "current" | "all";
  onDone: string;
}

export const exportEffector = {
  css: (
    vars: string,
    style: string,
    scope: "current" | "all",
    onDone: string,
  ): ExportEffect => ({
    plugin: "export",
    type: "css",
    vars,
    style,
    scope,
    onDone,
  }),
};

/** Every style rule of the page whose selector names a style (`[data-style="ant"]`). */
export function styleRulesOf(
  sheets: Iterable<CSSStyleSheet>,
  style: string | "all",
): string[] {
  const wanted =
    style === "all"
      ? /\[data-style="[\w-]+"\]/
      : new RegExp(`\\[data-style="${style}"\\]`);
  const out: string[] = [];
  const walk = (rules: CSSRuleList, wrap: (css: string) => string) => {
    for (const rule of Array.from(rules)) {
      // duck typing: a rule of another document is not an instance of this window's classes
      if ("conditionText" in rule && "cssRules" in rule) {
        const media = rule as CSSMediaRule;
        walk(media.cssRules, (css) =>
          wrap(`@media ${media.conditionText} {\n${css}\n}`),
        );
      } else if ("selectorText" in rule) {
        const r = rule as CSSStyleRule;
        if (wanted.test(r.selectorText)) out.push(wrap(r.cssText));
      }
    }
  };
  for (const sheet of sheets) {
    try {
      walk(sheet.cssRules, (css) => css);
    } catch {
      // a cross-origin sheet cannot be read: it has no rules of ours
    }
  }
  return out;
}

/** Pure: the text of the file. */
export function buildExport(parts: {
  vars: string;
  style: string;
  scope: "current" | "all";
  tokens: string;
  rules: string[];
}): string {
  const what =
    parts.scope === "all"
      ? 'every style (set <html data-style="..."> to pick one)'
      : `the "${parts.style}" style (set <html data-style="${parts.style}">)`;
  return [
    `/* pavlus ui-kit: ${what}. Add the class "dark" or "light" to <html> for the mode. */`,
    "",
    "/* 1. Colours, font, sizes and corners of your look. */",
    parts.vars,
    "",
    "/* 2. The component tokens and what reads them (button, field, card, tabs, switch...). */",
    parts.tokens.trim(),
    "",
    `/* 3. ${parts.scope === "all" ? "The rules and variables of every style" : "The rules and variables of this style"}. */`,
    parts.rules.join("\n"),
    "",
  ].join("\n");
}

export interface Exported {
  file: string;
  bytes: number;
  copied: boolean;
}

export function createExportPlugin(
  doc: Document = document,
): Plugin<ExportEffect, unknown> {
  return {
    name: "export",
    handle(effect, ctx) {
      if (effect.type !== "css") return;
      void import("./design.css?raw").then(async ({ default: raw }) => {
        const tokens = raw.split("/*@designs*/")[0];
        const rules = styleRulesOf(
          Array.from(doc.styleSheets),
          effect.scope === "all" ? "all" : effect.style,
        );
        const text = buildExport({
          vars: effect.vars,
          style: effect.style,
          scope: effect.scope,
          tokens,
          rules,
        });
        const file =
          effect.scope === "all"
            ? "pavlus-all-styles.css"
            : `pavlus-theme-${effect.style}.css`;
        const win = doc.defaultView;
        let copied = false;
        try {
          await win?.navigator.clipboard.writeText(text);
          copied = true;
        } catch {
          // no clipboard (insecure page, denied): the file is still saved
        }
        try {
          const url = win!.URL.createObjectURL(
            new Blob([text], { type: "text/css" }),
          );
          const a = doc.createElement("a");
          a.href = url;
          a.download = file;
          doc.body.appendChild(a);
          a.click();
          a.remove();
          win!.setTimeout(() => win!.URL.revokeObjectURL(url), 1000);
        } catch {
          // no download in this environment
        }
        ctx.dispatch({
          id: effect.onDone,
          payload: { file, bytes: text.length, copied } satisfies Exported,
        });
      });
    },
  };
}
