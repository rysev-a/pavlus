import type {
  ElementNode,
  EmbedNode,
  ForNode,
  IfNode,
  Node,
  OutletNode,
} from "../../template/ast.ts";
import { elementInfo } from "./element-info.ts";
import { ExprEmitter } from "./expr.ts";
import { camel, isStr, json, record, type Ctx } from "./shared.ts";

/** Emits the body of `render`: the template's state as virtual nodes. */
export class RenderEmitter extends ExprEmitter {
  protected renderNodes(nodes: Node[], ctx: Ctx, out: string): void {
    for (const n of nodes) this.renderNode(n, ctx, out);
  }

  protected renderNode(n: Node, ctx: Ctx, out: string): void {
    switch (n.type) {
      case "text": {
        const dynamic = n.parts.some((p) => !isStr(p));
        const id = dynamic ? `id: ${this.id(n.nid, "", ctx)}, ` : "";
        this.w.line(
          `${out}.push({ t: "text", ${id}text: ${this.parts(n.parts, ctx, "next")} });`,
        );
        return;
      }
      case "element":
        return this.renderElement(n, ctx, out);
      case "if":
        return this.renderIf(n, ctx, out);
      case "for":
        return this.renderFor(n, ctx, out);
      case "embed":
        return this.renderEmbed(n, ctx, out);
      case "outlet":
        return this.renderOutlet(n, ctx, out);
    }
  }

  protected renderElement(el: ElementNode, ctx: Ctx, out: string): void {
    const info = elementInfo(el);
    const base = camel(el.tag);
    const children = this.name(`${base}Children`);
    const attrs = this.name(`${base}Attrs`);
    this.note(el);
    this.w.line(`const ${children} = [];`);
    this.renderNodes(el.children, ctx, children);
    this.w.line(`const ${attrs} = ${record(info.staticAttrs)};`);
    for (const a of info.dynAttrs) {
      this.w.call(
        `${this.h("setAttr")}(${attrs}, ${json(a.name)}, `,
        [this.attrValue(a, ctx, "next")],
        ");",
      );
    }
    if (info.classDynamic) {
      this.w.call(
        `${this.h("setAttr")}(${attrs}, "class", `,
        [this.classValue(el, info, ctx, "next")],
        ");",
      );
    }
    let events = "{}";
    if (el.events.length) {
      events = this.name(`${base}Events`);
      this.w.entries(
        `const ${events} = {`,
        el.events.map(
          (e) =>
            `${json(e.name)}: ${this.eventMsg(e, this.payload(e, ctx, "next"), ctx)}`,
        ),
        "};",
      );
    }
    this.w.entries(
      `${out}.push({`,
      [
        `t: "el"`,
        ...(info.hasId ? [`id: ${this.id(el.nid, "", ctx)}`] : []),
        `tag: ${json(el.tag)}`,
        `attrs: ${attrs}`,
        `events: ${events}`,
        `children: ${children}`,
      ],
      "});",
    );
  }

  protected renderIf(n: IfNode, ctx: Ctx, out: string): void {
    this.note(n);
    this.marker(out, this.id(n.nid, "s", ctx));
    this.w.chain(
      n.branches.map((b) => ({
        test: b.test ? this.expr(b.test, ctx, "next") : null,
        body: () => this.scoped(() => this.renderNodes(b.children, ctx, out)),
      })),
    );
    this.marker(out, this.id(n.nid, "e", ctx));
  }

  protected renderFor(n: ForNode, ctx: Ctx, out: string): void {
    const list = this.name(`${n.item}List`);
    this.note(n);
    this.marker(out, this.id(n.nid, "s", ctx));
    this.w.line(`const ${list} = (${this.expr(n.of, ctx, "next")}) || [];`);
    this.scoped(() => {
      const index = this.name(n.index ?? `${n.item}Index`);
      const item = this.name(n.item);
      const key = this.name(`${n.item}Key`);
      const suffix = this.name(`${n.item}Suffix`);
      const inner = this.bind(
        ctx,
        n,
        { prev: item, next: item },
        { prev: index, next: index },
        suffix,
      );
      this.w.block(
        `for (let ${index} = 0; ${index} < ${list}.length; ${index}++)`,
        () => {
          this.w.line(`const ${item} = ${list}[${index}];`);
          this.w.line(
            `const ${key} = String(${n.key ? this.expr(n.key, inner, "next") : index});`,
          );
          this.w.line(`const ${suffix} = ${ctx.suffix} + "#" + ${key};`);
          this.marker(out, `${json(`${n.nid}[`)} + ${suffix}`);
          this.renderNodes(n.children, inner, out);
          this.marker(out, `${json(`${n.nid}]`)} + ${suffix}`);
        },
      );
    });
    this.marker(out, this.id(n.nid, "e", ctx));
  }

  protected renderEmbed(n: EmbedNode, ctx: Ctx, out: string): void {
    const push = (view: string) =>
      this.w.call(
        `${out}.push(...${view}.render(`,
        [
          this.propsJs(n, ctx, "next"),
          this.childSuffix(n, ctx),
          this.childPrefix(n, ctx),
          this.childEnvJs(n, ctx),
        ],
        "));",
      );
    this.note(n);
    if (n.component) return push(n.component);
    const view = this.name(`${n.name}View`);
    this.marker(out, this.id(n.nid, "s", ctx));
    this.w.line(
      `const ${view} = ${this.h("asView")}(${this.expr(n.dynamic!, ctx, "next")});`,
    );
    this.w.block(`if (${view})`, () => push(view));
    this.marker(out, this.id(n.nid, "e", ctx));
  }

  protected renderOutlet(n: OutletNode, ctx: Ctx, out: string): void {
    const match = this.name("outlet");
    this.note(n);
    this.marker(out, this.id(n.nid, "s", ctx));
    this.w.line(
      `const ${match} = ${this.h("resolveOutlet")}(env, ${ctx.roots.next});`,
    );
    this.w.block(`if (${match})`, () => {
      this.w.call(
        `${out}.push(...${match}.view.render(`,
        this.outletArgs(match, n, ctx),
        "));",
      );
    });
    this.marker(out, this.id(n.nid, "e", ctx));
  }
}
