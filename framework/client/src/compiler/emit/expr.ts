import type {
  Attr,
  ElementNode,
  EmbedNode,
  EventBinding,
  Expr,
  OutletNode,
  Part,
} from "../../template/ast.ts";
import { EmitBase } from "./base.ts";
import type { ElementInfo } from "./element-info.ts";
import { isStr, json, type Ctx, type Side } from "./shared.ts";

/**
 * Turns template expressions into JS source, once per side (`prev` / `next`),
 * plus the arguments an embed or outlet passes to its child view.
 */
export class ExprEmitter extends EmitBase {
  protected expr(e: Expr, ctx: Ctx, side: Side): string {
    switch (e.k) {
      case "lit":
        return e.value === undefined ? "undefined" : json(e.value);
      case "id": {
        const local = ctx.scope.get(e.name);
        return local ? local[side] : `${ctx.roots[side]}.${e.name}`;
      }
      case "member":
        return `(${this.expr(e.obj, ctx, side)})?.${e.prop}`;
      case "index":
        return `(${this.expr(e.obj, ctx, side)})?.[${this.expr(e.index, ctx, side)}]`;
    }
  }

  /** A string: literal text with `{interpolations}` joined by `+`. */
  protected parts(parts: Part[], ctx: Ctx, side: Side): string {
    if (parts.every(isStr)) return json(parts.join(""));
    const items = parts.map((p) =>
      isStr(p) ? json(p) : `${this.h("toText")}(${this.expr(p, ctx, side)})`,
    );
    if (!isStr(parts[0])) items.unshift('""');
    return items.join(" + ");
  }

  /** An attribute value: a string, or `null` for "no attribute". */
  protected attrValue(a: Attr, ctx: Ctx, side: Side): string {
    if (a.value === null) return '""';
    if (a.value.every(isStr)) return json(a.value.join(""));
    if (a.value.length === 1)
      return `${this.h("toAttr")}(${this.expr(a.value[0] as Expr, ctx, side)})`;
    return this.parts(a.value, ctx, side);
  }

  protected classValue(
    el: ElementNode,
    info: ElementInfo,
    ctx: Ctx,
    side: Side,
  ): string {
    const items: string[] = [];
    if (el.classes.length) items.push(json(el.classes.join(" ")));
    for (const t of el.toggles) {
      items.push(`(${this.expr(t.test, ctx, side)} ? ${json(t.name)} : "")`);
    }
    if (info.classAttr) items.push(this.attrValue(info.classAttr, ctx, side));
    return `${this.h("joinClasses")}([${items.join(", ")}])`;
  }

  protected payload(ev: EventBinding, ctx: Ctx, side: Side): string {
    if (ev.args.length === 0) return "undefined";
    if (ev.args.length === 1) return this.expr(ev.args[0], ctx, side);
    return `[${ev.args.map((a) => this.expr(a, ctx, side)).join(", ")}]`;
  }

  protected eventMsg(ev: EventBinding, payload: string, ctx: Ctx): string {
    const flags = `${ev.prevent ? ", prevent: true" : ""}${ev.stop ? ", stop: true" : ""}`;
    return `{ id: ${ctx.prefix} + ${json(ev.msg)}, payload: ${payload}${flags} }`;
  }

  protected propsJs(n: EmbedNode, ctx: Ctx, side: Side): string {
    const items = n.props.map((p) => {
      if ("spread" in p) return `...(${this.expr(p.spread, ctx, side)})`;
      const v = p.value;
      const js =
        v === null
          ? "true"
          : v.length === 1 && !isStr(v[0])
            ? this.expr(v[0], ctx, side) // keep the value's type
            : this.parts(v, ctx, side);
      return `${json(p.name)}: ${js}`;
    });
    return items.length ? `{ ${items.join(", ")} }` : "{}";
  }

  /** Node ids of the child are made unique by extending the suffix. */
  protected childSuffix(n: EmbedNode, ctx: Ctx): string {
    return `${ctx.suffix} + ${json(`/${n.nid}`)}`;
  }

  /**
   * Events of the child are prefixed with the instance name — and, for a
   * keyed embed (`key=<expr>`), with the key: `row.<key>.`, so every instance
   * has its own message address and its boundary can slice its state.
   */
  protected childPrefix(n: EmbedNode, ctx: Ctx): string {
    const base = `${ctx.prefix} + ${json(`${n.name}.`)}`;
    return n.key
      ? `${base} + String(${this.expr(n.key, ctx, "next")}) + "."`
      : base;
  }

  /** The component behind an embed, so its own `+outlet` can resolve. */
  protected childEnvJs(n: EmbedNode, ctx: Ctx): string {
    return n.component
      ? `${this.h("childEnv")}(env, ${json(n.name)}, ${ctx.roots.next})`
      : this.expr(n.dynamic!, ctx, "next");
  }

  protected outletArgs(match: string, n: OutletNode, ctx: Ctx): string[] {
    return [
      `${match}.state`,
      `${ctx.suffix} + ${json(`/${n.nid}`)}`,
      `${ctx.prefix} + ${match}.name + "."`,
      `${match}.component`,
    ];
  }
}
