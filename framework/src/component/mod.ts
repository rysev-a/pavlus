import type { Effect, Message } from "../core/types.ts";
import { DomPlugin } from "../plugins/dom/mod.ts";
import { loggerEffector } from "../plugins/logger/helpers.ts";
import { routerEffector } from "../plugins/router/helpers.ts";
import { storeEffector } from "../plugins/store/helpers.ts";
import {
  asRoute,
  matchPattern,
  matchRoute,
  type Route,
  type RouteSpec,
  type Routing,
  routeComponent,
  routedState,
  routeName,
  sameRoute,
} from "../routing/mod.ts";
import type { Patch, View } from "../runtime/vnode.ts";

/** The function form of a component: a message and its state in, effects out. */
export type ComponentFn<S = any> = (message: Message, state: S) => Effect[];

export interface ComponentCtx {
  /**
   * Effects of the child `name` handling message `id`. Pure: it only calls
   * the child's handler. Use it for "parent starts child".
   */
  send(child: string, id: string, payload?: unknown): Effect[];
  /**
   * For the component that owns the location (it handles the router
   * plugin's message): stores `route` and returns the `leave`/`enter`
   * effects of every routed child the change affects, down the whole tree.
   */
  setRoute(location: unknown): Effect[];
}

/** A method of a component class, named after the message id. */
export type Handler<S = any> = (
  message: Message,
  state: S,
  ctx: ComponentCtx,
) => Effect[];

export interface ChildSpec<S = any> {
  /** The child component (a function, or an instance of a class extending `Component`). */
  component?: ComponentLike<any>;
  /**
   * Alternative to `component`: choose the child from the state, for
   * components that are values (`+{expr}` in the template). Return
   * `null`/`undefined` for "no child": its messages are ignored.
   */
  select?: (state: S) => ComponentLike<any> | null | undefined;
  /** State key of the child. It sees `state[key]`; its store paths get this prefix. */
  key?: string;
  /**
   * A keyed child — one per `key=<expr>` iteration of an embed
   * (`+Row#row(key=user.id …)`): the child is ONE element of `state[each]`,
   * the one named by the key segment of its message id (`row.<key>.…`). It
   * sees only that element, its store paths are rooted at `<each>.<key>`, and
   * messages it never sees don't reach it — the row knows nothing about the
   * other rows. `each` must be a single state key holding an id-keyed map.
   */
  each?: string;
  /**
   * The currently rendered keys of an `each` child, for tools that show one
   * node per instance (the debug agent's component tree): a page window
   * (`s => s.order`) while `each` holds the whole map. The function receives
   * the PARENT's state — the one whose `each` field holds the map. Absent =
   * every element of the map. The runtime never calls it: routing an
   * instance's messages needs only the map.
   */
  live?: (state: S) => readonly string[];
  /** Extra read-only fields merged into the child's state. */
  props?: (state: S) => Record<string, unknown>;
  /**
   * Display tag for the debug agent (overrides the component's own `tag`):
   * a stable name for a component that appears in the tree under several
   * keys, e.g. `tag: "user-form"` for an editor and a creator.
   */
  tag?: string;
}

/** Children by instance name: `children: Children<State> = { users: { ... } }`. */
export type Children<S = any> = Record<string, ChildSpec<S>>;

/**
 * Anything usable as a component: a function (`ComponentFn`), or an instance
 * of a class that extends {@link Component}. Plain objects are not accepted.
 */
export type ComponentLike<S = any> = ComponentFn<S> | Component<S>;

const NOT_HANDLERS = new Set(["view", "children", "routing", "dispatch"]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/* ------------------------------------------------------- component trace */

/**
 * Per-component message flow, reported by every child boundary
 * (`namespace`). Paths are dotted, as in `children` (`"users.editor"`);
 * message ids are relative to the path (`" setEmail"` at `users.editor`).
 */
export interface ComponentTrace {
  /** The component at `path` received `message`. */
  receive(path: string, message: Message): void;
  /** Everything the component's own handler and its subtree returned. */
  emit(path: string, message: Message, effects: Effect[]): void;
}

let trace: ComponentTrace | null = null;
/** Dotted path of the component being dispatched (threaded by `namespace`). */
let curPath = "";

/**
 * Observe which components receive which messages and what they emit —
 * the debug agent feeds this into the Apps tab (input/output per component).
 * One tracer at a time; pass `null` to stop.
 */
export const setComponentTrace = (t: ComponentTrace | null): void => {
  trace = t;
};

function lookup(obj: object, id: string): Handler | undefined {
  // `_helper` methods are private by convention (`#helper` is private in JS itself).
  if (NOT_HANDLERS.has(id) || id.startsWith("_") || id in Object.prototype)
    return undefined;
  const f = (obj as Record<string, unknown>)[id];
  return typeof f === "function" ? (f as Handler) : undefined;
}

const handlers = new WeakMap<Component, ComponentFn>();

/** Normalizes a component to the function form. */
export function toHandler<S = any>(c: ComponentLike<S>): ComponentFn<S> {
  if (typeof c === "function") {
    if (c.prototype instanceof Component) {
      throw new Error(
        `pavlus: ${c.name} is a class: pass an instance (new ${c.name}()), not the class`,
      );
    }
    return c;
  }
  if (!(c instanceof Component)) {
    const kind =
      Object.getPrototypeOf(c) === Object.prototype
        ? "a plain object (defineComponent is gone: write a class that extends Component)"
        : `an instance of ${Object.getPrototypeOf(c)?.constructor?.name ?? "an unknown class"}, which does not extend Component`;
    throw new Error(
      `pavlus: a component is a function or an instance of a class extending Component, got ${kind}`,
    );
  }
  let h = handlers.get(c);
  if (!h) handlers.set(c, (h = (m, st) => c.dispatch(m, st)));
  return h as ComponentFn<S>;
}

export interface ViewOfOptions<S = any, C = any> {
  /**
   * State key of the component: the view renders `state[key]` and its
   * messages are prefixed `key.` — the same slicing a `children` entry does,
   * for a component mounted on its own (into a slot of its parent's view).
   */
  key?: string;
  /** Alternative to `key` for choosing the component's state. */
  select?: (state: S) => C;
  /** Extra read-only fields merged into the component's state. */
  props?: (state: S) => Record<string, unknown>;
  /**
   * Message id prefix baked into the view's events (a trailing dot is part
   * of it: `"edit."`). Defaults to `key + "."` when `key` is given.
   */
  ns?: string;
}

/**
 * A `View` to mount: the view itself, or the template of a component closed
 * over the component, so `+outlet` and the embedded children find `routing`
 * and `children` without the DOM plugin knowing what a component is.
 *
 * With {@link ViewOfOptions} the view is a standalone mini-application: it
 * reads its slice of the whole state and addresses its messages through the
 * prefix, so an event dispatched at the root lands on the component the same
 * way it would through `children` — and the patches its `diff` computes come
 * out addressed to it (`handler` patches carry the prefixed message ids).
 */
/**
 * The last merge of a props function, so the same base and field values
 * re-merge to the same object: states repeat references down the chain (the
 * `next` of one message is the `prev` of the next), so a child's diff can stop
 * at `prev === next` instead of walking its guards. Keyed by the function:
 * a stable member of a `children` table. The merge must stay pure — the
 * child only reads it.
 */
const propMerges = new WeakMap<
  object,
  { base: unknown; extra: Record<string, unknown>; out: unknown }
>();

const sameFields = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  );
};

/** `base` with `extra` merged in, memoized by `props` (see {@link propMerges}). */
function mergeProps(
  props: object,
  base: unknown,
  extra: Record<string, unknown>,
): unknown {
  const last = propMerges.get(props);
  if (last && last.base === base && sameFields(last.extra, extra))
    return last.out;
  const out =
    typeof base === "object" && base !== null
      ? { ...base, ...extra }
      : { ...extra };
  propMerges.set(props, { base, extra, out });
  return out;
}

export function viewOf<S = any, C = any>(
  c: View | { view?: View } | ComponentFn,
  opts: ViewOfOptions<S, C> = {},
): View | undefined {
  const view = "render" in c ? c : (c as { view?: View }).view;
  if (!view) {
    // A direct view (src/direct) given directly: no render/diff, its `create`
    // is a function. A component member named `create` (a child, a handler)
    // must not be mistaken for one.
    if (typeof (c as { create?: unknown }).create === "function")
      return c as unknown as View;
    return undefined;
  }
  if (typeof (view as { create?: unknown }).create === "function") {
    // A direct view closed over the component: the owner rides in `env.o`.
    const direct = view as unknown as {
      create(env: object, state: unknown): unknown;
    };
    return {
      ...direct,
      create: (env: object, state: unknown) =>
        direct.create({ ...env, o: c }, state),
    } as unknown as View;
  }
  const plain =
    opts.key === undefined &&
    opts.select === undefined &&
    opts.props === undefined &&
    opts.ns === undefined;
  if (plain) {
    if ("render" in c) return c;
    return {
      ...view,
      render: (state, sfx = "", ns = "") => view.render(state, sfx, ns, c),
      diff: (prev, next, sfx = "", ns = "") =>
        view.diff(prev, next, sfx, ns, c),
    };
  }
  const key = opts.key;
  const pick =
    opts.select ??
    (key !== undefined ? (s: S) => (s as any)?.[key] : (s: S) => s);
  const ns = opts.ns ?? (key !== undefined ? `${key}.` : "");
  const slice = (s: S): C => {
    const base = pick(s);
    if (!opts.props) return base as C;
    return mergeProps(opts.props, base, opts.props(s)) as C;
  };
  return {
    ...view,
    render: (state, sfx = "", _ns = "", _env) =>
      view.render(slice(state), sfx, ns, c),
    diff: (prev, next, sfx = "", _ns = "", _env) =>
      view.diff(slice(prev), slice(next), sfx, ns, c),
  };
}

function childHandler(
  name: string,
  spec: ChildSpec,
  state: unknown,
  scope?: string,
): ComponentFn | null {
  const comp = spec.select ? spec.select(state) : spec.component;
  if (!comp) return null;
  return namespace(name, comp, {
    key: spec.key,
    each: spec.each,
    props: spec.props,
    scope,
  });
}

/** `base` + a path relative to it (`"/dashboard"` + `"/roles"`). */
function joinPath(base: string, url: string): string {
  return base + (url === "/" ? "" : url) || "/";
}

/**
 * A routed child: a child whose state also gets `route` and whose
 * `router.navigate` effects are made relative to its base.
 */
function routedHandler(
  name: string,
  pattern: string,
  spec: RouteSpec,
  state: unknown,
  outletScope?: string,
): ComponentFn | null {
  const comp = routeComponent(spec, state);
  if (!comp) return null;
  const parentRoute = asRoute((state as { route?: unknown })?.route);
  const match = parentRoute ? matchPattern(pattern, parentRoute) : null;
  const childRoute = match?.route ?? null;
  // When the child is not active (a late reply), its base is the pattern.
  const base = childRoute
    ? childRoute.base
    : `${parentRoute?.base ?? ""}${pattern === "*" || pattern === "/" ? "" : pattern}`;
  const inner = namespace(name, comp, {
    key: spec.key,
    // The same merge the outlet renders (`routedState`), derived from the
    // state it slices: one memo, so the child's own paint and the outlet's
    // diff see the very same object and `prev === next` can prune them.
    select: (s) => {
      const r = asRoute((s as { route?: unknown })?.route);
      return routedState(
        spec,
        s,
        r ? (matchPattern(pattern, r)?.route ?? null) : null,
      );
    },
    scope: outletScope,
  });
  // `base` already holds every ancestor, so only the innermost routed child
  // prefixes; it marks the effect `absolute` so the levels above leave it be.
  return (m, s) =>
    inner(m, s).map((e) =>
      e.plugin === "router" &&
      e.type === "navigate" &&
      !e.absolute &&
      typeof e.url === "string"
        ? { ...e, url: joinPath(base, e.url), absolute: true }
        : e,
    );
}

interface ChainLink {
  /** Instance names from the top: `["dashboard", "users"]`. */
  names: string[];
  component: unknown;
  state: unknown;
  route: Route;
}

/** The routed children active for `state`, from the top down to the leaf. */
function chain(component: unknown, state: unknown): ChainLink[] {
  const links: ChainLink[] = [];
  let names: string[] = [];
  let comp = component;
  let st = state;
  while (isObject(comp) && isObject(comp.routing)) {
    const route = asRoute((st as { route?: unknown })?.route);
    if (!route) break;
    const match = matchRoute(comp.routing as Routing, route);
    if (!match) break;
    const child = routeComponent(match.spec, st);
    const childState = routedState(match.spec, st, match.route);
    names = [...names, match.name];
    links.push({
      names,
      component: child,
      state: childState,
      route: match.route,
    });
    comp = child;
    st = childState;
  }
  return links;
}

/** Same page position (search and hash changes do not re-enter a page). */
const samePlace = (a: Route, b: Route): boolean =>
  a.path === b.path &&
  a.base === b.base &&
  JSON.stringify(a.params) === JSON.stringify(b.params);

/**
 * `leave` and `enter` effects for a route change, computed against the
 * whole tree: from the first level whose active child differs, the old
 * children leave (deepest first) and the new ones enter (top down). When the
 * same children stay active, the leaf re-enters if its own route changed.
 */
function transitions(
  handler: ComponentFn,
  component: unknown,
  prevState: unknown,
  nextState: unknown,
): Effect[] {
  const before = chain(component, prevState);
  const after = chain(component, nextState);
  const effects: Effect[] = [];
  let level = 0;
  while (
    level < before.length &&
    level < after.length &&
    before[level].names.at(-1) === after[level].names.at(-1)
  ) {
    level++;
  }
  for (let i = before.length - 1; i >= level; i--) {
    const link = before[i];
    effects.push(
      ...handler(
        { id: `${link.names.join(".")}.leave`, payload: link.route },
        prevState,
      ),
    );
  }
  for (let i = level; i < after.length; i++) {
    const link = after[i];
    effects.push(
      ...handler(
        { id: `${link.names.join(".")}.enter`, payload: link.route },
        nextState,
      ),
    );
  }
  if (level > 0 && level === before.length && level === after.length) {
    const leaf = after[level - 1];
    if (!samePlace(leaf.route, before[level - 1].route)) {
      effects.push(
        ...handler(
          { id: `${leaf.names.join(".")}.enter`, payload: leaf.route },
          nextState,
        ),
      );
    }
  }
  return effects;
}

/** What a component knows about its children; worked out once per instance. */
interface Plan {
  children: Children;
  routed: Map<string, { pattern: string; spec: RouteSpec }>;
}

const plans = new WeakMap<Component, Plan>();

function planOf(component: Component): Plan {
  let plan = plans.get(component);
  if (plan) return plan;
  const children = component.children ?? {};
  const routed = new Map<string, { pattern: string; spec: RouteSpec }>();
  for (const [pattern, spec] of Object.entries(component.routing ?? {})) {
    const name = routeName(pattern, spec);
    if (routed.has(name) || Object.hasOwn(children, name)) {
      throw new Error(
        `pavlus: two children named "${name}" (routing "${pattern}"); give one a \`name\``,
      );
    }
    routed.set(name, { pattern, spec });
  }
  plans.set(component, (plan = { children, routed }));
  return plan;
}

/**
 * The base class of every component. A subclass is a component: each method
 * is the handler of the message with that name, `view` is its template,
 * `children` and `routing` declare what it embeds.
 *
 * ```ts
 * class Dashboard extends Component<DashboardState> {
 *   view = view;
 *   children: Children<DashboardState> = {
 *     users: { component: users, key: "users" },
 *   };
 *   enter(_msg: Message, _state: DashboardState, { send }: ComponentCtx) {
 *     return send("users", "load");
 *   }
 * }
 * export const dashboard = new Dashboard();
 * ```
 *
 * Names that are never messages: `view`, `children`, `routing`, `dispatch`,
 * anything starting with `_`, `#private` members and what every object has.
 * The instance is shared by every message, so keep it free of mutable state.
 *
 * Messages nobody handles get a default, so the usual wiring needs no code:
 * - `navigate` (also `x.navigate` from an embedded template or a view-only
 *   page) with a url as payload becomes `router.navigate(url)`, relative to
 *   this component;
 * - for a component with `routing`: `mounted` becomes
 *   `router.listen("routeChanged")` and `routeChanged` calls `ctx.setRoute`.
 * A handler with the same name replaces the default.
 */
export abstract class Component<S = any> {
  /** The component's template. */
  declare view?: View;
  /**
   * For a view that cannot compute patches of its own (a direct view, built
   * by `create` instead of `render`/`diff`): the plugin repaints the mount on
   * every state change instead of applying the component's paint effects.
   */
  declare updateDomOnStateChange?: boolean;
  /**
   * Display tag for the debug agent: a stable name for this component kind,
   * shown and grouped in the panel's Apps tab (`"user-form"`).
   */
  declare tag?: string;
  /**
   * Children by instance name. Messages `"<name>.x"` are routed to the child
   * as `"x"`; the instance name is the one used in the template (`+Child#name`).
   */
  declare children?: Children<S>;
  /**
   * Children by path pattern; `+outlet` in the template renders the one the
   * route matches. See `docs/routing.md`.
   */
  declare routing?: Routing<S>;

  /**
   * Handles one message: the component's own handler for `message.id` first
   * (so a parent can observe `users.loaded`), then the child the id is
   * addressed to.
   */
  dispatch(message: Message, state: S): Effect[] {
    // The root has no `namespace` wrapper above it, so it reports itself;
    // children are reported by the wrapper (curPath is set there).
    const root = trace !== null && curPath === "";
    if (root) trace!.receive("", message);
    const { children, routed } = planOf(this);
    // Where the embedded children of this component's template render: the
    // `"/nid"` of each `+Child#name`, and of `+outlet` for the routed ones.
    // Passed to the child boundaries, so a child that paints itself has its
    // patches scoped without knowing anything about this template.
    const embeds = this.view?.meta?.embeds ?? {};
    const outlet = this.view?.meta?.outlet;
    const outletScope =
      outlet === false || outlet === undefined ? undefined : `/${outlet}`;
    const known = (name: string): boolean =>
      Object.hasOwn(children, name) || routed.has(name);
    const childOf = (name: string): ComponentFn | null => {
      if (Object.hasOwn(children, name))
        return childHandler(name, children[name], state, embeds[name]);
      const r = routed.get(name);
      return r
        ? routedHandler(name, r.pattern, r.spec, state, outletScope)
        : null;
    };

    const ctx: ComponentCtx = {
      send: (child, id, payload) => {
        if (!known(child))
          throw new Error(`pavlus: no child "${child}" to send "${id}" to`);
        return childOf(child)?.({ id: `${child}.${id}`, payload }, state) ?? [];
      },
      setRoute: (location) => {
        const route: Route = {
          ...(asRoute(location) ?? { path: "/", search: "", hash: "" }),
          base: "",
          params: {},
        };
        // The location did not change (the logo while at "/"): the state
        // already holds this very route, so there is nothing to write, paint
        // or re-enter — not even a history entry.
        const cur = isObject(state)
          ? asRoute((state as { route?: unknown }).route)
          : null;
        if (sameRoute(cur, route)) return [];
        const next = { ...(isObject(state) ? state : {}), route };
        return [
          storeEffector.set("route", route),
          ...transitions((m, st) => this.dispatch(m, st), this, state, next),
        ];
      },
    };

    const effects: Effect[] = [];
    const own = lookup(this, message.id);
    if (own) {
      const out = own.call(this, message, state, ctx);
      if (!Array.isArray(out)) {
        throw new Error(
          `pavlus: handler "${message.id}" must return an array of effects`,
        );
      }
      effects.push(...out);
    }
    const dot = message.id.indexOf(".");
    const name = dot > 0 ? message.id.slice(0, dot) : "";
    const child = name && known(name) ? childOf(name) : null;
    if (child) effects.push(...child(message, state));
    if (!own && !child) effects.push(...this.#defaults(message, ctx));
    if (root) trace!.emit("", message, effects);
    return effects;
  }

  /** What a message nobody handles does (see the class doc). */
  #defaults(message: Message, ctx: ComponentCtx): Effect[] {
    const { id, payload } = message;
    const tail = id.slice(id.lastIndexOf(".") + 1);
    if (tail === "navigate" && typeof payload === "string") {
      return [routerEffector.navigate(payload)];
    }
    if (this.routing) {
      if (id === "mounted") return [routerEffector.listen("routeChanged")];
      if (id === "routeChanged") return ctx.setRoute(payload);
    }
    return [];
  }
}

/** Runs all components on the same message, concatenating their effects. */
export function compose<S>(...components: ComponentLike<S>[]): ComponentFn<S> {
  const hs = components.map(toHandler);
  return (m, s) => hs.flatMap((c) => c(m, s));
}

/**
 * Wraps `inner` so its input message can be changed (add data, rewrite id or
 * payload). Return `null` to drop the message.
 */
export function mapMessage<S>(
  inner: ComponentLike<S>,
  f: (message: Message, state: S) => Message | null,
): ComponentFn<S> {
  const h = toHandler(inner);
  return (m, s) => {
    const next = f(m, s);
    return next === null ? [] : h(next, s);
  };
}

/** Wraps `inner` so its output can be filtered, transformed or extended. */
export function mapEffects<S>(
  inner: ComponentLike<S>,
  f: (effects: Effect[], message: Message, state: S) => Effect[],
): ComponentFn<S> {
  const h = toHandler(inner);
  return (m, s) => f(h(m, s), m, s);
}

/**
 * Makes every store write of `inner` (and of everything embedded in it)
 * answer "paint": the component's `paint` handler — which a component with
 * a view usually has — turns the answer's `{ prev, next }` into patches.
 * The one-liner for a root that repaints the whole tree on any write; a
 * component that wants finer control answers "paint" write by write.
 */
export function paintOnWrite<S>(inner: ComponentLike<S>): ComponentFn<S> {
  const view = viewOf(inner);
  const h = mapEffects(inner, (effects) =>
    effects.map((e) =>
      e.plugin === "store" &&
      (e as { onSuccess?: string }).onSuccess === undefined
        ? { ...e, onSuccess: "paint" }
        : e,
    ),
  );
  // Keep the view (bound to the real component, so `+outlet` still finds its
  // `routing`): a wrapped root can still be mounted.
  return view === undefined ? h : Object.assign(h, { view });
}

/** Fields of an effect that name the message id of a reply. */
const REPLY_FIELDS = [
  "replyTo",
  "onSuccess",
  "onError",
  "onOpen",
  "onMessage",
  "onClose",
  "onChange",
];

export interface NamespaceOptions<S, C> {
  /**
   * State key of the child. When set, the child sees `state[key]` and its
   * store effects are rooted at `key`.
   */
  key?: string;
  /** Alternative to `key` for choosing the child's state. */
  select?: (state: S) => C;
  /**
   * A keyed child: it is ONE element of `state[each]`, picked by the key
   * segment of its message id (`row.<key>.…`). Its state is
   * `state[each][key]`, its store paths are rooted at `<each>.<key>`, and a
   * message for a key that has no element yet is dropped. Mutually exclusive
   * with `key` and `select`.
   */
  each?: string;
  /** Extra read-only fields merged into the child's state. */
  props?: (state: S) => Record<string, unknown>;
  /**
   * The node id scope of the embed this child renders through (the
   * `"/nid"` of its `+Child#name` node). Effects of a child that paints
   * itself (`dom.update` without a target) get their node ids scoped to it,
   * and the `paint` answers it receives are sliced like its state.
   */
  scope?: string;
}

/**
 * Mounts a child under a message prefix. Only messages `"<prefix>.x"` reach
 * the child (as `"x"`), and the reply ids in its effects get the prefix back,
 * so answers find their way to the right child.
 *
 * The boundary also enriches what passes through, so the child only knows its
 * own environment: store paths get the state key in front, and the patches of
 * a `dom.update` without a target (a child that paints itself) get scoped to
 * the embed (`scope`). A `paint` answer — `{ prev, next }` of the whole state
 * — arrives already sliced to the child's state, ready for its own `diff`.
 */
export function namespace<S = any, C = any>(
  prefix: string,
  child: ComponentLike<C>,
  opts: NamespaceOptions<S, C> = {},
): ComponentFn<S> {
  const h = toHandler(child);
  const key = opts.key;
  const each = opts.each;
  if (each !== undefined && (key !== undefined || opts.select !== undefined))
    throw new Error(
      `pavlus: namespace("${prefix}"): each cannot be combined with key or select`,
    );
  const slice =
    opts.select ??
    (key !== undefined
      ? (s: S) => (s as any)?.[key]
      : (s: S) => s as unknown as C);
  const pick = (s: S): C => {
    const base = slice(s);
    if (!opts.props) return base;
    return mergeProps(opts.props, base, opts.props(s)) as C;
  };
  // keyed: the child's state is the one element of `state[each]` its
  // message key names — the lens every boundary composes level by level
  const at = (s: S, k: string): C => {
    const base = (s as any)?.[each as string]?.[k];
    if (!opts.props) return base;
    return mergeProps(opts.props, base, opts.props(s)) as C;
  };
  const head = `${prefix}.`;
  return (m, s) => {
    if (!m.id.startsWith(head)) return [];
    let rest = m.id.slice(head.length);
    let k: string | null = null;
    let childState: C;
    if (each !== undefined) {
      const dot = rest.indexOf(".");
      if (dot <= 0) return []; // "row." (no key) or "row.7" (a bare key)
      k = rest.slice(0, dot);
      rest = rest.slice(dot + 1);
      childState = at(s, k);
      // no element for that key (removed, or not there yet): its messages
      // are ignored, exactly like a `select` child that is `null`
      if (childState === undefined || childState === null) return [];
    } else childState = pick(s);
    const khead = k === null ? head : `${head}${k}.`;
    const path =
      k === null
        ? curPath
          ? `${curPath}.${prefix}`
          : prefix
        : curPath
          ? `${curPath}.${prefix}.${k}`
          : `${prefix}.${k}`;
    // A paint answer carries the states of the whole app; the child's diff
    // wants its own slice, exactly as it renders it. Every boundary slices
    // (a lens composed level by level), so the answer is right no matter how
    // deep the component that asked for it sits.
    const inner: Message = { ...m, id: rest };
    if (opts.scope !== undefined && isPaintPayload(m.payload)) {
      const { prev, next } = m.payload as { prev: S; next: S };
      inner.payload = {
        prev: k === null ? pick(prev) : at(prev, k),
        next: k === null ? pick(next) : at(next, k),
      };
    }
    const prev = curPath;
    curPath = path;
    try {
      trace?.receive(path, inner);
      const out = h(inner, childState).map((e) => {
        const out: Effect = { ...e };
        for (const f of REPLY_FIELDS) {
          if (typeof out[f] === "string") out[f] = khead + (out[f] as string);
        }
        if (
          out.plugin === "store" &&
          (key !== undefined || k !== null) &&
          "path" in out
        ) {
          const sp = out.path as string | readonly (string | number)[];
          if (k === null) {
            out.path =
              typeof sp === "string"
                ? sp
                  ? `${key}.${sp}`
                  : key
                : [key!, ...sp];
          } else {
            out.path =
              typeof sp === "string"
                ? `${each}.${k}${sp ? `.${sp}` : ""}`
                : [each!, k, ...sp];
          }
        }
        if (
          out.plugin === "dom" &&
          out.type === "update" &&
          out.target === undefined &&
          opts.scope !== undefined
        ) {
          // An embed inside a `for` renders once per iteration: its recorded
          // scope starts with "#", the slot of this instance's key (the loop
          // puts `"#<key>"` in front of everything it renders) — a keyed
          // child's own patches get it filled in here.
          const scope =
            k !== null && opts.scope.startsWith("#")
              ? `#${k}${opts.scope.slice(1)}`
              : opts.scope;
          out.patches = DomPlugin.scopePatches(out.patches as Patch[], {
            ids: scope,
            ns: khead,
          }) as unknown as typeof out.patches;
        }
        return out;
      });
      trace?.emit(path, inner, out);
      return out;
    } finally {
      curPath = prev;
    }
  };
}

/** A store write's answer: `{ prev, next }` of the states around the write. */
function isPaintPayload(p: unknown): boolean {
  const o = p as { prev?: unknown; next?: unknown };
  return typeof p === "object" && p !== null && "prev" in o && "next" in o;
}

/** Adds a log effect for every message the wrapped component handles. */
export function withLogging<S>(
  inner: ComponentLike<S>,
  label: string,
): ComponentFn<S> {
  return mapEffects(inner, (effects, m) => [
    loggerEffector.debug(`[${label}] ${m.id} -> ${effects.length} effect(s)`, {
      payload: m.payload,
      effects: effects.map((e) => `${e.plugin}.${e.type}`),
    }),
    ...effects,
  ]);
}
