import type { Expr, Pos } from "./ast.ts";
import { TemplateError } from "./errors.ts";

type Token = {
  t: "num" | "str" | "id" | "p" | "eof";
  v: string | number;
  pos: number;
};

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

const BINARY: Record<string, number> = {
  "??": 1,
  "||": 2,
  "&&": 3,
  "==": 4,
  "!=": 4,
  "===": 4,
  "!==": 4,
  "<": 5,
  ">": 5,
  "<=": 5,
  ">=": 5,
  "+": 6,
  "-": 6,
  "*": 7,
  "/": 7,
  "%": 7,
};

const KEYWORDS: Record<string, Expr> = {
  true: { k: "lit", value: true },
  false: { k: "lit", value: false },
  null: { k: "lit", value: null },
  undefined: { k: "lit", value: undefined },
};

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r" };

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
  private eat(v: string): void {
    if (!this.isP(v)) throw this.err(`Expected "${v}"`, this.peek());
    this.i++;
  }

  parseAll(): Expr {
    const e = this.ternary();
    const t = this.peek();
    if (t.t !== "eof") throw this.err(`Unexpected "${t.v}"`, t);
    return e;
  }

  private ternary(): Expr {
    const test = this.binary(1);
    if (!this.isP("?")) return test;
    this.i++;
    const then = this.ternary();
    this.eat(":");
    const els = this.ternary();
    return { k: "cond", test, then, else: els };
  }

  private binary(minPrec: number): Expr {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      const prec = t.t === "p" ? BINARY[t.v as string] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      this.i++;
      const right = this.binary(prec + 1);
      left = { k: "binary", op: t.v as string, left, right };
    }
  }

  private unary(): Expr {
    const t = this.peek();
    if (t.t === "p" && (t.v === "!" || t.v === "-" || t.v === "+")) {
      this.i++;
      return { k: "unary", op: t.v, arg: this.unary() };
    }
    return this.postfix();
  }

  private postfix(): Expr {
    let e = this.primary();
    for (;;) {
      if (this.isP(".") || this.isP("?.")) {
        this.i++;
        const t = this.peek();
        if (t.t !== "id") throw this.err("Expected property name", t);
        this.i++;
        e = { k: "member", obj: e, prop: t.v as string };
      } else if (this.isP("[")) {
        this.i++;
        const index = this.ternary();
        this.eat("]");
        e = { k: "index", obj: e, index };
      } else if (this.isP("(")) {
        this.i++;
        const args: Expr[] = [];
        while (!this.isP(")")) {
          args.push(this.ternary());
          if (!this.isP(")")) this.eat(",");
        }
        this.eat(")");
        e = { k: "call", callee: e, args };
      } else return e;
    }
  }

  private primary(): Expr {
    const t = this.peek();
    if (t.t === "num" || t.t === "str") {
      this.i++;
      return { k: "lit", value: t.v };
    }
    if (t.t === "id") {
      // `x => ...`: a one-parameter arrow without parentheses
      const next = this.toks[this.i + 1];
      if (
        !KEYWORDS[t.v as string] &&
        next &&
        next.t === "p" &&
        next.v === "=>"
      ) {
        const param = t.v as string;
        this.i += 2;
        return { k: "arrow", params: [param], body: this.ternary() };
      }
      this.i++;
      return KEYWORDS[t.v as string] ?? { k: "id", name: t.v as string };
    }
    if (this.isP("(")) {
      // `(a, b) => ...` or `() => ...` — but also a parenthesized expression.
      // Try the parameter list first; anything that does not fit rolls back.
      const arrow = this.tryArrowParams();
      if (arrow) return { k: "arrow", params: arrow, body: this.ternary() };
      this.i++;
      const e = this.ternary();
      this.eat(")");
      return e;
    }
    if (this.isP("[")) {
      this.i++;
      const items: Expr[] = [];
      while (!this.isP("]")) {
        items.push(this.ternary());
        if (!this.isP("]")) this.eat(",");
      }
      this.eat("]");
      return { k: "array", items };
    }
    throw this.err(
      t.t === "eof" ? "Unexpected end of expression" : `Unexpected "${t.v}"`,
      t,
    );
  }

  /**
   * `(` id (`,` id)* `)` `=>`, or null (with the position restored) when the
   * tokens are not an arrow's parameter list. A parse error inside also rolls
   * back: `(a.b)` is a parenthesized expression, not a broken parameter.
   */
  private tryArrowParams(): string[] | null {
    const save = this.i;
    const rollback = (): null => {
      this.i = save;
      return null;
    };
    if (!this.isP("(")) return null;
    this.i++;
    const params: string[] = [];
    let confirmed = false; // `)` followed by `=>` seen: it IS an arrow
    try {
      while (!this.isP(")")) {
        const t = this.peek();
        if (t.t !== "id" || KEYWORDS[t.v as string]) return rollback();
        params.push(t.v as string);
        this.i++;
        if (!this.isP(")")) this.eat(",");
      }
      this.i++; // )
      if (!this.isP("=>")) return rollback();
      confirmed = true;
      // only an arrow from here on: duplicates are a real error, not a rollback
      const dup = params.find((p, i) => params.indexOf(p) !== i);
      if (dup !== undefined)
        throw this.err(`duplicate parameter "${dup}"`, this.toks[save]!);
      this.i++; // =>
      return params;
    } catch (e) {
      if (confirmed || !(e instanceof TemplateError)) throw e;
      return rollback();
    }
  }
}

/**
 * Parses a template expression. `at` is the source position of the first
 * character, used for error locations.
 */
export function parseExpr(src: string, at: Pos): Expr {
  if (!src.trim()) throw new TemplateError("Empty expression", at.line, at.col);
  return new ExprParser(tokenize(src, at), at).parseAll();
}
