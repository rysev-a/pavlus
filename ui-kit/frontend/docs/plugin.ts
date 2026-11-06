import type { Effect, Plugin } from "@service-laboratory/pavlus";
import { type Demo, type DemoView } from "./demo.ts";
import { type DocBlock, parseMarkdown } from "./markdown.ts";
import { type Lang } from "./pages.ts";

/**
 * Everything the Docs do that is not pure: fetch the Markdown of a page, load
 * the compiler on demand and run the demos, remember the language. The
 * application only asks (`docsEffector.load`) and gets the finished page back
 * as a message; `buildDoc` below is the pure part.
 */

/** A block as the template shows it: a demo block carries its compiled `view`. */
export type ViewBlock =
  | Exclude<DocBlock, { kind: "demo" }>
  | { kind: "demo"; name: string; view: DemoView | null; missing: boolean };

export interface DocView {
  slug: string;
  lang: Lang;
  summary: string;
  blocks: (ViewBlock & { i: number })[];
  toc: { id: string; text: string; level: 2 | 3 }[];
}

/** Pure: a page as parsed, with the compiled demos filled in. */
export function buildDoc(
  slug: string,
  lang: Lang,
  markdown: string,
  demos: Record<string, Demo>,
  run: (name: string, demo: Demo, open: string[]) => DemoView,
): DocView {
  const parsed = parseMarkdown(markdown);
  const blocks = parsed.blocks.map((b, i): ViewBlock & { i: number } => {
    if (b.kind !== "demo") return { ...b, i };
    const demo = demos[b.name];
    return demo
      ? {
          kind: "demo",
          name: b.name,
          view: run(b.name, demo, b.open),
          missing: false,
          i,
        }
      : { kind: "demo", name: b.name, view: null, missing: true, i };
  });
  const toc = parsed.blocks.flatMap((b) =>
    b.kind === "h2" || b.kind === "h3"
      ? [{ id: b.id, text: b.text, level: (b.kind === "h2" ? 2 : 3) as 2 | 3 }]
      : [],
  );
  return { slug, lang, summary: parsed.summary, blocks, toc };
}

// ---- the plugin ----

export type DocsEffect = Effect & { plugin: "docs" } & (
    | {
        type: "load";
        slug: string;
        lang: Lang;
        onSuccess: string;
        onError: string;
      }
    | { type: "run"; template: string; state: string; onSuccess: string }
    | { type: "remember"; lang: Lang }
    | {
        type: "trace";
        template: string;
        prev: string;
        next: string;
        onSuccess: string;
        onError: string;
      }
  );

export const docsEffector = {
  load: (
    slug: string,
    lang: Lang,
    onSuccess: string,
    onError: string,
  ): DocsEffect => ({
    plugin: "docs",
    type: "load",
    slug,
    lang,
    onSuccess,
    onError,
  }),
  /** Compile `template` and run it with the JSON `state` (the playground). */
  run: (template: string, state: string, onSuccess: string): DocsEffect => ({
    plugin: "docs",
    type: "run",
    template,
    state,
    onSuccess,
  }),
  /** Run every stage of the template engine on a template (the Template engine page). */
  trace: (
    template: string,
    prev: string,
    next: string,
    onSuccess: string,
    onError: string,
  ): DocsEffect => ({
    plugin: "docs",
    type: "trace",
    template,
    prev,
    next,
    onSuccess,
    onError,
  }),
  remember: (lang: Lang): DocsEffect => ({
    plugin: "docs",
    type: "remember",
    lang,
  }),
};

const markdown = import.meta.glob<string>("./content/*/*.md", {
  query: "?raw",
  import: "default",
});
const demoModules = import.meta.glob<{ demos: Record<string, Demo> }>(
  "./demos/*.ts",
);

export function createDocsPlugin(
  doc: Document = document,
): Plugin<DocsEffect, unknown> {
  return {
    name: "docs",
    handle(effect, ctx) {
      if (effect.type === "remember") {
        try {
          doc.defaultView?.localStorage.setItem(
            "ui-kit-docs-lang",
            effect.lang,
          );
        } catch {
          // storage blocked: the language is just not remembered
        }
        return;
      }
      if (effect.type === "trace") {
        import("../engine/trace.ts").then(
          ({ traceTemplate }) =>
            ctx.dispatch({
              id: effect.onSuccess,
              payload: traceTemplate(effect.template, effect.prev, effect.next),
            }),
          () => ctx.dispatch({ id: effect.onError, payload: null }),
        );
        return;
      }
      if (effect.type === "run") {
        import("./demo.ts").then(({ runDemo }) => {
          let value: unknown;
          let error = "";
          try {
            value = JSON.parse(effect.state || "null");
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
          }
          ctx.dispatch({
            id: effect.onSuccess,
            payload: error
              ? { stateError: error, view: null }
              : {
                  stateError: "",
                  view: runDemo(
                    "playground",
                    { template: effect.template, state: value },
                    ["module", "ast"],
                  ),
                },
          });
        });
        return;
      }
      const { slug, lang } = effect;
      const text = markdown[`./content/${lang}/${slug}.md`];
      if (!text) {
        ctx.dispatch({ id: effect.onError, payload: slug });
        return;
      }
      Promise.all([
        text(),
        import("./demo.ts"),
        demoModules[`./demos/${slug}.ts`]?.() ?? Promise.resolve({ demos: {} }),
      ]).then(
        ([md, { runDemo }, { demos }]) =>
          ctx.dispatch({
            id: effect.onSuccess,
            payload: buildDoc(slug, lang, md, demos, runDemo),
          }),
        () => ctx.dispatch({ id: effect.onError, payload: slug }),
      );
    },
  };
}
