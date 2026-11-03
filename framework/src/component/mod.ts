import type { Effect, Message } from "../core/types.ts";
import { loggerEffector } from "../plugins/logger/helpers.ts";
import { routerEffector } from "../plugins/router/helpers.ts";
import { storeEffector } from "../plugins/store/helpers.ts";
import {
  asRoute,
  matchPattern,
  matchRoute,
  type Route,
  routeComponent,
  routedState,
  routeName,
  type RouteSpec,
  type Routing,
} from "../routing/mod.ts";
import type { View } from "../runtime/vnode.ts";

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
  /** Extra read-only fields merged into the child's state. */
  props?: (state: S) => Record<string, unknown>;
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

/**
 * A `View` to mount: the view itself, or the template of a component closed
 * over the component, so `+outlet` and the embedded children find `routing`
 * and `children` without the DOM plugin knowing what a component is.
 */
export function viewOf(c: View | { view?: View }): View | undefined {
  if ("render" in c) return c;
  const view = c.view;
  if (!view) return undefined;
  return {
    ...view,
    render: (state, sfx = "", ns = "") => view.render(state, sfx, ns, c),
    diff: (prev, next, sfx = "", ns = "") => view.diff(prev, next, sfx, ns, c),
  };
}

function childHandler(
  name: string,
  spec: ChildSpec,
  state: unknown,
): ComponentFn | null {
  const comp = spec.select ? spec.select(state) : spec.component;
  if (!comp) return null;
  return namespace(name, comp, { key: spec.key, props: spec.props });
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
    props: (s) => ({ ...(spec.props?.(s) ?? {}), route: childRoute }),
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

const sameRoute = (a: Route, b: Route): boolean =>
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
    if (!sameRoute(leaf.route, before[level - 1].route)) {
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
    const { children, routed } = planOf(this);
    const known = (name: string): boolean =>
      Object.hasOwn(children, name) || routed.has(name);
    const childOf = (name: string): ComponentFn | null => {
      if (Object.hasOwn(children, name))
        return childHandler(name, children[name], state);
      const r = routed.get(name);
      return r ? routedHandler(name, r.pattern, r.spec, state) : null;
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
  /** Extra read-only fields merged into the child's state. */
  props?: (state: S) => Record<string, unknown>;
}

/**
 * Mounts a child under a message prefix. Only messages `"<prefix>.x"` reach
 * the child (as `"x"`), and the reply ids in its effects get the prefix back,
 * so answers find their way to the right child.
 */
export function namespace<S = any, C = any>(
  prefix: string,
  child: ComponentLike<C>,
  opts: NamespaceOptions<S, C> = {},
): ComponentFn<S> {
  const h = toHandler(child);
  const key = opts.key;
  const slice =
    opts.select ??
    (key !== undefined
      ? (s: S) => (s as any)?.[key]
      : (s: S) => s as unknown as C);
  const head = `${prefix}.`;
  return (m, s) => {
    if (!m.id.startsWith(head)) return [];
    let childState = slice(s);
    if (opts.props) {
      const base =
        typeof childState === "object" && childState !== null ? childState : {};
      childState = { ...base, ...opts.props(s) } as C;
    }
    return h({ ...m, id: m.id.slice(head.length) }, childState).map((e) => {
      const out: Effect = { ...e };
      for (const f of REPLY_FIELDS) {
        if (typeof out[f] === "string") out[f] = head + (out[f] as string);
      }
      if (out.plugin === "store" && key !== undefined && "path" in out) {
        const path = out.path as string | readonly (string | number)[];
        out.path =
          typeof path === "string"
            ? path
              ? `${key}.${path}`
              : key
            : [key, ...path];
      }
      return out;
    });
  };
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
