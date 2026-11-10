import type { Message, Plugin, PluginContext } from "../../core/types.ts";
import {
  cleanTree,
  serializeSvg,
  SVG_NS,
  SvgTreeError,
  XLINK_NS,
  XML_NS,
  type CleanNode,
  type SvgHandler,
  type SvgNode,
} from "./tree.ts";

export type SvgTarget = string | Element;

export type SvgEffect =
  /**
   * Renders `tree` (root tag must be `svg`) into `target`, replacing its content.
   * If `target` is itself an `<svg>` element, the tree is rendered into it.
   * Mounting again on the same target replaces the previous tree.
   */
  | {
      plugin: "svg";
      type: "mount";
      target: SvgTarget;
      tree: SvgNode;
      onMounted?: string;
      onError?: string;
    }
  /** Diffs `tree` against the last tree of `target` and patches the DOM minimally. */
  | {
      plugin: "svg";
      type: "update";
      target: SvgTarget;
      tree: SvgNode;
      onError?: string;
    }
  | { plugin: "svg"; type: "unmount"; target: SvgTarget }
  /** Replies `{ x, y, width, height }` (getBBox) of the root or of `selector` inside it. */
  | {
      plugin: "svg";
      type: "measure";
      target: SvgTarget;
      selector?: string;
      onSuccess: string;
      onError?: string;
    }
  /** Replies the serialized markup. Pure: needs no DOM. */
  | {
      plugin: "svg";
      type: "toString";
      tree: SvgNode;
      onSuccess: string;
      onError?: string;
    };

export interface SvgErrorPayload {
  code: "unsupported" | "notFound" | "invalid" | "failed";
  message: string;
}

export interface SvgPluginOptions {
  document?: Pick<
    Document,
    "querySelector" | "createElementNS" | "createTextNode"
  >;
}

export interface SvgPlugin extends Plugin<SvgEffect, any> {
  /** Number of mounted trees. */
  mounted(): number;
  /** Number of DOM listeners currently attached by this plugin. */
  listeners(): number;
}

interface Listener {
  fn: (ev: Event) => void;
  handler: SvgHandler;
}

/** A rendered node: the clean data it was built from, and the DOM it owns. */
interface RNode {
  clean: CleanNode;
  el: Element;
  textNode: Text | null;
  children: RNode[];
  listeners: Map<string, Listener>;
}

interface Instance {
  container: Element;
  root: RNode;
  /** True when the plugin created the `<svg>` (and removes it on unmount). */
  created: boolean;
}

const isElement = (v: unknown): v is Element =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Element).appendChild === "function";

export function createSvgPlugin(opts: SvgPluginOptions = {}): SvgPlugin {
  const doc: SvgPluginOptions["document"] =
    opts.document ?? (globalThis as any).document;
  const instances = new Map<Element, Instance>();
  let listenerCount = 0;

  const fail = (
    ctx: PluginContext<any>,
    onError: string | undefined,
    error: SvgErrorPayload,
  ): void => {
    if (onError) ctx.dispatch({ id: onError, payload: error });
    else if (error.code !== "unsupported")
      throw new Error(`pavlus/svg: ${error.message}`);
  };

  const resolve = (
    ctx: PluginContext<any>,
    target: SvgTarget,
    onError: string | undefined,
    quiet = false,
  ): Element | undefined => {
    if (!doc || typeof doc.createElementNS !== "function") {
      fail(ctx, onError, { code: "unsupported", message: "no DOM available" });
      return;
    }
    const el = typeof target === "string" ? doc.querySelector(target) : target;
    if (!isElement(el)) {
      if (!quiet)
        fail(ctx, onError, {
          code: "notFound",
          message: `svg target "${String(target)}" not found`,
        });
      return;
    }
    return el;
  };

  /** Validates a tree; reports and returns undefined when it is not allowed. */
  const clean = (
    ctx: PluginContext<any>,
    tree: unknown,
    onError: string | undefined,
  ): CleanNode | undefined => {
    try {
      return cleanTree(tree);
    } catch (e) {
      fail(ctx, onError, {
        code: "invalid",
        message: e instanceof SvgTreeError ? e.message : String(e),
      });
    }
  };

  // ------------------------------------------------------------- DOM helpers

  function setAttr(el: Element, name: string, value: string): void {
    if (name === "xmlns" || name.startsWith("xmlns:")) return; // namespaces come from createElementNS
    if (name.startsWith("xlink:")) el.setAttributeNS(XLINK_NS, name, value);
    else if (name.startsWith("xml:")) el.setAttributeNS(XML_NS, name, value);
    else el.setAttribute(name, value);
  }

  /** Where the pointer is, in the viewBox space of the svg root. */
  function localPoint(
    svg: Element,
    ev: MouseEvent,
  ): { x: number; y: number } | undefined {
    if (typeof ev.clientX !== "number" || typeof ev.clientY !== "number")
      return;
    const s = svg as unknown as SVGSVGElement;
    try {
      const m = s.getScreenCTM?.();
      if (m && typeof s.createSVGPoint === "function") {
        const p = s.createSVGPoint();
        p.x = ev.clientX;
        p.y = ev.clientY;
        const q = p.matrixTransform(m.inverse());
        return { x: q.x, y: q.y };
      }
    } catch {
      /* fall through to the bounding-box estimate */
    }
    const r = svg.getBoundingClientRect();
    const vb = svg
      .getAttribute("viewBox")
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      vb &&
      vb.length === 4 &&
      vb.every(Number.isFinite) &&
      r.width &&
      r.height
    )
      return {
        x: vb[0]! + ((ev.clientX - r.left) * vb[2]!) / r.width,
        y: vb[1]! + ((ev.clientY - r.top) * vb[3]!) / r.height,
      };
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function mergePayload(
    payload: unknown,
    pt: { x: number; y: number } | undefined,
  ): unknown {
    if (!pt) return payload;
    if (payload === undefined) return pt;
    if (
      typeof payload === "object" &&
      payload !== null &&
      !Array.isArray(payload)
    )
      return { ...payload, ...pt };
    return { payload, ...pt };
  }

  function syncListeners(
    r: RNode,
    next: CleanNode["on"],
    svgRoot: () => Element,
    ctx: PluginContext<any>,
  ): void {
    for (const [ev, l] of [...r.listeners]) {
      if (!(ev in next)) {
        r.el.removeEventListener(ev, l.fn);
        r.listeners.delete(ev);
        listenerCount--;
      }
    }
    for (const [ev, handler] of Object.entries(next)) {
      const have = r.listeners.get(ev);
      if (have) {
        have.handler = handler; // the listener reads the latest handler
        continue;
      }
      const l: Listener = {
        handler,
        fn: (e) => {
          const h = l.handler;
          if (h.prevent) e.preventDefault();
          if (h.stop) e.stopPropagation();
          const msg: Message = {
            id: h.id,
            payload: mergePayload(
              h.payload,
              localPoint(svgRoot(), e as MouseEvent),
            ),
            event: { type: e.type },
          };
          if ("key" in e) msg.event!.key = (e as KeyboardEvent).key;
          ctx.dispatch(msg);
        },
      };
      r.el.addEventListener(ev, l.fn);
      r.listeners.set(ev, l);
      listenerCount++;
    }
  }

  function dropListeners(r: RNode): void {
    for (const [ev, l] of r.listeners) {
      r.el.removeEventListener(ev, l.fn);
      listenerCount--;
    }
    r.listeners.clear();
    r.children.forEach(dropListeners);
  }

  function setText(r: RNode, text: string): void {
    if (text === "") {
      r.textNode?.remove();
      r.textNode = null;
    } else if (r.textNode) {
      if (r.textNode.data !== text) r.textNode.data = text;
    } else {
      r.textNode = doc!.createTextNode(text);
      r.el.insertBefore(r.textNode, r.el.firstChild);
    }
  }

  function create(
    n: CleanNode,
    svgRoot: () => Element,
    ctx: PluginContext<any>,
  ): RNode {
    const el = doc!.createElementNS(SVG_NS, n.tag);
    const r: RNode = {
      clean: { ...n, attrs: {}, text: "", on: {}, children: [] },
      el,
      textNode: null,
      children: [],
      listeners: new Map(),
    };
    patch(r, n, svgRoot, ctx);
    return r;
  }

  /** Makes the DOM of `r` match `n` (same tag), touching only what differs. */
  function patch(
    r: RNode,
    n: CleanNode,
    svgRoot: () => Element,
    ctx: PluginContext<any>,
  ): void {
    const old = r.clean.attrs;
    for (const k of Object.keys(old))
      if (!(k in n.attrs) && !k.startsWith("xmlns")) r.el.removeAttribute(k);
    for (const [k, v] of Object.entries(n.attrs))
      if (old[k] !== v) setAttr(r.el, k, v);
    if (n.text !== r.clean.text) setText(r, n.text);
    syncListeners(r, n.on, svgRoot, ctx);
    reconcile(r, n.children, svgRoot, ctx);
    r.clean = n;
  }

  function reconcile(
    parent: RNode,
    next: CleanNode[],
    svgRoot: () => Element,
    ctx: PluginContext<any>,
  ): void {
    const keyed = new Map<string, RNode>();
    const plain: RNode[] = [];
    for (const c of parent.children)
      c.clean.key !== undefined ? keyed.set(c.clean.key, c) : plain.push(c);
    const used = new Set<RNode>();
    const result: RNode[] = [];
    let pi = 0;
    for (const n of next) {
      const m = n.key !== undefined ? keyed.get(n.key) : plain[pi++];
      if (m && m.clean.tag === n.tag) {
        patch(m, n, svgRoot, ctx);
        used.add(m);
        result.push(m);
      } else result.push(create(n, svgRoot, ctx));
    }
    for (const c of parent.children)
      if (!used.has(c)) {
        dropListeners(c);
        c.el.remove();
      }
    let cursor: Node | null = parent.textNode
      ? parent.textNode.nextSibling
      : parent.el.firstChild;
    for (const r of result) {
      if (r.el === cursor) cursor = cursor.nextSibling;
      else parent.el.insertBefore(r.el, cursor);
    }
    parent.children = result;
  }

  function destroy(inst: Instance): void {
    dropListeners(inst.root);
    if (inst.created) inst.root.el.remove();
    else {
      for (const k of Object.keys(inst.root.clean.attrs))
        if (!k.startsWith("xmlns")) inst.root.el.removeAttribute(k);
      while (inst.root.el.firstChild)
        inst.root.el.removeChild(inst.root.el.firstChild);
    }
    instances.delete(inst.container);
  }

  return {
    name: "svg",
    handle(effect, ctx) {
      switch (effect.type) {
        case "toString": {
          const tree = clean(ctx, effect.tree, effect.onError);
          if (!tree) return;
          ctx.dispatch({ id: effect.onSuccess, payload: serializeSvg(tree) });
          return;
        }
        case "mount": {
          const container = resolve(ctx, effect.target, effect.onError);
          if (!container) return;
          const tree = clean(ctx, effect.tree, effect.onError);
          if (!tree) return;
          if (tree.tag !== "svg")
            return fail(ctx, effect.onError, {
              code: "invalid",
              message: 'the root of a mounted tree must be an "svg" element',
            });
          const prev = instances.get(container);
          if (prev) destroy(prev);
          const adopt =
            container.localName === "svg" && container.namespaceURI === SVG_NS;
          while (container.firstChild)
            container.removeChild(container.firstChild);
          let inst!: Instance;
          const svgRoot = () => inst.root.el;
          let root: RNode;
          if (adopt) {
            root = {
              clean: { ...tree, attrs: {}, text: "", on: {}, children: [] },
              el: container,
              textNode: null,
              children: [],
              listeners: new Map(),
            };
            inst = { container, root, created: false };
            patch(root, tree, svgRoot, ctx);
          } else {
            root = create(tree, () => inst.root.el, ctx);
            container.appendChild(root.el);
            inst = { container, root, created: true };
          }
          instances.set(container, inst);
          if (effect.onMounted) ctx.dispatch({ id: effect.onMounted });
          return;
        }
        case "update": {
          const container = resolve(ctx, effect.target, effect.onError);
          if (!container) return;
          const inst = instances.get(container);
          if (!inst)
            return fail(ctx, effect.onError, {
              code: "notFound",
              message: "nothing mounted on this target; mount first",
            });
          const tree = clean(ctx, effect.tree, effect.onError);
          if (!tree) return;
          if (tree.tag !== "svg")
            return fail(ctx, effect.onError, {
              code: "invalid",
              message: 'the root of a mounted tree must be an "svg" element',
            });
          patch(inst.root, tree, () => inst.root.el, ctx);
          return;
        }
        case "unmount": {
          const container = resolve(ctx, effect.target, undefined, true);
          const inst = container && instances.get(container);
          if (inst) destroy(inst);
          return;
        }
        case "measure": {
          const container = resolve(ctx, effect.target, effect.onError);
          if (!container) return;
          const scope = instances.get(container)?.root.el ?? container;
          let node: Element | null;
          try {
            node = !effect.selector
              ? scope
              : scope.matches(effect.selector)
                ? scope
                : scope.querySelector(effect.selector);
          } catch {
            return fail(ctx, effect.onError, {
              code: "invalid",
              message: `bad selector "${effect.selector}"`,
            });
          }
          if (!node)
            return fail(ctx, effect.onError, {
              code: "notFound",
              message: `no element matches "${effect.selector}"`,
            });
          const bb = (node as unknown as SVGGraphicsElement).getBBox;
          if (typeof bb !== "function")
            return fail(ctx, effect.onError, {
              code: "unsupported",
              message: "getBBox is not available",
            });
          try {
            const b = bb.call(node);
            ctx.dispatch({
              id: effect.onSuccess,
              payload: { x: b.x, y: b.y, width: b.width, height: b.height },
            });
          } catch (e) {
            fail(ctx, effect.onError, {
              code: "failed",
              message: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }
    },
    mounted: () => instances.size,
    listeners: () => listenerCount,
    dispose() {
      for (const inst of [...instances.values()]) destroy(inst);
    },
  };
}

export { svgEffector } from "./helpers.ts";
export type { SvgEffector } from "./helpers.ts";
export { svg, root, g, rect, circle, line, path, text } from "./h.ts";
export { cleanTree, serializeSvg, SvgTreeError } from "./tree.ts";
export type { SvgNode, SvgHandler, SvgAttrValue } from "./tree.ts";
