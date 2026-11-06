/**
 * Tokenizer for the Pug syntax.
 *
 * Pug is line based, so the lexer turns the source into one statement per
 * logical line (`Stmt`): an indent, a position and a structured payload
 * (an element chain, an `if`, an `each`, ...). Everything that is not
 * indentation structure is resolved here: attribute lists (which may span
 * several lines), `#{expr}` interpolation, `#[tag text]` inline tags, comment
 * blocks (dropped) and dot blocks (`p.` followed by raw text lines). The
 * parser (`parse.ts`) then only has to nest statements by indent and lower
 * them to the shared template AST.
 *
 * Expressions are never parsed here by hand: every one goes through
 * `parseExpr`, so they stay the pure JS subset.
 */
import type { Expr, Part, Pos } from "../../template/ast.ts";
import { TemplateError } from "../../template/errors.ts";
import { parseExpr } from "../../template/expr.ts";

/** Text between tags: literal strings, expressions and `#[tag text]` tags. */
export type Piece = Part | InlineTag;

export interface InlineTag {
  inline: true;
  head: TagHead;
  pieces: Piece[];
}

export function isInline(p: Piece): p is InlineTag {
  return typeof p === "object" && "inline" in p;
}

/** One entry of an attribute list: `name`, `name="x #{y}"`, `name=expr`. */
export interface RawAttr {
  name: string;
  pos: Pos;
  form: "bool" | "string" | "expr";
  /** `null` for a bare attribute; the interpolated string; or `[expr]`. */
  parts: Part[] | null;
  /**
   * Quoted values only: the raw text between the quotes. Events and class
   * toggles parse it as an expression (`@click="save(item)"`).
   */
  inner?: { text: string; at: Pos };
}

/** The pieces that follow a tag name or `+Name`, in source order. */
export type HeadItem =
  | { kind: "class"; name: string; pos: Pos }
  | { kind: "id"; name: string; pos: Pos }
  | { kind: "attrs"; attrs: RawAttr[] }
  | { kind: "amp"; expr: Expr; pos: Pos };

/** `tag.cls#id(attrs)`; `tag` is `null` for `.cls` / `#id` (a `div`). */
export interface TagHead {
  kind: "tag";
  tag: string | null;
  pos: Pos;
  items: HeadItem[];
}

/** `+Name#instance(props)` or `+#{expr}#instance(props)`. */
export interface EmbedHead {
  kind: "embed";
  component: string | null;
  dynamic: Expr | null;
  instance: string | null;
  /** Where the component name starts (for the "not imported" error). */
  namePos: Pos;
  pos: Pos;
  items: HeadItem[];
}

export interface OutletHead {
  kind: "outlet";
  pos: Pos;
}

export type ChainItem = TagHead | EmbedHead | OutletHead;

/** What follows the last head of a line. */
export type Body =
  | { kind: "none" }
  | { kind: "text"; pieces: Piece[] }
  | { kind: "expr"; expr: Expr }
  | { kind: "dot"; lines: { pieces: Piece[]; line: number }[] };

/** `a: b: c text`: heads joined by block expansion plus the last one's body. */
export interface Chain {
  items: ChainItem[];
  selfClosing: boolean;
  body: Body;
}

interface Base {
  indent: number;
  pos: Pos;
}

export type Stmt = Base &
  (
    | { kind: "import"; local: string; from: string }
    | { kind: "text"; pieces: Piece[] }
    | { kind: "code"; expr: Expr }
    | { kind: "if"; test: Expr }
    | { kind: "elseif"; test: Expr }
    | { kind: "else" }
    | {
        kind: "each";
        item: string;
        index: string | null;
        of: Expr;
        key: Expr | null;
      }
    | { kind: "case"; subject: Expr }
    | { kind: "when"; test: Expr; inline: Chain | null }
    | { kind: "default"; inline: Chain | null }
    | { kind: "chain"; chain: Chain }
  );

/** Pug constructs with no counterpart in a pure render template. */
const UNSUPPORTED = new Map<string, string>(
  Object.entries({
    mixin:
      "Mixin definitions are not supported: a component is its own file, " +
      "import it and call it with `+Name`",
    include: "`include` is not supported: import a component instead",
    extends: "`extends` is not supported: use components and `+outlet`",
    block: "`block` is not supported: use components and `+outlet`",
    append: "`append` is not supported",
    prepend: "`prepend` is not supported",
    yield: "`yield` is not supported",
    doctype: "`doctype` is not supported: a template renders a fragment",
    while: "`while` is not supported: use `each`",
  }),
);

const isLetter = (c: string | undefined): boolean =>
  c !== undefined && /[A-Za-z]/.test(c);
const isIdStart = (c: string | undefined): boolean =>
  c !== undefined && /[A-Za-z_$]/.test(c);
const isIdChar = (c: string | undefined): boolean =>
  c !== undefined && /[\w$]/.test(c);
const isNameChar = (c: string | undefined): boolean =>
  c !== undefined && /[\w-]/.test(c);
const isWs = (c: string | undefined): boolean =>
  c === " " || c === "\t" || c === "\n";

/** Characters that, next to whitespace, mean an expression goes on. */
const OPERATOR_START = /^(?:===|!==|==|!=|<=|>=|&&|\|\||\?\?|\?\.|[-+*/%<>?:])/;

export function lex(source: string): Stmt[] {
  return new Lexer(source).run();
}

class Lexer {
  private readonly src: string;
  private readonly starts: number[] = [0];
  /** Cursor. Between statements it rests on the `\n` ending the line. */
  private i = 0;
  /** Indent of the line being lexed (dot blocks must be deeper). */
  private lineIndent = 0;

  constructor(source: string) {
    this.src = source.replace(/\r\n?/g, "\n");
    for (let k = 0; k < this.src.length; k++)
      if (this.src[k] === "\n") this.starts.push(k + 1);
  }

  // ---- positions and errors ------------------------------------------------

  pos(offset: number): Pos {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - this.starts[lo] + 1 };
  }

  private fail(message: string, offset: number): never {
    const p = this.pos(offset);
    throw new TemplateError(message, p.line, p.col);
  }

  // ---- cursor helpers --------------------------------------------------------

  private eol(from = this.i): number {
    const n = this.src.indexOf("\n", from);
    return n < 0 ? this.src.length : n;
  }

  private atEol(): boolean {
    return this.i >= this.src.length || this.src[this.i] === "\n";
  }

  private skipSpaces(): void {
    while (this.src[this.i] === " ") this.i++;
  }

  private ident(): string | null {
    if (!isIdStart(this.src[this.i])) return null;
    const start = this.i;
    while (isIdChar(this.src[this.i])) this.i++;
    return this.src.slice(start, this.i);
  }

  /** `[A-Za-z]+` at the cursor, without moving it. */
  private peekWord(): string {
    let j = this.i;
    while (isLetter(this.src[j])) j++;
    return this.src.slice(this.i, j);
  }

  /** Index after the string literal starting at `at`. */
  private skipString(at: number): number {
    const q = this.src[at];
    for (let k = at + 1; k < this.src.length; ) {
      if (this.src[k] === "\\") k += 2;
      else if (this.src[k] === q) return k + 1;
      else k++;
    }
    return this.fail("Unterminated string", at);
  }

  /**
   * Index of the `}` matching the `{` at `open`, skipping strings. The
   * braces of one interpolation must close on the same line.
   */
  private matchBrace(open: number, errAt = open): number {
    let depth = 0;
    for (let k = open; k < this.src.length && this.src[k] !== "\n"; k++) {
      const c = this.src[k];
      if (c === '"' || c === "'") {
        const q = c;
        for (k++; k < this.src.length && this.src[k] !== q; k++) {
          if (this.src[k] === "\\") k++;
          if (this.src[k] === "\n") break;
        }
      } else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) return k;
    }
    return this.fail("Unclosed {", errAt);
  }

  /** The expression on the rest of the line (cursor ends at the `\n`). */
  private exprToEol(what: string): Expr {
    this.skipSpaces();
    const start = this.i;
    const end = this.eol();
    if (!this.src.slice(start, end).trim()) this.fail(what, start);
    this.i = end;
    return parseExpr(this.src.slice(start, end), this.pos(start));
  }

  // ---- lines -------------------------------------------------------------------

  run(): Stmt[] {
    const out: Stmt[] = [];
    while (this.i < this.src.length) {
      const ls = this.i;
      const end = this.eol(ls);
      if (!this.src.slice(ls, end).trim()) {
        this.i = end + 1;
        continue;
      }
      let j = ls;
      while (this.src[j] === " ") j++;
      if (this.src[j] === "\t") {
        this.fail("Tabs are not allowed, use spaces", j);
      }
      this.i = j;
      this.lineIndent = j - ls;
      const stmt = this.statement(j - ls);
      if (stmt) out.push(stmt);
      this.i++; // past the "\n"
    }
    return out;
  }

  /**
   * Non-blank lines indented deeper than `indent` that follow the cursor's
   * line: the body of a comment or of a dot block.
   */
  private blockLines(indent: number): { ls: number; n: number; eol: number }[] {
    const lines: { ls: number; n: number; eol: number }[] = [];
    let p = this.eol();
    while (p < this.src.length) {
      const ls = p + 1;
      const eol = this.eol(ls);
      if (!this.src.slice(ls, eol).trim()) {
        p = eol;
        continue;
      }
      let n = 0;
      while (this.src[ls + n] === " ") n++;
      if (this.src[ls + n] === "\t") {
        this.fail("Tabs are not allowed, use spaces", ls + n);
      }
      if (n <= indent) break;
      lines.push({ ls, n, eol });
      p = eol;
    }
    return lines;
  }

  private statement(indent: number): Stmt | null {
    const src = this.src;
    const start = this.i;
    const pos = this.pos(start);
    const base = { indent, pos };
    const c = src[start];

    if (src.startsWith("//", start)) {
      // `//` and `//-`: both are dropped, with their indented block.
      const lines = this.blockLines(indent);
      this.i = lines.length ? lines[lines.length - 1].eol : this.eol();
      return null;
    }
    if (c === "|") {
      this.i++;
      if (src[this.i] === " ") this.i++;
      return { ...base, kind: "text", pieces: this.pieces(null) };
    }
    if (c === "<") {
      this.fail(
        "Inline HTML is not supported: write elements as tags (`div.card`)",
        start,
      );
    }
    if (c === "-") return this.code(base);
    if (c === "=") {
      this.i++;
      return {
        ...base,
        kind: "code",
        expr: this.exprToEol("Expected an expression after ="),
      };
    }
    if (c === "!" && src[start + 1] === "=") this.failUnescaped(start);

    if (isLetter(c)) {
      const word = this.peekWord();
      const after = src[start + word.length];
      const boundary = after === undefined || after === " " || after === "\n";
      if (boundary || (word === "default" && after === ":")) {
        const s = this.keyword(word, base);
        if (s !== undefined) return s;
      }
    }
    if (c === "+" || c === "." || c === "#" || isLetter(c)) {
      return { ...base, kind: "chain", chain: this.chain() };
    }
    return this.fail(
      `Cannot parse line "${src.slice(start, this.eol()).trim()}"`,
      start,
    );
  }

  private failUnescaped(at: number): never {
    return this.fail(
      "Unescaped output (`!=`, `!{}`) is not supported: output is always escaped, " +
        "templates cannot produce raw HTML",
      at,
    );
  }

  /** `- import Name from "path"`; any other unbuffered code is rejected. */
  private code(base: { indent: number; pos: Pos }): Stmt {
    const src = this.src;
    this.i++;
    this.skipSpaces();
    const at = this.i;
    if (this.peekWord() !== "import") {
      this.fail(
        'Unbuffered code is not supported; the only `-` line is `- import Name from "path"`',
        at,
      );
    }
    this.i += 6;
    this.skipSpaces();
    const local = this.ident();
    if (local === null)
      this.fail("Expected a component name after `import`", this.i);
    this.skipSpaces();
    if (this.peekWord() !== "from") this.fail('Expected `from "path"`', this.i);
    this.i += 4;
    this.skipSpaces();
    const q = src[this.i];
    if (q !== '"' && q !== "'") this.fail("Expected a quoted path", this.i);
    const close = src.indexOf(q, this.i + 1);
    if (close < 0 || close > this.eol())
      this.fail("Unterminated string", this.i);
    const from = src.slice(this.i + 1, close);
    this.i = close + 1;
    this.skipSpaces();
    if (!this.atEol()) this.fail("Unexpected text after import", this.i);
    return { ...base, kind: "import", local: local!, from };
  }

  /** Statements that start with a keyword; `undefined`: it is a tag after all. */
  private keyword(
    word: string,
    base: { indent: number; pos: Pos },
  ): Stmt | undefined {
    const at = this.i;
    const unsupported = UNSUPPORTED.get(word);
    if (unsupported) this.fail(unsupported, at);
    switch (word) {
      case "if":
      case "unless": {
        this.i += word.length;
        const test = this.exprToEol(`\`${word}\` needs a condition`);
        return word === "if"
          ? { ...base, kind: "if", test }
          : { ...base, kind: "if", test: { k: "unary", op: "!", arg: test } };
      }
      case "else": {
        this.i += 4;
        this.skipSpaces();
        if (this.atEol()) return { ...base, kind: "else" };
        if (this.peekWord() === "if" && isWs(this.src[this.i + 2])) {
          this.i += 2;
          const test = this.exprToEol("`else if` needs a condition");
          return { ...base, kind: "elseif", test };
        }
        return this.fail(
          "Expected `if` or the end of the line after `else`",
          this.i,
        );
      }
      case "each":
      case "for":
        this.i += word.length;
        return this.each(base);
      case "case":
        this.i += 4;
        return {
          ...base,
          kind: "case",
          subject: this.exprToEol("`case` needs an expression"),
        };
      case "when":
        return this.when(base);
      case "default": {
        this.i += 7;
        this.skipSpaces();
        let inline: Chain | null = null;
        if (this.src[this.i] === ":") {
          this.i++;
          this.skipSpaces();
          if (!this.atEol()) inline = this.chain();
        } else if (!this.atEol()) {
          this.fail("Unexpected text after `default`", this.i);
        }
        return { ...base, kind: "default", inline };
      }
    }
    return undefined;
  }

  /** `each item[, index] in expr [key expr]` (`for` is an alias). */
  private each(base: { indent: number; pos: Pos }): Stmt {
    const src = this.src;
    const expected = "Expected `item in expr` or `item, index in expr`";
    this.skipSpaces();
    const item = this.ident() ?? this.fail(expected, this.i);
    this.skipSpaces();
    let index: string | null = null;
    if (src[this.i] === ",") {
      this.i++;
      this.skipSpaces();
      index = this.ident() ?? this.fail(expected, this.i);
      this.skipSpaces();
    }
    if (this.peekWord() !== "in" || !isWs(src[this.i + 2])) {
      this.fail(expected, this.i);
    }
    this.i += 2;
    this.skipSpaces();
    const start = this.i;
    const end = this.eol();
    const rest = src.slice(start, end);
    if (!rest.trim()) this.fail("Expected a list expression after `in`", start);

    // Extension: a trailing `key expr` names the reconciliation key.
    const k = findKey(rest);
    this.i = end;
    if (!k) {
      return {
        ...base,
        kind: "each",
        item,
        index,
        of: parseExpr(rest, this.pos(start)),
        key: null,
      };
    }
    const keySrc = rest.slice(k.keyStart);
    if (!keySrc.trim())
      this.fail("`key` needs an expression", start + k.keyStart - 3);
    return {
      ...base,
      kind: "each",
      item,
      index,
      of: parseExpr(rest.slice(0, k.end), this.pos(start)),
      key: parseExpr(keySrc, this.pos(start + k.keyStart)),
    };
  }

  /** `when expr` with an optional `: tag` expansion on the same line. */
  private when(base: { indent: number; pos: Pos }): Stmt {
    this.i += 4;
    this.skipSpaces();
    const start = this.i;
    const rest = this.src.slice(start, this.eol());
    if (!rest.trim()) this.fail("`when` needs a value", start);
    const colon = findBlockColon(rest);
    const exprSrc = colon < 0 ? rest : rest.slice(0, colon);
    if (!exprSrc.trim()) this.fail("`when` needs a value", start);
    const test = parseExpr(exprSrc, this.pos(start));
    let inline: Chain | null = null;
    if (colon < 0) this.i = start + rest.length;
    else {
      this.i = start + colon + 1;
      this.skipSpaces();
      if (!this.atEol()) inline = this.chain();
    }
    return { ...base, kind: "when", test, inline };
  }

  // ---- element chains ----------------------------------------------------------

  /** `a: b: c(x) text` / `p= expr` / `p.` + raw lines / `br/` / `+Name(...)`. */
  private chain(): Chain {
    const src = this.src;
    const items: ChainItem[] = [];
    const indent = this.lineIndent;
    for (;;) {
      const item = this.item();
      items.push(item);
      const c = src[this.i];
      if (c === ":" && src[this.i + 1] === " ") {
        if (item.kind !== "tag") {
          this.fail("This line cannot have children", this.i);
        }
        this.i++;
        this.skipSpaces();
        if (this.atEol()) this.fail("Expected an element after `:`", this.i);
        continue;
      }
      return { items, ...this.tail(item, indent) };
    }
  }

  /** What follows the last head of a line. */
  private tail(
    item: ChainItem,
    indent: number,
  ): { selfClosing: boolean; body: Body } {
    const src = this.src;
    const none = { selfClosing: false, body: { kind: "none" } as Body };
    if (item.kind === "outlet") {
      this.skipSpaces();
      if (!this.atEol()) this.fail("`+outlet` takes nothing after it", this.i);
      return none;
    }
    const c = src[this.i];
    if (this.atEol()) return none;
    if (c === "/" || c === ".") {
      const at = this.i;
      this.i++;
      this.skipSpaces();
      if (!this.atEol()) {
        this.fail(`Unexpected "${src[at]}"`, at);
      }
      if (c === "/") return { selfClosing: true, body: { kind: "none" } };
      if (item.kind !== "tag")
        this.fail('Unexpected "." after a component', at);
      // Dot block: every deeper line is raw text (interpolation still works).
      const lines = this.blockLines(indent);
      const out: { pieces: Piece[]; line: number }[] = [];
      const base = lines.length ? lines[0].n : 0;
      for (const l of lines) {
        if (l.n < base) this.fail("Inconsistent indentation", l.ls + l.n);
        this.i = l.ls + base;
        out.push({ pieces: this.pieces(null), line: this.pos(l.ls).line });
      }
      this.i = lines.length ? lines[lines.length - 1].eol : this.eol();
      return { selfClosing: false, body: { kind: "dot", lines: out } };
    }
    if (c === "!" && src[this.i + 1] === "=") this.failUnescaped(this.i);
    if (c === "=") {
      if (item.kind !== "tag") {
        this.fail('Unexpected "=" after a component', this.i);
      }
      this.i++;
      const expr = this.exprToEol("Expected an expression after =");
      return { selfClosing: false, body: { kind: "expr", expr } };
    }
    if (c === " ") {
      this.skipSpaces();
      if (this.atEol()) return none;
      if (item.kind !== "tag") {
        this.fail("Unexpected text after a component", this.i);
      }
      const pieces = this.pieces(null);
      return {
        selfClosing: false,
        body: pieces.length ? { kind: "text", pieces } : { kind: "none" },
      };
    }
    return this.fail(`Unexpected "${c}"`, this.i);
  }

  private item(): ChainItem {
    return this.src[this.i] === "+" ? this.plus() : this.tagHead();
  }

  private tagHead(): TagHead {
    const src = this.src;
    const start = this.i;
    let tag: string | null = null;
    if (isLetter(src[this.i])) {
      while (isNameChar(src[this.i])) this.i++;
      tag = src.slice(start, this.i);
    }
    const items = this.headItems(true);
    if (this.i === start) {
      this.fail(
        `Cannot parse line "${src.slice(start, this.eol()).trim()}"`,
        start,
      );
    }
    return { kind: "tag", tag, pos: this.pos(start), items };
  }

  /**
   * `.class`, `#id`, `(attrs)` and `&attributes(expr)` in any order. A
   * component call takes only attribute lists.
   */
  private headItems(allowNames: boolean): HeadItem[] {
    const src = this.src;
    const items: HeadItem[] = [];
    for (;;) {
      const c = src[this.i];
      if (
        allowNames &&
        (c === "." || c === "#") &&
        isNameChar(src[this.i + 1])
      ) {
        const pos = this.pos(this.i);
        const start = ++this.i;
        while (isNameChar(src[this.i])) this.i++;
        const name = src.slice(start, this.i);
        items.push({ kind: c === "." ? "class" : "id", name, pos });
      } else if (c === "(") {
        items.push({ kind: "attrs", attrs: this.attrList() });
      } else if (c === "&" && src.startsWith("&attributes(", this.i)) {
        const pos = this.pos(this.i);
        const open = this.i + 11;
        const close = this.matchParen(open);
        const expr = parseExpr(src.slice(open + 1, close), this.pos(open + 1));
        this.i = close + 1;
        items.push({ kind: "amp", expr, pos });
      } else return items;
    }
  }

  /** Index of the `)` matching the `(` at `open`. */
  private matchParen(open: number): number {
    let depth = 0;
    for (let k = open; k < this.src.length; k++) {
      const c = this.src[k];
      if (c === '"' || c === "'") k = this.skipString(k) - 1;
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) return k;
    }
    return this.fail("Unclosed (", open);
  }

  /** `+outlet`, `+Name#instance(props)` or `+#{expr}#instance(props)`. */
  private plus(): EmbedHead | OutletHead {
    const src = this.src;
    const start = this.i;
    const pos = this.pos(start);
    this.i++;
    let component: string | null = null;
    let dynamic: Expr | null = null;
    const namePos = this.pos(this.i);
    if (src[this.i] === "#" && src[this.i + 1] === "{") {
      const close = this.matchBrace(this.i + 1, this.i);
      dynamic = parseExpr(src.slice(this.i + 2, close), this.pos(this.i + 2));
      this.i = close + 1;
    } else {
      const name = this.ident();
      if (name === null) {
        this.fail("Expected a component name or #{expression} after +", this.i);
      }
      if (name === "outlet") return { kind: "outlet", pos };
      component = name;
    }
    let instance: string | null = null;
    if (src[this.i] === "#") {
      this.i++;
      instance = this.ident();
      if (instance === null) {
        this.fail("Instance name must be an identifier", this.i - 1);
      }
    }
    if (src[this.i] === "." && isNameChar(src[this.i + 1])) {
      this.fail("Classes are not supported on components", this.i);
    }
    const items = this.headItems(false);
    return { kind: "embed", component, dynamic, instance, namePos, pos, items };
  }

  // ---- attribute lists -----------------------------------------------------------

  /** `(a=1 b="x #{y}" c, @click="go(item)")`, possibly over several lines. */
  private attrList(): RawAttr[] {
    const src = this.src;
    const open = this.i;
    this.i++;
    const attrs: RawAttr[] = [];
    for (;;) {
      while (isWs(src[this.i]) || src[this.i] === ",") this.i++;
      if (this.i >= src.length) this.fail("Unclosed (", open);
      if (src[this.i] === ")") {
        this.i++;
        return attrs;
      }
      const start = this.i;
      while (
        this.i < src.length &&
        !isWs(src[this.i]) &&
        !"=,)(!\"'".includes(src[this.i])
      ) {
        this.i++;
      }
      if (this.i === start) {
        this.fail(`Unexpected "${src[start]}" in attributes`, start);
      }
      const name = src.slice(start, this.i);
      const pos = this.pos(start);
      while (isWs(src[this.i])) this.i++;
      if (src[this.i] === "!" && src[this.i + 1] === "=") {
        this.fail(
          "Unescaped attribute values (`!=`) are not supported: use `=`",
          this.i,
        );
      }
      if (src[this.i] !== "=") {
        attrs.push({ name, pos, form: "bool", parts: null });
        continue;
      }
      this.i++;
      while (isWs(src[this.i])) this.i++;
      attrs.push(this.attrValue(name, pos));
    }
  }

  private attrValue(name: string, pos: Pos): RawAttr {
    const src = this.src;
    const c = src[this.i];
    if (c === '"' || c === "'") {
      // The closing quote: `#{ ... }` may contain quotes of its own.
      let j = this.i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j += 2;
        else if (src[j] === "#" && src[j + 1] === "{") {
          j = this.matchBrace(j + 1, j) + 1;
        } else j++;
      }
      if (j >= src.length) this.fail("Unterminated string", this.i);
      // `"a" + b`: an operator after the closing quote makes it an expression.
      const after = this.skipWs(j + 1);
      if (OPERATOR_START.test(src.slice(after, after + 3))) {
        return this.exprValue(name, pos);
      }
      const from = this.i + 1;
      const parts = this.attrParts(from, j, c);
      this.i = j + 1;
      return {
        name,
        pos,
        form: "string",
        parts,
        inner: { text: src.slice(from, j), at: this.pos(from) },
      };
    }
    return this.exprValue(name, pos);
  }

  private skipWs(from: number): number {
    while (isWs(this.src[from])) from++;
    return from;
  }

  /** An unquoted attribute value: a JS expression. */
  private exprValue(name: string, pos: Pos): RawAttr {
    const src = this.src;
    const end = this.valueEnd(this.i);
    if (end === this.i) this.fail(`Expected a value after "${name}="`, this.i);
    const expr = parseExpr(src.slice(this.i, end), this.pos(this.i));
    this.i = end;
    return { name, pos, form: "expr", parts: [expr] };
  }

  /**
   * End of an unquoted attribute value. It stops at a `,` or `)` outside
   * brackets, and at whitespace unless an operator continues the expression
   * (`a=b + c`, `a=x ? y : z`) so `bool other=expr` still splits.
   */
  private valueEnd(from: number): number {
    const src = this.src;
    let depth = 0;
    let j = from;
    while (j < src.length) {
      const d = src[j];
      if (d === '"' || d === "'") {
        j = this.skipString(j);
        continue;
      }
      if (d === "(" || d === "[" || d === "{") depth++;
      else if (d === ")" || d === "]" || d === "}") {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0 && d === ",") break;
      else if (depth === 0 && isWs(d)) {
        let n = j;
        while (isWs(src[n])) n++;
        const joins =
          n < src.length &&
          (OPERATOR_START.test(src.slice(n, n + 3)) ||
            /[-+*/%<>?:&|=!]/.test(src[j - 1]));
        if (!joins) break;
        j = n;
        continue;
      }
      j++;
    }
    return j;
  }

  /** The text of a quoted attribute: literal strings and `#{expr}`. */
  private attrParts(from: number, to: number, quote: string): Part[] {
    const src = this.src;
    const parts: Part[] = [];
    let lit = "";
    for (let j = from; j < to; ) {
      const c = src[j];
      if (c === "\\" && (src[j + 1] === quote || src[j + 1] === "\\")) {
        lit += src[j + 1];
        j += 2;
      } else if (c === "\\" && src[j + 1] === "#" && src[j + 2] === "{") {
        lit += "#{";
        j += 3;
      } else if (c === "#" && src[j + 1] === "{") {
        const close = this.matchBrace(j + 1, j);
        if (lit) parts.push(lit);
        lit = "";
        parts.push(parseExpr(src.slice(j + 2, close), this.pos(j + 2)));
        j = close + 1;
      } else if (c === "!" && src[j + 1] === "{") {
        this.failUnescaped(j);
      } else {
        lit += c;
        j++;
      }
    }
    if (lit) parts.push(lit);
    return parts;
  }

  // ---- text ---------------------------------------------------------------------------

  /**
   * Text up to the end of the line (`open === null`), or up to the `]`
   * closing the `#[` at offset `open`. `\#{` and `\#[` are literal.
   */
  private pieces(open: number | null): Piece[] {
    const src = this.src;
    const out: Piece[] = [];
    let lit = "";
    let depth = 0;
    const flush = (): void => {
      if (lit) out.push(lit);
      lit = "";
    };
    for (;;) {
      const c = src[this.i];
      if (c === undefined || c === "\n") {
        if (open !== null) this.fail("Unclosed #[", open);
        break;
      }
      if (
        c === "\\" &&
        src[this.i + 1] === "#" &&
        "{[".includes(src[this.i + 2] ?? "")
      ) {
        lit += src.slice(this.i + 1, this.i + 3);
        this.i += 3;
      } else if (c === "#" && src[this.i + 1] === "{") {
        const close = this.matchBrace(this.i + 1, this.i);
        flush();
        out.push(parseExpr(src.slice(this.i + 2, close), this.pos(this.i + 2)));
        this.i = close + 1;
      } else if (c === "!" && src[this.i + 1] === "{") {
        this.failUnescaped(this.i);
      } else if (c === "#" && src[this.i + 1] === "[") {
        flush();
        out.push(this.inlineTag());
      } else {
        if (open !== null && c === "[") depth++;
        else if (open !== null && c === "]") {
          if (depth === 0) break;
          depth--;
        }
        lit += c;
        this.i++;
      }
    }
    flush();
    if (open === null) {
      const last = out[out.length - 1];
      if (typeof last === "string") {
        const t = last.trimEnd();
        if (t) out[out.length - 1] = t;
        else out.pop();
      }
    }
    return out;
  }

  /** `#[tag.cls(attr) text]` inside text. */
  private inlineTag(): InlineTag {
    const src = this.src;
    const open = this.i;
    this.i += 2;
    const c = src[this.i];
    if (!(isLetter(c) || c === "." || c === "#")) {
      this.fail("Expected a tag after #[", this.i);
    }
    const head = this.tagHead();
    let pieces: Piece[] = [];
    if (src[this.i] === " ") {
      this.i++;
      pieces = this.pieces(open);
    } else if (src[this.i] !== "]") {
      this.fail(`Unexpected "${src[this.i] ?? "end of line"}"`, this.i);
    }
    if (src[this.i] !== "]") this.fail("Unclosed #[", open);
    this.i++;
    return { inline: true, head, pieces };
  }
}

/**
 * Splits `list key expr` at the whitespace before a standalone `key` word
 * outside brackets and strings. `end` is where the list ends, `keyStart`
 * where the key expression begins (in `src`).
 */
function findKey(src: string): { end: number; keyStart: number } | null {
  let depth = 0;
  for (let k = 0; k < src.length; k++) {
    const c = src[k];
    if (c === '"' || c === "'") {
      for (k++; k < src.length && src[k] !== c; k++) if (src[k] === "\\") k++;
    } else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && isWs(c)) {
      let n = k;
      while (isWs(src[n])) n++;
      if (
        src.startsWith("key", n) &&
        (n + 3 >= src.length || isWs(src[n + 3]))
      ) {
        return { end: k, keyStart: n + 3 };
      }
    }
  }
  return null;
}

/**
 * Index of the `:` that ends a `when` value and starts a `tag` expansion:
 * a colon followed by a space that does not belong to a `?:` ternary.
 */
function findBlockColon(src: string): number {
  let depth = 0;
  let pending = 0;
  for (let k = 0; k < src.length; k++) {
    const c = src[k];
    if (c === '"' || c === "'") {
      for (k++; k < src.length && src[k] !== c; k++) if (src[k] === "\\") k++;
    } else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (
      depth === 0 &&
      c === "?" &&
      src[k + 1] !== "." &&
      src[k + 1] !== "?"
    ) {
      pending++;
    } else if (depth === 0 && c === ":") {
      if (pending > 0) pending--;
      else if (src[k + 1] === " " || k + 1 === src.length) return k;
    }
  }
  return -1;
}
