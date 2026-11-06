import type {
  ElementNode,
  EmbedNode,
  Expr,
  ForNode,
  IfNode,
  Node,
  OutletNode,
  Part,
  TemplateAst,
} from "../template/ast.ts";
import { TemplateError } from "../template/errors.ts";
import { exprIdents, listDeps } from "../compiler/analyze.ts";
import { elementInfo } from "../compiler/emit/element-info.ts";
import { RESERVED_WORDS } from "../compiler/emit/names.ts";
import {
  camel,
  describe,
  isStr,
  json,
  lineOf,
} from "../compiler/emit/shared.ts";

/** The runtime helpers generated code may import (and so reserve the names of). */
export const HELPERS = [
  "UNSET",
  "asDirectView",
  "attach",
  "childEnv",
  "drop",
  "fail",
  "joinClasses",
  "list",
  "noop",
  "off",
  "pushNodes",
  "on",
  "outlet",
  "safeUrl",
  "send",
  "setAttr",
  "setChecked",
  "setSelected",
  "setValue",
  "skel",
  "toAttr",
  "toList",
  "toText",
];

/** Names the generated code uses itself: a template import may not take them. */
const FIXED = [
  "env",
  "s",
  "f",
  "u",
  "n",
  "d",
  "ls",
  "out",
  "e",
  "v",
  "p",
  "o",
  "m",
  "mv",
  "mn",
  "val",
  "vw",
  "ev",
  "meta",
  "create",
  ...HELPERS,
];

/** Template variable to JS variable, and the loop variables a block takes. */
interface Scope {
  vars: Map<string, string>;
  params: string[];
}

/** A node of the static skeleton. */
interface SNode {
  kind: "el" | "text" | "anchor";
  tag?: string;
  attrs?: [string, string][];
  kids: SNode[];
  data?: string;
  need: boolean;
  ref: string;
  /** For an anchor: code that pushes the nodes of its region (`n(out)`). */
  region?: string;
}

type Gen = () => string[];

const URL_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "poster",
  "xlink:href",
]);
const PROP_ATTRS: Record<string, string> = {
  value: "setValue",
  checked: "setChecked",
  selected: "setSelected",
};

export interface DirectGenerated {
  /** `const meta`, skeletons, block functions and `create`; no imports/exports. */
  code: string;
  helpers: string[];
}

/** Generates the module body of a direct template. */
export function generateDirect(ast: TemplateAst): DirectGenerated {
  return new Generator(ast).run();
}

/**
 * Whether an expression calls anything (`name.toUpperCase()`, `fmt(n)`): its
 * evaluation may be expensive enough to skip when its inputs did not change.
 */
function hasCall(e: Expr): boolean {
  switch (e.k) {
    case "lit":
    case "id":
      return false;
    case "member":
      return hasCall(e.obj);
    case "index":
      return hasCall(e.obj) || hasCall(e.index);
    case "call":
      return true;
    case "unary":
      return hasCall(e.arg);
    case "binary":
      return hasCall(e.left) || hasCall(e.right);
    case "cond":
      return hasCall(e.test) || hasCall(e.then) || hasCall(e.else);
    case "array":
      return e.items.some(hasCall);
  }
}

/** One row of `meta.deps`: what a binding reads, for tools and audits. */
export interface BindingDeps {
  /** Line of the binding in the template source. */
  line: number;
  /** `text`, `<tag>.<attr>`, `<tag>.class`, `if`, `for`, `+Name#inst`. */
  of: string;
  /** Root identifiers the binding reads (state fields, loop variables). */
  reads: string[];
  /** `true` when the generated code skips the binding unless `reads` changed. */
  checked: boolean;
}

/**
 * Root identifiers of a binding, when it is worth a per-binding pre-check:
 * only bindings that call anything can be expensive to re-evaluate, and only
 * under the same purity assumption the block guard already makes (a template
 * expression is a function of the state it reads).
 */
function callDeps(parts: Part[]): { reads: string[]; checked: boolean } | null {
  const exprs = parts.filter((p): p is Expr => !isStr(p));
  if (!exprs.some(hasCall)) return null;
  const reads = new Set<string>();
  for (const e of exprs) exprIdents(e, reads);
  if (reads.size === 0) return null; // nothing to compare: leave it as it is
  return { reads: [...reads], checked: true };
}

class Generator {
  private counter = 0;
  private taken: Set<string>;
  private top: string[] = [];
  /** Rows of `meta.deps`, collected while the bindings are generated. */
  private depTable: BindingDeps[] = [];
  readonly helpers = new Set<string>();

  private ast: TemplateAst;

  constructor(ast: TemplateAst) {
    this.ast = ast;
    this.taken = new Set([...RESERVED_WORDS, ...FIXED]);
    for (const i of ast.imports) {
      if (this.taken.has(i.local)) {
        throw new TemplateError(
          `import name "${i.local}" is reserved by the compiler; rename it`,
          1,
          1,
        );
      }
      this.taken.add(i.local);
    }
  }

  private fresh(base: string): string {
    const id = base.replace(/[^\w$]/g, "_");
    for (;;) {
      const name = `${id}${++this.counter}`;
      if (!this.taken.has(name)) {
        this.taken.add(name);
        return name;
      }
    }
  }

  private h(name: string): string {
    if (!HELPERS.includes(name))
      throw new Error(`direct: unknown helper ${name}`);
    this.helpers.add(name);
    return name;
  }

  /** Records a `meta.deps` row. */
  private noteDep(
    line: number,
    of: string,
    reads: Iterable<string>,
    checked = false,
  ): void {
    const row: BindingDeps = {
      line,
      of,
      reads: [...new Set(reads)].sort(),
      checked,
    };
    if (row.reads.length) this.depTable.push(row);
  }

  /** `a.b` / `$t` — how a template identifier is spelled in the block. */
  private static read(sc: Scope, d: string): string {
    return sc.vars.get(d) ?? `s.${d}`;
  }

  run(): DirectGenerated {
    const embeds = new Set<string>();
    let outlet = false;
    const walk = (nodes: Node[]): void => {
      for (const n of nodes) {
        if (n.type === "outlet") outlet = true;
        else if (n.type === "embed") embeds.add(n.name);
        else if (n.type === "element" || n.type === "for") walk(n.children);
        else if (n.type === "if") n.branches.forEach((b) => walk(b.children));
      }
    };
    walk(this.ast.nodes);

    const root = this.block(this.ast.nodes, { vars: new Map(), params: [] });
    const lines = [
      `const meta = { embeds: ${json([...embeds])}, outlet: ${outlet}, deps: ${json(this.depTable)} };`,
      "",
      ...this.top,
      "/** The template: builds the DOM for `s` and returns the block that keeps it current. */",
      "function create(env, s) {",
      `  return ${root}(env, s);`,
      "}",
    ];
    return { code: lines.join("\n"), helpers: [...this.helpers].sort() };
  }

  /* ---------------------------------------------------------- expressions */

  private expr(e: Expr, sc: Scope): string {
    switch (e.k) {
      case "lit":
        return e.value === undefined ? "undefined" : json(e.value);
      case "id":
        return sc.vars.get(e.name) ?? `s.${e.name}`;
      case "member":
        return `(${this.expr(e.obj, sc)})?.${e.prop}`;
      case "index":
        return `(${this.expr(e.obj, sc)})?.[${this.expr(e.index, sc)}]`;
      case "call":
        return `(${this.expr(e.callee, sc)})?.(${e.args
          .map((a) => this.expr(a, sc))
          .join(", ")})`;
      case "unary":
        return `(${e.op}(${this.expr(e.arg, sc)}))`;
      case "binary":
        return `(${this.expr(e.left, sc)} ${e.op} ${this.expr(e.right, sc)})`;
      case "cond":
        return `(${this.expr(e.test, sc)} ? ${this.expr(e.then, sc)} : ${this.expr(e.else, sc)})`;
      case "array":
        return `[${e.items.map((a) => this.expr(a, sc)).join(", ")}]`;
    }
  }

  private parts(parts: Part[], sc: Scope): string {
    if (parts.every(isStr)) return json(parts.join(""));
    const items = parts.map((p) =>
      isStr(p) ? json(p) : `${this.h("toText")}(${this.expr(p, sc)})`,
    );
    if (!isStr(parts[0])) items.unshift('""');
    return items.join(" + ");
  }

  /** A string, or `null` for "no attribute". */
  private attrValue(parts: Part[], sc: Scope): string {
    if (parts.every(isStr)) return json(parts.join(""));
    if (parts.length === 1)
      return `${this.h("toAttr")}(${this.expr(parts[0] as Expr, sc)})`;
    return this.parts(parts, sc);
  }

  private payload(args: Expr[], sc: Scope): string {
    if (args.length === 0) return "undefined";
    if (args.length === 1) return this.expr(args[0], sc);
    return `[${args.map((a) => this.expr(a, sc)).join(", ")}]`;
  }

  private props(
    n: EmbedNode,
    sc: Scope,
  ): { consts: [string, string][]; obj: string } {
    const consts: [string, string][] = [];
    const items = n.props.map((p) => {
      const v = this.fresh("p");
      if ("spread" in p) {
        consts.push([v, `${this.expr(p.spread, sc)}`]);
        return `...${v}`;
      }
      const val = p.value;
      const js =
        val === null
          ? "true"
          : val.length === 1 && !isStr(val[0])
            ? this.expr(val[0], sc)
            : this.parts(val, sc);
      consts.push([v, js]);
      return `${json(p.name)}: ${v}`;
    });
    return { consts, obj: items.length ? `{ ${items.join(", ")} }` : "{}" };
  }

  /* --------------------------------------------------------------- blocks */

  /**
   * Generates the function for one block (the template, an `if` branch or a
   * loop body) and returns its name. It takes `(env, s, ...loop variables)`.
   */
  private block(nodes: Node[], sc: Scope): string {
    const name = this.fresh("block");
    const roots: SNode[] = [];
    const decls: string[] = [];
    const creates: Gen[] = [];
    const updates: Gen[] = [];
    const destroys: string[] = [];
    let hasEvents = false;

    const sn = (kind: SNode["kind"], extra: Partial<SNode> = {}): SNode => ({
      kind,
      kids: [],
      need: false,
      ref: "",
      ...extra,
    });
    const ref = (x: SNode): string => {
      x.need = true;
      return `\u0001${x.ref || (x.ref = this.fresh("r"))}\u0002`;
    };

    const region = (
      kids: SNode[],
      code: string,
    ): { anchor: SNode; a: string } => {
      const anchor = sn("anchor", { region: code });
      kids.push(anchor);
      return { anchor, a: ref(anchor) };
    };

    const visit = (n: Node, kids: SNode[]): void => {
      switch (n.type) {
        case "text": {
          if (n.parts.every(isStr)) {
            const data = n.parts.join("");
            if (data !== "") kids.push(sn("text", { data }));
            return;
          }
          const x = sn("text", { data: "" });
          kids.push(x);
          const t = this.fresh("t");
          decls.push(`let ${t} = "";`);
          const reads = new Set<string>();
          for (const p of n.parts) if (!isStr(p)) exprIdents(p, reads);
          const pre = callDeps(n.parts);
          this.noteDep(n.line, "text", reads, pre !== null);
          // Lazy: `ref(x)` names the node only at assembly time.
          let core = () => [
            `const v = ${this.parts(n.parts, sc)};`,
            `if (v !== ${t}) {`,
            `  ${t} = v;`,
            `  ${ref(x)}.data = v;`,
            `}`,
          ];
          if (pre) {
            const gs = pre.reads.map(() => this.fresh("g"));
            for (const g of gs) decls.push(`let ${g} = ${this.h("UNSET")};`);
            const cond = pre.reads
              .map((d, i) => `${Generator.read(sc, d)} === ${gs[i]}`)
              .join(" && ");
            const inner = core;
            core = () => [
              `if (!(${cond})) {`,
              ...pre.reads.map(
                (d, i) => `  ${gs[i]} = ${Generator.read(sc, d)};`,
              ),
              ...inner().map((l) => `  ${l}`),
              `}`,
            ];
          }
          const genCore = core;
          updates.push(() => [
            `// line ${n.line}: text`,
            `try {`,
            ...genCore().map((l) => `  ${l}`),
            `} catch (e) {`,
            `  ${this.h("fail")}(env, e);`,
            `}`,
          ]);
          return;
        }
        case "element":
          return element(n, kids);
        case "if":
          return conditional(n, kids);
        case "for":
          return loop(n, kids);
        case "embed":
          return embed(n, kids);
        case "outlet":
          return outletNode(n, kids);
      }
    };

    const element = (el: ElementNode, kids: SNode[]): void => {
      const info = elementInfo(el);
      const x = sn("el", { tag: el.tag, attrs: [], kids: [] });
      kids.push(x);
      x.attrs = Object.entries(info.staticAttrs);
      const late: Gen[] = [];

      for (const a of info.dynAttrs) {
        if (/^on\w/i.test(a.name) || a.name === "srcdoc") {
          throw new TemplateError(
            `the attribute "${a.name}" cannot be bound to data (it would run it as code): use an @event or a static value`,
            el.pos.line,
            el.pos.col,
          );
        }
        const v = a.value as Part[];
        const last = this.fresh("a");
        decls.push(`let ${last} = null;`);
        const setter = PROP_ATTRS[a.name];
        let value = this.attrValue(v, sc);
        if (URL_ATTRS.has(a.name.toLowerCase())) {
          value = `${this.h("safeUrl")}(${value})`;
        }
        const attrReads = new Set<string>();
        for (const p of v) if (!isStr(p)) exprIdents(p, attrReads);
        const pre = callDeps(v);
        this.noteDep(
          el.pos.line,
          `<${el.tag}> ${a.name}`,
          attrReads,
          pre !== null,
        );
        let core = () => [
          `const v = ${value};`,
          `if (v !== ${last}) {`,
          `  ${last} = v;`,
          setter
            ? `  ${this.h(setter)}(${ref(x)}, v);`
            : `  ${this.h("setAttr")}(${ref(x)}, ${json(a.name)}, v);`,
          `}`,
        ];
        if (pre) {
          const gs = pre.reads.map(() => this.fresh("g"));
          for (const g of gs) decls.push(`let ${g} = ${this.h("UNSET")};`);
          const cond = pre.reads
            .map((d, i) => `${Generator.read(sc, d)} === ${gs[i]}`)
            .join(" && ");
          const inner = core;
          core = () => [
            `if (!(${cond})) {`,
            ...pre.reads.map(
              (d, i) => `  ${gs[i]} = ${Generator.read(sc, d)};`,
            ),
            ...inner().map((l) => `  ${l}`),
            `}`,
          ];
        }
        const genCore = core;
        const gen: Gen = () => [
          `// line ${el.pos.line}: <${el.tag}> ${a.name}`,
          `try {`,
          ...genCore().map((l) => `  ${l}`),
          `} catch (e) {`,
          `  ${this.h("fail")}(env, e);`,
          `}`,
        ];
        (setter ? late : updates).push(gen);
      }

      if (info.classDynamic) {
        const dynAttr =
          info.classAttr && !info.classAttr.value?.every(isStr)
            ? info.classAttr
            : undefined;
        const base = el.classes.join(" ");
        const tail = dynAttr
          ? ""
          : ((info.classAttr?.value ?? []) as string[]).join("");
        // Toggles only: the skeleton carries the static classes and the
        // inputs start as "all off". A dynamic class attribute: no skeleton
        // class, every input starts unseen.
        if (!dynAttr) {
          const fixed = [base, tail].filter(Boolean).join(" ").trim();
          if (fixed) x.attrs.push(["class", fixed]);
        }
        const init = dynAttr ? this.h("UNSET") : "false";
        const names = el.toggles.map(() => this.fresh("c"));
        const dyn = dynAttr ? this.fresh("c") : "";
        for (const c of names) decls.push(`let ${c} = ${init};`);
        if (dynAttr) decls.push(`let ${dyn} = ${init};`);
        {
          const reads = new Set<string>();
          for (const t of el.toggles) exprIdents(t.test, reads);
          if (dynAttr)
            for (const p of dynAttr.value ?? [])
              if (!isStr(p)) exprIdents(p, reads);
          this.noteDep(el.pos.line, `<${el.tag}> class`, reads);
        }
        const inputs = dynAttr ? [...names, dyn] : names;
        const items = [
          ...(base ? [json(base)] : []),
          ...el.toggles.map((t, i) => `${names[i]}$ ? ${json(t.name)} : ""`),
          ...(dynAttr ? [`${dyn}$`] : tail ? [json(tail)] : []),
        ];
        updates.push(() => {
          const consts = el.toggles.map(
            (t, i) => `${names[i]}$ = !!(${this.expr(t.test, sc)})`,
          );
          if (dynAttr)
            consts.push(
              `${dyn}$ = ${this.attrValue(dynAttr.value as Part[], sc)}`,
            );
          return [
            `// line ${el.pos.line}: <${el.tag}> class`,
            `try {`,
            `  const ${consts.join(", ")};`,
            `  if (${inputs.map((c) => `${c}$ !== ${c}`).join(" || ")}) {`,
            `    ${inputs.map((c) => `${c} = ${c}$;`).join(" ")}`,
            `    ${this.h("setAttr")}(${ref(x)}, "class", ${this.h("joinClasses")}([${items.join(", ")}]));`,
            `  }`,
            `} catch (e) {`,
            `  ${this.h("fail")}(env, e);`,
            `}`,
          ];
        });
      }

      if (el.events.length) {
        hasEvents = true;
        for (const ev of el.events) {
          creates.push(() => [
            `${this.h("on")}(env.rt, ls, ${ref(x)}, ${json(ev.name)}, (ev) => {`,
            ...(ev.prevent ? ["  ev.preventDefault();"] : []),
            ...(ev.stop ? ["  ev.stopPropagation();"] : []),
            `  let p;`,
            `  try {`,
            `    p = ${this.payload(ev.args, sc)};`,
            `  } catch (e) {`,
            `    ${this.h("fail")}(env, e);`,
            `    return;`,
            `  }`,
            `  ${this.h("send")}(env, ${json(ev.msg)}, p, ev);`,
            `});`,
          ]);
        }
      }

      for (const c of el.children) visit(c, x.kids);
      updates.push(...late);
    };

    const conditional = (n: IfNode, kids: SNode[]): void => {
      const b = this.fresh("ib");
      const k = this.fresh("ik");
      decls.push(`let ${b} = null, ${k} = -1;`);
      const { anchor, a } = region(
        kids,
        `if (${b}) ${this.h("pushNodes")}(${b}, out);`,
      );
      destroys.push(`if (${b}) ${b}.d();`);
      const fns = n.branches.map((br) => this.block(br.children, sc));
      {
        const reads = new Set<string>();
        for (const br of n.branches) if (br.test) exprIdents(br.test, reads);
        this.noteDep(n.line, "if", reads);
      }
      const args = ["env", "s", ...sc.params].join(", ");
      const hasElse = n.branches[n.branches.length - 1].test === null;
      let select = hasElse ? String(n.branches.length - 1) : "-1";
      for (let i = n.branches.length - 1; i >= 0; i--) {
        const t = n.branches[i].test;
        if (t) select = `${this.expr(t, sc)} ? ${i} : ${select}`;
      }
      updates.push(() => [
        `// line ${n.line}: if`,
        `try {`,
        `  const v = ${select};`,
        `  if (v !== ${k}) {`,
        `    if (${b}) {`,
        `      ${this.h("drop")}(${b});`,
        `      ${b} = null;`,
        `    }`,
        `    ${k} = v;`,
        ...fns.map(
          (fn, i) =>
            `    ${i ? "else " : ""}if (v === ${i}) ${b} = ${fn}(${args});`,
        ),
        `    if (${b}) ${this.h("attach")}(${b}, ${ref(anchor)}.parentNode, ${ref(anchor)});`,
        `  } else if (${b}) ${b}.u(${["s", ...sc.params].join(", ")});`,
        `} catch (e) {`,
        `  ${this.h("fail")}(env, e);`,
        `}`,
      ]);
    };

    const loop = (n: ForNode, kids: SNode[]): void => {
      const l = this.fresh("l");
      const { anchor } = region(kids, `${l}.n(out);`);
      creates.push(() => [
        `const ${l} = ${this.h("list")}(env.rt, ${ref(anchor)});`,
      ]);
      destroys.push(`${l}.d();`);
      const item = this.fresh(`$${camel(n.item) || "item"}`);
      const idx = this.fresh(`$${n.index ? camel(n.index) : "index"}`);
      const vars = new Map(sc.vars).set(n.item, item);
      if (n.index) vars.set(n.index, idx);
      const inner: Scope = { vars, params: [...sc.params, item, idx] };
      const fn = this.block(n.children, inner);
      {
        const reads = new Set<string>();
        exprIdents(n.of, reads);
        this.noteDep(n.line, `for ${n.item}`, reads);
      }
      const b = this.fresh("b");
      updates.push(() => [
        `// line ${n.line}: for ${n.item}${n.index ? `, ${n.index}` : ""}`,
        `try {`,
        `  ${l}.r(`,
        `    ${this.h("toList")}(${this.expr(n.of, sc)}),`,
        `    ${n.key ? `(${item}, ${idx}) => ${this.expr(n.key, inner)}` : "null"},`,
        `    (${item}, ${idx}) => ${fn}(${["env", "s", ...inner.params].join(", ")}),`,
        `    (${b}, ${item}, ${idx}) => ${b}.u(${["s", ...inner.params].join(", ")}),`,
        `  );`,
        `} catch (e) {`,
        `  ${this.h("fail")}(env, e);`,
        `}`,
      ]);
    };

    const embed = (n: EmbedNode, kids: SNode[]): void => {
      const cb = this.fresh("cb");
      const ce = this.fresh("ce");
      const { anchor } = region(
        kids,
        `if (${cb}) ${this.h("pushNodes")}(${cb}, out);`,
      );
      destroys.push(`if (${cb}) ${cb}.d();`);
      const { consts, obj } = this.props(n, sc);
      {
        const reads = new Set<string>();
        if (n.dynamic) exprIdents(n.dynamic, reads);
        for (const p of n.props) {
          if ("spread" in p) exprIdents(p.spread, reads);
          else
            for (const v of p.value ?? []) if (!isStr(v)) exprIdents(v, reads);
        }
        this.noteDep(
          n.pos.line,
          `+${n.component ?? "{expr}"}#${n.name}`,
          reads,
        );
      }
      const last = consts.map(() => this.fresh("q"));
      const same = last.length
        ? consts.map(([v], i) => `${v} === ${last[i]}`).join(" && ")
        : "true";
      const remember = consts.map(([v], i) => `${last[i]} = ${v};`).join(" ");
      const decl = (extra = ""): string[] => [
        `const ${ce} = { rt: env.rt, ns: env.ns + ${json(`${n.name}.`)}, o: undefined };`,
        `let ${cb} = null${extra};`,
        ...last.map((q) => `let ${q} = ${this.h("UNSET")};`),
      ];
      const constLine = `const ${consts.map(([v, js]) => `${v} = ${js}`).join(", ")};`;

      if (n.component) {
        decls.push(...decl());
        updates.push(() => [
          `// line ${n.pos.line}: +${n.component}#${n.name}`,
          `try {`,
          `  const o = ${this.h("childEnv")}(env.o, ${json(n.name)}, s);`,
          ...(consts.length ? [`  ${constLine}`] : []),
          `  if (!${cb}) {`,
          `    ${ce}.o = o;`,
          `    ${cb} = ${n.component}.create(${ce}, ${obj});`,
          `    ${this.h("attach")}(${cb}, ${ref(anchor)}.parentNode, ${ref(anchor)});`,
          ...(remember ? [`    ${remember}`] : []),
          `  } else if (o !== ${ce}.o || !(${same})) {`,
          `    ${ce}.o = o;`,
          ...(remember ? [`    ${remember}`] : []),
          `    ${cb}.u(${obj});`,
          `  }`,
          `} catch (e) {`,
          `  ${this.h("fail")}(env, e);`,
          `}`,
        ]);
        return;
      }

      const cv = this.fresh("cv");
      decls.push(...decl(`, ${cv} = null`));
      updates.push(() => [
        `// line ${n.pos.line}: +{...}#${n.name}`,
        `try {`,
        `  const val = ${this.expr(n.dynamic!, sc)};`,
        `  const vw = ${this.h("asDirectView")}(val);`,
        ...(consts.length ? [`  ${constLine}`] : []),
        `  if (vw !== ${cv}) {`,
        `    if (${cb}) {`,
        `      ${this.h("drop")}(${cb});`,
        `      ${cb} = null;`,
        `    }`,
        `    ${cv} = vw;`,
        `    ${ce}.o = val;`,
        `    if (vw) {`,
        `      ${cb} = vw.create(${ce}, ${obj});`,
        `      ${this.h("attach")}(${cb}, ${ref(anchor)}.parentNode, ${ref(anchor)});`,
        ...(remember ? [`      ${remember}`] : []),
        `    }`,
        `  } else if (${cb}) {`,
        `    ${ce}.o = val;`,
        `    if (!(${same})) {`,
        ...(remember ? [`      ${remember}`] : []),
        `      ${cb}.u(${obj});`,
        `    }`,
        `  }`,
        `} catch (e) {`,
        `  ${this.h("fail")}(env, e);`,
        `}`,
      ]);
    };

    const outletNode = (n: OutletNode, kids: SNode[]): void => {
      const cb = this.fresh("ob");
      const ov = this.fresh("ov");
      const on = this.fresh("on");
      const ce = this.fresh("oe");
      const { anchor } = region(
        kids,
        `if (${cb}) ${this.h("pushNodes")}(${cb}, out);`,
      );
      destroys.push(`if (${cb}) ${cb}.d();`);
      decls.push(
        `const ${ce} = { rt: env.rt, ns: "", o: undefined };`,
        `let ${cb} = null, ${ov} = null, ${on} = null;`,
      );
      updates.push(() => [
        `// line ${n.line}: +outlet`,
        `try {`,
        `  const m = ${this.h("outlet")}(env, s);`,
        `  const mv = m ? m.view : null;`,
        `  const mn = m ? m.name : null;`,
        `  if (mv !== ${ov} || mn !== ${on}) {`,
        `    if (${cb}) {`,
        `      ${this.h("drop")}(${cb});`,
        `      ${cb} = null;`,
        `    }`,
        `    ${ov} = mv;`,
        `    ${on} = mn;`,
        `    if (m) {`,
        `      ${ce}.ns = env.ns + m.name + ".";`,
        `      ${ce}.o = m.component;`,
        `      ${cb} = m.view.create(${ce}, m.state);`,
        `      ${this.h("attach")}(${cb}, ${ref(anchor)}.parentNode, ${ref(anchor)});`,
        `    }`,
        `  } else if (${cb}) {`,
        `    ${ce}.o = m.component;`,
        `    ${cb}.u(m.state);`,
        `  }`,
        `} catch (e) {`,
        `  ${this.h("fail")}(env, e);`,
        `}`,
      ]);
    };

    for (const n of nodes) visit(n, roots);

    /* ---- evaluate the deferred code (it decides which nodes need refs) */
    const single = roots.length === 1 && roots[0].kind !== "anchor";
    // The single root is `f` itself (the clone); its descendants get refs.
    if (single) roots[0].ref = "f";
    const upd = updates.flatMap((g) => g());
    const cre = creates.flatMap((g) => g());

    /* ---- skeleton and refs */
    const mark = (x: SNode): boolean => {
      let any = x.need;
      for (const k of x.kids) any = mark(k) || any;
      x.need = any;
      return any;
    };
    // Several roots: every one is reported by `n(out)`.
    if (!single) for (const r of roots) r.need = true;
    roots.forEach(mark);

    const refLines: string[] = [];
    const walkRefs = (kids: SNode[], parent: string): void => {
      let prev: { ref: string; idx: number } | null = null;
      kids.forEach((k, idx) => {
        if (k.need) {
          if (!k.ref) k.ref = this.fresh("r");
          if (k.ref !== "f") {
            const hops = ".nextSibling".repeat(prev ? idx - prev.idx : idx);
            refLines.push(
              `const ${k.ref} = ${prev ? prev.ref : `${parent}.firstChild`}${hops};`,
            );
          }
          prev = { ref: k.ref, idx };
          if (k.kids.some((c) => c.need)) walkRefs(k.kids, k.ref);
        }
      });
    };
    if (single) {
      if (roots[0].kids.some((c) => c.need)) walkRefs(roots[0].kids, "f");
    } else walkRefs(roots, "f");

    const spec = (x: SNode): string => {
      if (x.kind === "text") return json(x.data ?? "");
      if (x.kind === "anchor") return "0";
      const attrs = (x.attrs ?? []).flatMap(([k, v]) => [json(k), json(v)]);
      return `[${[json(x.tag), `[${attrs.join(", ")}]`, ...x.kids.map(spec)].join(", ")}]`;
    };
    const skName = this.fresh("sk");
    this.top.push(
      `const ${skName} = ${this.h("skel")}([${roots.map(spec).join(", ")}], ${single});`,
      "",
    );

    /* ---- assemble the function */
    const resolve = (lines: string[]): string[] =>
      lines.map((l) =>
        l.replace(/\u0001([^\u0002]*)\u0002/g, (_m, r: string) => r),
      );
    const params = ["env", "s", ...sc.params];
    const uParams = ["s", ...sc.params].map((p) => `${p}$`);
    const deps = [...listDeps(nodes)];
    const acc = (d: string): string => sc.vars.get(d) ?? `s.${d}`;
    const body: string[] = [];
    const guard: string[] = [];
    if (updates.length) {
      if (deps.includes("")) {
        // an outlet below: what it shows depends on more than the template names
      } else if (deps.length === 0) {
        const ran = this.fresh("ran");
        decls.push(`let ${ran} = false;`);
        guard.push(`if (${ran}) return;`, `${ran} = true;`);
      } else {
        const gs = deps.map(() => this.fresh("g"));
        gs.forEach((g) => decls.push(`let ${g} = ${this.h("UNSET")};`));
        guard.push(
          `if (${deps.map((d, i) => `${acc(d)} === ${gs[i]}`).join(" && ")}) return;`,
          ...deps.map((d, i) => `${gs[i]} = ${acc(d)};`),
        );
      }
    }
    body.push(`const f = ${skName}(env.rt.doc).cloneNode(true);`);
    body.push(...refLines);
    body.push(...decls);
    if (hasEvents) body.push("const ls = [];");
    body.push(...cre);
    const uFn =
      updates.length || hasEvents
        ? [
            `function u(${uParams.join(", ")}) {`,
            ...["s", ...sc.params].map((p) => `  ${p} = ${p}$;`),
            ...guard.map((l) => `  ${l}`),
            ...upd.map((l) => `  ${l}`),
            "}",
          ]
        : [`const u = ${this.h("noop")};`];
    body.push(...uFn);

    const dStmts = [
      ...(hasEvents ? [`${this.h("off")}(env.rt, ls);`] : []),
      ...destroys,
    ];
    if (dStmts.length)
      body.push(`function d() {`, ...dStmts.map((l) => `  ${l}`), "}");
    else body.push(`const d = ${this.h("noop")};`);

    if (single) {
      if (updates.length) body.push(`u(${["s", ...sc.params].join(", ")});`);
      body.push(`return { e: f, f, u, d };`);
    } else {
      body.push(
        "function n(out) {",
        ...roots.flatMap((r) => [
          ...(r.region ? [`  ${r.region}`] : []),
          `  out.push(${r.ref});`,
        ]),
        "}",
      );
      if (updates.length) body.push(`u(${["s", ...sc.params].join(", ")});`);
      body.push(`return { e: null, f, u, n, d };`);
    }

    const first = nodes.length ? lineOf(nodes[0]) : 0;
    const what = nodes.length ? describe(nodes[0]) : "empty";
    this.top.push(
      `/** line ${first}: ${what}${nodes.length > 1 ? ", ..." : ""} */`,
      `function ${name}(${params.join(", ")}) {`,
      ...resolve(body).map((l) => `  ${l}`),
      "}",
      "",
    );
    return name;
  }
}
