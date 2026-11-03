import type {
  Attr,
  ClassToggle,
  ElementNode,
  EmbedNode,
  EventBinding,
  Expr,
  ForNode,
  IfNode,
  ImportDecl,
  Node,
  Part,
  Pos,
  Prop,
  TemplateAst,
  TextNode,
} from "./ast.ts";
import { TemplateError } from "./errors.ts";
import { parseExpr } from "./expr.ts";

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

interface Line {
  no: number;
  indent: number;
  text: string;
}

/** Position of `offset` inside a line's trimmed text. */
function at(line: Line, offset: number): Pos {
  return { line: line.no, col: line.indent + offset + 1 };
}

/**
 * Removes a trailing `// comment`. Only a `//` preceded by whitespace and
 * outside `()` / `{}` / quotes counts, so `href=http://x` is left alone.
 */
function stripComment(text: string): string {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (depth > 0 && (c === '"' || c === "'")) quote = c;
    else if (c === "(" || c === "{") depth++;
    else if (c === ")" || c === "}") depth--;
    else if (
      depth === 0 &&
      c === "/" &&
      text[i + 1] === "/" &&
      (i === 0 || /\s/.test(text[i - 1]))
    )
      return text.slice(0, i).trimEnd();
  }
  return text;
}

/** Index of the `}` matching the `{` at `open`, skipping strings. */
function matchBrace(text: string, open: number, line: Line): number {
  let depth = 0;
  let quote = "";
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  const p = at(line, open);
  throw new TemplateError("Unclosed {", p.line, p.col);
}

/** Splits text into literal strings and `{expr}` parts. `\{` escapes a brace. */
function parseParts(text: string, base: number, line: Line): Part[] {
  const parts: Part[] = [];
  let lit = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && (text[i + 1] === "{" || text[i + 1] === "}")) {
      lit += text[++i];
    } else if (c === "{") {
      const close = matchBrace(text, i, line);
      if (lit) parts.push(lit);
      lit = "";
      parts.push(parseExpr(text.slice(i + 1, close), at(line, base + i + 1)));
      i = close;
    } else lit += c;
  }
  if (lit) parts.push(lit);
  return parts;
}

/** Turns `removeUser(user)` / `users.remove` into a message binding. */
function toMessage(e: Expr, p: Pos): { msg: string; args: Expr[] } {
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
  if (msg === null) {
    throw new TemplateError(
      "Event handler must be a message id like `save` or `remove(item)`",
      p.line,
      p.col,
    );
  }
  return { msg, args: e.k === "call" ? e.args : [] };
}

interface RawAttr {
  name: string;
  value: Part[] | null;
  bare: boolean;
  pos: Pos;
  /** `...expr` entry (only valid in component props). */
  spread?: boolean;
}

/** End of an unquoted attribute value: first space / comma / `)` at depth 0. */
function scanBare(text: string, start: number): number {
  let j = start;
  let depth = 0;
  let quote = "";
  for (; j < text.length; j++) {
    const d = text[j];
    if (quote) {
      if (d === "\\") j++;
      else if (d === quote) quote = "";
    } else if (d === '"' || d === "'") quote = d;
    else if (d === "(" || d === "[" || d === "{") depth++;
    else if (d === ")" || d === "]" || d === "}") {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && (/\s/.test(d) || d === ",")) break;
  }
  return j;
}

/** Parses `(a=1 b="x {y}" @click=go(item))` starting after the `(`. */
function parseAttrs(
  text: string,
  start: number,
  line: Line,
): { attrs: RawAttr[]; end: number } {
  const attrs: RawAttr[] = [];
  let i = start;
  for (;;) {
    while (i < text.length && (/\s/.test(text[i]) || text[i] === ",")) i++;
    if (i >= text.length) {
      const p = at(line, start - 1);
      throw new TemplateError("Unclosed (", p.line, p.col);
    }
    if (text[i] === ")") return { attrs, end: i + 1 };
    if (text.startsWith("...", i)) {
      const pos = at(line, i);
      const j = scanBare(text, i + 3);
      attrs.push({
        name: "...",
        value: [parseExpr(text.slice(i + 3, j), at(line, i + 3))],
        bare: true,
        pos,
        spread: true,
      });
      i = j;
      continue;
    }
    const m = /^[@\w:.\-]+/.exec(text.slice(i));
    if (!m) {
      const p = at(line, i);
      throw new TemplateError(
        `Unexpected "${text[i]}" in attributes`,
        p.line,
        p.col,
      );
    }
    const name = m[0];
    const pos = at(line, i);
    i += name.length;
    if (text[i] !== "=") {
      attrs.push({ name, value: null, bare: false, pos });
      continue;
    }
    i++;
    const c = text[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
      if (j >= text.length) {
        const p = at(line, i);
        throw new TemplateError("Unterminated string", p.line, p.col);
      }
      attrs.push({
        name,
        value: parseParts(text.slice(i + 1, j), i + 1, line),
        bare: false,
        pos,
      });
      i = j + 1;
    } else if (c === "{") {
      const close = matchBrace(text, i, line);
      attrs.push({
        name,
        value: [parseExpr(text.slice(i + 1, close), at(line, i + 1))],
        bare: true,
        pos,
      });
      i = close + 1;
    } else {
      const j = scanBare(text, i);
      attrs.push({
        name,
        value: [parseExpr(text.slice(i, j), at(line, i))],
        bare: true,
        pos,
      });
      i = j;
    }
  }
}

/** Mutable state shared by the line parsers. */
class Builder {
  nid = 0;

  element(line: Line): ElementNode {
    const text = line.text;
    let i = 0;
    const tagM = /^[A-Za-z][\w-]*/.exec(text);
    let tag = "div";
    if (tagM) {
      tag = tagM[0];
      i = tag.length;
    }
    const el: ElementNode = {
      type: "element",
      nid: this.nid++,
      tag,
      classes: [],
      toggles: [],
      attrs: [],
      events: [],
      children: [],
      pos: at(line, 0),
    };
    for (;;) {
      const m = /^([.#])([\w-]+)/.exec(text.slice(i));
      if (!m) break;
      if (m[1] === ".") el.classes.push(m[2]);
      else el.attrs.push({ name: "id", value: [m[2]] });
      i += m[0].length;
    }
    if (i === 0) {
      const p = at(line, 0);
      throw new TemplateError(`Cannot parse line "${text}"`, p.line, p.col);
    }
    if (text[i] === "(") {
      const r = parseAttrs(text, i + 1, line);
      for (const a of r.attrs) this.addAttr(el, a);
      i = r.end;
    }
    const rest = text.slice(i);
    if (rest && !/^\s/.test(rest)) {
      const p = at(line, i);
      throw new TemplateError(`Unexpected "${rest[0]}"`, p.line, p.col);
    }
    const inline = rest.trim();
    if (inline) {
      const parts = parseParts(
        inline,
        i + (rest.length - rest.trimStart().length),
        line,
      );
      el.children.push({ type: "text", nid: this.nid++, line: line.no, parts });
    }
    return el;
  }

  private addAttr(el: ElementNode, a: RawAttr): void {
    if (a.spread) {
      throw new TemplateError(
        "`...spread` is only allowed in component props (+Name(...))",
        a.pos.line,
        a.pos.col,
      );
    }
    const single = (): Expr => {
      if (a.value?.length !== 1 || typeof a.value[0] === "string") {
        throw new TemplateError(
          `"${a.name}" needs an expression value`,
          a.pos.line,
          a.pos.col,
        );
      }
      return a.value[0];
    };
    if (a.name.startsWith("@")) {
      const [name, ...mods] = a.name.slice(1).split(".");
      const { msg, args } = toMessage(single(), a.pos);
      const ev: EventBinding = {
        name,
        msg,
        args,
        prevent: mods.includes("prevent"),
        stop: mods.includes("stop"),
      };
      el.events.push(ev);
    } else if (a.name.startsWith("class:")) {
      const t: ClassToggle = { name: a.name.slice(6), test: single() };
      el.toggles.push(t);
    } else {
      const attr: Attr = { name: a.name, value: a.value };
      el.attrs.push(attr);
    }
  }

  /** Parses `+Name#instance(props)` or `+{expr}#instance(props)`. */
  embed(line: Line, imports: Set<string>): EmbedNode {
    const text = line.text;
    const fail = (m: string, offset: number): never => {
      const p = at(line, offset);
      throw new TemplateError(m, p.line, p.col);
    };
    let i = 1;
    let component: string | null = null;
    let dynamic: Expr | null = null;
    let name = "";
    if (text[i] === "{") {
      const close = matchBrace(text, i, line);
      dynamic = parseExpr(text.slice(i + 1, close), at(line, i + 1));
      i = close + 1;
    } else {
      const m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
      if (!m)
        return fail("Expected a component name or {expression} after +", i);
      component = m[0];
      if (!imports.has(component)) {
        return fail(
          `"${component}" is not imported. Add \`import ${component} from "..."\` ` +
            `or use +{${component}} for a component that comes from the state`,
          i,
        );
      }
      name = component[0].toLowerCase() + component.slice(1);
      i += component.length;
    }
    if (text[i] === "#") {
      const m = /^#([A-Za-z_$][\w$]*)/.exec(text.slice(i));
      if (!m) return fail("Instance name must be an identifier", i);
      name = m[1];
      i += m[0].length;
    }
    if (!name) {
      return fail(
        "A dynamic component needs an instance name: +{expr}#name(...)",
        i,
      );
    }
    const props: Prop[] = [];
    if (text[i] === "(") {
      const r = parseAttrs(text, i + 1, line);
      for (const a of r.attrs) {
        if (a.spread) props.push({ spread: a.value![0] as Expr });
        else if (!/^[A-Za-z_$][\w$]*$/.test(a.name)) {
          throw new TemplateError(
            `"${a.name}" is not a valid prop name`,
            a.pos.line,
            a.pos.col,
          );
        } else props.push({ name: a.name, value: a.value });
      }
      i = r.end;
    }
    if (text.slice(i).trim())
      return fail(`Unexpected "${text.slice(i).trim()}" after component`, i);
    return {
      type: "embed",
      nid: this.nid++,
      component,
      dynamic,
      name,
      props,
      pos: at(line, 0),
    };
  }

  text(line: Line, raw: string, base: number): TextNode {
    return {
      type: "text",
      nid: this.nid++,
      line: line.no,
      parts: parseParts(raw, base, line),
    };
  }
}

interface Frame {
  indent: number;
  childIndent: number | null;
  /** Where children of this node go; `null` for leaves. */
  into: Node[] | null;
}

/**
 * Parses template source into an AST.
 *
 * Syntax (indentation based):
 *
 * ```
 * ul.menu
 *   for item in items key item.id
 *     li.menu__item(class:active=item.active)
 *       a(href=item.url @click=open(item.id)) {item.title}
 *   if empty
 *     | Nothing here
 *   else
 *     | {items.length} items
 * ```
 */
export function parse(source: string): TemplateAst {
  const b = new Builder();
  const lines: Line[] = [];
  source.split(/\r?\n/).forEach((raw, idx) => {
    if (!raw.trim()) return;
    const no = idx + 1;
    const indent = raw.length - raw.trimStart().length;
    if (raw.slice(0, indent).includes("\t")) {
      throw new TemplateError("Tabs are not allowed, use spaces", no, 1);
    }
    let text = raw.trim();
    if (text.startsWith("//")) return;
    if (!text.startsWith("|")) text = stripComment(text);
    if (text) lines.push({ no, indent, text });
  });

  const roots: Node[] = [];
  const imports: ImportDecl[] = [];
  const importNames = new Set<string>();
  const stack: Frame[] = [{ indent: -1, childIndent: null, into: roots }];

  for (const line of lines) {
    const imp =
      /^import\s+([A-Za-z_$][\w$]*)\s+from\s+(?:"([^"]+)"|'([^']+)')$/.exec(
        line.text,
      );
    if (imp) {
      const bad = (m: string): never => {
        throw new TemplateError(m, line.no, line.indent + 1);
      };
      if (line.indent !== 0 || roots.length > 0)
        bad("`import` lines must be at the top of the file");
      if (!/^[A-Z]/.test(imp[1]) || RESERVED_IMPORTS.has(imp[1])) {
        bad(
          `"${imp[1]}" cannot be used as a component name (start with a capital letter, not ${[...RESERVED_IMPORTS].join("/")})`,
        );
      }
      if (importNames.has(imp[1])) bad(`"${imp[1]}" is imported twice`);
      importNames.add(imp[1]);
      imports.push({ local: imp[1], from: imp[2] ?? imp[3] });
      continue;
    }
    while (stack[stack.length - 1].indent >= line.indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent.into === null) {
      throw new TemplateError("This line cannot have children", line.no, 1);
    }
    if (parent.childIndent === null) parent.childIndent = line.indent;
    else if (parent.childIndent !== line.indent) {
      throw new TemplateError("Inconsistent indentation", line.no, 1);
    }

    const t = line.text;
    let node: Node | null = null;
    let into: Node[] | null = null;
    let m: RegExpExecArray | null;

    if ((m = /^if\s+(.+?):?$/.exec(t))) {
      const n: IfNode = {
        type: "if",
        nid: b.nid++,
        line: line.no,
        branches: [
          {
            test: parseExpr(m[1], at(line, t.indexOf(m[1]))),
            children: [],
          },
        ],
      };
      node = n;
      into = n.branches[0].children;
    } else if ((m = /^else\s+if\s+(.+?):?$/.exec(t)) || /^else:?$/.test(t)) {
      const prev = parent.into[parent.into.length - 1];
      if (
        prev?.type !== "if" ||
        prev.branches[prev.branches.length - 1].test === null
      ) {
        throw new TemplateError(
          "`else` without matching `if`",
          line.no,
          line.indent + 1,
        );
      }
      const branch = {
        test: m ? parseExpr(m[1], at(line, t.lastIndexOf(m[1]))) : null,
        children: [] as Node[],
      };
      prev.branches.push(branch);
      into = branch.children;
    } else if ((m = /^for\s+(\w+)(?:\s*,\s*(\w+))?\s+in\s+(.+?):?$/.exec(t))) {
      let ofSrc = m[3];
      let keySrc: string | null = null;
      const k = /^(.+?)\s+key\s+(.+)$/.exec(ofSrc);
      if (k) {
        ofSrc = k[1];
        keySrc = k[2];
      }
      const n: ForNode = {
        type: "for",
        nid: b.nid++,
        line: line.no,
        item: m[1],
        index: m[2] ?? null,
        of: parseExpr(ofSrc, at(line, t.indexOf(ofSrc))),
        key:
          keySrc === null
            ? null
            : parseExpr(keySrc, at(line, t.lastIndexOf(keySrc))),
        children: [],
      };
      node = n;
      into = n.children;
    } else if (t.startsWith("|")) {
      const body = t.slice(t[1] === " " ? 2 : 1);
      node = b.text(line, body, t[1] === " " ? 2 : 1);
    } else if (t.startsWith("{")) {
      node = b.text(line, t, 0);
    } else if (/^\+outlet\b/.test(t)) {
      if (t.trim() !== "+outlet") {
        throw new TemplateError(
          "`+outlet` takes nothing after it",
          line.no,
          line.indent + 8,
        );
      }
      node = { type: "outlet", nid: b.nid++, line: line.no };
    } else if (t.startsWith("+")) {
      node = b.embed(line, importNames);
    } else {
      const el = b.element(line);
      node = el;
      into = VOID_TAGS.has(el.tag) ? null : el.children;
    }

    if (node) {
      // Text after text (`| a` then `| b`, or inline text then a `|` line) is
      // joined with a newline, which HTML renders as a space, like pug does.
      const previous = parent.into[parent.into.length - 1];
      if (node.type === "text" && previous?.type === "text") {
        node.parts.unshift("\n");
      }
      parent.into.push(node);
    }
    stack.push({ indent: line.indent, childIndent: null, into });
  }
  return { imports, nodes: roots };
}
