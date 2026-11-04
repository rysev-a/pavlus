import type { Plugin, PluginContext } from "../../core/types.ts";
import {
  type Block,
  type DirectView,
  directViewOf,
  type Env,
  type Rt,
} from "../../direct/runtime.ts";
import { RENDER_END, RENDER_START } from "../../runtime/vnode.ts";

/** A direct view, or a component that has one (it then owns the view). */
export type DirectMountable = DirectView | { view?: DirectView };

export type DirectDomEffect =
  | {
      plugin: "dom";
      type: "mount";
      /** CSS selector or element. */
      target: string | Element;
      /** A compiled direct template, or a component whose `view` is one. */
      view: DirectMountable;
      /** Message id dispatched once the view is in the DOM. */
      onMounted?: string;
      /** Repaint on every application state change (the root of an app). */
      followState?: boolean;
    }
  | { plugin: "dom"; type: "unmount"; target: string | Element }
  | {
      plugin: "dom";
      type: "update";
      /** Ignored: a direct view remembers what it painted. Kept for the effect shape. */
      prev: unknown;
      /** The state to show now. */
      next: unknown;
      target?: string | Element;
    }
  | { plugin: "dom"; type: "focus"; selector: string }
  | { plugin: "dom"; type: "blur"; selector: string };

export interface DirectDomPluginOptions {
  /** Defaults to the global `document`. */
  document?: Document;
  /**
   * Receives the error of a binding that threw (the rest of the update goes
   * on). Default: `console.error`.
   */
  onError?: (error: unknown) => void;
}

export interface DirectDomStats {
  mounts: number;
  /** Event listeners currently attached by the plugin. */
  listeners: number;
}

export interface DirectDomPlugin extends Plugin<DirectDomEffect, any> {
  stats(): DirectDomStats;
}

interface Instance {
  container: Element;
  start: Comment;
  end: Comment;
  block: Block;
  /** The state last painted. */
  state: unknown;
  follow: boolean;
  /** An update is running: further ones are queued, never nested. */
  busy: boolean;
  pending: { next: unknown } | null;
}

/**
 * The direct counterpart of `createDomPlugin()`: same effects (`mount`,
 * `unmount`, `update`, `focus`, `blur`; `followState`, `onMounted`), same
 * message dispatch, but the view is a compiled *direct* template. It builds
 * the DOM by cloning a skeleton and `update`s it in place; there is no vnode
 * tree, patch list or node-id table.
 *
 * Not supported (the vdom plugin does them): hydrating server-rendered
 * markup (a server render found in the container is replaced, not adopted).
 */
export function createDirectDomPlugin(
  opts: DirectDomPluginOptions = {},
): DirectDomPlugin {
  const doc = opts.document ?? globalThis.document;
  const instances = new Map<Element, Instance>();
  let ctx: PluginContext<any> | undefined;

  const rt: Rt = {
    doc,
    l: 0,
    send: (m) => ctx?.dispatch(m),
    err: (e) => (opts.onError ?? console.error)(e),
  };

  const resolve = (t: string | Element): Element => {
    const el = typeof t === "string" ? doc.querySelector(t) : t;
    if (!el) throw new Error(`pavlus/dom: target "${String(t)}" not found`);
    return el;
  };

  function removeRange(from: Node, to: Node): void {
    let n: Node | null = from;
    while (n) {
      const next: Node | null = n === to ? null : n.nextSibling;
      n.parentNode?.removeChild(n);
      n = next;
    }
  }

  /** Server renders (`renderToString` of the vdom pipeline) are not hydrated. */
  function clearServerRender(container: Element): void {
    let start: Node | null = null;
    for (const n of [...container.childNodes]) {
      if (n.nodeType !== 8) continue;
      const data = (n as Comment).data;
      if (data === RENDER_START) start = n;
      else if (data === RENDER_END && start) {
        removeRange(start, n);
        start = null;
      }
    }
  }

  /** Paints `next`; an update asked for while one runs waits its turn. */
  function repaint(inst: Instance, next: unknown): void {
    if (inst.busy) {
      inst.pending = { next };
      return;
    }
    inst.busy = true;
    try {
      let cur = next;
      for (;;) {
        if (cur !== inst.state) {
          inst.state = cur;
          inst.block.u(cur);
        }
        if (!inst.pending) break;
        cur = inst.pending.next;
        inst.pending = null;
      }
    } finally {
      inst.busy = false;
      inst.pending = null;
    }
  }

  function repaintAt(target: string | Element, next: unknown): void {
    const el = typeof target === "string" ? doc.querySelector(target) : target;
    const inst = el ? instances.get(el) : undefined;
    if (!inst)
      throw new Error(`pavlus/dom: nothing mounted at "${String(target)}"`);
    repaint(inst, next);
  }

  function mount(
    target: string | Element,
    mountable: DirectMountable,
    c: PluginContext<any>,
    onMounted?: string,
    follow = false,
  ): void {
    const container = resolve(target);
    const view = directViewOf(mountable);
    if (!view) {
      throw new Error(
        "pavlus/dom: this plugin mounts direct views (compiled with the direct compiler)",
      );
    }
    if (instances.has(container)) unmount(container);
    clearServerRender(container);
    const state = c.getState();
    const env: Env = {
      rt,
      ns: "",
      o: "create" in mountable ? undefined : mountable,
    };
    const listeners = rt.l;
    let block: Block;
    try {
      block = view.create(env, state);
    } catch (e) {
      rt.l = listeners; // listeners of the half-built, never attached DOM
      throw e;
    }
    const inst: Instance = {
      container,
      start: doc.createComment(RENDER_START),
      end: doc.createComment(RENDER_END),
      block,
      state,
      follow,
      busy: false,
      pending: null,
    };
    container.append(inst.start, block.f, inst.end);
    instances.set(container, inst);
    if (onMounted) c.dispatch({ id: onMounted });
  }

  function unmount(target: string | Element): void {
    const container = resolve(target);
    const inst = instances.get(container);
    if (!inst) return;
    instances.delete(container);
    removeRange(inst.start, inst.end);
    inst.block.d();
  }

  return {
    name: "dom",
    init(c) {
      ctx = c;
    },
    handle(effect: DirectDomEffect, c) {
      switch (effect.type) {
        case "mount":
          return mount(
            effect.target,
            effect.view,
            c,
            effect.onMounted,
            effect.followState === true,
          );
        case "unmount":
          return unmount(effect.target);
        case "update":
          if (effect.target === undefined) {
            for (const inst of [...instances.values()])
              repaint(inst, effect.next);
            return;
          }
          return repaintAt(effect.target, effect.next);
        case "focus":
          return (
            doc.querySelector(effect.selector) as HTMLElement | null
          )?.focus();
        case "blur":
          return (
            doc.querySelector(effect.selector) as HTMLElement | null
          )?.blur();
      }
    },
    onState(state) {
      for (const inst of [...instances.values()]) {
        if (inst.follow) repaint(inst, state);
      }
    },
    dispose() {
      for (const c of [...instances.keys()]) unmount(c);
      ctx = undefined;
    },
    stats() {
      return { mounts: instances.size, listeners: rt.l };
    },
  };
}

/**
 * The HTML of a direct view for `state`, built in `doc` (the global
 * `document`, or any DOM implementation: there is no DOM-free path). Block
 * anchors are dropped. Not hydratable by this plugin.
 */
export function renderToString<S>(
  view: DirectView<S>,
  state: S,
  doc: Document = globalThis.document,
): string {
  const rt: Rt = { doc, l: 0, send() {}, err: (e) => console.error(e) };
  const block = view.create({ rt, ns: "", o: undefined }, state);
  const host = doc.createElement("div");
  host.appendChild(block.f);
  block.d();
  return host.innerHTML.replaceAll("<!---->", "");
}

/** Effect builders with the direct view type (the effects are the dom plugin's). */
export const directEffector = {
  mount: (
    target: string | Element,
    view: DirectMountable,
    options: { onMounted?: string; followState?: boolean } = {},
  ): Extract<DirectDomEffect, { type: "mount" }> => ({
    plugin: "dom",
    type: "mount",
    target,
    view,
    ...(options.onMounted !== undefined && { onMounted: options.onMounted }),
    ...(options.followState === true && { followState: true }),
  }),
  unmount: (target: string | Element): DirectDomEffect => ({
    plugin: "dom",
    type: "unmount",
    target,
  }),
  update: (
    prev: unknown,
    next: unknown,
    target?: string | Element,
  ): DirectDomEffect =>
    target === undefined
      ? { plugin: "dom", type: "update", prev, next }
      : { plugin: "dom", type: "update", prev, next, target },
  focus: (selector: string): DirectDomEffect => ({
    plugin: "dom",
    type: "focus",
    selector,
  }),
  blur: (selector: string): DirectDomEffect => ({
    plugin: "dom",
    type: "blur",
    selector,
  }),
};

export type { DirectView } from "../../direct/runtime.ts";
