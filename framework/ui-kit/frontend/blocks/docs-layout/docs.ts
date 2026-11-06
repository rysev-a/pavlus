/**
 * The pure functions of the docs layout: a small Markdown subset becomes
 * blocks, pages become a menu, a table of contents and neighbours.
 */
import { type CodeLine, codeLines } from "../code-block/code-block.ts";
import type { SearchItem } from "../search-box/search-box.ts";

/** A piece of a line of text: plain, `code`, bold, an external link or a link to a page. */
export interface Inline {
  t: string;
  k: "" | "code" | "b" | "a" | "page";
  /** For a link: the address, or the id of the page. */
  href: string;
}

export type DocBlock =
  | { kind: "h2" | "h3"; id: string; text: string }
  | { kind: "p"; runs: Inline[] }
  | { kind: "ul" | "ol"; items: Inline[][] }
  | { kind: "code"; lang: string; title: string; lines: CodeLine[] }
  | { kind: "callout"; tone: string; title: string; text: string }
  | { kind: "table"; head: Inline[][]; rows: Inline[][][] };

/** A page as written: the body is Markdown. */
export interface DocSource {
  id: string;
  title: string;
  group: string;
  summary: string;
  body: string;
}

/** A page ready to show, with its plain text for the search. */
export interface DocPage {
  id: string;
  title: string;
  group: string;
  summary: string;
  blocks: DocBlock[];
  text: string;
}

export const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

/** Pure: `code`, **bold**, [text](https://...) and [text](page:id) in a line. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: text.slice(last, at), k: "", href: "" });
    if (m[1] !== undefined) out.push({ t: m[1], k: "code", href: "" });
    else if (m[2] !== undefined) out.push({ t: m[2], k: "b", href: "" });
    else {
      const page = m[4].startsWith("page:");
      out.push({
        t: m[3],
        k: page ? "page" : "a",
        href: page ? m[4].slice(5) : m[4],
      });
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), k: "", href: "" });
  return out;
}

const plain = (runs: Inline[]): string => runs.map((r) => r.t).join("");

const LIST = /^(?:[-*]|\d+\.)\s+(.*)$/;
const TONES = ["note", "tip", "warning", "danger"];

const startsBlock = (line: string): boolean =>
  /^(#{2,3}\s|```|>\s*\[!|\|)/.test(line) || LIST.test(line);

/**
 * Pure: a small Markdown subset as blocks: `##` and `###` headings, paragraphs,
 * `-` and `1.` lists, fenced code (```ts title), `> [!NOTE] Title` callouts
 * (NOTE, TIP, WARNING, DANGER) and pipe tables.
 */
export function parseDoc(source: string): DocBlock[] {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: DocBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = /^```(\S*)\s*(.*)$/.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```"))
        code.push(lines[i++]);
      i++;
      const lang = fence[1] || "text";
      blocks.push({
        kind: "code",
        lang,
        title: fence[2],
        lines: codeLines(code.join("\n"), lang),
      });
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      const text = heading[2].trim();
      blocks.push({
        kind: heading[1].length === 2 ? "h2" : "h3",
        id: slug(text),
        text,
      });
      i++;
      continue;
    }

    const callout = /^>\s*\[!(\w+)\]\s*(.*)$/.exec(line);
    if (callout && TONES.includes(callout[1].toLowerCase())) {
      const tone = callout[1].toLowerCase();
      const text: string[] = [];
      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        text.push(lines[i].replace(/^>\s?/, "").trim());
        i++;
      }
      blocks.push({
        kind: "callout",
        tone,
        title: callout[2].trim() || tone[0].toUpperCase() + tone.slice(1),
        // a callout is plain text: marks are dropped, the words stay
        text: plain(parseInline(text.join(" ").trim())),
      });
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i]
          .replace(/^\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head = [], ...body] = rows;
      blocks.push({
        kind: "table",
        head: head.map(parseInline),
        rows: body.map((r) => r.map(parseInline)),
      });
      continue;
    }

    const first = LIST.exec(line);
    if (first) {
      const ordered = /^\d/.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]);
        if (m) items.push(m[1]);
        else if (/^\s{2,}\S/.test(lines[i]) && items.length)
          items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
        i++;
      }
      blocks.push({
        kind: ordered ? "ol" : "ul",
        items: items.map(parseInline),
      });
      continue;
    }

    const text: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
      text.push(lines[i].trim());
      i++;
    }
    if (text.length === 0) {
      i++;
      continue;
    }
    blocks.push({ kind: "p", runs: parseInline(text.join(" ")) });
  }
  return blocks;
}

/** Pure: the text of the blocks, for the search. */
export function plainText(blocks: DocBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case "h2":
      case "h3":
        parts.push(b.text);
        break;
      case "p":
        parts.push(plain(b.runs));
        break;
      case "ul":
      case "ol":
        parts.push(...b.items.map(plain));
        break;
      case "code":
        parts.push(
          b.lines.map((l) => l.tokens.map((t) => t.t).join("")).join(" "),
        );
        break;
      case "callout":
        parts.push(b.title, b.text);
        break;
      case "table":
        parts.push(
          ...b.head.map(plain),
          ...b.rows.flatMap((r) => r.map(plain)),
        );
        break;
    }
  }
  return parts.join(" ");
}

export function compilePage(src: DocSource): DocPage {
  const blocks = parseDoc(src.body);
  return {
    id: src.id,
    title: src.title,
    group: src.group,
    summary: src.summary,
    blocks,
    text: `${src.summary} ${plainText(blocks)}`,
  };
}

export const searchItemsOf = (pages: DocPage[]): SearchItem[] =>
  pages.map((p) => ({
    id: p.id,
    title: p.title,
    group: p.group,
    body: p.text,
  }));

export interface NavPage {
  id: string;
  title: string;
  active: boolean;
}

export interface NavGroup {
  id: string;
  title: string;
  open: boolean;
  /** The group holds the page being read. */
  active: boolean;
  pages: NavPage[];
}

/** Pure: the menu. Groups come in the order of their first page. */
export function navOf(
  pages: DocPage[],
  current: string,
  closed: string[],
): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const p of pages) {
    const id = slug(p.group);
    let g = groups.find((x) => x.id === id);
    if (!g) {
      g = {
        id,
        title: p.group,
        open: !closed.includes(id),
        active: false,
        pages: [],
      };
      groups.push(g);
    }
    const active = p.id === current;
    if (active) g.active = true;
    g.pages.push({ id: p.id, title: p.title, active });
  }
  return groups;
}

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Pure: the headings of a page: the table of contents. */
export function tocOf(page: DocPage): TocItem[] {
  const toc: TocItem[] = [];
  for (const b of page.blocks) {
    if (b.kind === "h2" || b.kind === "h3")
      toc.push({ id: b.id, text: b.text, level: b.kind === "h2" ? 2 : 3 });
  }
  return toc;
}

export interface Neighbour {
  id: string;
  title: string;
  group: string;
}

/** Pure: the page before and the page after, in the order of the menu (null at the ends). */
export function neighbours(
  pages: DocPage[],
  current: string,
): { prev: Neighbour | null; next: Neighbour | null } {
  // the menu lists groups in order, so read the pages the same way
  const ordered = navOf(pages, current, []).flatMap((g) =>
    g.pages.map((p) => pages.find((x) => x.id === p.id) as DocPage),
  );
  const at = ordered.findIndex((p) => p.id === current);
  const pick = (p: DocPage | undefined): Neighbour | null =>
    p ? { id: p.id, title: p.title, group: p.group } : null;
  return {
    prev: at > 0 ? pick(ordered[at - 1]) : null,
    next: at !== -1 ? pick(ordered[at + 1]) : null,
  };
}

export interface Crumb {
  title: string;
  /** The page it opens; empty for the page itself. */
  id: string;
}

/** Pure: Docs > group > page. The first two open the first page of their level. */
export function crumbsOf(
  pages: DocPage[],
  current: string,
  site: string,
): Crumb[] {
  const page = pages.find((p) => p.id === current);
  if (!page) return [];
  const firstOfGroup = pages.find((p) => p.group === page.group);
  return [
    { title: site, id: pages[0].id },
    { title: page.group, id: firstOfGroup?.id ?? page.id },
    { title: page.title, id: "" },
  ];
}
