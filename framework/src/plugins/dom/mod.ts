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
       * For a view that cannot compute patches of its own (a direct view):
       * the plugin repaints the mount on every state change. Set by `createApp`
       * from the component's `updateDomOnStateChange`.
       */
      followState?: boolean;
    }
  | { plugin: "dom"; type: "unmount"; target: string | Element }
  | {
      plugin: "dom";
      type: "update";
      /**
       * The changes a component's view diff computed — which nodes get new
       * text, attributes, event listeners, what is inserted and removed.
       * Applied as-is: the plugin never re-diffs and never reads the state.
       */
      patches: Patch[];
      /**
       * The mount the patches belong to. Omitted (by a component that paints
       * itself) when the patches are scoped to the application's only mount.
       */
      target?: string | Element;
    }
  | { plugin: "dom"; type: "focus"; target: string | Element }
  | { plugin: "dom"; type: "blur"; target: string | Element };

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
  nodes: Map<string, Node>;
  /** The state the instance was last rendered or repainted with. */
  state: unknown;
  /** Set by `followState`: the plugin repaints the instance on state changes. */
  follow: boolean;
}

/**
 * The only code that touches the DOM. Mounts compiled views, applies the
 * patches it is given — the ones a component's view diff computed — and owns
 * every event listener it adds. It never diffs and never reads the state:
 * what to change is decided above it, by the components.
 *
 * A component paints itself in a handler (usually `paint`, the answer of a
 * store write): it diffs its own view and returns `DomPlugin.update(patches)`
 * with no target and node ids relative to itself. Every child boundary it
 * passes through ({@link namespace}) scopes the ids to where the child is
 * embedded, so by the time the effect reaches the plugin the ids address
 * nodes of the one mount.
 *
 * The instance methods are the executor API (what an effect asks for); the
 * static methods build the effects themselves:
 *
 * ```ts
 * import { DomPlugin } from "@service-laboratory/pavlus/plugins/dom";
 *
 * // in a handler, as an effect:
 * return [DomPlugin.update(patches)];
 * // in the plugin list:
 * createApp({ app, plugins: [store, new DomPlugin()], mount: "#app" });
 * ```
 */
export class DomPlugin implements Plugin<DomEffect, any> {
  name = "dom" as const;

  private readonly doc: Document;
  private readonly instances = new Map<Element, Instance>();
  private readonly listening = new WeakMap<Node, Listening>();
  private readonly ids = new WeakMap<Node, string>();
  private listenerCount = 0;
  private ctx: PluginContext<any> | undefined;

  constructor(opts: DomPluginOptions = {}) {
    this.doc = opts.document ?? globalThis.document;
  }

  /* -------------------------------------------------------- effect builders */

  /** Builds a `mount` effect: render `view` into `target`. */
  static mount(
    target: string | Element,
    view: View,
    options: { onMounted?: string; followState?: boolean } = {},
  ): DomEffect {
    return {
      plugin: "dom",
      type: "mount",
      target,
      view,
      ...(options.onMounted !== undefined && { onMounted: options.onMounted }),
      ...(options.followState === true && { followState: true }),
    };
  }

  /** Builds an `unmount` effect: remove what is mounted at `target`. */
  static unmount(target: string | Element): DomEffect {
    return { plugin: "dom", type: "unmount", target };
  }

  /** Builds an `update` effect: apply `patches` (see the instance method). */
  static update(patches: Patch[], target?: string | Element): DomEffect {
    return { plugin: "dom", type: "update", patches, target };
  }

  /**
   * Moves the patches of a component that paints itself into the scope of the
   * embed they pass through: node ids get `ids` in front (the `"/nid"` of the
   * `+Child#name` node), the event messages of `handler` patches get `ns` (the
   * `"name."` prefix). What a boundary above already scoped stays correct:
   * each level only adds its own segment in front.
   */
  static scopePatches(
    patches: Patch[],
    scope: { ids?: string; ns?: string },
  ): Patch[] {
    const id = (s: string): string =>
      scope.ids === undefined ? s : scope.ids + s;
    const msg = (m: EventMsg): EventMsg =>
      scope.ns === undefined ? m : { ...m, id: scope.ns + m.id };
    const vnodes = (ns: VNode[]): VNode[] =>
      ns.map((n) => {
        if (n.t === "marker") return { ...n, id: id(n.id) };
        if (n.t === "text")
          return n.id === undefined ? n : { ...n, id: id(n.id) };
        const events =
          scope.ns === undefined || Object.keys(n.events).length === 0
            ? n.events
            : Object.fromEntries(
                Object.entries(n.events).map(([k, m]) => [k, msg(m)]),
              );
        return {
          ...n,
          id: n.id === undefined ? undefined : id(n.id),
          events,
          children: vnodes(n.children),
        };
      });
    return patches.map((p): Patch => {
      switch (p.op) {
        case "text":
        case "attr":
        case "rmAttr":
        case "handler":
          return p.op === "handler"
            ? { ...p, id: id(p.id), msg: msg(p.msg) }
            : { ...p, id: id(p.id) };
        case "insert":
          return { ...p, before: id(p.before), nodes: vnodes(p.nodes) };
        case "clear":
          return { ...p, from: id(p.from), to: id(p.to) };
        case "remove":
          return { ...p, from: id(p.from), to: id(p.to) };
        case "move":
          return { ...p, from: id(p.from), to: id(p.to), before: id(p.before) };
      }
    });
  }

  /** Builds a `focus` effect: focus the first element matching `target`. */
  static focus(target: string | Element): DomEffect {
    return { plugin: "dom", type: "focus", target };
  }

  /** Builds a `blur` effect: remove focus from the first match of `target`. */
  static blur(target: string | Element): DomEffect {
    return { plugin: "dom", type: "blur", target };
  }

  /* ------------------------------------------------------- executor methods */

  /**
   * Renders `view` (a compiled template, or `viewOf(component)`) into
   * `target`, replacing whatever was mounted there, from the current state.
   * A server render in the container (`renderToString`) is hydrated: the
   * markup stays, the listeners and ids attach to it. `onMounted` is
   * dispatched once it is in the DOM.
   */
  mount(
    target: string | Element,
    view: View,
    options: {
      onMounted?: string;
      ctx?: PluginContext<any>;
      followState?: boolean;
    } = {},
  ): void {
    const ctx = options.ctx ?? this.ctx;
    const container = this.resolve(target);
    if (this.instances.has(container)) this.unmount(container);
    const state = ctx?.getState();
    const nodes = view.render(state);
    const server = DomPlugin.serverRender(container);
    const inst: Instance = {
      container,
      start: server?.start ?? this.doc.createComment(RENDER_START),
      end: server?.end ?? this.doc.createComment(RENDER_END),
      view,
      nodes: new Map(),
      state,
      follow: options.followState === true,
    };
    // A server render in the container (`renderToString`) is hydrated: the
    // markup stays, the listeners and ids are attached to it.
    if (server) {
      try {
        let cursor: Node | null = server.start.nextSibling;
        for (const v of nodes) cursor = this.adopt(v, cursor, container, inst);
        if (cursor !== server.end)
          this.mismatch("extra content after the render");
        this.instances.set(container, inst);
        if (options.onMounted) ctx?.dispatch({ id: options.onMounted });
        return;
      } catch (e) {
        if (!(e instanceof Mismatch)) throw e;
        console.warn(
          `pavlus/dom: the server render does not match the view (${(e as Error).message}); rendering afresh`,
        );
        this.removeRange(server.start, server.end, true, inst);
        inst.nodes.clear();
        inst.start = this.doc.createComment(RENDER_START);
        inst.end = this.doc.createComment(RENDER_END);
      }
    }
    container.appendChild(inst.start);
    for (const v of nodes) container.appendChild(this.build(v, inst));
    container.appendChild(inst.end);
    this.instances.set(container, inst);
    if (options.onMounted) ctx?.dispatch({ id: options.onMounted });
  }

  /** Removes what was mounted into `target`, with all its listeners. */
  unmount(target: string | Element): void {
    const container = this.resolve(target);
    const inst = this.instances.get(container);
    if (!inst) return;
    this.removeRange(inst.start, inst.end, true, inst);
    this.instances.delete(container);
  }

  /**
   * Applies the patches a component's view diff computed. Without a target
   * the patches belong to the application's only mount — there must be
   * exactly one. Throws when there is nothing (or not exactly one) to apply
   * them to.
   */
  update(target: string | Element | undefined, patches: Patch[]): void {
    let inst: Instance | undefined;
    if (target === undefined) {
      if (this.instances.size !== 1) {
        throw new Error(
          `pavlus/dom: an update without a target needs exactly one mount, found ${this.instances.size}`,
        );
      }
      inst = this.instances.values().next().value;
    } else {
      const el =
        typeof target === "string" ? this.doc.querySelector(target) : target;
      inst = el ? this.instances.get(el) : undefined;
    }
    if (!inst)
      throw new Error(`pavlus/dom: nothing mounted at "${String(target)}"`);
    this.apply(patches, inst);
  }

  /** Focuses the first element matching `target`. */
  focus(target: string | Element): void {
    this.elementAt(target)?.focus();
  }

  /** Removes focus from the first element matching `target`. */
  blur(target: string | Element): void {
    this.elementAt(target)?.blur();
  }

  stats(): DomStats {
    let nodes = 0;
    for (const i of this.instances.values()) nodes += i.nodes.size;
    return {
      mounts: this.instances.size,
      nodes,
      listeners: this.listenerCount,
    };
  }

  /* -------------------------------------------------------- plugin surface */

  init(ctx: PluginContext<any>) {
    this.ctx = ctx;
  }

  handle(effect: DomEffect, ctx: PluginContext<any>) {
    switch (effect.type) {
      case "mount":
        return this.mount(effect.target, effect.view, {
          onMounted: effect.onMounted,
          ctx,
          followState: effect.followState,
        });
      case "unmount":
        return this.unmount(effect.target);
      case "update":
        return this.update(effect.target, effect.patches);
      case "focus":
        return this.focus(effect.target);
      case "blur":
        return this.blur(effect.target);
    }
  }

  dispose() {
    for (const c of [...this.instances.keys()]) this.unmount(c);
    this.ctx = undefined;
  }

  /**
   * Repaints the mounts that asked for it (`followState`): a view that has
   * no component painting it — the root of an app whose component sets
   * `updateDomOnStateChange`, typically a direct view without a `diff`.
   * The patches come from the view's own `diff` of what it was last painted
   * with against the new state, addressed to the mount's own nodes.
   */
  onState(next: unknown): void {
    for (const inst of [...this.instances.values()]) {
      if (!inst.follow) continue;
      if (typeof inst.view.diff !== "function") continue; // a direct view
      this.apply(inst.view.diff(inst.state, next), inst);
      inst.state = next;
    }
  }

  /* -------------------------------------------------------- DOM internals */

  private resolve(t: string | Element): Element {
    const el = typeof t === "string" ? this.doc.querySelector(t) : t;
    if (!el) throw new Error(`pavlus/dom: target "${String(t)}" not found`);
    return el;
  }

  private elementAt(t: string | Element): HTMLElement | null {
    return (
      typeof t === "string" ? this.doc.querySelector(t) : t
    ) as HTMLElement | null;
  }

  /** Live form state lives in properties; the attribute only seeds it. */
  private static readonly PROPS = new Set(["value", "checked", "selected"]);

  private static writeAttr(el: Element, name: string, value: string | null) {
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
    if (DomPlugin.PROPS.has(name) && name in el) {
      (el as unknown as Record<string, unknown>)[name] =
        name === "value" ? (value ?? "") : value !== null;
    }
  }

  private static snapshot(ev: Event): Message["event"] {
    const t = ev.target as HTMLInputElement | null;
    const info: NonNullable<Message["event"]> = { type: ev.type };
    if (t && "value" in t && typeof t.value === "string") info.value = t.value;
    if (t && "checked" in t && typeof t.checked === "boolean")
      info.checked = t.checked;
    if ("key" in ev) info.key = (ev as KeyboardEvent).key;
    return info;
  }

  private setHandler(el: Element, event: string, msg: EventMsg): void {
    let l = this.listening.get(el);
    if (!l) this.listening.set(el, (l = { msgs: new Map(), fns: new Map() }));
    l.msgs.set(event, msg);
    if (l.fns.has(event)) return; // listener reads the latest message
    const fn: EventListener = (ev) => {
      const m = l!.msgs.get(event)!;
      if (m.prevent) ev.preventDefault();
      if (m.stop) ev.stopPropagation();
      this.ctx?.dispatch({
        id: m.id,
        payload: m.payload,
        event: DomPlugin.snapshot(ev),
      });
    };
    l.fns.set(event, fn);
    el.addEventListener(event, fn);
    this.listenerCount++;
  }

  private register(v: VNode, node: Node, inst: Instance): void {
    if (v.id !== undefined) {
      inst.nodes.set(v.id, node);
      this.ids.set(node, v.id);
    }
  }

  private build(v: VNode, inst: Instance): Node {
    let node: Node;
    if (v.t === "text") node = this.doc.createTextNode(v.text);
    else if (v.t === "marker") node = this.doc.createComment("");
    else {
      const el = this.doc.createElement(v.tag);
      for (const [k, val] of Object.entries(v.attrs))
        DomPlugin.writeAttr(el, k, val);
      for (const [ev, msg] of Object.entries(v.events))
        this.setHandler(el, ev, msg);
      for (const c of v.children) el.appendChild(this.build(c, inst));
      node = el;
    }
    this.register(v, node, inst);
    return node;
  }

  /** The comments `renderToString` put around a server render, if any. */
  private static serverRender(
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

  private mismatch(what: string): never {
    throw new Mismatch(what);
  }

  /**
   * Hydration: adopts the DOM `node` for `v` (listeners, ids; the markup is
   * already there) and returns the sibling to continue with. The HTML parser
   * merges adjacent text nodes and drops empty ones, so text is split or
   * inserted as needed. Anything else that differs is a `Mismatch`.
   *
   * One tolerance: an element the view sees as childless may hold exactly a
   * server render (`<!--pavlus-->…<!--/pavlus-->` filling it) — a parent
   * renders its slots empty and the mounted child fills them, so the
   * leftover markup is left for that mount to hydrate.
   */
  private adopt(
    v: VNode,
    node: Node | null,
    parent: Node,
    inst: Instance,
  ): Node | null {
    let adopted: Node;
    if (v.t === "text") {
      if (v.text === "") {
        adopted = parent.insertBefore(this.doc.createTextNode(""), node);
        this.register(v, adopted, inst);
        return node;
      }
      if (!node || node.nodeType !== 3)
        this.mismatch(`expected text "${v.text}"`);
      const text = node as Text;
      if (text.data !== v.text) {
        if (!text.data.startsWith(v.text))
          this.mismatch(`text "${text.data}" is not "${v.text}"`);
        text.splitText(v.text.length);
      }
      adopted = text;
    } else if (v.t === "marker") {
      if (!node || node.nodeType !== 8)
        this.mismatch(`expected a marker (${v.id})`);
      adopted = node!;
    } else {
      if (!node || node.nodeType !== 1 || (node as Element).localName !== v.tag)
        this.mismatch(`expected <${v.tag}>`);
      const el = node as Element;
      for (const [ev, msg] of Object.entries(v.events))
        this.setHandler(el, ev, msg);
      let child: Node | null = el.firstChild;
      for (const cv of v.children) child = this.adopt(cv, child, el, inst);
      if (child && v.children.length === 0 && this.slotRender(el, child))
        child = null;
      if (child) this.mismatch(`extra content in <${v.tag}>`);
      adopted = el;
    }
    this.register(v, adopted, inst);
    return adopted.nextSibling;
  }

  /**
   * True when `from` starts the only content of `el` and that content is
   * exactly a server render: `<!--pavlus-->…<!--/pavlus-->` up to the end of
   * the element.
   */
  private slotRender(el: Element, from: Node): boolean {
    if (from.nodeType !== 8 || (from as Comment).data !== RENDER_START)
      return false;
    const last = el.lastChild;
    return (
      last !== from &&
      last !== null &&
      last.nodeType === 8 &&
      (last as Comment).data === RENDER_END
    );
  }

  /** Detaches listeners and forgets ids for a node and everything below it. */
  private disposeTree(node: Node, inst: Instance): void {
    const l = this.listening.get(node);
    if (l) {
      for (const [ev, fn] of l.fns) {
        node.removeEventListener(ev, fn);
        this.listenerCount--;
      }
      this.listening.delete(node);
    }
    const id = this.ids.get(node);
    if (id !== undefined) {
      inst.nodes.delete(id);
      this.ids.delete(node);
    }
    node.childNodes.forEach((c) => this.disposeTree(c, inst));
  }

  private removeRange(
    from: Node,
    to: Node,
    inclusive: boolean,
    inst: Instance,
  ): void {
    let n: Node | null = inclusive ? from : from.nextSibling;
    const stop = inclusive ? to.nextSibling : to;
    while (n && n !== stop) {
      const next: Node | null = n.nextSibling;
      this.disposeTree(n, inst);
      n.parentNode?.removeChild(n);
      n = next;
    }
  }

  private get(inst: Instance, id: string): Node {
    const n = inst.nodes.get(id);
    if (!n) throw new Error(`pavlus/dom: unknown node id "${id}"`);
    return n;
  }

  /** Applies patches a component computed, to the mount they belong to. */
  private apply(patches: Patch[], inst: Instance): void {
    for (const p of patches) {
      switch (p.op) {
        case "text":
          this.get(inst, p.id).textContent = p.text;
          break;
        case "attr":
          DomPlugin.writeAttr(this.get(inst, p.id) as Element, p.name, p.value);
          break;
        case "rmAttr":
          DomPlugin.writeAttr(this.get(inst, p.id) as Element, p.name, null);
          break;
        case "handler":
          this.setHandler(this.get(inst, p.id) as Element, p.event, p.msg);
          break;
        case "insert": {
          const ref = this.get(inst, p.before);
          const parent = ref.parentNode!;
          for (const v of p.nodes)
            parent.insertBefore(this.build(v, inst), ref);
          break;
        }
        case "clear":
          this.removeRange(
            this.get(inst, p.from),
            this.get(inst, p.to),
            false,
            inst,
          );
          break;
        case "remove":
          this.removeRange(
            this.get(inst, p.from),
            this.get(inst, p.to),
            true,
            inst,
          );
          break;
        case "move": {
          const from = this.get(inst, p.from);
          const to = this.get(inst, p.to);
          const ref = this.get(inst, p.before);
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
}

class Mismatch extends Error {}
