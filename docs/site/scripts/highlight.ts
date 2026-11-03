/**
 * Minimal build-time syntax highlighting for the docs page. Each language gets
 * a tiny line-oriented tokenizer that wraps tokens in spans with simple CSS
 * classes (.tk-kw, .tk-str, … — the palette lives in page.ts). Spans never
 * cross a line break, so callers can wrap each line for the line-number
 * gutter. Every token is HTML-escaped here.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const span = (cls: string, text: string): string =>
  `<span class="tk-${cls}">${esc(text)}</span>`;

/** One highlighted token: raw text + CSS class suffix ("" = plain). */
export interface Tok {
  t: string;
  c: string;
}

export const tok = (t: string, c = ""): Tok => ({ t, c });

/* ------------------------------------------------------------------ */
/* pavlus templates — token model (shared by the HTML and SVG output)  */

const PAVLUS_KEYWORDS = /^(?:if|elif|else|for|in|key)$/;

/** A quoted string whose `{expr}` parts keep the expression class. */
function stringToks(quote: string, body: string): Tok[] {
  const out: Tok[] = [tok(quote, "str")];
  body
    .split(/(\{[^}]*\})/g)
    .forEach((p, i) => out.push(i % 2 === 1 ? tok(p, "expr") : tok(p, "str")));
  out.push(tok(quote, "str"));
  return out;
}

/**
 * A plain expression fragment (an `if`/`for` header tail): strings, simple
 * comparisons and numbers get classes, the rest stays plain.
 */
function exprToks(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /"(?:[^"\\]|\\.)*"|[=!<>]?==|!=|[-+*/%<>]=?|\d+(?:\.\d+)?|\s+|./g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const t = m[0];
    if (t.startsWith('"')) out.push(...stringToks('"', t.slice(1, -1)));
    else if (/^[=!<>+\-*/%]/.test(t)) out.push(tok(t, "punc"));
    else if (/^\d/.test(t)) out.push(tok(t, "num"));
    else out.push(tok(t));
  }
  return out;
}

/** Attribute list inside (…): name=value, class:x=y, @event=msg(args), {expr}, "str". */
function attrToks(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^\s+/.exec(rest))) {
      out.push(tok(m[0]));
    } else if ((m = /^@[.\w-]+/.exec(rest))) {
      out.push(tok(m[0], "evt"));
    } else if ((m = /^"(?:[^"\\]|\\.)*"/.exec(rest))) {
      out.push(...stringToks('"', m[0].slice(1, -1)));
    } else if ((m = /^\{[^}]*\}/.exec(rest))) {
      out.push(tok(m[0], "expr"));
    } else if ((m = /^[\w:.-]+(?==)/.exec(rest))) {
      out.push(tok(m[0], "attr"));
    } else if ((m = /^[=:]/.exec(rest))) {
      out.push(tok(m[0], "punc"));
    } else if ((m = /^[\w.-]+/.exec(rest))) {
      // a bare attribute value is an expression reference
      out.push(tok(m[0], "expr"));
    } else {
      out.push(tok(rest[0]));
      i += 1;
      continue;
    }
    i += m[0].length;
  }
  return out;
}

/** Text content after the element head: `{expr}` parts get a class. */
function textToks(src: string): Tok[] {
  if (!src) return [];
  return src
    .split(/(\{[^}]*\})/g)
    .map((p, i) => (i % 2 === 1 ? tok(p, "expr") : tok(p)));
}

/** One pavlus line → tokens. */
function lineToks(line: string): Tok[] {
  const indent = /^\s*/.exec(line)![0];
  const rest = line.slice(indent.length);
  const out: Tok[] = [tok(indent)];
  if (rest === "") return out;

  // control lines: if / else if / else / for … in … key …
  const head = /^\w+/.exec(rest);
  if (head && PAVLUS_KEYWORDS.test(head[0])) {
    rest
      .split(/\b(if|elif|else|for|in|key)\b/g)
      .forEach((p, i) =>
        out.push(...(i % 2 === 1 ? [tok(p, "kw")] : exprToks(p))),
      );
    return out;
  }

  // embed: +Component#name or +outlet
  if (rest.startsWith("+")) {
    const m = /^\+(?:\{[^}]*\}|[\w-]+)?(?:#\w+)?/.exec(rest);
    if (m)
      return [...out, tok(m[0], "tag"), ...textToks(rest.slice(m[0].length))];
  }

  // literal text line: | …
  if (rest.startsWith("|")) return [...out, ...textToks(rest)];

  // element: tag(.class)*(…attrs)? text
  const el = /^([a-zA-Z][\w-]*)((?:\.[\w-]+)*)/.exec(rest);
  if (el) {
    out.push(tok(el[1], "tag"));
    for (const c of el[2].split(".").filter(Boolean)) {
      out.push(tok("."), tok(c, "attr"));
    }
    let i = el[0].length;
    if (rest[i] === "(") {
      // balanced scan: attribute lists contain calls like remove(u.id)
      let depth = 0;
      let j = i;
      let quote: string | null = null;
      for (; j < rest.length; j++) {
        const ch = rest[j];
        if (quote) {
          if (ch === "\\") j += 1;
          else if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === "(") depth += 1;
        else if (ch === ")") {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
      }
      out.push(tok("(", "punc"));
      out.push(...attrToks(rest.slice(i + 1, j - 1)));
      out.push(tok(")", "punc"));
      i = j;
    }
    out.push(...textToks(rest.slice(i)));
    return out;
  }

  out.push(...textToks(rest));
  return out;
}

/** Per-line pavlus tokens — the source for both HTML and SVG rendering. */
export function pavlusTokens(code: string): Tok[][] {
  return code.split("\n").map(lineToks);
}

const toksHtml = (toks: Tok[]): string =>
  toks.map((t) => (t.c ? span(t.c, t.t) : esc(t.t))).join("");

export function hlPavlus(code: string): string {
  return pavlusTokens(code).map(toksHtml).join("\n");
}

/* ------------------------------------------------------------------ */
/* TypeScript / JavaScript (generated modules, apps, framework slices) */

const TS_KEYWORDS = new Set(
  `import export from const let var function return if else for of in new class
   extends implements interface type enum async await try catch finally throw
   switch case break continue default do while typeof instanceof this super
   static get set public private protected readonly abstract declare as is
   keyof infer yield delete void satisfies true false null undefined`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Per-line TypeScript/JavaScript tokens. Block comments and template literals
 * may span lines; the state is carried between lines so tokens never cross a
 * line break.
 */
export function tsTokens(code: string): Tok[][] {
  let inBlock: null | "comment" | "template" = null;

  const scan = (line: string): Tok[] => {
    const out: Tok[] = [];
    let i = 0;
    while (i < line.length) {
      const rest = line.slice(i);

      if (inBlock === "comment") {
        const end = rest.indexOf("*/");
        if (end === -1) {
          out.push(tok(rest, "com"));
          return out;
        }
        out.push(tok(rest.slice(0, end + 2), "com"));
        i += end + 2;
        inBlock = null;
        continue;
      }
      if (inBlock === "template") {
        const m = /^`(?:\\.|[^`\\])*`/.exec(rest);
        if (!m) {
          out.push(tok(rest, "str"));
          return out;
        }
        out.push(tok(m[0], "str"));
        i += m[0].length;
        inBlock = null;
        continue;
      }

      let m: RegExpExecArray | null;
      if ((m = /^\/\/.*/.exec(rest))) {
        out.push(tok(m[0], "com"));
      } else if ((m = /^\/\*.*?\*\//.exec(rest))) {
        out.push(tok(m[0], "com"));
      } else if ((m = /^\/\*/.exec(rest))) {
        out.push(tok(rest, "com"));
        inBlock = "comment";
        return out;
      } else if ((m = /^`/.exec(rest))) {
        const str = /^`(?:\\.|[^`\\])*`/.exec(rest);
        if (!str) {
          inBlock = "template";
          out.push(tok(rest, "str"));
          return out;
        }
        out.push(tok(str[0], "str"));
        m = str;
      } else if ((m = /^"(?:\\.|[^"\\])*("|$)/.exec(rest))) {
        out.push(tok(m[0], m[1] ? "str" : ""));
      } else if ((m = /^'(?:\\.|[^'\\])*('|$)/.exec(rest))) {
        out.push(tok(m[0], m[1] ? "str" : ""));
      } else if ((m = /^\d+(?:\.\d+)?/.exec(rest))) {
        out.push(tok(m[0], "num"));
      } else if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
        const w = m[0];
        if (TS_KEYWORDS.has(w)) out.push(tok(w, "kw"));
        else if (/^\s*\(/.test(line.slice(i + w.length)))
          out.push(tok(w, "fn"));
        else if (/^[A-Z]/.test(w)) out.push(tok(w, "type"));
        else out.push(tok(w));
      } else {
        out.push(tok(line[i]));
        i += 1;
        continue;
      }
      i += m[0].length;
    }
    return out;
  };

  return code.split("\n").map(scan);
}

/** Highlights TypeScript/JavaScript as HTML spans. */
export function hlTs(code: string): string {
  return tsTokens(code).map(toksHtml).join("\n");
}

/* ------------------------------------------------------------------ */
/* Line wrapping + gutter                                              */

/** Wraps highlighted code into per-line spans for the CSS gutter. */
export function codeLines(html: string): string {
  return html
    .split("\n")
    .map((l) => `<span class="line">${l}</span>`)
    .join("");
}

/** Inline style that starts the gutter counter at the true source offset. */
export const gutterStart = (from: number): string =>
  `counter-reset: ln ${Math.max(0, from - 1)}`;
