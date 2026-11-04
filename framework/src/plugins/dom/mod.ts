import type {
  Effect,
  Message,
  Plugin,
  PluginContext,
} from "../../core/types.ts";
import {
  type EventMsg,
  type Patch,
  RENDER_END,
  RENDER_START,
  type View,
  type VNode,
} from "../../runtime/vnode.ts";

export type DomEffect =
  | {
      plugin: "dom";
      type: "mount";
      /** CSS selector or element. */
      target: string | Element;
      /** A compiled template; for a component, `viewOf(component)`. */
      view: View;
      /** Message id dispatched once the view is in the DOM. */
      onMounted?: string;
      /**
       * Keep it in sync with the application state: every state change is
       * re-diffed and patched. Off by default — the application repaints the
       * mount with `update` when it decides to (the root of an app sets this
       * through the component's `updateDomOnStateChange`).
       */
      followState?: boolean;
    }
  | { plugin: "dom"; type: "unmount"; target: string | Element }
  | {
      plugin: "dom";
      type: "update";
      /**
       * Repaint between `prev` and `next`: the view is re-diffed against the
       * state the mount was last painted with and the state to show now —
       * the pair a store write's answer carries. Without `target`, every
       * mount is repainted.
       */
      prev: unknown;
      next: unknown;
      target?: string | Element;
    }
  | { plugin: "dom"; type: "focus"; selector: string }
  | { plugin: "dom"; type: "blur"; selector: string };

export interface DomPluginOptions {
  /** Defaults to the global `document`. */
  document?: Document;
}

export interface DomStats {
  mounts: number;
  /** Nodes tracked by id across all mounts. */
  nodes: number;
  /** Event listeners currently attached by the plugin. */
  listeners: number;
}

export interface DomPlugin extends Plugin<DomEffect, any> {
  stats(): DomStats;
}

interface Listening {
  /** Latest message per event type; the DOM listener reads it on every event. */
  msgs: Map<string, EventMsg>;
  fns: Map<string, EventListener>;
}

interface Instance {
  container: Element;
  start: Comment;
  end: Comment;
  view: View;
  /** The state the mount was last painted with; a diff starts from it. */
  state: unknown;
  /** Re-diffed on `onState` (mounted with `followState`). */
  follow: boolean;
  nodes: Map<string, Node>;
}

/**
 * The only code that touches the DOM. Mounts compiled views, applies the
 * patches `view.diff` produces, and owns every event listener it adds. A
 * mount follows the application state only when mounted with `followState`
 * (the root of an app whose component sets `updateDomOnStateChange`); every
 * other mount is repainted when the application sends it `update` with the
 * `{ prev, next }` pair it wants diffed — a state change alone never touches
 * the DOM.
 */
export function createDomPlugin(opts: DomPluginOptions = {}): DomPlugin {
  const doc = opts.document ?? globalThis.document;
  const instances = new Map<Element, Instance>();
  const listening = new WeakMap<Node, Listening>();
  const ids = new WeakMap<Node, string>();
  let listenerCount = 0;
  let ctx: PluginContext<any> | undefined;

  const resolve = (t: string | Element): Element => {
    const el = typeof t === "string" ? doc.querySelector(t) : t;
    if (!el) throw new Error(`pavlus/dom: target "${String(t)}" not found`);
    return el;
  };

  function snapshot(ev: Event): Message["event"] {
    const t = ev.target as HTMLInputElement | null;
    const info: NonNullable<Message["event"]> = { type: ev.type };
    if (t && "value" in t && typeof t.value === "string") info.value = t.value;
    if (t && "checked" in t && typeof t.checked === "boolean")
      info.checked = t.checked;
    if ("key" in ev) info.key = (ev as KeyboardEvent).key;
    return info;
  }

  function setHandler(el: Element, event: string, msg: EventMsg): void {
    let l = listening.get(el);
    if (!l) listening.set(el, (l = { msgs: new Map(), fns: new Map() }));
    l.msgs.set(event, msg);
    if (l.fns.has(event)) return; // listener reads the latest message
    const fn: EventListener = (ev) => {
      const m = l!.msgs.get(event)!;
      if (m.prevent) ev.preventDefault();
      if (m.stop) ev.stopPropagation();
      ctx?.dispatch({ id: m.id, payload: m.payload, event: snapshot(ev) });
    };
    l.fns.set(event, fn);
    el.addEventListener(event, fn);
    listenerCount++;
  }

  /** Live form state lives in properties; the attribute only seeds it. */
  const PROPS = new Set(["value", "checked", "selected"]);
  function writeAttr(el: Element, name: string, value: string | null): void {
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
    if (PROPS.has(name) && name in el) {
      (el as unknown as Record<string, unknown>)[name] =
        name === "value" ? (value ?? "") : value !== null;
    }
  }

  function register(v: VNode, node: Node, inst: Instance): void {
    if (v.id !== undefined) {
      inst.nodes.set(v.id, node);
      ids.set(node, v.id);
    }
  }

  function build(v: VNode, inst: Instance): Node {
    let node: Node;
    if (v.t === "text") node = doc.createTextNode(v.text);
    else if (v.t === "marker") node = doc.createComment("");
    else {
      const el = doc.createElement(v.tag);
      for (const [k, val] of Object.entries(v.attrs)) writeAttr(el, k, val);
      for (const [ev, msg] of Object.entries(v.events)) setHandler(el, ev, msg);
      for (const c of v.children) el.appendChild(build(c, inst));
      node = el;
    }
    register(v, node, inst);
    return node;
  }

  /** The comments `renderToString` put around a server render, if any. */
  function serverRender(
    container: Element,
  ): { start: Comment; end: Comment } | null {
    let start: Comment | null = null;
    for (const n of container.childNodes) {
      if (n.nodeType !== 8) continue;
      const data = (n as Comment).data;
      if (data === RENDER_START) start = n as Comment;
      else if (data === RENDER_END && start)
        return { start, end: n as Comment };
    }
    return null;
  }

  class Mismatch extends Error {}
  const mismatch = (what: string): never => {
    throw new Mismatch(what);
  };

  /**
   * Hydration: adopts the DOM `node` for `v` (listeners, ids; the markup is
   * already there) and returns the sibling to continue with. The HTML parser
   * merges adjacent text nodes and drops empty ones, so text is split or
   * inserted as needed. Anything else that differs is a `Mismatch`.
   */
  function adopt(
    v: VNode,
    node: Node | null,
    parent: Node,
    inst: Instance,
  ): Node | null {
    let adopted: Node;
    if (v.t === "text") {
      if (v.text === "") {
        adopted = parent.insertBefore(doc.createTextNode(""), node);
        register(v, adopted, inst);
        return node;
      }
      if (!node || node.nodeType !== 3) mismatch(`expected text "${v.text}"`);
      const text = node as Text;
      if (text.data !== v.text) {
        if (!text.data.startsWith(v.text))
          mismatch(`text "${text.data}" is not "${v.text}"`);
        text.splitText(v.text.length);
      }
      adopted = text;
    } else if (v.t === "marker") {
      if (!node || node.nodeType !== 8) mismatch(`expected a marker (${v.id})`);
      adopted = node!;
    } else {
      if (!node || node.nodeType !== 1 || (node as Element).localName !== v.tag)
        mismatch(`expected <${v.tag}>`);
      const el = node as Element;
      for (const [ev, msg] of Object.entries(v.events)) setHandler(el, ev, msg);
      let child: Node | null = el.firstChild;
      for (const cv of v.children) child = adopt(cv, child, el, inst);
      if (child) mismatch(`extra content in <${v.tag}>`);
      adopted = el;
    }
    register(v, adopted, inst);
    return adopted.nextSibling;
  }

  /** Detaches listeners and forgets ids for a node and everything below it. */
  function dispose(node: Node, inst: Instance): void {
    const l = listening.get(node);
    if (l) {
      for (const [ev, fn] of l.fns) {
        node.removeEventListener(ev, fn);
        listenerCount--;
      }
      listening.delete(node);
    }
    const id = ids.get(node);
    if (id !== undefined) {
      inst.nodes.delete(id);
      ids.delete(node);
    }
    node.childNodes.forEach((c) => dispose(c, inst));
  }

  function removeRange(
    from: Node,
    to: Node,
    inclusive: boolean,
    inst: Instance,
  ): void {
    let n: Node | null = inclusive ? from : from.nextSibling;
    const stop = inclusive ? to.nextSibling : to;
    while (n && n !== stop) {
      const next: Node | null = n.nextSibling;
      dispose(n, inst);
      n.parentNode?.removeChild(n);
      n = next;
    }
  }

  function get(inst: Instance, id: string): Node {
    const n = inst.nodes.get(id);
    if (!n) throw new Error(`pavlus/dom: unknown node id "${id}"`);
    return n;
  }

  /** Re-diffs a mount between `prev` and `next` and patches (no-op if equal). */
  function repaint(inst: Instance, prev: unknown, next: unknown): void {
    if (prev === next) return;
    const patches = inst.view.diff(prev, next);
    inst.state = next;
    apply(patches, inst);
  }

  function repaintAt(
    target: string | Element,
    prev: unknown,
    next: unknown,
  ): void {
    const el = typeof target === "string" ? doc.querySelector(target) : target;
    const inst = el ? instances.get(el) : undefined;
    if (!inst)
      throw new Error(`pavlus/dom: nothing mounted at "${String(target)}"`);
    repaint(inst, prev, next);
  }

  function apply(patches: Patch[], inst: Instance): void {
    for (const p of patches) {
      switch (p.op) {
        case "text":
          get(inst, p.id).textContent = p.text;
          break;
        case "attr":
          writeAttr(get(inst, p.id) as Element, p.name, p.value);
          break;
        case "rmAttr":
          writeAttr(get(inst, p.id) as Element, p.name, null);
          break;
        case "handler":
          setHandler(get(inst, p.id) as Element, p.event, p.msg);
          break;
        case "insert": {
          const ref = get(inst, p.before);
          const parent = ref.parentNode!;
          for (const v of p.nodes) parent.insertBefore(build(v, inst), ref);
          break;
        }
        case "clear":
          removeRange(get(inst, p.from), get(inst, p.to), false, inst);
          break;
        case "remove":
          removeRange(get(inst, p.from), get(inst, p.to), true, inst);
          break;
        case "move": {
          const from = get(inst, p.from);
          const to = get(inst, p.to);
          const ref = get(inst, p.before);
          const parent = ref.parentNode!;
          const range: Node[] = [];
          for (let n: Node | null = from; n; n = n.nextSibling) {
            range.push(n);
            if (n === to) break;
          }
          for (const n of range) parent.insertBefore(n, ref);
          break;
        }
      }
    }
  }

  function mount(
    target: string | Element,
    view: View,
    c: PluginContext<any>,
    onMounted?: string,
    follow = false,
  ): void {
    const container = resolve(target);
    if (instances.has(container)) unmount(container);
    const state = c.getState();
    const nodes = view.render(state);
    const server = serverRender(container);
    const inst: Instance = {
      container,
      start: server?.start ?? doc.createComment(RENDER_START),
      end: server?.end ?? doc.createComment(RENDER_END),
      view,
      state,
      follow,
      nodes: new Map(),
    };
    // A server render in the container (`renderToString`) is hydrated: the
    // markup stays, the listeners and ids are attached to it.
    if (server) {
      try {
        let cursor: Node | null = server.start.nextSibling;
        for (const v of nodes) cursor = adopt(v, cursor, container, inst);
        if (cursor !== server.end) mismatch("extra content after the render");
        instances.set(container, inst);
        if (onMounted) c.dispatch({ id: onMounted });
        return;
      } catch (e) {
        if (!(e instanceof Mismatch)) throw e;
        console.warn(
          `pavlus/dom: the server render does not match the view (${e.message}); rendering afresh`,
        );
        removeRange(server.start, server.end, true, inst);
        inst.nodes.clear();
        inst.start = doc.createComment(RENDER_START);
        inst.end = doc.createComment(RENDER_END);
      }
    }
    container.appendChild(inst.start);
    for (const v of nodes) container.appendChild(build(v, inst));
    container.appendChild(inst.end);
    instances.set(container, inst);
    if (onMounted) c.dispatch({ id: onMounted });
  }

  function unmount(target: string | Element): void {
    const container = resolve(target);
    const inst = instances.get(container);
    if (!inst) return;
    removeRange(inst.start, inst.end, true, inst);
    instances.delete(container);
  }

  return {
    name: "dom",
    init(c) {
      ctx = c;
    },
    handle(effect: DomEffect, c) {
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
            for (const inst of instances.values())
              repaint(inst, effect.prev, effect.next);
            return;
          }
          return repaintAt(effect.target, effect.prev, effect.next);
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
      for (const inst of instances.values()) {
        if (!inst.follow) continue;
        repaint(inst, inst.state, state);
      }
    },
    dispose() {
      for (const c of [...instances.keys()]) unmount(c);
      ctx = undefined;
    },
    stats() {
      let nodes = 0;
      for (const i of instances.values()) nodes += i.nodes.size;
      return { mounts: instances.size, nodes, listeners: listenerCount };
    },
  };
}

export { domEffector } from "./helpers.ts";
export type { DomEffector } from "./helpers.ts";
