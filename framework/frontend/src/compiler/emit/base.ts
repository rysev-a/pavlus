import type { ForNode, Node, TemplateAst } from "../../template/ast.ts";
import { FIXED_NAMES, RESERVED_WORDS, RUNTIME_NAMES } from "./names.ts";
import { describe, json, lineOf, type Ctx, type Local } from "./shared.ts";
import { Writer } from "./writer.ts";

/**
 * What every emitter shares: the writer, the scoped name allocator, and the
 * set of runtime helpers the generated code ends up importing. The emitters
 * are layered (expressions, then render, then diff) over this one object, so
 * they all write into the same output and see the same names.
 */
export class EmitBase {
  protected w = new Writer();

  /** Names in use, one set per JS block that is open while generating. */
  protected scopes: Set<string>[];

  /** Runtime helpers the generated code refers to. */
  readonly helpers = new Set<string>();

  constructor(ast: TemplateAst) {
    this.scopes = [
      new Set([
        ...RESERVED_WORDS,
        ...RUNTIME_NAMES,
        ...FIXED_NAMES,
        "env",
        ...ast.imports.map((i) => i.local),
      ]),
    ];
  }

  /**
   * A readable JS variable name for `base`. It only has to differ from the
   * names visible at this point (enclosing blocks), so sibling blocks reuse
   * `liChildren`, `user`, ... instead of numbering them.
   */
  protected name(base: string): string {
    let id = base.replace(/[^\w$]/g, "_");
    if (!/^[A-Za-z_$]/.test(id)) id = `_${id}`;
    const taken = (n: string) => this.scopes.some((scope) => scope.has(n));
    let candidate = id;
    for (let n = 2; taken(candidate); n++) candidate = `${id}${n}`;
    this.scopes[this.scopes.length - 1].add(candidate);
    return candidate;
  }

  /** Runs `fn` for the body of a JS block: names it declares end with it. */
  protected scoped<T>(fn: () => T): T {
    this.scopes.push(new Set());
    try {
      return fn();
    } finally {
      this.scopes.pop();
    }
  }

  protected h(helper: string): string {
    this.helpers.add(helper);
    return helper;
  }

  /** Runs `fn` against a fresh writer and returns what it wrote. */
  protected capture(extraDepth: number, fn: () => void): string[] {
    const saved = this.w;
    this.w = new Writer(saved.depth + extraDepth);
    fn();
    const lines = this.w.lines;
    this.w = saved;
    return lines;
  }

  /**
   * The id of a node: the id scope it sits under (the embeds and keyed loops
   * it is nested in, outer first) in front of its own number. The scope grows
   * by prepending at each boundary, so an effect bubbling from a child — where
   * each `namespace` puts its own segment in front — composes the same id the
   * render built.
   */
  protected id(nid: number, kind: string, ctx: Ctx): string {
    return `${ctx.suffix} + ${json(`${nid}${kind}`)}`;
  }

  protected marker(out: string, id: string): void {
    this.w.line(`${out}.push({ t: "marker", id: ${id} });`);
  }

  protected bind(
    ctx: Ctx,
    f: ForNode,
    item: Local,
    index: Local,
    suffix: string,
  ): Ctx {
    const scope = new Map(ctx.scope);
    scope.set(f.item, item);
    if (f.index) scope.set(f.index, index);
    return { ...ctx, scope, suffix };
  }

  protected note(n: Node, extra = ""): void {
    this.w.line(`// line ${lineOf(n)}: ${describe(n)}${extra}`);
  }
}
