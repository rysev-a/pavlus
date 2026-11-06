/**
 * The pages of the Docs are Markdown: a small subset, parsed by this pure
 * function into blocks the template shows. Beyond what any Markdown has:
 *
 * - a front-matter line `summary: ...` between two `---` lines;
 * - `> [!TIP] Title` callouts (NOTE, TIP, WARNING, DANGER);
 * - fenced code with a language and an optional title: ```pavlus app.pavlus
 *   (`pavlus` fences must compile: the tests check; use `pavlus-invalid` to
 *   show a template that does not);
 * - `::demo name` (and `::demo name open=module,ast`): the demo `name` of the
 *   page's `demos/<slug>.ts`, compiled and run live by the real compiler;
 * - `::playground`: the editable playground.
 */
import { type Inline, parseInline } from "../blocks/docs-layout/docs.ts";
import { highlight, type Line } from "../source.ts";

export type { Inline };

export type DocBlock =
  | { kind: "h2" | "h3"; id: string; text: string }
  | { kind: "p"; runs: Inline[] }
  | { kind: "ul" | "ol"; items: Inline[][] }
  | { kind: "code"; lang: string; title: string; lines: Line[] }
  | { kind: "callout"; tone: string; title: string; runs: Inline[] }
  | { kind: "table"; head: Inline[][]; rows: Inline[][][] }
  | { kind: "demo"; name: string; open: string[] }
  | { kind: "playground" };

export interface ParsedDoc {
  summary: string;
  blocks: DocBlock[];
}

const LIST = /^(?:[-*]|\d+\.)\s+(.*)$/;
const TONES = ["note", "tip", "warning", "danger"];

/** The file name the highlighter reads the kind of language from. */
export const fileOfLang = (lang: string): string =>
  lang === "pavlus" || lang === "pavlus-invalid"
    ? "x.pavlus"
    : lang === "css"
      ? "x.css"
      : lang === "ts" || lang === "js" || lang === "json" || lang === "tsx"
        ? "x.ts"
        : "x.txt";

const startsBlock = (line: string): boolean =>
  /^(#{2,3}\s|```|>\s*\[!|\||::)/.test(line) || LIST.test(line);

export function parseMarkdown(source: string): ParsedDoc {
  let text = source.replace(/\r/g, "");
  let summary = "";
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    summary = /^summary:\s*(.*)$/m.exec(fm[1])?.[1].trim() ?? "";
    text = text.slice(fm[0].length);
  }
  const lines = text.split("\n");
  const blocks: DocBlock[] = [];
  let heading = 0;
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
        lines: highlight(fileOfLang(lang), code.join("\n")),
      });
      continue;
    }

    const demo = /^::demo\s+([\w-]+)(?:\s+open=([\w,]+))?\s*$/.exec(line);
    if (demo) {
      blocks.push({
        kind: "demo",
        name: demo[1],
        open: demo[2] ? demo[2].split(",") : [],
      });
      i++;
      continue;
    }
    if (/^::playground\s*$/.test(line)) {
      blocks.push({ kind: "playground" });
      i++;
      continue;
    }

    const head = /^(#{2,3})\s+(.*)$/.exec(line);
    if (head) {
      blocks.push({
        kind: head[1].length === 2 ? "h2" : "h3",
        id: `h-${heading++}`,
        text: head[2].trim(),
      });
      i++;
      continue;
    }

    const callout = /^>\s*\[!(\w+)\]\s*(.*)$/.exec(line);
    if (callout && TONES.includes(callout[1].toLowerCase())) {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        body.push(lines[i].replace(/^>\s?/, "").trim());
        i++;
      }
      blocks.push({
        kind: "callout",
        tone: callout[1].toLowerCase(),
        title: callout[2].trim(),
        runs: parseInline(body.join(" ").trim()),
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
      const [first = [], ...rest] = rows;
      blocks.push({
        kind: "table",
        head: first.map(parseInline),
        rows: rest.map((r) => r.map(parseInline)),
      });
      continue;
    }

    if (LIST.test(line)) {
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

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length === 0) {
      i++;
      continue;
    }
    blocks.push({ kind: "p", runs: parseInline(para.join(" ")) });
  }
  return { summary, blocks };
}
