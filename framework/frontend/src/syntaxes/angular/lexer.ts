import type { Pos } from "../../template/ast.ts";
import { TemplateError } from "../../template/errors.ts";

/** The source text with offset -> 1-based line/column lookup. */
export class Source {
  readonly text: string;
  private readonly lineStarts: number[] = [0];

  constructor(text: string) {
    this.text = text;
    for (let i = 0; i < text.length; i++)
      if (text[i] === "\n") this.lineStarts.push(i + 1);
  }

  pos(offset: number): Pos {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - this.lineStarts[lo] + 1 };
  }

  fail(message: string, offset: number): never {
    const p = this.pos(offset);
    throw new TemplateError(message, p.line, p.col);
  }
}

/** An attribute exactly as written: no decoding, no interpretation. */
export interface RawAttr {
  name: string;
  nameStart: number;
  /** `null` for a bare attribute. */
  value: string | null;
  /** Offset of the first character of the value (inside the quotes). */
  valueStart: number;
}

export type BlockKind = "if" | "else if" | "else" | "for" | "empty";

export type Token =
  /**
   * Text between markup. `raw` text (script/style) has no interpolation and
   * no entities; `rcdata` (textarea/title) has both, but no markup.
   */
  | { t: "text"; start: number; raw: string; mode: "text" | "rcdata" | "raw" }
  | {
      t: "open";
      start: number;
      name: string;
      attrs: RawAttr[];
      selfClosing: boolean;
    }
  | { t: "close"; start: number; name: string }
  | { t: "comment"; start: number; body: string; bodyStart: number }
  /** `@if (header) {`, `@else {`, ... `header` is `null` for else/empty. */
  | {
      t: "block";
      start: number;
      kind: BlockKind;
      header: string | null;
      headerStart: number;
    }
  | { t: "blockEnd"; start: number };

const WS = /[ \t\r\n\f]/;
const NAME_START = /[A-Za-z]/;

/** Elements whose content is not markup. */
const RAW_TEXT: Record<string, "rcdata" | "raw"> = {
  script: "raw",
  style: "raw",
  textarea: "rcdata",
  title: "rcdata",
};

/** Control-flow blocks of newer Angular that this syntax does not have. */
const UNSUPPORTED_BLOCK = /^@(switch|defer|let)(?![\w$-])/;
const BLOCK = /^@(if|for|empty|else)(?![\w$-])/;

/**
 * Index of the `}}` closing the interpolation whose expression starts at
 * `from`, skipping string literals; -1 when there is none.
 */
export function findInterpEnd(text: string, from: number): number {
  let quote = "";
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "}" && text[i + 1] === "}") return i;
  }
  return -1;
}

/** Splits the template into markup, text, comment and block tokens. */
export function tokenize(src: Source): Token[] {
  const text = src.text;
  const toks: Token[] = [];
  let i = 0;

  const skipWs = (from: number): number => {
    while (from < text.length && WS.test(text[from])) from++;
    return from;
  };

  /** `@kind (header) {`; `i` is at the `@`. */
  const block = (): void => {
    const start = i;
    const rest = text.slice(i, i + 12);
    if (UNSUPPORTED_BLOCK.test(rest)) {
      src.fail(
        `${UNSUPPORTED_BLOCK.exec(rest)![0]} is not supported; use @if / @for`,
        start,
      );
    }
    let kind = BLOCK.exec(rest)![1] as BlockKind;
    let j = i + 1 + kind.length;
    if (kind === "else") {
      const k = skipWs(j);
      if (/^if(?![\w$-])/.test(text.slice(k, k + 3))) {
        kind = "else if";
        j = k + 2;
      }
    }
    let header: string | null = null;
    let headerStart = j;
    if (kind === "if" || kind === "else if" || kind === "for") {
      j = skipWs(j);
      if (text[j] !== "(") src.fail(`Expected "(" after @${kind}`, j);
      headerStart = j + 1;
      let depth = 0;
      let quote = "";
      let k = j;
      for (; k < text.length; k++) {
        const c = text[k];
        if (quote) {
          if (c === "\\") k++;
          else if (c === quote) quote = "";
        } else if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "(") depth++;
        else if (c === ")" && --depth === 0) break;
      }
      if (k >= text.length) src.fail(`Unclosed ( in @${kind}`, j);
      header = text.slice(headerStart, k);
      j = k + 1;
    }
    j = skipWs(j);
    if (text[j] !== "{") src.fail(`Expected "{" to open the @${kind} block`, j);
    toks.push({ t: "block", start, kind, header, headerStart });
    i = j + 1;
  };

  /** A tag: `i` is at the `<`. */
  const tag = (closing: boolean): void => {
    const start = i;
    let j = i + (closing ? 2 : 1);
    const nameStart = j;
    while (j < text.length && !WS.test(text[j]) && !/[/>]/.test(text[j])) j++;
    const name = text.slice(nameStart, j);
    if (closing) {
      j = skipWs(j);
      if (text[j] !== ">") src.fail(`Expected ">" in </${name}`, j);
      toks.push({ t: "close", start, name });
      i = j + 1;
      return;
    }
    const attrs: RawAttr[] = [];
    for (;;) {
      j = skipWs(j);
      if (j >= text.length) src.fail(`Unclosed tag <${name}`, start);
      if (text[j] === ">" || (text[j] === "/" && text[j + 1] === ">")) break;
      if (text[j] === "/") {
        j++;
        continue;
      }
      const aStart = j;
      while (
        j < text.length &&
        !WS.test(text[j]) &&
        !/[=>"']/.test(text[j]) &&
        !(text[j] === "/" && text[j + 1] === ">")
      )
        j++;
      if (j === aStart) {
        src.fail(`Unexpected "${text[j]}" in <${name}>`, j);
      }
      const attr: RawAttr = {
        name: text.slice(aStart, j),
        nameStart: aStart,
        value: null,
        valueStart: j,
      };
      const eq = skipWs(j);
      if (text[eq] === "=") {
        j = skipWs(eq + 1);
        const q = text[j];
        if (q === '"' || q === "'") {
          const end = text.indexOf(q, j + 1);
          if (end < 0) src.fail("Unterminated attribute value", j);
          attr.value = text.slice(j + 1, end);
          attr.valueStart = j + 1;
          j = end + 1;
        } else {
          const vStart = j;
          while (j < text.length && !WS.test(text[j]) && text[j] !== ">") j++;
          attr.value = text.slice(vStart, j);
          attr.valueStart = vStart;
        }
      }
      attrs.push(attr);
    }
    const selfClosing = text[j] === "/";
    i = j + (selfClosing ? 2 : 1);
    toks.push({ t: "open", start, name, attrs, selfClosing });

    const mode = RAW_TEXT[name.toLowerCase()];
    if (mode && !selfClosing) {
      const end = new RegExp(`</${name}[\\s>/]`, "i").exec(text.slice(i));
      if (!end) src.fail(`Unclosed <${name}>`, start);
      const stop = i + end!.index;
      if (stop > i)
        toks.push({ t: "text", start: i, raw: text.slice(i, stop), mode });
      i = stop;
    }
  };

  /** True when the `@` at `at` starts a control-flow block. */
  const isBlockAt = (at: number): boolean =>
    !/[\w.$]/.test(text[at - 1] ?? " ") &&
    (BLOCK.test(text.slice(at, at + 12)) ||
      UNSUPPORTED_BLOCK.test(text.slice(at, at + 12)));

  while (i < text.length) {
    const c = text[i];
    if (c === "<" && text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      if (end < 0) src.fail("Unclosed comment", i);
      toks.push({
        t: "comment",
        start: i,
        body: text.slice(i + 4, end),
        bodyStart: i + 4,
      });
      i = end + 3;
    } else if (c === "<" && text[i + 1] === "!") {
      // <!doctype html>: nothing to render
      const end = text.indexOf(">", i);
      if (end < 0) src.fail("Unclosed <!", i);
      i = end + 1;
    } else if (c === "<" && NAME_START.test(text[i + 1] ?? "")) tag(false);
    else if (
      c === "<" &&
      text[i + 1] === "/" &&
      NAME_START.test(text[i + 2] ?? "")
    )
      tag(true);
    else if (c === "}") {
      toks.push({ t: "blockEnd", start: i });
      i++;
    } else if (c === "@" && isBlockAt(i)) block();
    else {
      // Plain text up to the next markup, `}` or block keyword.
      const start = i;
      while (i < text.length) {
        const d = text[i];
        if (d === "{" && text[i + 1] === "{") {
          const end = findInterpEnd(text, i + 2);
          if (end < 0) src.fail("Unclosed {{", i);
          i = end + 2;
          continue;
        }
        if (d === "}") break;
        if (d === "<") {
          const n = text[i + 1] ?? "";
          if (NAME_START.test(n) || n === "!") break;
          if (n === "/" && NAME_START.test(text[i + 2] ?? "")) break;
        }
        if (d === "@" && isBlockAt(i)) break;
        i++;
      }
      toks.push({ t: "text", start, raw: text.slice(start, i), mode: "text" });
    }
  }
  return toks;
}
