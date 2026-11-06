import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./markup-preview.pavlus";

export type PartStyle = "" | "b" | "i" | "c";

export interface Part {
  id: string;
  text: string;
  style: PartStyle;
}

export type BlockKind = "h" | "p" | "li" | "quote" | "code";

export interface MarkBlock {
  id: string;
  kind: BlockKind;
  parts: Part[];
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/;

/** Pure: a line cut into plain, bold, italic and code parts. */
export function parseInline(text: string, prefix: string): Part[] {
  const parts: Part[] = [];
  text.split(INLINE).forEach((piece, i) => {
    if (piece === "") return;
    const id = `${prefix}.${i}`;
    if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4)
      parts.push({ id, text: piece.slice(2, -2), style: "b" });
    else if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2)
      parts.push({ id, text: piece.slice(1, -1), style: "c" });
    else if (piece.startsWith("*") && piece.endsWith("*") && piece.length > 2)
      parts.push({ id, text: piece.slice(1, -1), style: "i" });
    else parts.push({ id, text: piece, style: "" });
  });
  return parts;
}

/**
 * Pure: the blocks of a text. `# ` heading, `- ` or `* ` list item, `> ` quote,
 * a fence of three backticks starts and ends a code block, and plain lines up
 * to a blank line make one paragraph. An unclosed fence runs to the end.
 */
export function parseMarkup(text: string): MarkBlock[] {
  const blocks: MarkBlock[] = [];
  let para: string[] = [];
  let code: string[] | null = null;
  const add = (kind: BlockKind, parts: Part[]) =>
    blocks.push({ id: `b${blocks.length}`, kind, parts });
  const flush = () => {
    if (para.length > 0) {
      const id = `b${blocks.length}`;
      add("p", parseInline(para.join(" "), id));
      para = [];
    }
  };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      if (code === null) {
        flush();
        code = [];
      } else {
        add("code", [
          { id: `b${blocks.length}.0`, text: code.join("\n"), style: "" },
        ]);
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(raw);
      continue;
    }
    const line = raw.trim();
    const id = `b${blocks.length}`;
    if (line === "") flush();
    else if (/^#{1,3}\s+\S/.test(line)) {
      flush();
      add(
        "h",
        parseInline(line.replace(/^#{1,3}\s+/, ""), `b${blocks.length}`),
      );
    } else if (/^[-*]\s+\S/.test(line)) {
      flush();
      add("li", parseInline(line.replace(/^[-*]\s+/, ""), `b${blocks.length}`));
    } else if (/^>\s*\S/.test(line)) {
      flush();
      add("quote", parseInline(line.replace(/^>\s*/, ""), `b${blocks.length}`));
    } else {
      void id;
      para.push(line);
    }
  }
  if (code !== null)
    add("code", [
      { id: `b${blocks.length}.0`, text: code.join("\n"), style: "" },
    ]);
  flush();
  return blocks;
}

const SAMPLE = [
  "# Memory leak on route change",
  "",
  "I run **Node 22** and the heap grows after every `navigate()` call.",
  "",
  "- tried the profiler",
  "- *no* listeners left in the logs",
  "",
  "> Any idea what to look at next?",
].join("\n");

export interface MarkupState {
  text: string;
  preview: { blocks: MarkBlock[] };
}

export const initial: MarkupState = {
  text: SAMPLE,
  preview: { blocks: parseMarkup(SAMPLE) },
};

export class MarkupPreviewPage extends Component<MarkupState> {
  view = view;

  typing(msg: Message): Effect[] {
    const text = msg.event?.value ?? "";
    return [
      store.set("text", text),
      store.set("preview", { blocks: parseMarkup(text) }),
    ];
  }
}

export const page = new MarkupPreviewPage();
