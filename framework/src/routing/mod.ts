/**
 * Declarative routing: a `routing` table on a component maps path patterns
 * to children; `+outlet` in its template renders the one the route matches.
 *
 * Everything here is pure and shared by the component layer (messages,
 * `enter`/`leave`, relative navigation) and the compiled templates
 * (`resolveOutlet`, `childEnv`).
 *
 * @module
 */
import type { ChildSpec, ComponentLike } from "../component/mod.ts";
import type { View } from "../runtime/vnode.ts";

/** What a routed child sees as `route` in its state. */
export interface Route {
  /** The part of the path below this child's base (`"/"` when exactly at it). */
  path: string;
  /** The path above: `""` at the top, `"/dashboard"` for its children... */
  base: string;
  /** `:param` captures of this level and all levels above. */
  params: Record<string, string>;
  search: string;
  hash: string;
}

/** A `routing` entry: a child, plus optionally a bare view and a name. */
export interface RouteSpec<S = any> extends ChildSpec<S> {
  /** The template of a page without logic (instead of `component`). */
  view?: View;
  /** Instance name (message prefix). Defaults to {@link routeName}. */
  name?: string;
}

/** Path pattern (`"/"`, `"/users/:id"`, `"*"`) to the child it shows. */
export type Routing<S = any> = Record<string, RouteSpec<S>>;

/** A component that has a `routing` table (object or class instance). */
export interface Routed {
  routing?: Routing;
  children?: Record<string, ChildSpec>;
}

const segments = (path: string): string[] => path.split("/").filter(Boolean);

/**
 * The instance name of a routing entry: `spec.name`, or the last static
 * segment of the pattern (`"/users/:id"` → `users`), `index` for `"/"`,
 * `fallback` for `"*"`.
 */
export function routeName(pattern: string, spec: RouteSpec): string {
  if (spec.name) return spec.name;
  if (pattern === "*") return "fallback";
  const statics = segments(pattern).filter((s) => !s.startsWith(":"));
  const last = statics[statics.length - 1] ?? segments(pattern).pop()?.slice(1);
  return last ? last.replace(/[^\w$]/g, "_") : "index";
}

/** A top-level location (from the router plugin) as a {@link Route}. */
export function asRoute(location: unknown): Route | null {
  if (!location || typeof location !== "object") return null;
  const l = location as Partial<Route>;
  return {
    path: l.path ?? "/",
    base: l.base ?? "",
    params: l.params ?? {},
    search: l.search ?? "",
    hash: l.hash ?? "",
  };
}

export interface PatternMatch {
  /** Captures of this pattern. */
  params: Record<string, string>;
  /** The route below the pattern. */
  route: Route;
}

/**
 * Matches one pattern against a route. A pattern matches the path exactly or
 * as a prefix at a `/` boundary; `"/"` matches only exactly; `"*"` matches
 * anything. `:name` segments capture.
 */
export function matchPattern(
  pattern: string,
  route: Route,
): PatternMatch | null {
  const path = segments(route.path);
  if (pattern === "*") {
    return { params: {}, route: { ...route, params: { ...route.params } } };
  }
  const want = segments(pattern);
  if (want.length === 0) {
    return path.length === 0 ? { params: {}, route: { ...route } } : null;
  }
  if (path.length < want.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(":"))
      params[want[i].slice(1)] = decodeURIComponent(path[i]);
    else if (want[i] !== path[i]) return null;
  }
  const rest = path.slice(want.length);
  return {
    params,
    route: {
      path: rest.length ? `/${rest.join("/")}` : "/",
      base: `${route.base}/${path.slice(0, want.length).join("/")}`,
      params: { ...route.params, ...params },
      search: route.search,
      hash: route.hash,
    },
  };
}

export interface RouteMatch {
  pattern: string;
  name: string;
  spec: RouteSpec;
  /** The route the matched child receives. */
  route: Route;
}

/**
 * The entry of `routing` that matches `route`: the longest matching pattern
 * wins (then declaration order); `"*"` only when nothing else matches.
 */
export function matchRoute(routing: Routing, route: Route): RouteMatch | null {
  let best: RouteMatch | null = null;
  let bestLength = -1;
  for (const [pattern, spec] of Object.entries(routing)) {
    if (pattern === "*") continue;
    const m = matchPattern(pattern, route);
    const length = segments(pattern).length;
    if (m && length > bestLength) {
      best = { pattern, name: routeName(pattern, spec), spec, route: m.route };
      bestLength = length;
    }
  }
  if (!best && routing["*"]) {
    const m = matchPattern("*", route)!;
    best = {
      pattern: "*",
      name: routeName("*", routing["*"]),
      spec: routing["*"],
      route: m.route,
    };
  }
  return best;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function viewOf(c: unknown): View | undefined {
  if (!isObject(c)) return undefined;
  if (typeof c.render === "function") return c as unknown as View;
  return isObject(c.view) && typeof c.view.render === "function"
    ? (c.view as unknown as View)
    : undefined;
}

/** The component behind a routing entry, for the given parent state. */
export function routeComponent(
  spec: RouteSpec,
  state: unknown,
): ComponentLike | null | undefined {
  return spec.select ? spec.select(state) : spec.component;
}

/**
 * The state a routed child sees: its slice (`key`), the parent's `props`,
 * and its `route`. Shared by handlers and templates so both agree.
 *
 * The same state and route re-merge to the same object: states repeat
 * references down the chain (the `next` of one message is the `prev` of the
 * next), so a routed page's diff can stop at `prev === next` instead of
 * walking its guards. The merge must stay pure — the child only reads it.
 */
const merges = new WeakMap<
  RouteSpec,
  { state: unknown; route: Route | null; out: unknown }
>();

/** Routes equal by value: `matchPattern` builds a fresh one per call. */
export const sameRoute = (a: Route | null, b: Route | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.path === b.path &&
    a.base === b.base &&
    a.search === b.search &&
    a.hash === b.hash &&
    sameParams(a.params, b.params));

const sameParams = (
  a: Record<string, string>,
  b: Record<string, string>,
): boolean => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  );
};

export function routedState(
  spec: RouteSpec,
  state: unknown,
  route: Route | null,
): unknown {
  const last = merges.get(spec);
  if (last && last.state === state && sameRoute(last.route, route))
    return last.out;
  const slice =
    spec.key !== undefined
      ? (state as Record<string, unknown>)?.[spec.key]
      : state;
  const base = isObject(slice) ? slice : {};
  const out = { ...base, ...(spec.props?.(state) ?? {}), route };
  merges.set(spec, { state, route, out });
  return out;
}

export interface OutletMatch {
  name: string;
  view: View;
  /** The child's component, or `undefined` for a page that is only a view. */
  component: unknown;
  state: unknown;
}

/**
 * What `+outlet` renders for `state`: the routing entry of `env` (the
 * component owning the template) that matches `state.route`, with the view
 * and the state the child gets. `null` when there is no route or no match.
 */
export function resolveOutlet(
  env: unknown,
  state: unknown,
): OutletMatch | null {
  const routing = isObject(env) ? (env as Routed).routing : undefined;
  if (!routing) {
    throw new Error(
      "pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view",
    );
  }
  const route = asRoute((state as { route?: unknown })?.route);
  if (!route) return null;
  const match = matchRoute(routing, route);
  if (!match) return null;
  const component = routeComponent(match.spec, state);
  const view = match.spec.view ?? viewOf(component);
  if (!view) {
    throw new Error(
      `pavlus: routing entry "${match.pattern}" has neither a view nor a component with one`,
    );
  }
  return {
    name: match.name,
    view,
    component,
    state: routedState(match.spec, state, match.route),
  };
}

/**
 * The component of the child embedded as `name` (`+Child#name`), looked up in
 * `children` and in `routing`, so the child's own `+outlet` can resolve.
 */
export function childEnv(env: unknown, name: string, state: unknown): unknown {
  if (!isObject(env)) return undefined;
  const { children, routing } = env as Routed;
  const spec =
    children?.[name] ??
    Object.entries(routing ?? {}).find(
      ([p, s]) => routeName(p, s) === name,
    )?.[1];
  return spec ? routeComponent(spec, state) : undefined;
}
