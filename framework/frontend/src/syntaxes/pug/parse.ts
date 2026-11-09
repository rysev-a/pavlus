/**
 * Pug syntax for pavlus templates: `parsePug(source) => TemplateAst`.
 *
 * `lex.ts` turns the source into statements (one per logical line). This file
 * nests them by indentation (recursive descent over the indent structure) and
 * lowers them to the shared template AST. See README.md for the syntax and
 * every deviation from real Pug.
 */
import type {
  Attr,
  ClassToggle,
  ElementNode,
  EmbedNode,
  EventBinding,
  Expr,
  ForNode,
  IfBranch,
  IfNode,
  ImportDecl,
  Node,
  Part,
  Pos,
  Prop,
  TemplateAst,
  TextNode,
} from "../../template/ast.ts";
import { TemplateError } from "../../template/errors.ts";
import { parseEvent, parseExpr } from "../../template/expr.ts";
import {
  isInline,
  lex,
  type Chain,
  type EmbedHead,
  type InlineTag,
  type OutletHead,
  type Piece,
  type RawAttr,
  type Stmt,
  type TagHead,
} from "./lex.ts";

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

export function parsePug(source: string): TemplateAst {
  return new Parser(lex(source)).run();
}

function fail(message: string, pos: Pos): never {
  throw new TemplateError(message, pos.line, pos.col);
}

class Parser {
  private k = 0;
  private readonly imports: ImportDecl[] = [];
  private readonly importNames = new Set<string>();
  /** Set once the first non-import line is read: imports must come first. */
  private sawContent = false;

  private readonly stmts: Stmt[];

  constructor(stmts: Stmt[]) {
    this.stmts = stmts;
  }

  run(): TemplateAst {
    const nodes = this.block(-1, false);
    // Node ids are handed out in document order, parents before children,
    // exactly like the native parser. Numbering once at the end lets lowering
    // build wrappers (`each ... else`) after their children.
    let nid = 0;
    const number = (list: Node[]): void => {
      for (const n of list) {
        n.nid = nid++;
        if (n.type === "element" || n.type === "for") number(n.children);
        else if (n.type === "if")
          for (const b of n.branches) number(b.children);
      }
    };
    number(nodes);
    return { imports: this.imports, nodes };
  }

  // ---- blocks --------------------------------------------------------------------

  /**
   * The statements indented deeper than `parentIndent`, as nodes. `prevText`
   * says the parent already ends in a text line (inline text of a tag).
   */
  private block(parentIndent: number, prevText: boolean): Node[] {
    const out: Node[] = [];
    let childIndent: number | null = null;
    let openIf: IfNode | null = null;
    let openEach: ForNode | null = null;
    while (
      this.k < this.stmts.length &&
      this.stmts[this.k].indent > parentIndent
    ) {
      const s = this.stmts[this.k];
      if (s.kind === "import") {
        this.k++;
        this.declare(s);
        continue;
      }
      if (childIndent === null) childIndent = s.indent;
      else if (s.indent !== childIndent) {
        throw new TemplateError("Inconsistent indentation", s.pos.line, 1);
      }
      this.k++;
      this.sawContent = true;
      const wasIf = openIf as IfNode | null;
      const wasEach = openEach as ForNode | null;
      openIf = openEach = null;
      let isText = false;

      switch (s.kind) {
        case "text":
          out.push(...this.textNodes(s.pieces, s.pos.line, prevText));
          isText = true;
          this.leaf(s.indent);
          break;
        case "code":
          out.push(...this.textNodes([s.expr], s.pos.line, prevText));
          isText = true;
          this.leaf(s.indent);
          break;
        case "if": {
          const n: IfNode = {
            type: "if",
            nid: 0,
            line: s.pos.line,
            branches: [{ test: s.test, children: this.block(s.indent, false) }],
          };
          out.push(n);
          openIf = n;
          break;
        }
        case "elseif":
          if (!wasIf) fail("`else if` without matching `if`", s.pos);
          wasIf!.branches.push({
            test: s.test,
            children: this.block(s.indent, false),
          });
          openIf = wasIf;
          break;
        case "else":
          if (wasIf) {
            wasIf.branches.push({
              test: null,
              children: this.block(s.indent, false),
            });
          } else if (wasEach) {
            // `each ... else`: the else runs when the list is empty.
            const wrapped: IfNode = {
              type: "if",
              nid: 0,
              line: wasEach.line,
              branches: [
                {
                  test: { k: "member", obj: wasEach.of, prop: "length" },
                  children: [wasEach],
                },
                { test: null, children: this.block(s.indent, false) },
              ],
            };
            out[out.length - 1] = wrapped;
          } else fail("`else` without matching `if` or `each`", s.pos);
          break;
        case "each": {
          const n: ForNode = {
            type: "for",
            nid: 0,
            line: s.pos.line,
            item: s.item,
            index: s.index,
            of: s.of,
            key: s.key,
            children: this.block(s.indent, false),
          };
          out.push(n);
          openEach = n;
          break;
        }
        case "when":
        case "default":
          fail(`\`${s.kind}\` outside of \`case\``, s.pos);
          break;
        case "chain":
          out.push(this.lowerChain(s.chain, s.indent));
          break;
      }
      prevText = isText;
    }
    return out;
  }

  /** A line without children: anything deeper below it is an error. */
  private leaf(indent: number): void {
    const next = this.stmts[this.k];
    if (next && next.indent > indent) {
      fail("This line cannot have children", {
        line: next.pos.line,
        col: next.indent + 1,
      });
    }
  }

  private declare(s: Stmt & { kind: "import" }): void {
    const at = { line: s.pos.line, col: s.indent + 1 };
    if (s.indent !== 0 || this.sawContent) {
      fail("`import` lines must be at the top of the file", at);
    }
    if (!/^[A-Z]/.test(s.local) || RESERVED_IMPORTS.has(s.local)) {
      fail(
        `"${s.local}" cannot be used as a component name (start with a capital letter, not ${[...RESERVED_IMPORTS].join("/")})`,
        at,
      );
    }
    if (this.importNames.has(s.local))
      fail(`"${s.local}" is imported twice`, at);
    this.importNames.add(s.local);
    this.imports.push({ local: s.local, from: s.from });
    this.leaf(s.indent);
  }

  /** A line without children: anything deeper below it is an error. */
  // ---- text ------------------------------------------------------------------------------

  /**
   * Text nodes (and inline tags) for the pieces of one line. `join` marks
   * text that follows another text line: the lines are joined with "\n",
   * which HTML renders as a space, like pug does.
   */
  private textNodes(pieces: Piece[], line: number, join: boolean): Node[] {
    const nodes: Node[] = [];
    let cur: TextNode | null = null;
    for (const p of pieces) {
      if (isInline(p)) {
        cur = null;
        nodes.push(this.inlineTag(p, line));
      } else {
        if (!cur) {
          cur = { type: "text", nid: 0, line, parts: [] };
          nodes.push(cur);
        }
        cur.parts.push(p);
      }
    }
    if (nodes.length === 0)
      nodes.push({ type: "text", nid: 0, line, parts: [] });
    if (join) {
      const first = nodes[0];
      if (first.type === "text") first.parts.unshift("\n");
      else nodes.unshift({ type: "text", nid: 0, line, parts: ["\n"] });
    }
    return nodes;
  }

  private inlineTag(t: InlineTag, line: number): ElementNode {
    const el = this.element(t.head);
    if (t.pieces.length > 0) {
      if (VOID_TAGS.has(el.tag)) {
        fail(`<${el.tag}> cannot have content`, t.head.pos);
      }
      el.children = this.textNodes(t.pieces, line, false);
    }
    return el;
  }

  // ---- element chains ----------------------------------------------------------------

  /** Lowers `a: b text` plus the indented block below it; returns the top node. */
  private lowerChain(ch: Chain, indent: number): Node {
    const nodes = ch.items.map((it) =>
      it.kind === "tag"
        ? this.element(it)
        : it.kind === "embed"
          ? this.embed(it)
          : this.outlet(it),
    );
    for (let j = 0; j < nodes.length - 1; j++) {
      const parent = nodes[j] as ElementNode;
      if (VOID_TAGS.has(parent.tag)) {
        fail(`<${parent.tag}> cannot have children`, ch.items[j + 1].pos);
      }
      parent.children.push(nodes[j + 1]);
    }
    const last = nodes[nodes.length - 1];
    if (last.type !== "element") {
      this.leaf(indent);
      return nodes[0];
    }
    const { body } = ch;
    const closed = ch.selfClosing || VOID_TAGS.has(last.tag);
    if (closed && body.kind !== "none") {
      fail(`<${last.tag}> cannot have content`, last.pos);
    }
    let prevText = false;
    if (body.kind === "text") {
      last.children.push(...this.textNodes(body.pieces, last.pos.line, false));
      prevText = true;
    } else if (body.kind === "expr") {
      last.children.push(...this.textNodes([body.expr], last.pos.line, false));
      prevText = true;
    } else if (body.kind === "dot") {
      body.lines.forEach((l, n) => {
        last.children.push(...this.textNodes(l.pieces, l.line, n > 0));
        prevText = true;
      });
    }
    if (closed) this.leaf(indent);
    else last.children.push(...this.block(indent, prevText));
    return nodes[0];
  }

  private element(head: TagHead): ElementNode {
    const el: ElementNode = {
      type: "element",
      nid: 0,
      tag: head.tag ?? "div",
      classes: [],
      toggles: [],
      attrs: [],
      events: [],
      children: [],
      pos: head.pos,
    };
    /** Dynamic `class` values; merged into one attribute below. */
    const dynamicClasses: Part[][] = [];
    for (const item of head.items) {
      if (item.kind === "class") el.classes.push(item.name);
      else if (item.kind === "id") {
        el.attrs.push({ name: "id", value: [item.name] });
      } else if (item.kind === "amp") {
        fail(
          "`&attributes` is only supported on component calls (`+Name&attributes(obj)`)",
          item.pos,
        );
      } else {
        for (const a of item.attrs) this.attribute(el, a, dynamicClasses);
      }
    }
    if (dynamicClasses.length > 0) {
      // `class` attributes merge: static ones became classes above, the
      // dynamic ones are joined with spaces into one attribute.
      const value: Part[] = [];
      dynamicClasses.forEach((parts, n) => {
        if (n > 0) value.push(" ");
        value.push(...parts);
      });
      el.attrs.push({ name: "class", value });
    }
    return el;
  }

  private attribute(
    el: ElementNode,
    a: RawAttr,
    dynamicClasses: Part[][],
  ): void {
    /** The expression of an event or a class toggle. */
    const single = (): Expr => {
      if (a.form === "expr") return a.parts![0] as Expr;
      if (a.form === "string" && a.inner) {
        return parseExpr(a.inner.text, a.inner.at);
      }
      return fail(`"${a.name}" needs an expression value`, a.pos);
    };
    if (a.name.startsWith("@")) {
      const [name, ...mods] = a.name.slice(1).split(".");
      if (!name) fail("Missing event name after @", a.pos);
      for (const m of mods) {
        if (m !== "prevent" && m !== "stop") {
          fail(`Unknown event modifier ".${m}" (use .prevent or .stop)`, a.pos);
        }
      }
      if (a.form !== "event" || !a.inner) {
        fail(`"${a.name}" needs an expression value`, a.pos);
      }
      const { msg, args } = parseEvent(a.inner.text, a.inner.at);
      const ev: EventBinding = {
        name,
        msg,
        args,
        prevent: mods.includes("prevent"),
        stop: mods.includes("stop"),
      };
      el.events.push(ev);
    } else if (a.name.startsWith("class:")) {
      const name = a.name.slice(6);
      if (!name) fail("Missing class name after `class:`", a.pos);
      const t: ClassToggle = { name, test: single() };
      el.toggles.push(t);
    } else if (a.name === "class") {
      if (a.parts === null || a.parts.every((p) => typeof p === "string")) {
        const text = (a.parts ?? []).join("");
        el.classes.push(...text.split(/\s+/).filter(Boolean));
      } else dynamicClasses.push(a.parts);
    } else {
      const attr: Attr = { name: a.name, value: a.parts };
      el.attrs.push(attr);
    }
  }

  private embed(head: EmbedHead): EmbedNode {
    let name = "";
    if (head.component !== null) {
      if (!this.importNames.has(head.component)) {
        fail(
          `"${head.component}" is not imported. Add \`- import ${head.component} from "..."\` ` +
            `or use +#{${head.component}} for a component that comes from the state`,
          head.namePos,
        );
      }
      name = head.component[0].toLowerCase() + head.component.slice(1);
    }
    if (head.instance !== null) name = head.instance;
    if (!name) {
      fail(
        "A dynamic component needs an instance name: +#{expr}#name(...)",
        head.pos,
      );
    }
    const props: Prop[] = [];
    let key: Expr | null = null;
    for (const item of head.items) {
      if (item.kind === "amp") props.push({ spread: item.expr });
      else if (item.kind === "attrs") {
        for (const a of item.attrs) {
          if (/^[A-Za-z_$][\w$]*$/.test(a.name) && a.name === "key") {
            // reserved: the instance key of a keyed embed, not a prop
            const v = a.parts ?? [];
            if (v.length !== 1 || typeof v[0] === "string")
              fail(
                "The embed's key must be one expression: key=user.id",
                a.pos,
              );
            key = v[0] as Expr;
            continue;
          }
          if (!/^[A-Za-z_$][\w$]*$/.test(a.name)) {
            fail(`"${a.name}" is not a valid prop name`, a.pos);
          }
          props.push({ name: a.name, value: a.parts });
        }
      }
    }
    return {
      type: "embed",
      nid: 0,
      component: head.component,
      dynamic: head.dynamic,
      name,
      key,
      props,
      pos: head.pos,
    };
  }

  private outlet(head: OutletHead): Node {
    return { type: "outlet", nid: 0, line: head.pos.line };
  }
}
