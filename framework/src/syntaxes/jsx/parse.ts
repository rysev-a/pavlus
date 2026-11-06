import type {
  Attr,
  ClassToggle,
  ElementNode,
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
} from "../../template/ast.ts";
import { TemplateError } from "../../template/errors.ts";
import { parseExpr } from "../../template/expr.ts";

/**
 * The JSX syntax (`.view.jsx`). A file is import lines followed by ONE JSX
 * expression:
 *
 * ```jsx
 * import Card from "./card.pavlus";
 *
 * export default (
 *   <ul className="menu">
 *     {items.map((item, i) => (
 *       <li key={item.id} class:active={item.active}>
 *         <a href={item.url} onClickPrevent={open(item.id)}>{item.title}</a>
 *       </li>
 *     ))}
 *     {empty && <p>Nothing here</p>}
 *     <Card name="main" title="x" {...rest} />
 *   </ul>
 * );
 * ```
 *
 * Structure: a tokenizer-free recursive descent over the source. JSX is parsed
 * by `JsxParser`; the JavaScript inside `{ ... }` is never executed or fully
 * parsed here. A container is scanned once (strings, comments, brackets, and
 * nested JSX elements, which are parsed recursively) into a "masked" copy of
 * the same length where every nested element is replaced by a placeholder.
 * The small recognisers (`a && <X/>`, `a ? <X/> : <Y/>`, `xs.map(x => <X/>)`)
 * then work on the masked text, and everything else is handed to `parseExpr`.
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

/** Names the generated code itself uses; an import must not shadow them. */
const RESERVED_IMPORTS = new Set(["String", "Array", "Map", "Set", "Error"]);

/** Marks a nested JSX element inside a masked container. */
const HOLE = "\u0001";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  times: "×",
  divide: "÷",
  middot: "·",
  bull: "•",
  deg: "°",
  plusmn: "±",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  sect: "§",
  para: "¶",
  larr: "←",
  rarr: "→",
  uarr: "↑",
  darr: "↓",
  hearts: "♥",
  check: "✓",
};

/** Decodes `&amp;`, `&#65;`, `&#x41;`; unknown entities stay as written. */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (all, body) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[body] ?? all;
  });
}

/**
 * React's rule for JSX text: split into lines, trim the start of every line
 * but the first and the end of every line but the last, drop empty lines and
 * join the rest with one space. A single-line chunk is kept as it is.
 */
function collapseText(s: string): string {
  const lines = s.split(/\r\n|\n|\r/);
  let last = 0;
  lines.forEach((l, i) => {
    if (/[^ \t]/.test(l)) last = i;
  });
  let out = "";
  lines.forEach((raw, i) => {
    let l = raw.replace(/\t/g, " ");
    if (i !== 0) l = l.replace(/^ +/, "");
    if (i !== lines.length - 1) l = l.replace(/ +$/, "");
    if (l) {
      out += l;
      if (i !== last) out += " ";
    }
  });
  return out;
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

/** A parsed element or fragment: its nodes and its `key` attribute. */
interface Parsed {
  nodes: Node[];
  key: Expr | null;
}

/** A scanned `{ ... }`: the masked text and the elements that were inside. */
interface Container {
  /** Offset of the first character after `{`. */
  base: number;
  /** Same length as the source inside the braces; comments and JSX blanked. */
  m: string;
  /** Local offset of a hole -> the element that was there. */
  holes: Map<number, { len: number; parsed: Parsed }>;
  /** Offset of the closing `}`. */
  close: number;
}

type Raw =
  | { kind: "spread"; off: number; expr: Expr }
  | {
      kind: "bool" | "str" | "expr";
      name: string;
      off: number;
      /** Offset of the value (for errors). */
      voff: number;
      str: string;
      expr: Expr | null;
    };

/** A trimmed range inside a container's masked text. */
type Range = [number, number];

class JsxParser {
  p = 0;
  private readonly starts: number[] = [0];
  private readonly imports = new Set<string>();

  private readonly src: string;

  constructor(src: string) {
    this.src = src;
    for (let i = 0; i < src.length; i++)
      if (src[i] === "\n") this.starts.push(i + 1);
  }

  // ---- positions and errors --------------------------------------------

  pos(off: number): Pos {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= off) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: off - this.starts[lo] + 1 };
  }

  fail(message: string, off: number): never {
    const p = this.pos(off);
    throw new TemplateError(message, p.line, p.col);
  }

  /** `parseExpr` with the error moved to its real place in the file. */
  private expr(text: string, off: number): Expr {
    const at = this.pos(off);
    try {
      return parseExpr(text, at);
    } catch (e) {
      if (!(e instanceof TemplateError)) throw e;
      const raw = e.message.replace(/ \(line \d+, col \d+\)$/, "");
      const delta = e.line === at.line ? e.col - at.col : 0;
      return this.fail(raw, off + delta);
    }
  }

  // ---- low level scanning ----------------------------------------------

  private ws(): void {
    while (this.p < this.src.length && /\s/.test(this.src[this.p])) this.p++;
  }

  /** Whitespace and JS comments (between imports, around the root). */
  private trivia(): void {
    for (;;) {
      this.ws();
      if (this.src.startsWith("//", this.p)) {
        const nl = this.src.indexOf("\n", this.p);
        this.p = nl < 0 ? this.src.length : nl;
      } else if (this.src.startsWith("/*", this.p)) {
        const end = this.src.indexOf("*/", this.p + 2);
        if (end < 0) this.fail("Unterminated comment", this.p);
        this.p = end + 2;
      } else return;
    }
  }

  private match(re: RegExp): string | null {
    re.lastIndex = this.p;
    const m = re.exec(this.src);
    if (!m) return null;
    this.p += m[0].length;
    return m[0];
  }

  // ---- file ------------------------------------------------------------

  file(): TemplateAst {
    const imports: ImportDecl[] = [];
    this.trivia();
    while (/^import\b/.test(this.src.slice(this.p, this.p + 7)))
      imports.push(this.importDecl());
    this.trivia();
    if (this.match(/export\s+default\b/y)) this.trivia();
    let parens = 0;
    while (this.src[this.p] === "(") {
      parens++;
      this.p++;
      this.trivia();
    }
    if (this.src[this.p] !== "<") {
      this.fail(
        "Expected a JSX element (a view is `import` lines and one JSX expression)",
        this.p,
      );
    }
    const root = this.element();
    this.trivia();
    for (; parens > 0; parens--) {
      if (this.src[this.p] !== ")") this.fail('Expected ")"', this.p);
      this.p++;
      this.trivia();
    }
    if (this.src[this.p] === ";") this.p++;
    this.trivia();
    if (this.p < this.src.length) {
      this.fail(
        "Unexpected content after the root element (wrap siblings in <>...</>)",
        this.p,
      );
    }
    const nodes = root.nodes;
    renumber(nodes);
    return { imports, nodes };
  }

  private importDecl(): ImportDecl {
    const start = this.p;
    this.p += 6;
    this.ws();
    const local = this.match(/[A-Za-z_$][\w$]*/y);
    if (!local) {
      return this.fail(
        "Only default imports are supported: import Card from './card.pavlus'",
        this.p,
      );
    }
    if (!/^[A-Z]/.test(local) || RESERVED_IMPORTS.has(local)) {
      this.fail(
        `"${local}" cannot be used as a component name (start with a capital letter, not ${[...RESERVED_IMPORTS].join("/")})`,
        start + 7,
      );
    }
    if (this.imports.has(local))
      this.fail(`"${local}" is imported twice`, start);
    this.ws();
    if (!this.match(/from\b/y)) {
      this.fail(
        "Only default imports are supported: import Card from './card.pavlus'",
        this.p,
      );
    }
    this.ws();
    const q = this.src[this.p];
    if (q !== '"' && q !== "'")
      this.fail("Expected a module path string", this.p);
    const end = this.src.indexOf(q, this.p + 1);
    if (end < 0) this.fail("Unterminated string", this.p);
    const from = this.src.slice(this.p + 1, end);
    this.p = end + 1;
    this.ws();
    if (this.src[this.p] === ";") this.p++;
    this.imports.add(local);
    this.trivia();
    return { local, from };
  }

  // ---- elements --------------------------------------------------------

  /** Parses the element or fragment at `this.p` (a `<`). */
  element(): Parsed {
    const start = this.p;
    this.p++;
    if (this.src[this.p] === ">") {
      this.p++;
      return { nodes: this.children("", start), key: null };
    }
    const name = this.match(/[A-Za-z][\w-]*(?:\.[A-Za-z_$][\w$]*)*/y);
    if (!name) return this.fail("Expected a tag name after <", this.p);
    if (name.includes(".")) {
      this.fail(
        `Member names like <${name}> are not supported; use <Embed view={${name}} name="..." />`,
        start + 1,
      );
    }
    const { raws, selfClosing } = this.attributes(start, name);
    let children: Node[] = [];
    if (!selfClosing) {
      if (VOID_TAGS.has(name)) {
        // `<br>` without the slash; tolerate an immediate `</br>` too.
        this.match(new RegExp(`</${name}\\s*>`, "y"));
      } else children = this.children(name, start);
    }
    return this.build(name, raws, children, start);
  }

  /** Attributes up to and including `>` or `/>`. */
  private attributes(
    start: number,
    tag: string,
  ): { raws: Raw[]; selfClosing: boolean } {
    const raws: Raw[] = [];
    for (;;) {
      this.skipTagSpace();
      const c = this.src[this.p];
      if (c === undefined) return this.fail(`Unclosed <${tag}>`, start);
      if (c === ">") {
        this.p++;
        return { raws, selfClosing: false };
      }
      if (c === "/" && this.src[this.p + 1] === ">") {
        this.p += 2;
        return { raws, selfClosing: true };
      }
      if (c === "{") {
        const off = this.p;
        const box = this.container(this.p);
        this.p = box.close + 1;
        const [a, b] = trimRange(box.m, 0, box.m.length);
        if (!box.m.startsWith("...", a)) {
          this.fail(
            "Only {...spread} may stand alone in a tag; write name={expr}",
            off,
          );
        }
        this.noHoles(box);
        raws.push({
          kind: "spread",
          off,
          expr: this.expr(box.m.slice(a + 3, b), box.base + a + 3),
        });
        continue;
      }
      const off = this.p;
      const name = this.match(/[A-Za-z_$][\w$-]*(?::[A-Za-z_$][\w$-]*)?/y);
      if (!name) return this.fail(`Unexpected "${c}" in <${tag}>`, this.p);
      this.skipTagSpace();
      if (this.src[this.p] !== "=") {
        raws.push({ kind: "bool", name, off, voff: off, str: "", expr: null });
        continue;
      }
      this.p++;
      this.skipTagSpace();
      const voff = this.p;
      const q = this.src[this.p];
      if (q === '"' || q === "'") {
        const end = this.src.indexOf(q, this.p + 1);
        if (end < 0) this.fail("Unterminated string", this.p);
        const str = decodeEntities(this.src.slice(this.p + 1, end));
        this.p = end + 1;
        raws.push({ kind: "str", name, off, voff, str, expr: null });
      } else if (q === "{") {
        const box = this.container(this.p);
        this.p = box.close + 1;
        this.noHoles(box);
        const [a, b] = trimRange(box.m, 0, box.m.length);
        if (box.m[a] === "{") {
          this.fail(
            "Object expressions are not supported (`style` must be a string)",
            box.base + a,
          );
        }
        raws.push({
          kind: "expr",
          name,
          off,
          voff,
          str: "",
          expr: this.expr(box.m.slice(a, b), box.base + a),
        });
      } else {
        this.fail(
          `Expected "string" or {expression} as the value of "${name}"`,
          this.p,
        );
      }
    }
  }

  private skipTagSpace(): void {
    for (;;) {
      this.ws();
      if (this.src.startsWith("/*", this.p)) {
        const end = this.src.indexOf("*/", this.p + 2);
        if (end < 0) this.fail("Unterminated comment", this.p);
        this.p = end + 2;
      } else return;
    }
  }

  private noHoles(box: Container): void {
    for (const off of box.holes.keys()) {
      this.fail("JSX is not allowed inside an attribute value", box.base + off);
    }
  }

  /** Turns a tag and its attributes into nodes. */
  private build(tag: string, raws: Raw[], kids: Node[], start: number): Parsed {
    let key: Expr | null = null;
    const rest: Raw[] = [];
    for (const r of raws) {
      if (r.kind !== "spread" && r.name === "key") {
        key = r.kind === "expr" ? r.expr : { k: "lit", value: r.str };
      } else rest.push(r);
    }
    const pos = this.pos(start);
    const capital = /^[A-Z]/.test(tag);

    if (tag === "Outlet") {
      if (rest.length || kids.length) {
        this.fail("<Outlet /> takes no attributes and no children", start);
      }
      return { nodes: [{ type: "outlet", nid: -1, line: pos.line }], key };
    }
    if (capital) return { nodes: [this.embed(tag, rest, kids, start)], key };

    const el: ElementNode = {
      type: "element",
      nid: -1,
      tag,
      classes: [],
      toggles: [],
      attrs: [],
      events: [],
      children: kids,
      pos,
    };
    for (const r of rest) this.addAttr(el, r);
    return { nodes: [el], key };
  }

  private addAttr(el: ElementNode, r: Raw): void {
    if (r.kind === "spread") {
      this.fail(
        "`{...spread}` is only allowed on components (<Card {...props} />)",
        r.off,
      );
    }
    const value = (): Expr => {
      if (r.kind !== "expr") {
        this.fail(`"${r.name}" needs an {expression} value`, r.voff);
      }
      return r.expr!;
    };
    const parts = (): Part[] | null =>
      r.kind === "bool" ? null : r.kind === "str" ? str(r.str) : [r.expr!];

    if (r.name === "class" || r.name === "className") {
      if (r.kind === "str") {
        el.classes.push(...r.str.split(/\s+/).filter(Boolean));
      } else if (r.kind === "expr")
        el.attrs.push({ name: "class", value: parts() });
      else this.fail(`"${r.name}" needs a value`, r.off);
      return;
    }
    if (r.name.startsWith("class:")) {
      const t: ClassToggle = { name: r.name.slice(6), test: value() };
      el.toggles.push(t);
      return;
    }
    const ev = /^on([A-Z][A-Za-z0-9]*)$/.exec(r.name);
    if (ev) {
      let name = ev[1];
      let prevent = false;
      let stop = false;
      for (;;) {
        if (name.length > 7 && name.endsWith("Prevent")) {
          prevent = true;
          name = name.slice(0, -7);
        } else if (name.length > 4 && name.endsWith("Stop")) {
          stop = true;
          name = name.slice(0, -4);
        } else break;
      }
      const { msg, args } = toMessage(value(), () =>
        this.fail(
          "Event handler must be a message id like `save` or `remove(item)`",
          r.voff,
        ),
      );
      const binding: EventBinding = {
        name: name.toLowerCase(),
        msg,
        args,
        prevent,
        stop,
      };
      el.events.push(binding);
      return;
    }
    const attr: Attr = {
      name: r.name === "htmlFor" ? "for" : r.name,
      value: parts(),
    };
    el.attrs.push(attr);
  }

  /** `<Card name="main" title="x" {...rest} />` and `<Embed view={x} name="n" />`. */
  private embed(tag: string, raws: Raw[], kids: Node[], start: number): Node {
    const pos = this.pos(start);
    if (kids.length) {
      this.fail(`<${tag}> is a component and cannot have children`, start);
    }
    const dynamic = tag === "Embed";
    if (!dynamic && !this.imports.has(tag)) {
      this.fail(
        `"${tag}" is not imported. Add \`import ${tag} from "..."\` ` +
          `or use <Embed view={${tag}} name="..." /> for a component that comes from the state`,
        start + 1,
      );
    }
    let name = dynamic ? "" : tag[0].toLowerCase() + tag.slice(1);
    let view: Expr | null = null;
    let key: Expr | null = null;
    const props: Prop[] = [];
    for (const r of raws) {
      if (r.kind === "spread") {
        props.push({ spread: r.expr });
      } else if (r.name === "name") {
        if (r.kind !== "str" || !/^[A-Za-z_$][\w$]*$/.test(r.str)) {
          this.fail("Instance name must be a plain identifier string", r.voff);
        }
        name = r.str;
      } else if (dynamic && r.name === "view") {
        if (r.kind !== "expr")
          this.fail("`view` needs an {expression}", r.voff);
        view = r.expr;
      } else if (r.name === "key") {
        // reserved: the instance key of a keyed embed, not a prop
        if (r.kind !== "expr")
          this.fail(
            "The embed's key must be an {expression}: key={user.id}",
            r.voff,
          );
        key = r.expr;
      } else if (!/^[A-Za-z_$][\w$]*$/.test(r.name)) {
        this.fail(`"${r.name}" is not a valid prop name`, r.off);
      } else {
        props.push({
          name: r.name,
          value:
            r.kind === "bool"
              ? null
              : r.kind === "str"
                ? str(r.str)
                : [r.expr!],
        });
      }
    }
    if (dynamic && !view) {
      this.fail("<Embed> needs a `view={expr}` attribute", start);
    }
    if (!name) {
      this.fail(
        'A dynamic component needs an instance name: <Embed view={expr} name="x" />',
        start,
      );
    }
    return {
      type: "embed",
      nid: -1,
      component: dynamic ? null : tag,
      dynamic: view,
      name,
      key,
      props,
      pos,
    };
  }

  // ---- children --------------------------------------------------------

  /**
   * Children up to the closing tag `</tag>` (`</>` for a fragment, tag "").
   * Runs of text and `{expr}` become one text node, like one `| ...` line.
   */
  private children(tag: string, start: number): Node[] {
    const out: Node[] = [];
    let parts: Part[] = [];
    let line = 0;
    const flush = () => {
      if (parts.length) {
        pushNodes(out, [{ type: "text", nid: -1, line, parts }]);
        parts = [];
      }
    };
    const addPart = (part: Part, off: number) => {
      if (!parts.length) line = this.pos(off).line;
      const last = parts[parts.length - 1];
      if (typeof part === "string" && typeof last === "string") {
        parts[parts.length - 1] = last + part;
      } else parts.push(part);
    };
    const src = this.src;
    for (;;) {
      if (this.p >= src.length) {
        return this.fail(
          tag ? `Unclosed <${tag}>` : "Unclosed fragment <>",
          start,
        );
      }
      const c = src[this.p];
      if (c === "<") {
        if (src[this.p + 1] === "/") {
          flush();
          this.closing(tag, start);
          return out;
        }
        flush();
        pushNodes(out, this.element().nodes);
      } else if (c === "{") {
        const box = this.container(this.p);
        this.p = box.close + 1;
        const r = this.classify(box);
        if (r === null) continue;
        if ("expr" in r) addPart(r.expr, box.base - 1);
        else {
          flush();
          pushNodes(out, r.nodes);
        }
      } else {
        const from = this.p;
        while (
          this.p < src.length &&
          src[this.p] !== "<" &&
          src[this.p] !== "{"
        ) {
          if (src[this.p] === "}") {
            this.fail(
              'Unexpected "}" (write {"}"} for a literal brace)',
              this.p,
            );
          }
          this.p++;
        }
        const text = collapseText(decodeEntities(src.slice(from, this.p)));
        if (text) addPart(text, from);
      }
    }
  }

  private closing(tag: string, start: number): void {
    const at = this.p;
    this.p += 2;
    this.ws();
    const name = this.match(/[A-Za-z][\w.-]*/y) ?? "";
    this.ws();
    if (this.src[this.p] !== ">") this.fail('Expected ">"', this.p);
    this.p++;
    if (name !== tag) {
      const want = tag ? `</${tag}>` : "</>";
      this.fail(
        `Expected ${want} to close ${tag ? `<${tag}>` : "<>"} (line ${this.pos(start).line}), found </${name}>`,
        at,
      );
    }
  }

  // ---- `{ ... }` containers --------------------------------------------

  /**
   * Scans the `{` at `open`. Strings are skipped, comments blanked, brackets
   * counted and every nested JSX element (a `<` where an expression may
   * start) is parsed and replaced by a hole of the same length.
   */
  private container(open: number): Container {
    const src = this.src;
    const base = open + 1;
    const holes = new Map<number, { len: number; parsed: Parsed }>();
    let m = "";
    let i = base;
    let depth = 0;
    let last = ""; // the last two significant characters
    for (;;) {
      if (i >= src.length) this.fail("Unclosed {", open);
      const c = src[i];
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
        if (j >= src.length) this.fail("Unterminated string", i);
        m += src.slice(i, j + 1);
        i = j + 1;
        last = c;
      } else if (src.startsWith("/*", i)) {
        const end = src.indexOf("*/", i + 2);
        if (end < 0) this.fail("Unterminated comment", i);
        m += src.slice(i, end + 2).replace(/[^\n]/g, " ");
        i = end + 2;
      } else if (src.startsWith("//", i)) {
        let end = src.indexOf("\n", i);
        if (end < 0) end = src.length;
        m += " ".repeat(end - i);
        i = end;
      } else if (c === "<" && startsExpr(last)) {
        this.p = i;
        const parsed = this.element();
        const len = this.p - i;
        holes.set(m.length, { len, parsed });
        m += HOLE + "\u0002".repeat(len - 1);
        i = this.p;
        last = HOLE;
      } else {
        if (c === "}" && depth === 0) break;
        if (c === "{" || c === "(" || c === "[") depth++;
        else if (c === "}" || c === ")" || c === "]") depth--;
        m += c;
        i++;
        if (!/\s/.test(c)) last = (last + c).slice(-2);
      }
    }
    return { base, m, holes, close: i };
  }

  // ---- what a child container means ------------------------------------

  /** `null` for an empty container (a comment), nodes or a text part. */
  private classify(box: Container): { nodes: Node[] } | { expr: Expr } | null {
    const full = trimRange(box.m, 0, box.m.length);
    if (full[0] >= full[1]) return null;
    const cond = this.conditional(box, full);
    if (cond) return { nodes: [cond] };
    const loop = this.loop(box, full);
    if (loop) return { nodes: [loop] };
    const [a, b] = full;
    const hole = box.m.indexOf(HOLE, a);
    if (hole >= 0 && hole < b) {
      this.fail(
        "JSX can only appear as `cond && <X/>`, `cond ? <A/> : <B/>` or `list.map(x => <X/>)`",
        box.base + hole,
      );
    }
    if (box.m[a] === "{") {
      this.fail("Object expressions are not supported", box.base + a);
    }
    return { expr: this.expr(box.m.slice(a, b), box.base + a) };
  }

  private exprIn(box: Container, [a, b]: Range): Expr {
    return this.expr(box.m.slice(a, b), box.base + a);
  }

  /** The element filling exactly this range (parentheses allowed). */
  private holeIn(
    box: Container,
    range: Range,
  ): { len: number; parsed: Parsed } | null {
    const [a, b] = stripParens(box.m, range);
    const h = box.holes.get(a);
    return h && a + h.len === b ? h : null;
  }

  /** `a && <X/>` and `a ? <A/> : b ? <B/> : null` as an `if`. */
  private conditional(box: Container, range: Range): IfNode | null {
    const line = this.pos(box.base + range[0]).line;
    const ops = topLevel(box.m, range);
    let branches: IfBranch[] | null = null;
    if (ops.some((o) => o.op === "?")) {
      const tern = ternary(box.m, range, ops);
      if (tern && (this.holeIn(box, tern.cons) || this.holeIn(box, tern.alt))) {
        branches = this.chain(box, range);
      }
    } else {
      for (const o of ops) {
        if (o.op !== "&&") continue;
        const rest: Range = trimRange(box.m, o.i + 2, range[1]);
        const h = this.holeIn(box, rest);
        if (h) {
          branches = [
            {
              test: this.exprIn(box, trimRange(box.m, range[0], o.i)),
              children: h.parsed.nodes,
            },
          ];
          break;
        }
      }
    }
    if (!branches) return null;
    return { type: "if", nid: -1, line, branches };
  }

  /** Branches of `t ? A : (t2 ? B : C)`; `null` arms leave a branch out. */
  private chain(box: Container, range: Range): IfBranch[] {
    const tern = ternary(box.m, range, topLevel(box.m, range));
    if (!tern) {
      return this.fail(
        "Expected `cond ? <A/> : <B/>` (the else part may be `null` or another ternary)",
        box.base + range[0],
      );
    }
    const test = this.exprIn(box, tern.test);
    const cons = this.holeIn(box, tern.cons);
    const isNull = (r: Range) =>
      box.m.slice(...stripParens(box.m, r)) === "null";
    if (!cons && !isNull(tern.cons)) {
      this.fail(
        "The `?` branch must be a JSX element or `null`",
        box.base + tern.cons[0],
      );
    }
    const alt = this.holeIn(box, tern.alt);
    if (cons) {
      const out: IfBranch[] = [{ test, children: cons.parsed.nodes }];
      if (alt) out.push({ test: null, children: alt.parsed.nodes });
      else if (!isNull(tern.alt)) out.push(...this.chain(box, tern.alt));
      return out;
    }
    // `cond ? null : <B/>` shows B when the condition is false.
    if (!alt) {
      this.fail(
        "A conditional needs at least one JSX branch",
        box.base + range[0],
      );
    }
    return [
      {
        test: { k: "unary", op: "!", arg: test },
        children: alt!.parsed.nodes,
      },
    ];
  }

  /** `list.map((item, i) => <li key={item.id}>...</li>)` as a `for`. */
  private loop(box: Container, range: Range): ForNode | null {
    const m = box.m;
    for (const o of topLevel(m, range)) {
      if (o.op !== ".map") continue;
      const open = o.i + 4;
      const close = matchParen(m, open);
      // The call must be the last thing in the container.
      if (close < 0 || m.slice(close + 1, range[1]).trim()) continue;
      const [a, b] = trimRange(m, open + 1, close);
      const arrow = findArrow(m, a, b);
      if (arrow < 0) continue;
      const head = stripParens(m, trimRange(m, a, arrow));
      const names = m
        .slice(head[0], head[1])
        .split(",")
        .map((s) => s.trim());
      if (
        names.length > 2 ||
        !names.every((n) => /^[A-Za-z_$][\w$]*$/.test(n))
      ) {
        this.fail(
          "The map callback takes `item` or `(item, index)` (plain names)",
          box.base + a,
        );
      }
      const body = this.holeIn(box, trimRange(m, arrow + 2, b));
      if (!body) {
        this.fail(
          "The map callback must return one JSX element: `item => <li>...</li>`",
          box.base + arrow + 2,
        );
      }
      const line = this.pos(box.base + range[0]).line;
      return {
        type: "for",
        nid: -1,
        line,
        item: names[0],
        index: names[1] ?? null,
        of: this.exprIn(box, trimRange(m, range[0], o.i)),
        key: body!.parsed.key,
        children: body!.parsed.nodes,
      };
    }
    return null;
  }
}

// ---- helpers over masked text ---------------------------------------------

function str(s: string): Part[] {
  return s ? [s] : [];
}

/** Appends nodes, merging text that ends up next to text (fragments). */
function pushNodes(list: Node[], nodes: Node[]): void {
  for (const n of nodes) {
    const last = list[list.length - 1];
    if (n.type === "text" && last?.type === "text") {
      for (const p of n.parts) {
        const tail = last.parts[last.parts.length - 1];
        if (typeof p === "string" && typeof tail === "string") {
          last.parts[last.parts.length - 1] = tail + p;
        } else last.parts.push(p);
      }
    } else list.push(n);
  }
}

/** One id per node in document order, parents before children. */
function renumber(roots: Node[]): void {
  let nid = 0;
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      n.nid = nid++;
      if (n.type === "element" || n.type === "for") walk(n.children);
      else if (n.type === "if") n.branches.forEach((b) => walk(b.children));
    }
  };
  walk(roots);
}

/** Can an expression start after these significant characters? */
function startsExpr(last: string): boolean {
  return last === "" || last === "=>" || /[(,?:&|{[]$/.test(last);
}

function trimRange(m: string, a: number, b: number): Range {
  while (a < b && /\s/.test(m[a])) a++;
  while (b > a && /\s/.test(m[b - 1])) b--;
  return [a, b];
}

/** Index of the `)` closing the `(` at `open`, or -1. */
function matchParen(m: string, open: number): number {
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    const c = m[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < m.length && m[i] !== c) i += m[i] === "\\" ? 2 : 1;
    } else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (--depth === 0) return c === ")" ? i : -1;
    }
  }
  return -1;
}

/** Removes parentheses wrapping the whole range. */
function stripParens(m: string, range: Range): Range {
  let [a, b] = trimRange(m, range[0], range[1]);
  while (m[a] === "(" && matchParen(m, a) === b - 1) {
    [a, b] = trimRange(m, a + 1, b - 1);
  }
  return [a, b];
}

interface Op {
  op: "?" | ":" | "&&" | ".map";
  i: number;
}

/** Operators at bracket depth 0 that the recognisers care about. */
function topLevel(m: string, [a, b]: Range): Op[] {
  const ops: Op[] = [];
  let depth = 0;
  for (let i = a; i < b; i++) {
    const c = m[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < b && m[i] !== c) i += m[i] === "\\" ? 2 : 1;
    } else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth !== 0) continue;
    else if (c === "?") {
      if (m[i + 1] === "?") i++;
      else if (m[i + 1] !== ".") ops.push({ op: "?", i });
    } else if (c === ":") ops.push({ op: ":", i });
    else if (c === "&" && m[i + 1] === "&") {
      ops.push({ op: "&&", i });
      i++;
    } else if (c === "." && m.startsWith(".map(", i)) {
      ops.push({ op: ".map", i });
    }
  }
  return ops;
}

/** Splits `test ? cons : alt` at the first top-level `?` and its `:`. */
function ternary(
  m: string,
  [a, b]: Range,
  ops: Op[],
): { test: Range; cons: Range; alt: Range } | null {
  const q = ops.find((o) => o.op === "?");
  if (!q) return null;
  let open = 0;
  for (const o of ops) {
    if (o.i < q.i) continue;
    if (o.op === "?") open++;
    else if (o.op === ":" && --open === 0) {
      return {
        test: trimRange(m, a, q.i),
        cons: trimRange(m, q.i + 1, o.i),
        alt: trimRange(m, o.i + 1, b),
      };
    }
  }
  return null;
}

/** Offset of the `=>` at bracket depth 0 inside the range, or -1. */
function findArrow(m: string, a: number, b: number): number {
  let depth = 0;
  for (let i = a; i < b; i++) {
    const c = m[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && c === "=" && m[i + 1] === ">") return i;
  }
  return -1;
}

/** Parses a `.view.jsx` file into the template AST. */
export function parseJsx(source: string): TemplateAst {
  return new JsxParser(source).file();
}
