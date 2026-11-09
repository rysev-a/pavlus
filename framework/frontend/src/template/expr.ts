import type { Expr, Pos } from "./ast.ts";
import { TemplateError } from "./errors.ts";

/**
 * The expression grammar is deliberately tiny (see framework/docs/
 * philosophy.md): a template only reads ready data, so an expression is a
 * path into the state or a literal. Nothing else parses — operators,
 * calls, arrows and ternaries are errors that say where the logic belongs.
 */

type Token = {
  t: "num" | "str" | "id" | "p" | "eof";
  v: string | number;
  pos: number;
};

/** Every punctuator that was ever part of the language, kept so a removed one gets a named error. */
const PUNCT = [
  "=>",
  "===",
  "!==",
  "??",
  "?.",
  "&&",
  "||",
  "==",
  "!=",
  "<=",
  ">=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "!",
  "?",
  ":",
  ".",
  ",",
  "(",
  ")",
  "[",
  "]",
];

const KEYWORDS: Record<string, Expr> = {
  true: { k: "lit", value: true },
  false: { k: "lit", value: false },
  null: { k: "lit", value: null },
  undefined: { k: "lit", value: undefined },
};

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r" };

/** Where removed syntax belongs, in one line. */
const IN_CODE = "compute it in component code (framework/docs/philosophy.md)";

const BINARY_OPS = new Set([
  "+", "-", "*", "/", "%",
  "==", "!=", "===", "!==",
  "<", ">", "<=", ">=",
  "&&", "||",
]);

function tokenize(src: string, at: Pos): Token[] {
  const toks: Token[] = [];
  const err = (m: string, i: number) =>
    new TemplateError(m, at.line, at.col + i);
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i))!;
      toks.push({ t: "num", v: Number(m[0]), pos: i });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let s = "";
      let j = i + 1;
      for (;;) {
        if (j >= src.length) throw err("Unterminated string", i);
        const d = src[j];
        if (d === "\\") {
          const e = src[j + 1] ?? "";
          s += ESCAPES[e] ?? e;
          j += 2;
        } else if (d === c) {
          j++;
          break;
        } else {
          s += d;
          j++;
        }
      }
      toks.push({ t: "str", v: s, pos: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[\w$]+/.exec(src.slice(i))!;
      toks.push({ t: "id", v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    const p = PUNCT.find((x) => src.startsWith(x, i));
    if (!p) throw err(`Unexpected character "${c}"`, i);
    toks.push({ t: "p", v: p, pos: i });
    i += p.length;
  }
  toks.push({ t: "eof", v: "", pos: src.length });
  return toks;
}

/** A removed construct, named for the error message. */
function removed(p: string): string {
  if (p === "=>") return "an arrow function";
  if (p === "?.") return "optional chaining";
  if (p === "??") return "the nullish operator";
  if (p === "?" || p === ":") return "a ternary";
  if (p === "!") return "negation (!)";
  if (p === "(" || p === ")") return "a call (or parentheses)";
  if (p === "[") return "an array literal";
  if (BINARY_OPS.has(p)) return `the "${p}" operator`;
  return `"${p}"`;
}

class ExprParser {
  private i = 0;
  private toks: Token[];
  private at: Pos;

  constructor(toks: Token[], at: Pos) {
    this.toks = toks;
    this.at = at;
  }

  private err(m: string, tok: Token): TemplateError {
    return new TemplateError(m, this.at.line, this.at.col + tok.pos);
  }
  private peek(): Token {
    return this.toks[this.i];
  }
  private isP(v: string): boolean {
    const t = this.peek();
    return t.t === "p" && t.v === v;
  }
  private refuse(): never {
    const t = this.peek();
    if (t.t === "p") {
      throw this.err(
        `${removed(t.v as string)} is not allowed in a template expression — ${IN_CODE}`,
        t,
      );
    }
    throw this.err(
      t.t === "eof" ? "Unexpected end of expression" : `Unexpected "${t.v}"`,
      t,
    );
  }

  parseAll(): Expr {
    const e = this.expr();
    if (this.peek().t !== "eof") this.refuse();
    return e;
  }

  private expr(): Expr {
    const t = this.peek();
    if (t.t === "num" || t.t === "str") {
      this.i++;
      return { k: "lit", value: t.v };
    }
    if (t.t === "id") {
      this.i++;
      const kw = KEYWORDS[t.v as string];
      if (kw) return kw;
      // a path: id, then .prop / [literal] as far as it goes
      let e: Expr = { k: "id", name: t.v as string };
      for (;;) {
        if (this.isP(".")) {
          this.i++;
          const p = this.peek();
          if (p.t !== "id") this.refuse();
          this.i++;
          e = { k: "member", obj: e, prop: p.v as string };
        } else if (this.isP("[")) {
          this.i++;
          const ix = this.peek();
          if (ix.t !== "num" && ix.t !== "str") this.refuse();
          this.i++;
          if (!this.isP("]")) this.refuse();
          this.i++;
          e = { k: "index", obj: e, index: { k: "lit", value: ix.v } };
        } else return e;
      }
    }
    this.refuse();
  }
}

/**
 * Parses a template expression: a literal, or a path into the state such as
 * `user.name` or `items[0]`. `at` is the source position of the first
 * character, used for error locations.
 */
export function parseExpr(src: string, at: Pos): Expr {
  if (!src.trim()) throw new TemplateError("Empty expression", at.line, at.col);
  return new ExprParser(tokenize(src, at), at).parseAll();
}

/**
 * Parses an event binding: `save`, `remove(item.id)`, `pick(user, 2)` — a
 * dotted message id with literal/path arguments. The one place a call-like
 * shape survives: it is not a computation, it is the message's payload.
 */
export function parseEvent(
  src: string,
  at: Pos,
): { msg: string; args: Expr[] } {
  const toks = tokenize(src, at);
  const p = new ExprParser(toks, at);
  // message id: id ("." id)*  — consume tokens directly
  let msg = "";
  const first = toks[0];
  if (!first || first.t !== "id") {
    throw new TemplateError(
      "Event handler must be a message id like `save` or `remove(item)`",
      at.line,
      at.col,
    );
  }
  msg = first.v as string;
  let i = 1;
  for (;;) {
    const dot = toks[i];
    const name = toks[i + 1];
    if (dot && dot.t === "p" && dot.v === "." && name && name.t === "id") {
      msg += `.${name.v as string}`;
      i += 2;
    } else break;
  }
  const args: Expr[] = [];
  const open = toks[i];
  if (open && open.t === "p" && open.v === "(") {
    i++;
    for (;;) {
      const t = toks[i];
      if (t && t.t === "p" && t.v === ")") break;
      if (t && t.t === "eof")
        throw new TemplateError(
          "Unclosed ( in event arguments",
          at.line,
          at.col + t.pos,
        );
      const argToks: Token[] = [];
      let depth = 0;
      // one argument: everything up to a top-level , or )
      for (; i < toks.length; i++) {
        const tok = toks[i];
        if (tok.t === "eof") break;
        if (tok.t === "p" && depth === 0 && (tok.v === "," || tok.v === ")"))
          break;
        if (tok.t === "p" && (tok.v === "(" || tok.v === "[")) depth++;
        if (tok.t === "p" && (tok.v === ")" || tok.v === "]")) depth--;
        argToks.push(tok);
      }
      // ExprParser walks to an eof token; the slice has none of its own
      const last = argToks[argToks.length - 1];
      const eof: Token = {
        t: "eof",
        v: "",
        pos: last ? last.pos + String(last.v).length : 0,
      };
      const inner = new ExprParser([...argToks, eof], at);
      args.push(inner.parseAll());
      const sep = toks[i];
      if (sep && sep.t === "p" && sep.v === ",") i++;
      else if (sep && sep.t === "p" && sep.v === ")") break;
      else
        throw new TemplateError(
          "Unclosed ( in event arguments",
          at.line,
          at.col,
        );
    }
    i++; // )
    const trailing = toks[i];
    if (trailing && trailing.t !== "eof")
      throw new TemplateError(
        `Unexpected "${trailing.v}" after event arguments`,
        at.line,
        at.col + trailing.pos,
      );
  } else {
    const trailing = toks[i];
    if (trailing && trailing.t !== "eof")
      throw new TemplateError(
        `${removed(String(trailing.v))} is not allowed in an event binding — ${IN_CODE}`,
        at.line,
        at.col + trailing.pos,
      );
  }
  return { msg, args };
}
