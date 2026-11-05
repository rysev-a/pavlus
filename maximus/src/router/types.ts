import type { Accessor, ReadonlySignal } from "../core/mod.ts";
import type { Child } from "../dom/mod.ts";
import type { History } from "./history.ts";
import type { Params, ParamsOf, Query } from "./match.ts";

/** A resolved location as handed to guards, loaders and titles. */
export interface RouteLocation {
  /** Pathname without the base. */
  path: string;
  /** Query string with `?`, or `""`. */
  search: string;
  query: Query;
  /** Fragment with `#`, or `""`. */
  hash: string;
  params: Params;
}

export interface LoadContext<P extends string = string> {
  params: ParamsOf<P>;
  query: Query;
  location: RouteLocation;
  /** Aborted when the user navigates elsewhere before the loader finished. */
  signal: AbortSignal;
}

export interface GuardContext {
  to: RouteLocation;
  /** The location being left, `null` for the very first navigation. */
  from: RouteLocation | null;
  signal: AbortSignal;
}

/** `true`/`undefined` allow, `false` cancels, a string redirects to that path. */
export type GuardResult = boolean | string | void | undefined;

export interface RouteProps<P extends string = string, D = unknown> {
  params: Accessor<ParamsOf<P>>;
  query: Accessor<Query>;
  /** The result of this route's `load`. */
  data: Accessor<D | undefined>;
  router: Router;
}

export interface TitleContext<P extends string = string, D = unknown> {
  params: ParamsOf<P>;
  query: Query;
  data: D | undefined;
}

export interface RouteDef<P extends string = string, D = unknown> {
  /** Relative to the parent route. Omit for a pathless layout. */
  path?: P;
  component?: (props: RouteProps<P, D>) => Child;
  /** Nested routes, rendered by `router.outlet()` inside `component`. */
  children?: readonly AnyRoute[];
  /** Runs before the route renders (in parallel with sibling loaders). Abortable. */
  load?: (ctx: LoadContext<P>) => D | Promise<D>;
  guard?: (ctx: GuardContext) => GuardResult | Promise<GuardResult>;
  /** Redirect target (static, or computed from the location). */
  redirect?: string | ((to: RouteLocation) => string);
  /** Page title (announced to assistive tech after navigation). */
  title?: string | ((ctx: TitleContext<P, D>) => string);
  /** Rendered instead of `component` when `load` threw. Without it the error propagates to the nearest `errorBoundary`. */
  error?: (error: unknown, retry: () => void) => Child;
  meta?: Record<string, unknown>;
}

// Erased form stored in route tables (props are contravariant, so typed routes cannot be assigned to RouteDef<string> directly).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRoute = RouteDef<any, any>;

/** One level of the matched route chain. */
export interface RouteMatch {
  /** Full pattern of the matched route, e.g. `/users/:id`. */
  pattern: string;
  params: Params;
  data: unknown;
  meta: Record<string, unknown>;
  error: unknown;
}

export interface LinkOptions {
  replace?: boolean;
  state?: unknown;
  /** Prefetch loaders: on `hover` (also focus, default), when `visible`, or `none`. */
  prefetch?: "hover" | "visible" | "none" | boolean;
  /** Active only on an exact path match (default) or also for descendants. */
  exact?: boolean;
  scroll?: boolean;
}

export type LinkSpread = Record<string, unknown>;

export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
  /** Skip scroll handling for this navigation. */
  scroll?: boolean;
  /** Navigate even when the URL is the current one. */
  force?: boolean;
}

export interface Scroller {
  position(): { x: number; y: number };
  scrollTo(x: number, y: number): void;
  scrollToElement(el: Element): void;
}

export interface RouterOptions {
  routes: readonly AnyRoute[];
  /** Mount point of the app in the URL, e.g. `/app`. */
  base?: string;
  /** `memory` / `hash` / `browser`, or a custom {@link History}. Default: browser when a `window` exists, else memory. */
  history?: History | "memory" | "hash" | "browser";
  /** Normalisation of trailing slashes: `never` (default, redirects `/a/` to `/a`), `always`, or `ignore` (match both, keep as typed). */
  trailingSlash?: "never" | "always" | "ignore";
  caseSensitive?: boolean;
  /** Component for URLs that match nothing. */
  notFound?: (props: RouteProps) => Child;
  /** Runs before every route's own guard. */
  guard?: (ctx: GuardContext) => GuardResult | Promise<GuardResult>;
  /** Wrap route titles, e.g. `t => t + " | Site"`. */
  titleTemplate?: (title: string) => string;
  /** Announce the new page to assistive tech. `false` disables; a function builds the message from the title. Default: the title itself. */
  announce?: boolean | ((title: string, location: RouteLocation) => string);
  /** Focus after navigation: CSS selector, `"auto"` (`[data-router-focus]`, `main`, `h1`) or `false`. */
  focus?: string | "auto" | false;
  /** `false` disables scroll restoration; or supply your own scroller. */
  scroll?: boolean | Scroller;
  /** Use the View Transitions API when available and motion is not reduced. Default true. */
  viewTransitions?: boolean;
  /** Default link prefetch strategy. Default `hover`. */
  prefetch?: "hover" | "visible" | "none";
  /** Milliseconds a prefetched loader result stays usable. Default 30000. */
  prefetchTtl?: number;
  /** Receives errors from navigations started by links and history pops. Default `console.error`. */
  onError?: (error: unknown) => void;
}

export interface Router {
  /** Current pathname without the base. */
  path: ReadonlySignal<string>;
  /** Current query as an object (repeated keys become arrays). */
  query: ReadonlySignal<Query>;
  /** Merged params of the matched chain. */
  params: ReadonlySignal<Params>;
  /** Current fragment including `#`, or `""`. */
  hash: ReadonlySignal<string>;
  /** Result of the deepest matched route that has a `load`. */
  data<D = unknown>(): D | undefined;
  /** The matched chain, root first. */
  matches: ReadonlySignal<readonly RouteMatch[]>;
  /** True when nothing matched (and `notFound` is rendering, if given). */
  notFound: ReadonlySignal<boolean>;
  /** True while a navigation is waiting for guards or loaders. */
  navigating: ReadonlySignal<boolean>;
  /** Resolves when the initial navigation finished. */
  ready: Promise<void>;
  history: History;
  navigate(to: string, options?: NavigateOptions): Promise<boolean>;
  replace(
    to: string,
    options?: Omit<NavigateOptions, "replace">,
  ): Promise<boolean>;
  back(): void;
  forward(): void;
  go(delta: number): void;
  /** Merge `patch` into the query of the current page (`undefined`/`null` removes a key). */
  setQuery(
    patch: Record<string, unknown>,
    options?: NavigateOptions,
  ): Promise<boolean>;
  /** Renders the child route of the layout it is called in (call it synchronously while building the layout). */
  outlet(): Child;
  /** Spread onto an `<a>`: `html\`<a ${router.link("/x")}>x</a>\``. */
  link(path: string, options?: LinkOptions): LinkSpread;
  /** An `<a>` with client-side navigation. */
  a(
    path: string,
    content: Child,
    attrs?: Record<string, unknown>,
    options?: LinkOptions,
  ): Node;
  /** Reactive: is `path` the current page (or an ancestor, with `exact: false`)? */
  isActive(path: string, exact?: boolean): boolean;
  /** `href` string for a router path (base and driver applied). */
  href(path: string): string;
  /** Build a path from a pattern: `url("/users/:id", { id: 3 })`. */
  url<P extends string>(
    pattern: P,
    params: ParamsOf<P>,
    query?: Record<string, unknown>,
  ): string;
  /** Start the loaders of `path` ahead of time. */
  prefetch(path: string): Promise<void>;
  /** Announce `message` through the polite live region. */
  announce(message: string): void;
  dispose(): void;
}
