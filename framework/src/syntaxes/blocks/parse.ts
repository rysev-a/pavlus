import type {
  Attr,
  ElementNode,
  EmbedNode,
  Expr,
  ForNode,
  IfNode,
  ImportDecl,
  Node,
  Part,
  Pos,
  Prop,
  TemplateAst,
} from "../../template/ast.ts";
import { TemplateError } from "../../template/errors.ts";
import { parseExpr } from "../../template/expr.ts";

/**
 * Block HTML: plain HTML plus Svelte-style logic blocks that live outside the
 * tag grammar (`{#if}`, `{#each}`), so a template is always well-formed HTML
 * and needs no wrapper elements for control flow.
 *
 * ```
 * {#import Card from "./card.pavlus"}
 * <ul class="menu">
 *   {#each items as item, i (item.id)}
 *     <li class="menu__item" class:active={item.active}>
 *       <a href={item.url} on:click={open(item.id)}>{item.title}</a>
 *     </li>
 *   {:else}
 *     <li>Nothing here</li>
 *   {/each}
 * </ul>
 * <Card title="x" {...rest} name="main" />
 * ```
 *
 * The tokenizer is a single cursor over the source; `children` is the
 * recursive-descent core. It reads children until something it cannot own
 * (a closing tag, `{:else}`, `{/if}`, the end) and hands that back to the
 * caller, which knows what it was waiting for.
 */

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

/** Elements whose content is not markup; not supported. */
const RAW_TEXT_TAGS = new Set(["script", "style"]);

/** Names the generated code itself uses; an import must not shadow them. */
const RESERVED_IMPORTS = new Set(["String", "Array", "Map", "Set", "Error"]);

const IDENT = /^[A-Za-z_$][\w$]*$/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decodes `&amp;`-style entities; unknown ones are left as written. */
function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g,
    (whole, dec?: string, hex?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name] ?? whole;
      const code = dec ? parseInt(dec, 10) : parseInt(hex!, 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );
}

/** What stopped `children`. Offsets point at the start of the construct. */
type End =
  | { k: "eof" }
  | { k: "close"; name: string; at: number }
  | { k: "else"; at: number; test: Expr | null }
  | { k: "end"; what: string; at: number };

/** An attribute as written, before it is known what it means. */
interface RawAttr {
  name: string;
  /** `null` for a bare attribute (`disabled`). */
  value: Part[] | null;
  /** Written as `name={expr}`. */
  braced: boolean;
  /** `{...expr}` entry. */
  spread?: boolean;
  /** Offset of the attribute in the source. */
  at: number;
}

/** Turns `removeUser(user)` / `users.remove` into a message binding. */
function toMessage(e: Expr, fail: () => never): { msg: string; args: Expr[] } {
  const name = (x: Expr): string | null =>
    x.k === "id"
      ? x.name
      : x.k === "member"
        ? name(x.obj) === null
          ? null
          : `${name(x.obj)}.${x.prop}`
        : null;
  const callee = e.k === "call" ? e.callee : e;
  const msg = name(callee);
  if (msg === null) fail();
  return { msg: msg!, args: e.k === "call" ? e.args : [] };
}

class BlockParser {
  private i = 0;
  private nid = 0;
  private readonly lineStarts: number[] = [0];
  private readonly roots: Node[] = [];
  private readonly imports: ImportDecl[] = [];
  private readonly importNames = new Set<string>();

  private readonly src: string;

  constructor(src: string) {
    this.src = src;
    for (let k = 0; k < src.length; k++)
      if (src[k] === "\n") this.lineStarts.push(k + 1);
  }

  // ---------------------------------------------------------------- helpers

  /** 1-based line / column of a source offset. */
  private pos(offset: number): Pos {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - this.lineStarts[lo] + 1 };
  }

  private fail(message: string, offset: number): never {
    const p = this.pos(offset);
    throw new TemplateError(message, p.line, p.col);
  }

  /** `parseExpr` for the source slice `[from, to)`. */
  private expr(from: number, to: number): Expr {
    return parseExpr(this.src.slice(from, to), this.pos(from));
  }

  /** Offset of the `}` matching the `{` at `open`, skipping strings. */
  private matchBrace(open: number): number {
    const s = this.src;
    let depth = 0;
    let quote = "";
    for (let k = open; k < s.length; k++) {
      const c = s[k];
      if (quote) {
        if (c === "\\") k++;
        else if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) return k;
    }
    return this.fail("Unclosed {", open);
  }

  private skipSpace(): void {
    while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i++;
  }

  // ------------------------------------------------------------------- text

  /** Does a tag or comment start at `k`? (`a < b` is plain text.) */
  private tagStarts(k: number): boolean {
    return this.src[k] === "<" && /[A-Za-z/!]/.test(this.src[k + 1] ?? "");
  }

  /** Does a block tag (`{#`, `{:`, `{/`) start at `k`? */
  private blockStarts(k: number): boolean {
    return this.src[k] === "{" && "#:/".includes(this.src[k + 1] ?? " ");
  }

  /**
   * Reads a run of text up to the next tag or block tag. Each non-blank line
   * becomes one text node, trimmed, and a line directly after another text
   * node is joined to it with "\n", exactly like the native `|` lines.
   */
  private text(into: Node[]): void {
    const s = this.src;
    let parts: Part[] = [];
    let lit = "";
    let first = -1;

    const flush = (): void => {
      if (lit) parts.push(lit);
      lit = "";
      const head = parts[0];
      if (typeof head === "string") parts[0] = head.trimStart();
      const tail = parts[parts.length - 1];
      if (typeof tail === "string") parts[parts.length - 1] = tail.trimEnd();
      const kept = parts
        .filter((p) => p !== "")
        .map((p) => (typeof p === "string" ? decodeEntities(p) : p));
      if (kept.length > 0) {
        if (into[into.length - 1]?.type === "text") kept.unshift("\n");
        into.push({
          type: "text",
          nid: this.nid++,
          line: this.pos(first).line,
          parts: kept,
        });
      }
      parts = [];
      first = -1;
    };

    while (this.i < s.length) {
      const c = s[this.i];
      if (c === "<" && this.tagStarts(this.i)) break;
      if (this.blockStarts(this.i)) break;
      if (c === "\n") {
        flush();
        this.i++;
        continue;
      }
      if (first < 0 && !/\s/.test(c)) first = this.i;
      if (c === "\\" && (s[this.i + 1] === "{" || s[this.i + 1] === "}")) {
        lit += s[this.i + 1];
        this.i += 2;
      } else if (c === "{") {
        const close = this.matchBrace(this.i);
        if (lit) parts.push(lit);
        lit = "";
        parts.push(this.expr(this.i + 1, close));
        this.i = close + 1;
      } else {
        lit += c;
        this.i++;
      }
    }
    flush();
  }

  // --------------------------------------------------------------- children

  /**
   * Reads children into `into` until something that ends them. The terminator
   * is consumed and returned.
   */
  private children(into: Node[]): End {
    const s = this.src;
    for (;;) {
      this.text(into);
      if (this.i >= s.length) return { k: "eof" };
      const at = this.i;
      if (s[at] === "{") {
        const end = this.block(into);
        if (end) return end;
      } else if (s.startsWith("<!--", at)) {
        const close = s.indexOf("-->", at + 4);
        if (close < 0) this.fail("Unclosed comment", at);
        this.i = close + 3;
      } else if (s[at + 1] === "/") {
        const m = /^<\/([A-Za-z][\w:.-]*)\s*>/.exec(s.slice(at));
        if (!m) this.fail("Malformed closing tag", at);
        this.i = at + m![0].length;
        return { k: "close", name: m![1], at };
      } else if (s[at + 1] === "!") {
        this.fail(
          "Only <!-- comments --> are supported (no doctype or CDATA)",
          at,
        );
      } else this.tag(into);
    }
  }

  /** Expects the close of `<name>` after `children`. */
  private expectClose(end: End, name: string, open: number): void {
    if (end.k === "close" && end.name === name) return;
    if (end.k === "close")
      this.fail(`Expected </${name}> but found </${end.name}>`, end.at);
    if (end.k === "eof") this.fail(`Unclosed <${name}>`, open);
    this.fail(
      `Unexpected {${end.k === "else" ? ":else" : "/" + end.what}} inside <${name}>; close the element first`,
      end.at,
    );
  }

  // ----------------------------------------------------------------- blocks

  /**
   * Handles the `{` at the cursor. Opening blocks are parsed in full and
   * return `null`; `{:else}` / `{/if}` / `{/each}` return as terminators.
   */
  private block(into: Node[]): End | null {
    const open = this.i;
    const close = this.matchBrace(open);
    const body = this.src.slice(open + 1, close);
    const after = close + 1;
    let m: RegExpExecArray | null;

    if (body[0] === "/") {
      const what = body.slice(1).trim();
      if (what !== "if" && what !== "each")
        this.fail(`Unknown block {${body}}`, open);
      this.i = after;
      return { k: "end", what, at: open };
    }
    if (body[0] === ":") {
      m = /^:else(?:\s+if(\s[\s\S]*))?\s*$/.exec(body);
      if (!m || /^:else\s+if\s*$/.test(body))
        this.fail(
          m ? "`{:else if}` needs a condition" : `Unknown block {${body}}`,
          open,
        );
      this.i = after;
      const test = m![1]
        ? this.expr(open + 1 + body.indexOf(m![1], 5), close)
        : null;
      return { k: "else", at: open, test };
    }
    // body[0] === "#"
    if ((m = /^#if(?=\s)/.exec(body))) {
      this.i = after;
      this.ifBlock(into, this.expr(open + 1 + m[0].length, close), open);
    } else if ((m = /^#each(?=\s)/.exec(body))) {
      this.i = after;
      this.eachBlock(into, open + 1 + m[0].length, close, open);
    } else if (/^#import(?=\s)/.test(body)) {
      this.i = after;
      this.importBlock(body, open, into);
    } else this.fail(`Unknown block {${body}}`, open);
    return null;
  }

  private importBlock(body: string, at: number, into: Node[]): void {
    const m =
      /^#import\s+([A-Za-z_$][\w$]*)\s+from\s+(?:"([^"]+)"|'([^']+)')\s*$/.exec(
        body,
      );
    if (!m) this.fail("Expected {#import Name from './file.pavlus'}", at);
    if (into !== this.roots || this.roots.length > 0)
      this.fail("`{#import}` must be at the top of the file", at);
    const [, local, d, sq] = m!;
    if (!/^[A-Z]/.test(local) || RESERVED_IMPORTS.has(local)) {
      this.fail(
        `"${local}" cannot be used as a component name (start with a capital letter, not ${[...RESERVED_IMPORTS].join("/")})`,
        at,
      );
    }
    if (this.importNames.has(local))
      this.fail(`"${local}" is imported twice`, at);
    this.importNames.add(local);
    this.imports.push({ local, from: d ?? sq });
  }

  private ifBlock(into: Node[], test: Expr, open: number): void {
    const node: IfNode = {
      type: "if",
      nid: this.nid++,
      line: this.pos(open).line,
      branches: [{ test, children: [] }],
    };
    into.push(node);
    for (;;) {
      const branch = node.branches[node.branches.length - 1];
      const end = this.children(branch.children);
      if (end.k === "else") {
        if (branch.test === null)
          this.fail("Nothing can follow `{:else}` in an `{#if}`", end.at);
        node.branches.push({ test: end.test, children: [] });
      } else if (end.k === "end" && end.what === "if") return;
      else if (end.k === "eof") this.fail("Unclosed {#if}", open);
      else this.fail(this.mismatch(end, "if"), end.at);
    }
  }

  private mismatch(end: End, block: string): string {
    if (end.k === "close")
      return `Unexpected </${end.name}> inside {#${block}}; close the block first`;
    if (end.k === "end") return `Expected {/${block}} but found {/${end.what}}`;
    return "Unexpected `{:else}`";
  }

  /** `{#each items as item, i (item.id)}`; `[from, to)` spans after `#each`. */
  private eachBlock(
    into: Node[],
    from: number,
    to: number,
    open: number,
  ): void {
    const header = this.src.slice(from, to);
    const as = this.findAs(header);
    if (as < 0) this.fail("Expected {#each items as item}", from);
    const ofSrc = header.slice(0, as);
    const rest = header.slice(as).replace(/^\s+as\s+/, "");
    const restAt = from + header.length - rest.length;
    const m =
      /^([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*(?:\(([\s\S]*)\))?\s*$/.exec(
        rest,
      );
    if (!m)
      this.fail(
        "Expected `item`, `item, index` or `item, index (key)` after `as`",
        restAt,
      );
    const keyAt = restAt + rest.indexOf("(") + 1;
    const lineOpen = this.pos(from).line;
    const node: ForNode = {
      type: "for",
      nid: this.nid++,
      line: lineOpen,
      item: m![1],
      index: m![2] ?? null,
      of: parseExpr(ofSrc, this.pos(from)),
      key: m![3] === undefined ? null : parseExpr(m![3], this.pos(keyAt)),
      children: [],
    };
    into.push(node);
    const end = this.children(node.children);
    if (end.k === "end" && end.what === "each") return;
    if (end.k === "else") {
      // `{:else}` of an each is an `if` on the emptiness of the list.
      const empty: IfNode = {
        type: "if",
        nid: this.nid++,
        line: this.pos(end.at).line,
        branches: [
          {
            test: {
              k: "unary",
              op: "!",
              arg: { k: "member", obj: node.of, prop: "length" },
            },
            children: [],
          },
        ],
      };
      if (end.test)
        this.fail("`{:else if}` is not allowed in `{#each}`", end.at);
      into.push(empty);
      const last = this.children(empty.branches[0].children);
      if (last.k === "end" && last.what === "each") return;
      if (last.k === "eof") this.fail("Unclosed {#each}", open);
      this.fail(this.mismatch(last, "each"), last.at);
    }
    if (end.k === "eof") this.fail("Unclosed {#each}", open);
    this.fail(this.mismatch(end, "each"), end.at);
  }

  /** Index of the top-level word `as` in an each header, or -1. */
  private findAs(text: string): number {
    let depth = 0;
    let quote = "";
    for (let k = 0; k < text.length; k++) {
      const c = text[k];
      if (quote) {
        if (c === "\\") k++;
        else if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (depth === 0 && /^\s+as\s/.test(text.slice(k))) return k;
    }
    return -1;
  }

  // ------------------------------------------------------------------- tags

  /** Parses an element or component at the `<` under the cursor. */
  private tag(into: Node[]): void {
    const s = this.src;
    const start = this.i;
    const m = /^<([A-Za-z][\w:.-]*)/.exec(s.slice(start));
    if (!m) return this.fail("Malformed tag", start);
    const name = m[1];
    this.i = start + m[0].length;
    const { attrs, selfClose } = this.attrs(name, start);

    if (RAW_TEXT_TAGS.has(name)) {
      this.fail(
        `<${name}> is not supported: templates are markup only. Put ${name === "script" ? "logic in the component's TypeScript" : "styles in a .css file"}`,
        start,
      );
    }
    if (name === "svelte:component")
      this.fail(
        'Use <Dynamic this={expr} name="x" /> for dynamic components',
        start,
      );
    if (name === "Outlet") {
      if (attrs.length > 0) this.fail("<Outlet /> takes no attributes", start);
      this.closeLeaf(name, selfClose, start);
      into.push({
        type: "outlet",
        nid: this.nid++,
        line: this.pos(start).line,
      });
      return;
    }
    if (name === "Dynamic" || /^[A-Z]/.test(name)) {
      this.closeLeaf(name, selfClose, start);
      into.push(this.embed(name, attrs, start));
      return;
    }
    if (name.includes(":") || name.includes(".")) {
      this.fail(`"<${name}>" is not a valid tag name`, start);
    }

    const el: ElementNode = {
      type: "element",
      nid: this.nid++,
      tag: name,
      classes: [],
      toggles: [],
      attrs: [],
      events: [],
      children: [],
      pos: this.pos(start),
    };
    for (const a of attrs) this.elementAttr(el, a);
    into.push(el);
    if (VOID_TAGS.has(name) || selfClose) return;
    const end = this.children(el.children);
    this.expectClose(end, name, start);
  }

  /** A component is a leaf: `<X />` or `<X></X>`. */
  private closeLeaf(name: string, selfClose: boolean, start: number): void {
    if (selfClose) return;
    this.skipSpace();
    const close = `</${name}>`;
    if (!this.src.startsWith(close, this.i)) {
      this.fail(`<${name}> cannot have children; write <${name} ... />`, start);
    }
    this.i += close.length;
  }

  /** Reads attributes up to and including `>` or `/>`. */
  private attrs(
    tag: string,
    tagAt: number,
  ): { attrs: RawAttr[]; selfClose: boolean } {
    const s = this.src;
    const attrs: RawAttr[] = [];
    for (;;) {
      this.skipSpace();
      if (this.i >= s.length) this.fail(`Unclosed <${tag}`, tagAt);
      const c = s[this.i];
      if (c === ">") {
        this.i++;
        return { attrs, selfClose: false };
      }
      if (c === "/" && s[this.i + 1] === ">") {
        this.i += 2;
        return { attrs, selfClose: true };
      }
      const at = this.i;
      if (c === "{") {
        const close = this.matchBrace(at);
        const inner = s.slice(at + 1, close);
        if (!inner.startsWith("...")) {
          this.fail(
            'Unexpected "{" in attributes (write name={expr} or {...spread})',
            at,
          );
        }
        attrs.push({
          name: "...",
          value: [this.expr(at + 4, close)],
          braced: true,
          spread: true,
          at,
        });
        this.i = close + 1;
        continue;
      }
      const nm = /^[^\s=>/"'{}]+/.exec(s.slice(at));
      if (!nm) this.fail(`Unexpected "${c}" in attributes`, at);
      this.i = at + nm![0].length;
      if (s[this.i] !== "=") {
        attrs.push({ name: nm![0], value: null, braced: false, at });
        continue;
      }
      this.i++;
      const v = this.attrValue();
      attrs.push({ name: nm![0], value: v.parts, braced: v.braced, at });
    }
  }

  /** The value after `=`: `"a {b}"`, `'x'`, `{expr}` or unquoted text. */
  private attrValue(): { parts: Part[]; braced: boolean } {
    const s = this.src;
    const c = s[this.i];
    if (c === "{") {
      const close = this.matchBrace(this.i);
      const e = this.expr(this.i + 1, close);
      this.i = close + 1;
      return { parts: [e], braced: true };
    }
    const parts: Part[] = [];
    let lit = "";
    const pushLit = (): void => {
      if (lit) parts.push(decodeEntities(lit));
      lit = "";
    };
    if (c === '"' || c === "'") {
      const open = this.i++;
      for (;;) {
        if (this.i >= s.length) this.fail("Unterminated attribute value", open);
        const d = s[this.i];
        if (d === c) {
          this.i++;
          break;
        }
        if (d === "\\" && (s[this.i + 1] === "{" || s[this.i + 1] === "}")) {
          lit += s[this.i + 1];
          this.i += 2;
        } else if (d === "{") {
          const close = this.matchBrace(this.i);
          pushLit();
          parts.push(this.expr(this.i + 1, close));
          this.i = close + 1;
        } else {
          lit += d;
          this.i++;
        }
      }
      pushLit();
      return { parts, braced: false };
    }
    const m = /^[^\s>]+/.exec(s.slice(this.i));
    if (!m) this.fail("Missing attribute value", this.i);
    this.i += m![0].length;
    return { parts: [decodeEntities(m![0])], braced: false };
  }

  // ------------------------------------------------------- attribute meaning

  private single(a: RawAttr): Expr {
    if (a.value?.length !== 1 || typeof a.value[0] === "string" || !a.braced) {
      this.fail(`"${a.name}" needs a {expression} value`, a.at);
    }
    return a.value![0] as Expr;
  }

  private elementAttr(el: ElementNode, a: RawAttr): void {
    if (a.spread) {
      this.fail("`{...spread}` is only allowed on components", a.at);
    }
    if (a.name.startsWith("on:")) {
      const [name, ...mods] = a.name.slice(3).split("|");
      if (!name) this.fail("Event name missing after `on:`", a.at);
      for (const mod of mods) {
        if (
          !["prevent", "preventDefault", "stop", "stopPropagation"].includes(
            mod,
          )
        )
          this.fail(
            `Unknown event modifier "${mod}" (use |preventDefault and |stopPropagation)`,
            a.at,
          );
      }
      const { msg, args } = toMessage(this.single(a), () =>
        this.fail(
          "Event handler must be a message id like `save` or `remove(item)`",
          a.at,
        ),
      );
      el.events.push({
        name,
        msg,
        args,
        prevent: mods.includes("prevent") || mods.includes("preventDefault"),
        stop: mods.includes("stop") || mods.includes("stopPropagation"),
      });
    } else if (a.name.startsWith("class:")) {
      const name = a.name.slice(6);
      if (!name) this.fail("Class name missing after `class:`", a.at);
      // `class:active` alone is shorthand for `class:active={active}`.
      let test: Expr;
      if (a.value === null) {
        if (!IDENT.test(name))
          this.fail(`"${a.name}" needs a {expression} value`, a.at);
        test = { k: "id", name };
      } else test = this.single(a);
      el.toggles.push({ name, test });
    } else if (
      a.name === "class" &&
      a.value !== null &&
      a.value.every((p) => typeof p === "string")
    ) {
      el.classes.push(...a.value.join("").split(/\s+/).filter(Boolean));
    } else {
      const attr: Attr = { name: a.name, value: a.value };
      el.attrs.push(attr);
    }
  }

  private embed(tag: string, attrs: RawAttr[], start: number): EmbedNode {
    let component: string | null = null;
    let dynamic: Expr | null = null;
    let name = "";
    const props: Prop[] = [];
    let nameAttr: RawAttr | undefined;
    for (const a of attrs) {
      if (a.spread) props.push({ spread: a.value![0] as Expr });
      else if (a.name === "name") nameAttr = a;
      else if (tag === "Dynamic" && a.name === "this") dynamic = this.single(a);
      else if (!IDENT.test(a.name))
        this.fail(`"${a.name}" is not a valid prop name`, a.at);
      else props.push({ name: a.name, value: a.value });
    }
    if (tag === "Dynamic") {
      if (!dynamic)
        this.fail("<Dynamic> needs this={expression} (the view)", start);
    } else {
      component = tag;
      if (!this.importNames.has(tag)) {
        this.fail(
          `"${tag}" is not imported. Add \`{#import ${tag} from "..."}\` ` +
            `or use <Dynamic this={${tag}} name="..." /> for a component that comes from the state`,
          start,
        );
      }
      name = tag[0].toLowerCase() + tag.slice(1);
    }
    if (nameAttr) {
      const v = nameAttr.value;
      const text = v && v.every((p) => typeof p === "string") ? v.join("") : "";
      if (!IDENT.test(text))
        this.fail(
          '`name` must be a plain identifier like name="main"',
          nameAttr.at,
        );
      name = text;
    }
    if (!name) {
      this.fail(
        '<Dynamic> needs an instance name: <Dynamic this={expr} name="x" />',
        start,
      );
    }
    return {
      type: "embed",
      nid: this.nid++,
      component,
      dynamic,
      name,
      props,
      pos: this.pos(start),
    };
  }

  // ------------------------------------------------------------------- root

  parse(): TemplateAst {
    const end = this.children(this.roots);
    if (end.k === "close") this.fail(`Unexpected </${end.name}>`, end.at);
    if (end.k === "else")
      this.fail("`{:else}` without matching `{#if}`", end.at);
    if (end.k === "end")
      this.fail(
        `Unexpected {/${end.what}} without matching {#${end.what}}`,
        end.at,
      );
    return { imports: this.imports, nodes: this.roots };
  }
}

/** Parses Block HTML source (`.phtml`) into the template AST. */
export function parseBlocks(source: string): TemplateAst {
  return new BlockParser(source).parse();
}
