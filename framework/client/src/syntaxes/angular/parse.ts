import type {
  Attr,
  ClassToggle,
  ElementNode,
  EventBinding,
  Expr,
  ForNode,
  IfNode,
  ImportDecl,
  Node,
  Part,
  Prop,
  TemplateAst,
  TextNode,
} from "../../template/ast.ts";
import { TemplateError } from "../../template/errors.ts";
import { parseEvent, parseExpr } from "../../template/expr.ts";
import { decodeEntities } from "./entities.ts";
import {
  findInterpEnd,
  Source,
  tokenize,
  type RawAttr,
  type Token,
} from "./lexer.ts";

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/** Names the generated code itself uses; an import must not shadow them. */
const RESERVED_IMPORTS = new Set(["String", "Array", "Map", "Set", "Error"]);

const IDENT = /^[A-Za-z_$][\w$]*$/;
const HTML_WS = "[ \\t\\r\\n\\f]";

/** One piece of text or attribute value: literal source or `{{ expr }}`. */
type Seg = { lit: string } | { expr: Expr };

/** What an attribute turned out to be, before we know what element it is on. */
type Entry =
  | {
      k: "attr";
      name: string;
      value: Part[] | null;
      bound: boolean;
      at: number;
    }
  | { k: "toggle"; name: string; test: Expr; at: number }
  | { k: "event"; ev: EventBinding; at: number }
  | { k: "spread"; expr: Expr; at: number }
  | { k: "ref"; name: string; at: number }
  | { k: "if"; test: Expr; at: number }
  | {
      k: "for";
      item: string;
      of: Expr;
      key: Expr | null;
      index: string | null;
      at: number;
    };

type Structural = Extract<Entry, { k: "if" | "for" }>;

/** An open container while building the tree. */
interface Frame {
  kind: "root" | "element" | "container" | "leaf" | "block";
  /** Tag name, or `@if` / `@for` / ... for blocks. */
  name: string;
  /** Source offset of the opening token, for "unclosed" errors. */
  at: number;
  /** Where children go; `null` for nodes that cannot have any. */
  list: Node[] | null;
  /** `@for` only: the node, its explicit `let i = $index` and `$index` uses. */
  loop?: { node: ForNode; alias: string | null; refs: Expr[] };
}

/** Appends `node` to `list`, joining adjacent text with a newline. */
function push(list: Node[], node: Node): void {
  const previous = list[list.length - 1];
  if (node.type === "text" && previous?.type === "text") {
    node.parts.unshift("\n");
  }
  list.push(node);
}

/** Collects every identifier node called `name` in `e`. */
function collectIds(e: Expr, name: string, out: Expr[]): void {
  switch (e.k) {
    case "id":
      if (e.name === name) out.push(e);
      break;
    case "member":
      collectIds(e.obj, name, out);
      break;
    case "index":
      collectIds(e.obj, name, out);
      collectIds(e.index, name, out);
      break;
  }
}

/**
 * Splits `text` at top-level `sep` (outside quotes and brackets); returns the
 * pieces with their offsets in `text`.
 */
function splitTop(
  text: string,
  sep: string,
): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let depth = 0;
  let quote = "";
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === sep && depth === 0) {
      out.push({ text: text.slice(from, i), start: from });
      from = i + 1;
    }
  }
  out.push({ text: text.slice(from), start: from });
  return out;
}

/** Offset of the first non-whitespace character at or after `from`. */
function skipWs(text: string, from = 0): number {
  while (from < text.length && new RegExp(HTML_WS).test(text[from])) from++;
  return from;
}

class AngularParser {
  private readonly src: Source;
  private nid = 0;
  private readonly imports: ImportDecl[] = [];
  private readonly importNames = new Set<string>();
  /** Tag name -> imported local name. */
  private readonly selectors = new Map<string, string>();
  private readonly stack: Frame[] = [];
  /** Set once anything but comments and whitespace was seen. */
  private started = false;
  /** `if` nodes an `@else` must not attach to. */
  private readonly sealed = new Set<IfNode>();

  constructor(source: string) {
    this.src = new Source(source);
  }

  run(): TemplateAst {
    const roots: Node[] = [];
    this.stack.push({ kind: "root", name: "", at: 0, list: roots });
    for (const tok of tokenize(this.src)) this.token(tok);
    const top = this.top();
    if (top.kind !== "root") {
      this.src.fail(
        top.kind === "block"
          ? `Unclosed ${top.name} block (missing "}")`
          : `Unclosed <${top.name}>`,
        top.at,
      );
    }
    return { imports: this.imports, nodes: roots };
  }

  // -- plumbing --------------------------------------------------------------

  private top(): Frame {
    return this.stack[this.stack.length - 1];
  }

  /** The list new nodes go to; fails inside nodes that take no children. */
  private list(at: number): Node[] {
    const f = this.top();
    if (!f.list) {
      this.src.fail(`<${f.name}> cannot have children`, at);
    }
    return f.list!;
  }

  private fail(message: string, at: number): never {
    return this.src.fail(message, at);
  }

  /**
   * `parseExpr` for the expression starting at source offset `at`. Error
   * positions are mapped back into the original text (also across lines), and
   * `$index` is recorded for the enclosing `@for`.
   */
  private expr(code: string, at: number): Expr {
    const start = this.src.pos(at);
    let e: Expr;
    try {
      e = parseExpr(code, start);
    } catch (err) {
      if (err instanceof TemplateError && err.line === start.line) {
        const message = err.message.replace(/ \(line \d+, col \d+\)$/, "");
        this.fail(message, at + (err.col - start.col));
      }
      throw err;
    }
    const refs: Expr[] = [];
    collectIds(e, "$index", refs);
    if (refs.length) {
      const loop = [...this.stack].reverse().find((f) => f.loop)?.loop;
      if (!loop) this.fail("`$index` is only available inside @for", at);
      loop!.refs.push(...refs);
    }
    return e;
  }

  // -- text ------------------------------------------------------------------

  /** Splits `raw` into literal source and `{{ expr }}` segments. */
  private segments(raw: string, base: number): Seg[] {
    const out: Seg[] = [];
    let from = 0;
    for (;;) {
      const open = raw.indexOf("{{", from);
      const lit = raw.slice(from, open < 0 ? raw.length : open);
      if (lit) out.push({ lit });
      if (open < 0) return out;
      const end = findInterpEnd(raw, open + 2);
      if (end < 0) this.fail("Unclosed {{", base + open);
      out.push({ expr: this.expr(raw.slice(open + 2, end), base + open + 2) });
      from = end + 2;
    }
  }

  /** Attribute value parts: interpolation kept, entities decoded. */
  private attrParts(raw: string, base: number): Part[] {
    return this.segments(raw, base).map((s) =>
      "lit" in s ? decodeEntities(s.lit) : s.expr,
    );
  }

  private text(tok: Extract<Token, { t: "text" }>): void {
    const segs: Seg[] =
      tok.mode === "raw"
        ? [{ lit: tok.raw }]
        : this.segments(tok.raw, tok.start);
    const parts: Part[] = [];
    segs.forEach((s, i) => {
      if ("expr" in s) {
        parts.push(s.expr);
        return;
      }
      // Lines are trimmed and joined with "\n"; blank lines vanish. Only
      // HTML whitespace counts, so a decoded &nbsp; survives.
      let t = s.lit.replace(new RegExp(`${HTML_WS}*\\n${HTML_WS}*`, "g"), "\n");
      if (i === 0) t = t.replace(new RegExp(`^${HTML_WS}+`), "");
      if (i === segs.length - 1) t = t.replace(new RegExp(`${HTML_WS}+$`), "");
      if (t) parts.push(tok.mode === "raw" ? t : decodeEntities(t));
    });
    if (!parts.length) return;
    this.started = true;
    const list = this.list(tok.start);
    const node: TextNode = {
      type: "text",
      nid: this.nid++,
      line: this.src.pos(tok.start).line,
      parts,
    };
    push(list, node);
  }

  // -- tokens ----------------------------------------------------------------

  private token(tok: Token): void {
    switch (tok.t) {
      case "text":
        return this.text(tok);
      case "comment":
        return this.comment(tok);
      case "open":
        this.started = true;
        return this.open(tok);
      case "close":
        return this.close(tok);
      case "block":
        this.started = true;
        return this.block(tok);
      case "blockEnd":
        return this.blockEnd(tok);
    }
  }

  /** `<!-- import Name from "path" [as selector] -->` or an ordinary comment. */
  private comment(tok: Extract<Token, { t: "comment" }>): void {
    const lead = skipWs(tok.body);
    if (!/^import\s/.test(tok.body.slice(lead))) return;
    const at = tok.bodyStart + lead;
    const m =
      /^import\s+([A-Za-z_$][\w$]*)\s+from\s+(?:"([^"]+)"|'([^']+)')(?:\s+as\s+([A-Za-z][\w-]*))?\s*$/.exec(
        tok.body.slice(lead),
      );
    if (!m) {
      this.fail(
        'Malformed import. Write <!-- import Name from "./path" --> or <!-- import Name from "./path" as app-name -->',
        at,
      );
    }
    const [, local, dq, sq, as] = m!;
    if (this.started || this.top().kind !== "root") {
      this.fail("`import` comments must be at the top of the file", at);
    }
    if (!/^[A-Z]/.test(local) || RESERVED_IMPORTS.has(local)) {
      this.fail(
        `"${local}" cannot be used as a component name (start with a capital letter, not ${[...RESERVED_IMPORTS].join("/")})`,
        at,
      );
    }
    if (this.importNames.has(local))
      this.fail(`"${local}" is imported twice`, at);
    const selector = as ?? local;
    if (this.selectors.has(selector)) {
      this.fail(`<${selector}> is already used by another import`, at);
    }
    this.importNames.add(local);
    this.selectors.set(selector, local);
    this.imports.push({ local, from: dq ?? sq });
  }

  private close(tok: Extract<Token, { t: "close" }>): void {
    if (VOID_TAGS.has(tok.name.toLowerCase())) {
      this.fail(
        `<${tok.name}> is a void element and has no end tag`,
        tok.start,
      );
    }
    const top = this.top();
    if (top.kind === "root") {
      this.fail(`Unexpected closing tag </${tok.name}>`, tok.start);
    }
    if (top.kind === "block") {
      this.fail(
        `Unexpected </${tok.name}>: the ${top.name} block is still open (missing "}")`,
        tok.start,
      );
    }
    if (top.name.toLowerCase() !== tok.name.toLowerCase()) {
      this.fail(
        `Unexpected closing tag </${tok.name}>, expected </${top.name}>`,
        tok.start,
      );
    }
    this.stack.pop();
  }

  private blockEnd(tok: Extract<Token, { t: "blockEnd" }>): void {
    const top = this.top();
    if (top.kind === "root") {
      this.fail('Unexpected "}" (write a literal brace as &#125;)', tok.start);
    }
    if (top.kind !== "block") {
      this.fail(`Unexpected "}": <${top.name}> is still open`, tok.start);
    }
    // `@for` decides how its index is called once its body was parsed.
    const loop = top.loop;
    if (loop) {
      const index = loop.alias ?? (loop.refs.length ? "$index" : null);
      loop.node.index = index;
      for (const r of loop.refs) if (r.k === "id") r.name = index!;
    }
    this.stack.pop();
  }

  // -- control-flow blocks ---------------------------------------------------

  private block(tok: Extract<Token, { t: "block" }>): void {
    const at = tok.start;
    const line = this.src.pos(at).line;
    const parent = this.top();
    if (tok.kind === "if") {
      const test = this.expr(tok.header!, tok.headerStart);
      const node: IfNode = {
        type: "if",
        nid: this.nid++,
        line,
        branches: [{ test, children: [] }],
      };
      push(this.list(at), node);
      this.stack.push({
        kind: "block",
        name: "@if",
        at,
        list: node.branches[0].children,
      });
    } else if (tok.kind === "else if" || tok.kind === "else") {
      const prev = parent.list?.[parent.list.length - 1];
      if (
        prev?.type !== "if" ||
        this.sealed.has(prev) ||
        prev.branches[prev.branches.length - 1].test === null
      ) {
        this.fail(`@${tok.kind} without a matching @if`, at);
      }
      const ifNode = prev as IfNode;
      const branch = {
        test:
          tok.kind === "else if"
            ? this.expr(tok.header!, tok.headerStart)
            : null,
        children: [] as Node[],
      };
      ifNode.branches.push(branch);
      this.stack.push({
        kind: "block",
        name: `@${tok.kind}`,
        at,
        list: branch.children,
      });
    } else if (tok.kind === "empty") {
      // `@for (...) {...} @empty {...}`: a sibling `if` on the loop's length.
      const prev = parent.list?.[parent.list.length - 1];
      if (prev?.type !== "for") {
        this.fail("@empty without a matching @for", at);
      }
      // `@empty` needs `if !list.length` — negation left the template language
      // (a template reads ready flags); the converter cannot express it, so
      // the ported code must pass an `isEmpty` flag from code instead.
      this.fail(
        "@empty needs `!list.length`, which the template language no longer " +
          "expresses — pass an isEmpty flag from code instead " +
          "(framework/docs/philosophy.md)",
        tok.start,
      );
    } else this.forBlock(tok, line);
  }

  /** `@for (item of items; track item.id; let i = $index) {` */
  private forBlock(tok: Extract<Token, { t: "block" }>, line: number): void {
    const header = tok.header!;
    const base = tok.headerStart;
    const [head, ...options] = splitTop(header, ";");
    const m = new RegExp(
      `^(${HTML_WS}*)([A-Za-z_$][\\w$]*)(${HTML_WS}+of${HTML_WS}+)`,
    ).exec(head.text);
    if (!m) {
      this.fail(
        "Expected `item of items` at the start of @for",
        base + skipWs(head.text),
      );
    }
    const item = m![2];
    const of = this.expr(head.text.slice(m![0].length), base + m![0].length);

    let alias: string | null = null;
    let trackSrc: { code: string; at: number } | null = null;
    for (const opt of options) {
      const at = base + opt.start + skipWs(opt.text);
      const body = opt.text.trim();
      if (!body) continue;
      if (/^track\s/.test(body)) {
        const off = skipWs(opt.text) + 5 + skipWs(body.slice(5));
        trackSrc = {
          code: opt.text.slice(off),
          at: base + opt.start + off,
        };
      } else if (/^let\s/.test(body)) {
        for (const decl of splitTop(body.slice(3), ",")) {
          const d = /^\s*([A-Za-z_$][\w$]*)\s*=\s*([\w$]+)\s*$/.exec(decl.text);
          if (!d || d[2] !== "$index") {
            this.fail(
              "Only `let i = $index` is supported in @for (not $first, $last, $count, ...)",
              at,
            );
          }
          if (alias) this.fail("Only one `$index` alias is allowed", at);
          alias = d![1];
        }
      } else {
        this.fail(
          `Unexpected "${body}" in @for; expected \`track expr\` or \`let i = $index\``,
          at,
        );
      }
    }

    const node: ForNode = {
      type: "for",
      nid: this.nid++,
      line,
      item,
      index: null,
      of,
      key: null,
      children: [],
    };
    push(this.list(tok.start), node);
    const loop = { node, alias, refs: [] as Expr[] };
    this.stack.push({
      kind: "block",
      name: "@for",
      at: tok.start,
      list: node.children,
      loop,
    });
    if (trackSrc) {
      const key = this.expr(trackSrc.code, trackSrc.at);
      // `track $index` is what a loop without a key already does.
      const byIndex =
        key.k === "id" && (key.name === "$index" || key.name === alias);
      if (byIndex) loop.refs = loop.refs.filter((r) => r !== key);
      else node.key = key;
    }
  }

  // -- elements, components, containers --------------------------------------

  /** Turns raw attributes into entries, parsing every expression. */
  private entries(tok: Extract<Token, { t: "open" }>): Entry[] {
    const out: Entry[] = [];
    const structural: Structural[] = [];
    for (const a of tok.attrs) {
      const e = this.entry(a);
      if (e.k === "if" || e.k === "for") {
        if (structural.length) {
          this.fail(
            "Only one structural directive (*ngIf / *ngFor) per element; wrap in <ng-container>",
            a.nameStart,
          );
        }
        structural.push(e);
      }
      out.push(e);
    }
    return out;
  }

  private entry(a: RawAttr): Entry {
    const at = a.nameStart;
    const n = a.name;
    const needValue = (): string => {
      if (a.value === null) this.fail(`"${n}" needs a value`, at);
      return a.value!;
    };
    if (n.startsWith("*")) return this.structural(a);
    if (n.startsWith("[(")) {
      this.fail("Two-way binding [(x)] is not supported", at);
    }
    if (n.startsWith("[")) {
      if (!n.endsWith("]")) this.fail(`Expected "]" in ${n}`, at);
      const target = n.slice(1, -1);
      const test = this.expr(needValue(), a.valueStart);
      if (target.startsWith("class.")) {
        return { k: "toggle", name: target.slice(6), test, at };
      }
      if (target.startsWith("style")) {
        this.fail(
          "[style.x] is not supported; bind a class or the `style` attribute",
          at,
        );
      }
      if (target === "props") return { k: "spread", expr: test, at };
      const name = target.startsWith("attr.") ? target.slice(5) : target;
      return { k: "attr", name, value: [test], bound: true, at };
    }
    if (n.startsWith("(")) {
      if (!n.endsWith(")")) this.fail(`Expected ")" in ${n}`, at);
      const [name, ...mods] = n.slice(1, -1).split(".");
      for (const m of mods) {
        if (m !== "prevent" && m !== "stop") {
          this.fail(
            `Unknown event modifier ".${m}" (use .prevent or .stop)`,
            at,
          );
        }
      }
      const raw = needValue();
      const start = this.src.pos(a.valueStart);
      let msg: string;
      let args: Expr[];
      try {
        ({ msg, args } = parseEvent(raw, start));
      } catch (err) {
        if (err instanceof TemplateError && err.line === start.line) {
          const message = err.message.replace(/ \(line \d+, col \d+\)$/, "");
          this.fail(message, a.valueStart + (err.col - start.col));
        }
        throw err;
      }
      // The DOM event is never part of a message: `save($event)` is `save`.
      const evArgs = args.filter((x) => !(x.k === "id" && x.name === "$event"));
      return {
        k: "event",
        at,
        ev: {
          name,
          msg,
          args: evArgs,
          prevent: mods.includes("prevent"),
          stop: mods.includes("stop"),
        },
      };
    }
    if (n.startsWith("#")) {
      if (!IDENT.test(n.slice(1))) {
        this.fail("An instance name must be an identifier", at);
      }
      return { k: "ref", name: n.slice(1), at };
    }
    if (a.value === null)
      return { k: "attr", name: n, value: null, bound: false, at };
    return {
      k: "attr",
      name: n,
      value: this.attrParts(a.value, a.valueStart),
      bound: false,
      at,
    };
  }

  /** `save` / `users.remove` / `remove(item)` -> message id and arguments. */
  private message(e: Expr, at: number): { msg: string; args: Expr[] } {
    const name = (x: Expr): string | null =>
      x.k === "id"
        ? x.name
        : x.k === "member"
          ? name(x.obj) === null
            ? null
            : `${name(x.obj)}.${x.prop}`
          : null;
    const msg = name(e);
    if (msg === null) {
      this.fail(
        "Event handler must be a message id like `save` or `remove(item)`",
        at,
      );
    }
    return { msg: msg!, args: [] };
  }

  /** `*ngIf="expr"` and `*ngFor="let x of xs; trackBy: k; let i = index"`. */
  private structural(a: RawAttr): Structural {
    const at = a.nameStart;
    if (a.value === null) this.fail(`"${a.name}" needs a value`, at);
    const value = a.value!;
    const base = a.valueStart;
    const parts = splitTop(value, ";");
    if (a.name === "*ngIf") {
      const extra = parts.slice(1).find((p) => p.text.trim());
      if (extra) {
        this.fail(
          "`*ngIf` takes only a condition (no else/as); use @if / @else",
          base + extra.start + skipWs(extra.text),
        );
      }
      return { k: "if", test: this.expr(parts[0].text, base), at };
    }
    if (a.name !== "*ngFor") {
      this.fail(`Unknown structural directive ${a.name}`, at);
    }
    const first = parts[0];
    const m = new RegExp(
      `^(${HTML_WS}*let${HTML_WS}+)([A-Za-z_$][\\w$]*)(${HTML_WS}+of${HTML_WS}+)`,
    ).exec(first.text);
    if (!m) {
      this.fail(
        "Expected `let item of items` at the start of *ngFor",
        base + skipWs(first.text),
      );
    }
    const of = this.expr(first.text.slice(m![0].length), base + m![0].length);
    let key: Expr | null = null;
    let index: string | null = null;
    for (const p of parts.slice(1)) {
      const body = p.text.trim();
      if (!body) continue;
      const off = base + p.start + skipWs(p.text);
      let k: RegExpExecArray | null;
      let ix: RegExpExecArray | null;
      if ((k = /^trackBy\s*:\s*/.exec(body))) {
        key = this.expr(body.slice(k[0].length), off + k[0].length);
      } else if (
        (ix = /^let\s+([A-Za-z_$][\w$]*)\s*=\s*index$/.exec(body)) ||
        (ix = /^index\s+as\s+([A-Za-z_$][\w$]*)$/.exec(body))
      ) {
        index = ix[1];
      } else {
        this.fail(
          `Unexpected "${body}" in *ngFor; expected \`trackBy: expr\` or \`let i = index\``,
          off,
        );
      }
    }
    return { k: "for", item: m![2], of, key, index, at };
  }

  /**
   * Creates the `if` / `for` node a structural directive stands for, and
   * returns the list its subject goes into (or `list` when there is none).
   */
  private wrap(s: Structural | undefined, at: number): Node[] {
    const list = this.list(at);
    if (!s) return list;
    const line = this.src.pos(at).line;
    if (s.k === "if") {
      const node: IfNode = {
        type: "if",
        nid: this.nid++,
        line,
        branches: [{ test: s.test, children: [] }],
      };
      this.sealed.add(node);
      push(list, node);
      return node.branches[0].children;
    }
    const node: ForNode = {
      type: "for",
      nid: this.nid++,
      line,
      item: s.item,
      index: s.index,
      of: s.of,
      key: s.key,
      children: [],
    };
    push(list, node);
    return node.children;
  }

  private open(tok: Extract<Token, { t: "open" }>): void {
    const name = tok.name;
    const at = tok.start;
    const entries = this.entries(tok);
    const structural = entries.find((e) => e.k === "if" || e.k === "for") as
      | Structural
      | undefined;
    const rest = entries.filter((e) => e !== structural);
    const refOf = (): string | null =>
      (rest.find((e) => e.k === "ref") as { name: string } | undefined)?.name ??
      null;
    const pos = this.src.pos(at);

    // Nodes that stand for something other than an element.
    if (name === "ng-template" || name === "ng-content") {
      this.fail(`<${name}> is not supported`, at + 1);
    }
    if (name === "ng-container") {
      const stray = rest[0];
      if (stray) this.fail("<ng-container> takes no attributes", stray.at);
      const list = this.wrap(structural, at);
      if (!tok.selfClosing)
        this.stack.push({ kind: "container", name, at, list });
      return;
    }
    if (name === "router-outlet") {
      if (rest[0]) this.fail("<router-outlet> takes no attributes", rest[0].at);
      const list = this.wrap(structural, at);
      push(list, { type: "outlet", nid: this.nid++, line: pos.line });
      this.leaf(tok);
      return;
    }
    const local = this.selectors.get(name);
    if (local !== undefined || name === "ng-component") {
      let dynamic: Expr | null = null;
      let instance = refOf();
      const props: Prop[] = [];
      for (const e of rest) {
        if (e.k === "ref") continue;
        if (e.k === "spread") props.push({ spread: e.expr });
        else if (e.k === "attr") {
          if (name === "ng-component" && e.bound && e.name === "is") {
            dynamic = e.value![0] as Expr;
            continue;
          }
          if (!IDENT.test(e.name)) {
            this.fail(`"${e.name}" is not a valid prop name`, e.at);
          }
          props.push({ name: e.name, value: e.value });
        } else {
          this.fail(
            e.k === "event"
              ? "Components take no event bindings; pass a message id as a prop"
              : "Class bindings are not allowed on components",
            e.at,
          );
        }
      }
      if (name === "ng-component") {
        if (!dynamic) this.fail('<ng-component> needs [is]="expr"', at + 1);
        if (!instance) {
          this.fail(
            'A dynamic component needs an instance name: <ng-component [is]="expr" #name>',
            at + 1,
          );
        }
      } else instance ??= local![0].toLowerCase() + local!.slice(1);
      // [key]="expr" on a component is the instance key (a keyed embed)
      let key: Expr | null = null;
      const keyed = props.findIndex(
        (p) => !("spread" in p) && p.name === "key",
      );
      if (keyed >= 0) {
        const p = props[keyed] as { name: string; value: Part[] | null };
        const v = p.value ?? [];
        if (v.length !== 1 || typeof v[0] === "string")
          this.fail(
            'The component\'s key must be one expression: [key]="user.id"',
            at + 1,
          );
        key = v[0] as Expr;
        props.splice(keyed, 1);
      }
      const list = this.wrap(structural, at);
      push(list, {
        type: "embed",
        nid: this.nid++,
        component: dynamic ? null : local!,
        dynamic,
        name: instance!,
        key,
        props,
        pos,
      });
      this.leaf(tok);
      return;
    }
    if (/^[A-Z]/.test(name)) {
      this.fail(
        `"${name}" is not imported. Add <!-- import ${name} from "..." --> ` +
          `at the top, or use <ng-component [is]="..."> for a component that comes from the state`,
        at + 1,
      );
    }
    this.element(tok, rest, structural);
  }

  /** A component-like node: no children, but it may be written with an end tag. */
  private leaf(tok: Extract<Token, { t: "open" }>): void {
    if (!tok.selfClosing) {
      this.stack.push({
        kind: "leaf",
        name: tok.name,
        at: tok.start,
        list: null,
      });
    }
  }

  private element(
    tok: Extract<Token, { t: "open" }>,
    entries: Entry[],
    structural: Structural | undefined,
  ): void {
    const classes: string[] = [];
    const toggles: ClassToggle[] = [];
    const attrs: Attr[] = [];
    const events: EventBinding[] = [];
    for (const e of entries) {
      switch (e.k) {
        case "attr":
          // A fully static class="a b" is the same as `.a.b`.
          if (
            e.name === "class" &&
            !e.bound &&
            e.value?.every((p) => typeof p === "string")
          ) {
            classes.push(
              ...(e.value as string[]).join("").split(/\s+/).filter(Boolean),
            );
          } else attrs.push({ name: e.name, value: e.value });
          break;
        case "toggle":
          toggles.push({ name: e.name, test: e.test });
          break;
        case "event":
          events.push(e.ev);
          break;
        case "spread":
          this.fail("[props] is only allowed on components", e.at);
          break;
        case "ref":
          this.fail(
            "`#name` only names an embedded component instance, not an element",
            e.at,
          );
          break;
      }
    }
    const list = this.wrap(structural, tok.start);
    const el: ElementNode = {
      type: "element",
      nid: this.nid++,
      tag: tok.name,
      classes,
      toggles,
      attrs,
      events,
      children: [],
      pos: this.src.pos(tok.start),
    };
    push(list, el);
    if (!tok.selfClosing && !VOID_TAGS.has(tok.name.toLowerCase())) {
      this.stack.push({
        kind: "element",
        name: tok.name,
        at: tok.start,
        list: el.children,
      });
    }
  }
}

/**
 * Parses an Angular-like HTML template into the template AST.
 *
 * ```html
 * <!-- import Card from "./card.pavlus" as app-card -->
 * <ul class="menu">
 *   @for (item of items; track item.id; let i = $index) {
 *     <li [class.active]="item.active" (click)="open(item.id)">{{ i }}: {{ item.title }}</li>
 *   } @empty {
 *     <li>Nothing here</li>
 *   }
 * </ul>
 * <app-card [title]="t" #side />
 * ```
 */
export function parseAngular(source: string): TemplateAst {
  return new AngularParser(source).run();
}
