// The expression language of the builder. A .pavlus template reads ready data
// only — paths and literals (framework/docs/philosophy.md) — while here is
// where the logic lives: an inspector field, a condition, an action value or a
// list source is evaluated by this parser, never by the template compiler.
// The syntax is the old framework subset: paths, literals, the arithmetic and
// comparison operators, ternaries, and calls to the helpers of bind.ts (there
// are no method calls: len(x), not x.length()). Bracket access is refused —
// use at(list, i) — so a pasted expression cannot reach around the scope.

import type { Scope } from "./bind.ts";

type Tok =
  | { t: "num" | "str" | "id" | "p"; v: unknown; pos: number }
  | { t: "eof"; v: ""; pos: number };

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

const KEYWORDS: Record<string, unknown> = {
  true: true,
  false: false,
  null: null,
  undefined: undefined,
};

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r" };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
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
        if (j >= src.length) throw new Error("Unterminated string");
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
    if (!p) throw new Error(`Unexpected character "${c}"`);
    toks.push({ t: "p", v: p, pos: i });
    i += p.length;
  }
  toks.push({ t: "eof", v: "", pos: src.length });
  return toks;
}

/** binary operator precedence, higher binds tighter */
const PREC: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "===": 3,
  "!==": 3,
  "<": 4,
  ">": 4,
  "<=": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

/** A compiled expression: a pure function of the scope. */
export type CompiledExpr = (scope: Scope) => unknown;

const num = (x: unknown): number => {
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
};
const text = (x: unknown): string =>
  x === null || x === undefined
    ? ""
    : typeof x === "object"
      ? JSON.stringify(x)
      : String(x);

class Parser {
  private i = 0;
  private readonly toks: Tok[];
  constructor(toks: Tok[]) {
    this.toks = toks;
  }

  private peek(): Tok {
    return this.toks[this.i];
  }
  private isP(v: string): boolean {
    const t = this.peek();
    return t.t === "p" && t.v === v;
  }
  private eat(v: string): void {
    if (!this.isP(v)) throw new Error(`Expected "${v}"`);
    this.i++;
  }

  parse(): CompiledExpr {
    const e = this.ternary();
    const t = this.peek();
    if (t.t !== "eof") throw new Error(`Unexpected "${text(t.v)}"`);
    return e;
  }

  private ternary(): CompiledExpr {
    const test = this.binary(1);
    if (!this.isP("?")) return test;
    this.i++;
    const then = this.ternary();
    this.eat(":");
    const els = this.ternary();
    return (s) => (test(s) ? then(s) : els(s));
  }

  private binary(minPrec: number): CompiledExpr {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      const prec = t.t === "p" ? PREC[t.v as string] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      const op = t.v as string;
      this.i++;
      const right = this.binary(prec + 1);
      const l = left;
      left = (s) => {
        const x = l(s);
        const y = right(s);
        switch (op) {
          case "||":
            return x || y;
          case "&&":
            return x && y;
          case "==":
            return x == y; // eslint-disable-line eqeqeq -- the builder's subset is loose here
          case "!=":
            return x != y; // eslint-disable-line eqeqeq
          case "===":
            return x === y;
          case "!==":
            return x !== y;
          case "<":
            return num(x) < num(y);
          case ">":
            return num(x) > num(y);
          case "<=":
            return num(x) <= num(y);
          case ">=":
            return num(x) >= num(y);
          case "+":
            return typeof x === "string" || typeof y === "string"
              ? text(x) + text(y)
              : num(x) + num(y);
          case "-":
            return num(x) - num(y);
          case "*":
            return num(x) * num(y);
          case "/":
            return num(x) / (num(y) || 1);
          case "%":
            return num(x) % (num(y) || 1);
          default:
            return undefined;
        }
      };
    }
  }

  private unary(): CompiledExpr {
    const t = this.peek();
    if (t.t === "p" && (t.v === "!" || t.v === "-" || t.v === "+")) {
      this.i++;
      const arg = this.unary();
      if (t.v === "!") return (s) => !arg(s);
      if (t.v === "-") return (s) => -num(arg(s));
      return (s) => +num(arg(s));
    }
    return this.postfix();
  }

  private postfix(): CompiledExpr {
    let e = this.primary();
    for (;;) {
      if (this.isP("["))
        // an index would be computed member access: refused (use at())
        throw new Error(
          "Bracket access is not available: use at(list, i) or a path",
        );
      if (this.isP(".") || this.isP("?.")) {
        const opt = this.isP("?.");
        this.i++;
        const t = this.peek();
        if (t.t !== "id") throw new Error("Expected property name");
        this.i++;
        const prop = t.v as string;
        const base = e;
        e = (s) => {
          const o = base(s);
          return opt && (o === null || o === undefined)
            ? undefined
            : (o as Record<string, unknown> | null)?.[prop];
        };
      } else if (this.isP("(")) {
        this.i++;
        const args: CompiledExpr[] = [];
        while (!this.isP(")")) {
          args.push(this.ternary());
          if (!this.isP(")")) this.eat(",");
        }
        this.eat(")");
        const callee = e;
        e = (s) => {
          const fn = callee(s);
          if (typeof fn !== "function")
            throw new Error("This name is not a function here");
          return fn(...args.map((a) => a(s)));
        };
      } else return e;
    }
  }

  private primary(): CompiledExpr {
    const t = this.peek();
    if (t.t === "num" || t.t === "str") {
      this.i++;
      const v = t.v;
      return () => v;
    }
    if (this.isP("[")) {
      // an array literal: [a, b] (an index, a[b], is refused in postfix)
      this.i++;
      const items: CompiledExpr[] = [];
      while (!this.isP("]")) {
        items.push(this.ternary());
        if (!this.isP("]")) this.eat(",");
      }
      this.eat("]");
      return (s) => items.map((x) => x(s));
    }
    if (t.t === "id") {
      this.i++;
      const name = t.v as string;
      if (name in KEYWORDS) {
        const v = KEYWORDS[name];
        return () => v;
      }
      return (s) => s[name];
    }
    if (this.isP("(")) {
      this.i++;
      const e = this.ternary();
      this.eat(")");
      return e;
    }
    throw new Error(
      t.t === "eof"
        ? "Unexpected end of expression"
        : `Unexpected "${text(t.v)}"`,
    );
  }
}

const cache = new Map<string, CompiledExpr | Error>();

/** Parses an expression to a pure function of the scope (cached). */
export function compileExpr(src: string): CompiledExpr | Error {
  const hit = cache.get(src);
  if (hit) return hit;
  let out: CompiledExpr | Error;
  try {
    out = new Parser(tokenize(src)).parse();
  } catch (e) {
    out = new Error(e instanceof Error ? e.message : String(e));
  }
  if (cache.size > 2000) cache.clear();
  cache.set(src, out);
  return out;
}
