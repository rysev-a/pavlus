import { expect, test } from "vitest";
import {
  compilePage,
  crumbsOf,
  navOf,
  neighbours,
  parseDoc,
  parseInline,
  plainText,
  slug,
  tocOf,
} from "../blocks/docs-layout/docs.ts";
import { derive, docsState } from "../blocks/docs-layout/docs-layout.ts";

test("slug makes an id from a heading", () => {
  expect(slug("A first schema!")).toBe("a-first-schema");
  expect(slug("  --Hello, World-- ")).toBe("hello-world");
});

test("parseInline finds code, bold, links and page links", () => {
  const runs = parseInline(
    "Use `parse` and **safeParse**, see [docs](https://x.dev) or [intro](page:intro).",
  );
  expect(runs.map((r) => r.k)).toEqual([
    "",
    "code",
    "",
    "b",
    "",
    "a",
    "",
    "page",
    "",
  ]);
  expect(runs[5]).toEqual({
    t: "docs",
    k: "a",
    href: "https://x.dev",
    isPage: false,
    isLink: true,
    dataK: null,
  });
  expect(runs[7]).toEqual({
    t: "intro",
    k: "page",
    href: "intro",
    isPage: true,
    isLink: false,
    dataK: null,
  });
  expect(parseInline("plain")).toEqual([
    { t: "plain", k: "", href: "", isPage: false, isLink: false, dataK: null },
  ]);
});

const SOURCE = `## First

Some **text**
on two lines.

- one
- two \`x\`
  continued

1. step
2. step two

> [!WARNING] Careful
> It is sharp.
> Really.

> [!TIP]
> Just a tip.

\`\`\`ts file.ts
const a = 1;
\`\`\`

| Name | Type |
| --- | --- |
| \`id\` | string |

### Deeper
`;

test("parseDoc turns the Markdown subset into blocks", () => {
  const blocks = parseDoc(SOURCE);
  expect(blocks.map((b) => b.kind)).toEqual([
    "h2",
    "p",
    "ul",
    "ol",
    "callout",
    "callout",
    "code",
    "table",
    "h3",
  ]);
  expect(blocks[0]).toEqual({
    kind: "h2",
    id: "first",
    text: "First",
    isH2: true,
    isH3: false,
  });
  const p = blocks[1];
  expect(p.kind === "p" && p.runs.map((r) => r.t).join("")).toBe(
    "Some text on two lines.",
  );
  const ul = blocks[2];
  expect(ul.kind === "ul" && ul.items).toHaveLength(2);
  expect(ul.kind === "ul" && ul.items[1].map((r) => r.t).join("")).toBe(
    "two x continued",
  );
  expect(blocks[4]).toMatchObject({
    kind: "callout",
    tone: "warning",
    title: "Careful",
    text: "It is sharp. Really.",
  });
  expect(blocks[5]).toMatchObject({ tone: "tip", title: "Tip" });
  const code = blocks[6];
  expect(code.kind === "code" && [code.lang, code.title]).toEqual([
    "ts",
    "file.ts",
  ]);
  const table = blocks[7];
  expect(
    table.kind === "table" && [table.head.length, table.rows.length],
  ).toEqual([2, 1]);
});

test("plainText gathers what a reader can search for", () => {
  const text = plainText(parseDoc(SOURCE));
  for (const word of ["First", "sharp", "const a = 1;", "string", "Deeper"]) {
    expect(text).toContain(word);
  }
});

const pages = [
  {
    id: "a",
    title: "Alpha",
    group: "One",
    summary: "s",
    body: "## A1\n\n### A1a\n\n## A2",
  },
  { id: "b", title: "Beta", group: "Two", summary: "s", body: "text" },
  { id: "c", title: "Gamma", group: "One", summary: "s", body: "text" },
].map(compilePage);

test("navOf groups pages in the order of their first page and marks the current one", () => {
  const nav = navOf(pages, "c", ["two"]);
  expect(nav.map((g) => g.id)).toEqual(["one", "two"]);
  expect(nav[0].pages.map((p) => p.id)).toEqual(["a", "c"]);
  expect(nav[0]).toMatchObject({ open: true, active: true });
  expect(nav[1]).toMatchObject({ open: false, active: false });
  expect(nav[0].pages[1].active).toBe(true);
});

test("tocOf lists the headings with their level", () => {
  expect(tocOf(pages[0])).toEqual([
    { id: "a1", text: "A1", level: 2 },
    { id: "a1a", text: "A1a", level: 3 },
    { id: "a2", text: "A2", level: 2 },
  ]);
  expect(tocOf(pages[1])).toEqual([]);
});

test("neighbours follow the menu, not the list, and stop at the ends", () => {
  // the menu reads One (Alpha, Gamma) then Two (Beta)
  expect(neighbours(pages, "a")).toEqual({
    prev: null,
    next: { id: "c", title: "Gamma", group: "One" },
  });
  expect(neighbours(pages, "c").next?.id).toBe("b");
  expect(neighbours(pages, "b")).toMatchObject({ next: null });
  expect(neighbours(pages, "b").prev?.id).toBe("c");
});

test("crumbsOf: site, group, page", () => {
  expect(crumbsOf(pages, "c", "Docs")).toEqual([
    { title: "Docs", id: "a", sep: false },
    { title: "One", id: "a", sep: true },
    { title: "Gamma", id: "", sep: true },
  ]);
  expect(crumbsOf(pages, "nope", "Docs")).toEqual([]);
});

test("derive and docsState start on the first page", () => {
  const s = docsState("Lib", "v1", [
    { id: "x", title: "X", group: "G", summary: "", body: "## H" },
    { id: "y", title: "Y", group: "G", summary: "", body: "" },
  ]);
  expect(s.current).toBe("x");
  expect(s.page.id).toBe("x");
  expect(s.toc).toHaveLength(1);
  expect(s.next?.id).toBe("y");
  expect(s.items.map((i) => i.id)).toEqual(["x", "y"]);
  // an unknown page falls back to the first
  expect(derive(s.pages, "Lib", "zzz", []).page.id).toBe("x");
});
