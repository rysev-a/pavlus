import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { compileTemplate } from "../../../framework/src/compiler/mod.ts";
import { runDemo } from "../docs/demo.ts";
import { type DocBlock, parseMarkdown } from "../docs/markdown.ts";
import { LANGS, PAGES, docsNav, neighbours, slugOf } from "../docs/pages.ts";
import { UI } from "../docs/ui.ts";

const dir = join(process.cwd(), "frontend/docs");
const read = (p: string) => readFileSync(join(dir, p), "utf8");
const exists = (lang: string, slug: string) =>
  readdirSync(join(dir, "content", lang)).includes(`${slug}.md`);

/** The shape of a page: everything a translation must keep. */
const shape = (blocks: DocBlock[]) =>
  blocks.map((b) => {
    switch (b.kind) {
      case "h2":
      case "h3":
        return b.kind;
      case "p":
        return "p";
      case "ul":
      case "ol":
        return `${b.kind}:${b.items.length}`;
      case "code":
        return `code:${b.lang}:${b.lines.map((l) => l.tokens.map((t) => t.t).join("")).join("\n")}`;
      case "callout":
        return `callout:${b.tone}`;
      case "table":
        return `table:${b.head.length}x${b.rows.length}`;
      case "demo":
        return `demo:${b.name}:${b.open.join(",")}`;
      case "playground":
        return "playground";
    }
  });

const text = (b: DocBlock): string =>
  b.kind === "code"
    ? b.lines.map((l) => l.tokens.map((t) => t.t).join("")).join("\n")
    : "";

test("pages: slugs are unique and every page has a title in every language", () => {
  expect(new Set(PAGES.map((p) => p.slug)).size).toBe(PAGES.length);
  for (const p of PAGES) for (const l of LANGS) expect(p.title[l].length).toBeGreaterThan(0);
});

test("pages: the menu, the neighbours and the paths", () => {
  expect(docsNav("de")[0].title).toBe("Erste Schritte");
  expect(docsNav("en").flatMap((g) => g.items)).toHaveLength(PAGES.length);
  expect(slugOf("/docs")).toBe("overview");
  expect(slugOf("/docs/compiler-diff")).toBe("compiler-diff");
  expect(neighbours("overview", "en").prev).toBeNull();
  expect(neighbours("overview", "en").next?.slug).toBe("quick-start");
  expect(neighbours(PAGES.at(-1)!.slug, "en").next).toBeNull();
});

test("ui: every language has every word", () => {
  const keys = (o: unknown): string[] =>
    Object.entries(o as object).flatMap(([k, v]) =>
      typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k],
    );
  for (const l of LANGS) expect(keys(UI[l])).toEqual(keys(UI.en));
});

test("markdown: blocks of the subset", () => {
  const doc = parseMarkdown(
    "---\nsummary: Hi.\n---\n## One\n\ntext with `code`\n\n- a\n- b\n\n```pavlus x.pavlus\np hi\n```\n\n::demo d open=ast\n\n> [!TIP] T\n> body\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n",
  );
  expect(doc.summary).toBe("Hi.");
  expect(shape(doc.blocks)).toEqual([
    "h2",
    "p",
    "ul:2",
    "code:pavlus:p hi",
    "demo:d:ast",
    "callout:tip",
    "table:2x1",
  ]);
});

describe.each(PAGES.map((p) => p.slug))("docs page %s", (slug) => {
  test("english text exists and is complete", () => {
    expect(exists("en", slug), `content/en/${slug}.md`).toBe(true);
    const doc = parseMarkdown(read(`content/en/${slug}.md`));
    expect(doc.summary.length).toBeGreaterThan(20);
    expect(doc.blocks.filter((b) => b.kind === "h2").length).toBeGreaterThanOrEqual(3);
    expect(doc.blocks.length).toBeGreaterThan(12);
  });

  test("its demos exist, compile and run", async () => {
    const doc = parseMarkdown(read(`content/en/${slug}.md`));
    const names = doc.blocks.flatMap((b) => (b.kind === "demo" ? [b.name] : []));
    if (names.length === 0) return;
    const { demos } = await import(`../docs/demos/${slug}.ts`);
    for (const n of names) {
      expect(demos[n], `demo ${n}`).toBeDefined();
      const view = runDemo(n, demos[n]);
      expect(view.error, `demo ${n}`).toBe("");
    }
    // no demo goes unused
    for (const n of Object.keys(demos)) expect(names, `unused demo ${n}`).toContain(n);
  });

  test("its pavlus code blocks compile", () => {
    const doc = parseMarkdown(read(`content/en/${slug}.md`));
    for (const b of doc.blocks) {
      if (b.kind === "code" && b.lang === "pavlus") {
        expect(() => compileTemplate(text(b), { filename: "x.pavlus" }), text(b)).not.toThrow();
      }
    }
  });

  test.each(LANGS.filter((l) => l !== "en"))("%s keeps the shape of the english page", (lang) => {
    expect(exists(lang, slug), `content/${lang}/${slug}.md`).toBe(true);
    const en = parseMarkdown(read(`content/en/${slug}.md`));
    const tr = parseMarkdown(read(`content/${lang}/${slug}.md`));
    expect(tr.summary.length).toBeGreaterThan(5);
    expect(shape(tr.blocks)).toEqual(shape(en.blocks));
  });
});
