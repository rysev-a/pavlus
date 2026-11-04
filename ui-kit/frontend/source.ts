import type { Effect, Plugin } from "@service-laboratory/pavlus";

/**
 * The Source tab: every component, block and template can show its own source
 * (the pavlus template, its logic, its stylesheet). The files are bundled as
 * lazy raw chunks, loaded by a plugin when the tab is opened; the application
 * only asks (`sourceEffector.load`) and gets the text back as a message, then
 * cuts it into highlighted lines with the pure `highlight` below.
 */

/** Every file of a page folder, as lazy loaders of its text. */
export const loaders = import.meta.glob<string>(
  "./{pages,blocks,templates}/*/*",
  { query: "?raw", import: "default" },
);

/** The files of a page folder, the template first, the stylesheet and `meta.ts` last. */
export function filesOf(
  dir: string,
  slug: string,
  keys: string[] = Object.keys(loaders),
): string[] {
  const names = keys
    .filter((k) => k.startsWith(`./${dir}/`))
    .map((k) => k.slice(`./${dir}/`.length));
  const rank = (n: string) => {
    if (n === `${slug}.pavlus`) return 0;
    if (n === `${slug}.ts`) return 1;
    if (n === "view.pavlus") return 2;
    if (n === "meta.ts") return 9;
    if (n.endsWith(".css")) return 8;
    return 5;
  };
  return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// ---- the plugin ----

export interface SourceEffect extends Effect {
  plugin: "source";
  type: "load";
  /** `./blocks/hero/hero.pavlus`: a key of `loaders`. */
  path: string;
  onSuccess: string;
  onError: string;
}

export const sourceEffector = {
  load: (path: string, onSuccess: string, onError: string): SourceEffect => ({
    plugin: "source",
    type: "load",
    path,
    onSuccess,
    onError,
  }),
};

export function createSourcePlugin(
  files: Record<string, () => Promise<string>> = loaders,
): Plugin<SourceEffect, unknown> {
  return {
    name: "source",
    handle(effect, ctx) {
      if (effect.type !== "load") return;
      const load = files[effect.path];
      if (!load) {
        ctx.dispatch({ id: effect.onError, payload: effect.path });
        return;
      }
      load().then(
        (text) =>
          ctx.dispatch({
            id: effect.onSuccess,
            payload: { path: effect.path, text },
          }),
        () => ctx.dispatch({ id: effect.onError, payload: effect.path }),
      );
    },
  };
}

// ---- highlighting: pure, line by line ----

export type TokenClass =
  | "plain"
  | "comment"
  | "string"
  | "keyword"
  | "number"
  | "tag"
  | "attr"
  | "event"
  | "expr"
  | "type"
  | "prop";

export interface Token {
  i: number;
  t: string;
  c: TokenClass;
}

export interface Line {
  n: number;
  tokens: Token[];
}

type Rule = [RegExp, TokenClass];

const PAVLUS_KEYWORDS = /^(for|in|key|if|else|import|from|outlet)\b/;

const TS_KEYWORDS =
  /^(import|export|from|const|let|var|function|return|if|else|for|while|class|extends|new|this|type|interface|as|typeof|async|await|default|readonly|override|static|public|private|null|undefined|true|false|void|of|in|switch|case|break|continue|throw|try|catch|finally)\b/;

/** A pavlus line: indentation, a tag or a keyword, attributes, text. */
function pavlusLine(line: string): [string, TokenClass][] {
  const out: [string, TokenClass][] = [];
  const indent = /^\s*/.exec(line)![0];
  let rest = line.slice(indent.length);
  if (indent) out.push([indent, "plain"]);
  if (rest.startsWith("//")) return [...out, [rest, "comment"]];
  if (rest.startsWith("|")) {
    out.push(["|", "keyword"]);
    rest = rest.slice(1);
    return [...out, ...interpolated(rest, "plain")];
  }
  const kw = PAVLUS_KEYWORDS.exec(rest);
  if (kw) {
    out.push([kw[0], "keyword"]);
    rest = rest.slice(kw[0].length);
  } else if (rest.startsWith("+")) {
    const m = /^\+(\{[^}]*\}|[\w]+)/.exec(rest);
    if (m) {
      out.push([m[0], "type"]);
      rest = rest.slice(m[0].length);
    }
  } else {
    const m = /^[a-z][\w-]*/.exec(rest);
    if (m) {
      out.push([m[0], "tag"]);
      rest = rest.slice(m[0].length);
    }
  }
  const rules: Rule[] = [
    [/^\/\/.*$/, "comment"],
    [/^"(?:[^"\\]|\\.)*"/, "string"],
    [/^\{[^}]*\}/, "expr"],
    [/^@[\w.]+(?:\.[a-z]+)*/, "event"],
    [/^[.#][\w-]+/, "attr"],
    [/^class:[\w-]+/, "attr"],
    [/^[\w-]+(?==)/, "prop"],
    [/^\d+(?:\.\d+)?/, "number"],
    [/^(?:for|in|key|if|else)\b/, "keyword"],
  ];
  return [...out, ...scan(rest, rules)];
}

/** Text with `{expr}` holes. */
function interpolated(text: string, base: TokenClass): [string, TokenClass][] {
  return scan(text, [[/^\{[^}]*\}/, "expr"]], base);
}

/** Cuts `text` with the first rule that matches at each position; the rest is `base`. */
function scan(
  text: string,
  rules: Rule[],
  base: TokenClass = "plain",
): [string, TokenClass][] {
  const out: [string, TokenClass][] = [];
  let plain = "";
  const flush = () => {
    if (plain) out.push([plain, base]);
    plain = "";
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    // a rule can only start at a word boundary, so `class` in `subclass` stays plain
    const boundary = i === 0 || !/[\w-]/.test(text[i - 1]);
    let hit: [string, TokenClass] | null = null;
    if (boundary || /^[\s"{@.#(]/.test(rest)) {
      for (const [re, cls] of rules) {
        const m = re.exec(rest);
        if (m && m[0]) {
          hit = [m[0], cls];
          break;
        }
      }
    }
    if (hit) {
      flush();
      out.push(hit);
      i += hit[0].length;
    } else {
      plain += text[i];
      i++;
    }
  }
  flush();
  return out;
}

const TS_RULES = (inBlock: boolean): Rule[] =>
  inBlock
    ? []
    : [
        [/^\/\/.*$/, "comment"],
        [/^\/\*.*?\*\//, "comment"],
        [/^`(?:[^`\\]|\\.)*`/, "string"],
        [/^"(?:[^"\\]|\\.)*"/, "string"],
        [/^'(?:[^'\\]|\\.)*'/, "string"],
        [/^\d+(?:\.\d+)?/, "number"],
        [TS_KEYWORDS, "keyword"],
        [/^[A-Z][\w]*/, "type"],
      ];

const CSS_RULES: Rule[] = [
  [/^\/\*.*?\*\//, "comment"],
  [/^"(?:[^"\\]|\\.)*"/, "string"],
  [/^'(?:[^'\\]|\\.)*'/, "string"],
  [/^--[\w-]+/, "attr"],
  [/^[.#][\w-]+/, "tag"],
  [/^[\w-]+(?=\s*:)/, "prop"],
  [/^-?\d*\.?\d+(?:px|rem|em|%|fr|vh|vw|s|ms|deg)?/, "number"],
  [/^@[\w-]+/, "keyword"],
];

/** The kind of file, from its name. */
const kindOf = (file: string): "pavlus" | "ts" | "css" | "text" =>
  file.endsWith(".pavlus")
    ? "pavlus"
    : file.endsWith(".ts")
      ? "ts"
      : file.endsWith(".css")
        ? "css"
        : "text";

/** Highlights a whole file. Pure: the tokens of a line always join back to the line. */
export function highlight(file: string, text: string): Line[] {
  const kind = kindOf(file);
  let inBlock = false; // inside a /* ... */ that spans lines
  return text.split("\n").map((line, index) => {
    let parts: [string, TokenClass][];
    if (kind === "pavlus") parts = pavlusLine(line);
    else if (kind === "text") parts = [[line, "plain"]];
    else {
      const rules = kind === "css" ? CSS_RULES : TS_RULES(false);
      if (inBlock) {
        const end = line.indexOf("*/");
        if (end < 0) parts = [[line, "comment"]];
        else {
          inBlock = false;
          parts = [
            [line.slice(0, end + 2), "comment"],
            ...scan(line.slice(end + 2), rules),
          ];
        }
      } else {
        const open = /\/\*(?!.*\*\/)/.exec(line);
        if (open && !isInString(line, open.index)) {
          inBlock = true;
          parts = [
            ...scan(line.slice(0, open.index), rules),
            [line.slice(open.index), "comment"],
          ];
        } else parts = scan(line, rules);
      }
    }
    return {
      n: index + 1,
      tokens: parts.map(([t, c], i) => ({ i, t, c })),
    };
  });
}

/** Whether position `at` of `line` is inside a quoted string (an odd number of quotes before it). */
function isInString(line: string, at: number): boolean {
  const before = line.slice(0, at);
  return ['"', "'", "`"].some((q) => (before.split(q).length - 1) % 2 === 1);
}

/** Longest file shown whole; a longer one is cut (the page links to the file on GitHub). */
export const MAX_LINES = 1200;
