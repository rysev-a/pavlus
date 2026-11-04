import type {
  ElementNode,
  EmbedNode,
  ForNode,
  IfNode,
  Node,
  OutletNode,
} from "../../template/ast.ts";
import { nodeDeps } from "../analyze.ts";
import { elementInfo } from "./element-info.ts";
import { RenderEmitter } from "./render.ts";
import { cap, camel, json, type Ctx, type Side } from "./shared.ts";

/**
 * Emits the body of `diff`: the patches between two states. A new child or
 * branch is rendered with the layer below (`RenderEmitter`).
 */
export class DiffEmitter extends RenderEmitter {
  protected diffEmbed(n: EmbedNode, ctx: Ctx): void {
    const suffix = this.childSuffix(n, ctx);
    const prefix = this.childPrefix(n, ctx);
    const propsPrev = this.propsJs(n, ctx, "prev");
    const propsNext = this.propsJs(n, ctx, "next");
    const env = this.childEnvJs(n, ctx);
    if (n.component) {
      this.w.call(
        `patches.push(...${n.component}.diff(`,
        [propsPrev, propsNext, suffix, prefix, env],
        "));",
      );
      return;
    }
    const prevView = this.name(`prev${cap(n.name)}View`);
    const nextView = this.name(`next${cap(n.name)}View`);
    const S = this.id(n.nid, "s", ctx);
    const E = this.id(n.nid, "e", ctx);
    this.w.line(
      `const ${prevView} = ${this.h("asView")}(${this.expr(n.dynamic!, ctx, "prev")});`,
    );
    this.w.line(
      `const ${nextView} = ${this.h("asView")}(${this.expr(n.dynamic!, ctx, "next")});`,
    );
    this.w.line(`if (${prevView} !== ${nextView}) {`);
    this.w.indent(() => {
      this.w.line(
        "// another view means another template: replace, never diff across",
      );
      this.w.line(
        `if (${prevView}) patches.push({ op: "clear", from: ${S}, to: ${E} });`,
      );
      this.w.block(`if (${nextView})`, () => {
        this.w.call(
          `patches.push({ op: "insert", before: ${E}, nodes: ${nextView}.render(`,
          [propsNext, suffix, prefix, env],
          ") });",
        );
      });
    });
    this.w.line(`} else if (${nextView}) {`);
    this.w.indent(() => {
      this.w.call(
        `patches.push(...${nextView}.diff(`,
        [propsPrev, propsNext, suffix, prefix, env],
        "));",
      );
    });
    this.w.line("}");
  }

  protected diffOutlet(n: OutletNode, ctx: Ctx): void {
    const prevMatch = this.name("prevOutlet");
    const nextMatch = this.name("nextOutlet");
    const S = this.id(n.nid, "s", ctx);
    const E = this.id(n.nid, "e", ctx);
    const resolve = this.h("resolveOutlet");
    this.w.line(`const ${prevMatch} = ${resolve}(env, ${ctx.roots.prev});`);
    this.w.line(`const ${nextMatch} = ${resolve}(env, ${ctx.roots.next});`);
    this.w.line(
      `if (${prevMatch}?.view !== ${nextMatch}?.view || ${prevMatch}?.name !== ${nextMatch}?.name) {`,
    );
    this.w.indent(() => {
      this.w.line("// another page: replace what is between the markers");
      this.w.line(
        `if (${prevMatch}) patches.push({ op: "clear", from: ${S}, to: ${E} });`,
      );
      this.w.block(`if (${nextMatch})`, () => {
        this.w.call(
          `patches.push({ op: "insert", before: ${E}, nodes: ${nextMatch}.view.render(`,
          this.outletArgs(nextMatch, n, ctx),
          ") });",
        );
      });
    });
    this.w.line(`} else if (${nextMatch}) {`);
    this.w.indent(() => {
      this.w.call(
        `patches.push(...${nextMatch}.view.diff(`,
        [`${prevMatch}.state`, ...this.outletArgs(nextMatch, n, ctx)],
        "));",
      );
    });
    this.w.line("}");
  }

  protected diffNodes(
    nodes: Node[],
    ctx: Ctx,
    parentDeps: Set<string> | null,
  ): void {
    for (const n of nodes) this.diffNode(n, ctx, parentDeps);
  }

  /** True when any dependency differs between the two sides. */
  protected changed(deps: Set<string>, ctx: Ctx): string {
    if (deps.has("")) return "true";
    return [...deps]
      .map((d) => {
        const local = ctx.scope.get(d);
        return local
          ? `${local.prev} !== ${local.next}`
          : `${ctx.roots.prev}.${d} !== ${ctx.roots.next}.${d}`;
      })
      .join(" || ");
  }

  protected diffNode(n: Node, ctx: Ctx, parentDeps: Set<string> | null): void {
    const deps = nodeDeps(n);
    if (deps.size === 0) return; // static: nothing can change
    // "" (from an outlet below) means: may change whenever anything does.
    const always = deps.has("");
    // Same dependencies as the parent: the parent's check already covers it.
    const redundant =
      parentDeps !== null &&
      (always
        ? parentDeps.has("")
        : parentDeps.size === deps.size &&
          [...deps].every((d) => parentDeps.has(d)));
    const write = () =>
      this.capture(redundant ? 0 : 1, () => {
        switch (n.type) {
          case "text":
            return this.diffText(n, ctx);
          case "element":
            return this.diffElement(n, ctx, deps);
          case "if":
            return this.diffIf(n, ctx, deps);
          case "for":
            return this.diffFor(n, ctx);
          case "embed":
            return this.diffEmbed(n, ctx);
          case "outlet":
            return this.diffOutlet(n, ctx);
        }
      });
    const body = redundant ? write() : this.scoped(write);
    if (!body.length) return;
    if (redundant) {
      this.note(n);
      this.w.raw(body);
      return;
    }
    this.note(
      n,
      ` (reads: ${always ? "the route and the routed child" : [...deps].join(", ")})`,
    );
    this.w.line(`if (${this.changed(deps, ctx)}) {`);
    this.w.raw(body);
    this.w.line("}");
  }

  protected diffText(n: Extract<Node, { type: "text" }>, ctx: Ctx): void {
    const prevText = this.name("prevText");
    const nextText = this.name("nextText");
    this.w.line(`const ${prevText} = ${this.parts(n.parts, ctx, "prev")};`);
    this.w.line(`const ${nextText} = ${this.parts(n.parts, ctx, "next")};`);
    this.w.line(
      `if (${prevText} !== ${nextText}) patches.push({ op: "text", id: ${this.id(n.nid, "", ctx)}, text: ${nextText} });`,
    );
  }

  protected diffElement(el: ElementNode, ctx: Ctx, deps: Set<string>): void {
    const info = elementInfo(el);
    const id = this.id(el.nid, "", ctx);

    const attribute = (
      name: string,
      prevValue: string,
      nextValue: string,
    ): void => {
      const prevName = this.name(`prev${cap(camel(name))}`);
      const nextName = this.name(`next${cap(camel(name))}`);
      this.w.line(`const ${prevName} = ${prevValue};`);
      this.w.line(`const ${nextName} = ${nextValue};`);
      this.w.block(`if (${prevName} !== ${nextName})`, () => {
        this.w.line(`patches.push(${nextName} === null`);
        this.w.indent(() => {
          this.w.line(`? { op: "rmAttr", id: ${id}, name: ${json(name)} }`);
          this.w.line(
            `: { op: "attr", id: ${id}, name: ${json(name)}, value: ${nextName} });`,
          );
        });
      });
    };
    for (const a of info.dynAttrs) {
      attribute(
        a.name,
        this.attrValue(a, ctx, "prev"),
        this.attrValue(a, ctx, "next"),
      );
    }
    if (info.classDynamic) {
      attribute(
        "class",
        this.classValue(el, info, ctx, "prev"),
        this.classValue(el, info, ctx, "next"),
      );
    }

    for (const ev of info.dynEvents) {
      const prevName = this.name(`prev${cap(camel(ev.name))}Payload`);
      const nextName = this.name(`next${cap(camel(ev.name))}Payload`);
      this.w.line(`const ${prevName} = ${this.payload(ev, ctx, "prev")};`);
      this.w.line(`const ${nextName} = ${this.payload(ev, ctx, "next")};`);
      const same =
        ev.args.length === 1
          ? `${prevName} === ${nextName}`
          : `${this.h("sameValues")}(${prevName}, ${nextName})`;
      this.w.block(`if (!(${same}))`, () => {
        this.w.line(
          `patches.push({ op: "handler", id: ${id}, event: ${json(ev.name)}, msg: ${this.eventMsg(ev, nextName, ctx)} });`,
        );
      });
    }

    this.diffNodes(el.children, ctx, deps);
  }

  protected diffIf(n: IfNode, ctx: Ctx, deps: Set<string>): void {
    const prevBranch = this.name("prevBranch");
    const nextBranch = this.name("nextBranch");
    const hasElse = n.branches[n.branches.length - 1].test === null;
    // Which branch shows, as an index; -1 when none does.
    const select = (side: Side): string => {
      let s = hasElse ? String(n.branches.length - 1) : "-1";
      for (let i = n.branches.length - 1; i >= 0; i--) {
        const t = n.branches[i].test;
        if (t) s = `${this.expr(t, ctx, side)} ? ${i} : ${s}`;
      }
      return s;
    };
    const S = this.id(n.nid, "s", ctx);
    const E = this.id(n.nid, "e", ctx);
    // Diffs inside each branch, written at the depth of `else { if { ... } }`.
    const inside = n.branches.map((b) =>
      this.scoped(() =>
        this.capture(2, () => this.diffNodes(b.children, ctx, deps)),
      ),
    );

    this.w.line(`const ${prevBranch} = ${select("prev")};`);
    this.w.line(`const ${nextBranch} = ${select("next")};`);
    this.w.line(`if (${prevBranch} !== ${nextBranch}) {`);
    this.w.indent(() => {
      this.w.line("// another branch: replace what is between the markers");
      this.w.line(
        `if (${prevBranch} !== -1) patches.push({ op: "clear", from: ${S}, to: ${E} });`,
      );
      this.w.block(`if (${nextBranch} !== -1)`, () =>
        this.scoped(() => {
          const branchNodes = this.name("branchNodes");
          this.w.line(`const ${branchNodes} = [];`);
          this.w.chain(
            n.branches.map((b, i) => ({
              test: `${nextBranch} === ${i}`,
              body: () =>
                this.scoped(() =>
                  this.renderNodes(b.children, ctx, branchNodes),
                ),
            })),
          );
          this.w.line(
            `patches.push({ op: "insert", before: ${E}, nodes: ${branchNodes} });`,
          );
        }),
      );
    });
    if (inside.some((lines) => lines.length)) {
      this.w.line("} else {");
      this.w.indent(() => {
        this.w.line("// the same branch: diff inside it");
        inside.forEach((lines, i) => {
          if (!lines.length) return;
          this.w.line(`if (${nextBranch} === ${i}) {`);
          this.w.raw(lines);
          this.w.line("}");
        });
      });
    }
    this.w.line("}");
  }

  protected diffFor(n: ForNode, ctx: Ctx): void {
    const Item = cap(n.item);
    const prevList = this.name(`prev${Item}List`);
    const nextList = this.name(`next${Item}List`);
    const prevKeys = this.name(`prev${Item}Keys`);
    const nextKeys = this.name(`next${Item}Keys`);
    const startId = this.name(`${n.item}StartId`);
    const endId = this.name(`${n.item}EndId`);

    // `(item, index) => String(key)` for one side.
    const keyFn = (side: Side): string =>
      this.scoped(() => {
        const item = this.name(n.item);
        const index = this.name(n.index ?? `${n.item}Index`);
        const inner = this.bind(
          ctx,
          n,
          { prev: item, next: item },
          { prev: index, next: index },
          ctx.suffix,
        );
        const key = n.key ? this.expr(n.key, inner, side) : index;
        return `(${item}, ${index}) => String(${key})`;
      });
    const prevKeyFn = keyFn("prev");
    const nextKeyFn = keyFn("next");

    // insert: render a brand-new item from the next side
    const insertBody = this.scoped(() =>
      this.capture(2, () => {
        const item = this.name(n.item);
        const key = this.name(`${n.item}Key`);
        const suffix = this.name(`${n.item}Suffix`);
        const itemNodes = this.name(`${n.item}Nodes`);
        const insertCtx = this.bind(
          ctx,
          n,
          { prev: item, next: item },
          { prev: "index", next: "index" },
          suffix,
        );
        this.w.line(`const ${item} = ${nextList}[index];`);
        this.w.line(`const ${key} = ${nextKeys}[index];`);
        this.w.line(`const ${suffix} = ${ctx.suffix} + "#" + ${key};`);
        this.w.line(`const ${itemNodes} = [];`);
        this.marker(itemNodes, `${startId}(${key})`);
        this.renderNodes(n.children, insertCtx, itemNodes);
        this.marker(itemNodes, `${endId}(${key})`);
        this.w.line(
          `patches.push({ op: "insert", before: beforeId, nodes: ${itemNodes} });`,
        );
      }),
    );

    // common: diff an item present on both sides
    const commonBody = this.scoped(() =>
      this.capture(2, () => {
        const prevItem = this.name(`prev${Item}`);
        const nextItem = this.name(`next${Item}`);
        const suffix = this.name(`${n.item}Suffix`);
        const scope = new Map(ctx.scope);
        scope.set(n.item, { prev: prevItem, next: nextItem });
        if (n.index)
          scope.set(n.index, { prev: "prevIndex", next: "nextIndex" });
        const children = this.capture(0, () =>
          this.diffNodes(n.children, { ...ctx, scope, suffix }, null),
        );
        if (!children.length) return;
        this.w.line(`const ${prevItem} = ${prevList}[prevIndex];`);
        this.w.line(`const ${nextItem} = ${nextList}[nextIndex];`);
        this.w.line(
          `const ${suffix} = ${ctx.suffix} + "#" + ${nextKeys}[nextIndex];`,
        );
        this.w.raw(children);
      }),
    );

    this.w.line(`const ${prevList} = (${this.expr(n.of, ctx, "prev")}) || [];`);
    this.w.line(`const ${nextList} = (${this.expr(n.of, ctx, "next")}) || [];`);
    this.w.line(`const ${prevKeys} = ${prevList}.map(${prevKeyFn});`);
    this.w.line(`const ${nextKeys} = ${nextList}.map(${nextKeyFn});`);
    this.w.line(
      `const ${startId} = (key) => ${ctx.suffix} + "#" + key + ${json(`${n.nid}[`)};`,
    );
    this.w.line(
      `const ${endId} = (key) => ${ctx.suffix} + "#" + key + ${json(`${n.nid}]`)};`,
    );
    this.w.line(
      `${this.h("diffKeyedList")}(${prevKeys}, ${nextKeys}, ${startId}, ${this.id(n.nid, "e", ctx)}, {`,
    );
    this.w.indent(() => {
      this.w.line(
        `remove(key) { patches.push({ op: "remove", from: ${startId}(key), to: ${endId}(key) }); },`,
      );
      this.w.line("insert(index, beforeId) {");
      this.w.raw(insertBody);
      this.w.line("},");
      this.w.line(
        `move(key, beforeId) { patches.push({ op: "move", from: ${startId}(key), to: ${endId}(key), before: beforeId }); },`,
      );
      if (commonBody.length) {
        this.w.line("common(prevIndex, nextIndex) {");
        this.w.raw(commonBody);
        this.w.line("},");
      } else {
        this.w.line("common() {},");
      }
    });
    this.w.line("});");
  }
}
