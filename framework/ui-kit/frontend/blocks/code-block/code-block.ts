import { Component } from "@pavlus/frontend";
import view from "./code-block.pavlus";

/** The kind of a token: keyword, string, comment, number, function, type, plain. */
export type TokenKind = "k" | "s" | "c" | "n" | "f" | "t" | "p";

export interface Token {
  t: string;
  k: TokenKind;
}

export interface CodeLine {
  /** The line number, from 1. */
  n: number;
  tokens: Token[];
}

const KEYWORDS = new Set(
  (
    "const let var function return if else for while do switch case break continue " +
    "import from export default class extends implements new async await type interface " +
    "of in as typeof void throw try catch finally readonly static public private " +
    "true false null undefined this satisfies"
  ).split(" "),
);

const JS_TOKEN =
  /\/\/.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|[A-Za-z_$][\w$]*|\s+|[\s\S]/g;
const SH_TOKEN =
  /#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|--?[A-Za-z][\w-]*|\$[\w{}]+|\b\d+(?:\.\d+)?\b|[^\s"'#$]+|\s+|[\s\S]/g;
const JSON_TOKEN =
  /"(?:\\.|[^"\\])*"|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b(?:true|false|null)\b|\s+|[\s\S]/g;

/** Pure: one line of code as tokens. Joining the `t` of the tokens gives the line back. */
export function tokenizeLine(line: string, lang: string): Token[] {
  const out: Token[] = [];
  const push = (t: string, k: TokenKind) => out.push({ t, k });
  const language = lang.toLowerCase();

  if (language === "json") {
    for (const m of line.matchAll(JSON_TOKEN)) {
      const text = m[0];
      const rest = line.slice((m.index ?? 0) + text.length);
      if (text.startsWith('"')) push(text, /^\s*:/.test(rest) ? "t" : "s");
      else if (/^(true|false|null)$/.test(text)) push(text, "k");
      else if (/^-?\d/.test(text)) push(text, "n");
      else push(text, "p");
    }
    return merge(out);
  }

  if (language === "sh" || language === "bash" || language === "shell") {
    let first = true;
    for (const m of line.matchAll(SH_TOKEN)) {
      const text = m[0];
      if (text.startsWith("#")) push(text, "c");
      else if (/^["']/.test(text)) push(text, "s");
      else if (/^--?[A-Za-z]/.test(text)) push(text, "k");
      else if (text.startsWith("$")) push(text, "t");
      else if (/^\d/.test(text)) push(text, "n");
      else if (/^\s+$/.test(text)) push(text, "p");
      else if (first) {
        push(text, "f");
        first = false;
      } else push(text, "p");
      if (!/^\s+$/.test(text) && !text.startsWith("#")) first = false;
    }
    return merge(out);
  }

  if (language === "ts" || language === "js" || language === "typescript") {
    for (const m of line.matchAll(JS_TOKEN)) {
      const text = m[0];
      const rest = line.slice((m.index ?? 0) + text.length);
      if (text.startsWith("//")) push(text, "c");
      else if (/^["'`]/.test(text)) push(text, "s");
      else if (/^\d/.test(text)) push(text, "n");
      else if (KEYWORDS.has(text)) push(text, "k");
      else if (/^[A-Za-z_$]/.test(text)) {
        if (rest.startsWith("(")) push(text, "f");
        else if (/^[A-Z]/.test(text)) push(text, "t");
        else push(text, "p");
      } else push(text, "p");
    }
    return merge(out);
  }

  return [{ t: line, k: "p" }];
}

/** Neighbouring plain tokens become one, so a line has few spans. */
function merge(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const tok of tokens) {
    const last = out[out.length - 1];
    if (last && last.k === "p" && tok.k === "p") last.t += tok.t;
    else out.push({ ...tok });
  }
  return out;
}

/** Pure: a block of code as numbered lines of tokens (a trailing newline adds no line). */
export function codeLines(code: string, lang: string): CodeLine[] {
  const lines = code.replace(/\n$/, "").split("\n");
  return lines.map((line, i) => ({
    n: i + 1,
    tokens: tokenizeLine(line, lang),
  }));
}

export interface CodeBlockState {
  ts: CodeLine[];
  sh: CodeLine[];
  json: CodeLine[];
}

const TS = `import { Component } from "@pavlus/frontend";

// Handlers are pure: state in, effects out.
export class Counter extends Component<{ count: number }> {
  inc(_msg: Message, state: { count: number }) {
    return [store.set("count", state.count + 1)];
  }
}`;

const SH = `# install and run
npm install @pavlus/frontend
npm run dev --workspace ui-kit -- --port 5173`;

const JSON_SAMPLE = `{
  "name": "ui-kit",
  "private": true,
  "workspaces": ["framework", "ui-kit"],
  "version": "0.1.0"
}`;

export const initial: CodeBlockState = {
  ts: codeLines(TS, "ts"),
  sh: codeLines(SH, "sh"),
  json: codeLines(JSON_SAMPLE, "json"),
};

/** Only data: the lines are tokenized when the state is built. */
export class CodeBlockPage extends Component<CodeBlockState> {
  view = view;
}

export const page = new CodeBlockPage();
