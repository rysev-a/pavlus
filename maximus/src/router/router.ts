/**
 * `createRouter`: nested routes, guards, loaders, links, prefetch, view
 * transitions, scroll restoration, focus management and announcements.
 *
 * Navigation pipeline: resolve -> match -> (redirect) -> guards -> loaders ->
 * history write -> commit signals (inside a View Transition when possible) ->
 * title, announcement, focus, scroll. A newer navigation aborts the older one.
 * When no guard or loader is involved the whole pipeline runs synchronously.
 *
 * @module
 */
import {
  batch,
  computed,
  createContext,
  getOwner,
  onCleanup,
  signal,
  untrack,
} from "../core/mod.ts";
import { useServer } from "../ssr/context.ts";
import { html } from "../dom/mod.ts";
import type { Child } from "../dom/mod.ts";
import {
  createAnnouncer,
  focusContent,
  pageLabel,
  prefersReducedMotion,
  windowScroller,
} from "./a11y.ts";
import {
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
  parseUrl,
} from "./history.ts";
import type { History } from "./history.ts";
import { isExternal, shouldHandleClick } from "./link.ts";
import {
  buildPath,
  buildSearch,
  compilePattern,
  compareSegments,
  joinPatterns,
  matchSegments,
  parseQuery,
} from "./match.ts";
import type { Params, ParamsOf, Segment } from "./match.ts";
import type {
  AnyRoute,
  GuardContext,
  LinkOptions,
  LinkSpread,
  LoadContext,
  NavigateOptions,
  RouteDef,
  RouteLocation,
  RouteMatch,
  RouteProps,
  Router,
  RouterOptions,
  Scroller,
} from "./types.ts";

/** Throw from a loader to redirect: `throw redirect("/login")`. */
export class Redirect {
  readonly to: string;
  constructor(to: string) {
    this.to = to;
  }
}
export function redirect(to: string): Redirect {
  return new Redirect(to);
}

/** Identity helper that infers `params` from the path string. */
export function route<P extends string, D = unknown>(
  def: RouteDef<P, D> & { path: P },
): AnyRoute {
  return def;
}

interface Branch {
  pattern: string;
  segs: Segment[];
  chain: AnyRoute[];
  patterns: string[];
  names: string[][];
  order: number;
}

interface Matched {
  def: AnyRoute;
  pattern: string;
  names: string[];
  params: Params;
  data: unknown;
  fail: { e: unknown } | null;
}

interface Cur {
  path: string;
  search: string;
  hash: string;
  key: string;
  matches: Matched[];
  loc: RouteLocation;
}

interface Target {
  path: string;
  search: string;
  hash: string;
}

type Mode = "init" | "push" | "replace" | "pop";

interface StartOptions {
  state?: unknown;
  scroll?: boolean;
  force?: boolean;
  delta?: number;
  key?: string;
  redirects?: number;
}

const OutletDepth = createContext(0);
const MAX_REDIRECTS = 10;

function shallowEqual(a: Params | undefined, b: Params | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function normalizeBase(base: string | undefined): string {
  if (!base || base === "/") return "";
  let b = base.startsWith("/") ? base : "/" + base;
  while (b.endsWith("/")) b = b.slice(0, -1);
  return b;
}

function flatten(
  routes: readonly AnyRoute[],
  parent: string,
  chain: AnyRoute[],
  patterns: string[],
  out: Branch[],
  caseSensitive: boolean,
): void {
  for (const def of routes) {
    const pattern = joinPatterns(parent, def.path);
    const c = [...chain, def];
    const p = [...patterns, pattern];
    const hasChildren = (def.children?.length ?? 0) > 0;
    // A pathless layout does not match on its own; a layout with a path also matches exactly.
    if (!hasChildren || (def.path !== undefined && def.path !== "")) {
      const segs = compilePattern(pattern, caseSensitive);
      out.push({
        pattern,
        segs,
        chain: c,
        patterns: p,
        names: p.map((x) =>
          compilePattern(x, caseSensitive)
            .filter((s) => s.kind !== 5)
            .map((s) => s.value),
        ),
        order: out.length,
      });
    }
    if (hasChildren) flatten(def.children!, pattern, c, p, out, caseSensitive);
  }
}

export function createRouter(options: RouterOptions): Router {
  const base = normalizeBase(options.base);
  const policy = options.trailingSlash ?? "never";
  const caseSensitive = options.caseSensitive ?? false;
  const ttl = options.prefetchTtl ?? 30_000;
  const report =
    options.onError ??
    ((e: unknown) => {
      console.error(e);
    });

  const serverUrl = useServer()?.url;
  const hasWindow = typeof window !== "undefined" && serverUrl === undefined;
  const history: History =
    typeof options.history === "object"
      ? options.history
      : serverUrl !== undefined
        ? createMemoryHistory([serverUrl])
        : options.history === "memory" || !hasWindow
          ? createMemoryHistory()
          : options.history === "hash"
            ? createHashHistory()
            : createBrowserHistory();

  const scroller: Scroller | null =
    options.scroll === false
      ? null
      : typeof options.scroll === "object"
        ? options.scroll
        : hasWindow && history.kind !== "memory"
          ? windowScroller()
          : null;

  const branches: Branch[] = [];
  flatten(options.routes, "", [], [], branches, caseSensitive);
  branches.sort(
    (a, b) =>
      compareSegments(a.segs, b.segs) ||
      b.chain.length - a.chain.length ||
      a.order - b.order,
  );

  // ----------------------------------------------------------------- state
  const pathSig = signal("/");
  const searchSig = signal("");
  const hashSig = signal("");
  const querySig = signal(parseQuery(""));
  const matchesSig = signal<Matched[]>([]);
  const notFoundSig = signal(false);
  const navigating = signal(false);
  const publicMatches = computed<readonly RouteMatch[]>(() =>
    matchesSig().map((m) => ({
      pattern: m.pattern,
      params: m.params,
      data: m.data,
      meta: m.def.meta ?? {},
      error: m.fail?.e,
    })),
  );
  const paramsSig = computed<Params>(() => matchesSig().at(-1)?.params ?? {}, {
    equals: shallowEqual,
  });

  let cur: Cur | null = null;
  let navId = 0;
  let inflight: AbortController | null = null;
  let disposed = false;
  const positions = new Map<string, { x: number; y: number }>();
  const announcer = createAnnouncer();
  const prefetched = new Map<
    string,
    Map<
      AnyRoute,
      { at: number; promise: Promise<unknown>; ctrl: AbortController }
    >
  >();

  // ------------------------------------------------------------- url utils
  const canon = (path: string): string => {
    let p = path.replace(/\/{2,}/g, "/");
    if (!p.startsWith("/")) p = "/" + p;
    if (policy === "never" && p.length > 1 && p.endsWith("/"))
      p = p.replace(/\/+$/, "") || "/";
    else if (policy === "always" && !p.endsWith("/") && !/\.[^/]+$/.test(p))
      p += "/";
    return p;
  };
  const joinBase = (path: string): string =>
    base === ""
      ? path
      : path === "/"
        ? base + (policy === "always" ? "/" : "")
        : base + path;
  const fullUrl = (t: Target): string => joinBase(t.path) + t.search + t.hash;
  const fromHistory = (loc: {
    path: string;
    search: string;
    hash: string;
  }): Target => {
    let path = loc.path;
    if (base !== "") {
      if (path === base) path = "/";
      else if (path.startsWith(base + "/")) path = path.slice(base.length);
    }
    return { path, search: loc.search, hash: loc.hash };
  };
  const historyUrl = (): string => {
    const l = history.location();
    return l.path + l.search + l.hash;
  };

  const resolveTo = (to: string): Target => {
    if (isExternal(to))
      throw new TypeError(
        `Maximus router: "${to}" is an external URL; use a normal link or location.assign`,
      );
    const c = cur;
    if (to.startsWith("?")) return { path: c?.path ?? "/", ...splitSearch(to) };
    if (to.startsWith("#"))
      return {
        path: c?.path ?? "/",
        search: c?.search ?? "",
        hash: to === "#" ? "" : to,
      };
    const p = parseUrl(to);
    return { path: canon(p.path), search: p.search, hash: p.hash };
  };
  function splitSearch(s: string): { search: string; hash: string } {
    const p = parseUrl("/" + s);
    return { search: p.search, hash: p.hash };
  }

  const locationOf = (t: Target, params: Params): RouteLocation => ({
    path: t.path,
    search: t.search,
    query: parseQuery(t.search),
    hash: t.hash,
    params,
  });

  // -------------------------------------------------------------- matching
  const notFoundDef: AnyRoute | null = options.notFound
    ? { component: options.notFound as AnyRoute["component"] }
    : null;

  function matchPath(path: string): { branch: Branch; params: Params } | null {
    for (const b of branches) {
      const params = matchSegments(b.segs, path, caseSensitive);
      if (params !== null) return { branch: b, params };
    }
    return null;
  }

  function toMatched(b: Branch, params: Params): Matched[] {
    return b.chain.map((def, i) => ({
      def,
      pattern: b.patterns[i]!,
      names: b.names[i]!,
      params,
      data: undefined,
      fail: null,
    }));
  }

  // --------------------------------------------------------------- loaders
  const invokeLoad = (
    def: AnyRoute,
    loc: RouteLocation,
    signal: AbortSignal,
  ): Promise<unknown> => {
    try {
      const ctx: LoadContext = {
        params: loc.params,
        query: loc.query,
        location: loc,
        signal,
      };
      return Promise.resolve(def.load!(ctx));
    } catch (e) {
      return Promise.reject(e);
    }
  };

  const takePrefetched = (
    url: string,
    def: AnyRoute,
  ): Promise<unknown> | null => {
    const m = prefetched.get(url);
    const hit = m?.get(def);
    if (!m || !hit) return null;
    m.delete(def);
    if (m.size === 0) prefetched.delete(url);
    return Date.now() - hit.at <= ttl ? hit.promise : null;
  };

  // ------------------------------------------------------------ transitions
  const runTransition = (apply: () => void): void | Promise<void> => {
    const d = typeof document !== "undefined" ? document : null;
    const start = (
      d as unknown as {
        startViewTransition?: (cb: () => void) => {
          updateCallbackDone: Promise<void>;
        };
      } | null
    )?.startViewTransition;
    if (
      options.viewTransitions !== false &&
      d !== null &&
      typeof start === "function" &&
      !prefersReducedMotion()
    ) {
      const t = start.call(d, apply);
      return t.updateCallbackDone.catch(() => {});
    }
    apply();
  };

  // ------------------------------------------------------------ navigation
  function start(
    target: Target,
    mode: Mode,
    o: StartOptions = {},
  ): Promise<boolean> {
    const t: Target = { ...target, path: canon(target.path) };
    const c = cur;

    if (c !== null && mode !== "init") {
      const sameUrl =
        t.path === c.path && t.search === c.search && t.hash === c.hash;
      if (sameUrl && !o.force) {
        // Going "back to where we are" cancels a navigation that is still waiting.
        if (navigating.peek()) {
          navId++;
          inflight?.abort();
          navigating.set(false);
        }
        return Promise.resolve(true);
      }
      if (!sameUrl && t.path === c.path && t.search === c.search)
        return Promise.resolve(commitHashOnly(t, mode, o));
    }

    const id = ++navId;
    inflight?.abort();
    const ctrl = (inflight = new AbortController());
    const found = matchPath(t.path);

    // Redirect routes.
    if (found !== null) {
      for (const def of found.branch.chain) {
        if (def.redirect !== undefined) {
          const to =
            typeof def.redirect === "function"
              ? def.redirect(locationOf(t, found.params))
              : def.redirect;
          return redirectTo(to, mode, o);
        }
      }
    }

    const matched: Matched[] =
      found !== null
        ? toMatched(found.branch, found.params)
        : notFoundDef !== null
          ? [
              {
                def: notFoundDef,
                pattern: "*",
                names: [],
                params: {},
                data: undefined,
                fail: null,
              },
            ]
          : [];
    const params = found?.params ?? {};
    const to = locationOf(t, params);
    const from = c?.loc ?? null;

    const guards: Array<(ctx: GuardContext) => unknown> = [];
    if (options.guard) guards.push(options.guard);
    for (const m of matched) if (m.def.guard) guards.push(m.def.guard);
    const loaders = matched.filter((m) => m.def.load !== undefined);

    const finish = (): boolean | Promise<boolean> =>
      commit(t, mode, o, matched, found === null, id);

    if (guards.length === 0 && loaders.length === 0) {
      const r = finish();
      return r instanceof Promise ? r : Promise.resolve(r);
    }

    navigating.set(true);
    const run = async (): Promise<boolean> => {
      for (const g of guards) {
        const r = (await g({ to, from, signal: ctrl.signal })) as unknown;
        if (id !== navId) return false;
        if (r === false) return blocked(mode, o, id);
        if (typeof r === "string") return redirectTo(r, mode, o);
      }
      const url = t.path + t.search;
      const results = await Promise.all(
        loaders.map(async (m) => {
          const prev = c?.matches.find(
            (p) =>
              p.def === m.def &&
              p.fail === null &&
              c.search === t.search &&
              m.names.every((n) => p.params[n] === m.params[n]),
          );
          if (prev !== undefined && !o.force)
            return { v: prev.data, reused: true } as const;
          const pre = takePrefetched(url, m.def);
          try {
            return {
              v: await (pre ?? invokeLoad(m.def, to, ctrl.signal)),
            } as const;
          } catch (e) {
            return { e } as const;
          }
        }),
      );
      if (id !== navId) return false;
      for (let i = 0; i < loaders.length; i++) {
        const r = results[i]!;
        const m = loaders[i]!;
        if ("e" in r) {
          if (r.e instanceof Redirect) return redirectTo(r.e.to, mode, o);
          m.fail = { e: r.e };
        } else m.data = r.v;
      }
      return finish();
    };
    return run().finally(() => {
      if (id === navId) navigating.set(false);
    });
  }

  function redirectTo(
    to: string,
    mode: Mode,
    o: StartOptions,
  ): Promise<boolean> {
    const n = (o.redirects ?? 0) + 1;
    if (n > MAX_REDIRECTS)
      return Promise.reject(
        new Error(
          `Maximus router: more than ${MAX_REDIRECTS} redirects (last: "${to}")`,
        ),
      );
    let target: Target;
    try {
      target = resolveTo(to);
    } catch (e) {
      return Promise.reject(e);
    }
    // A redirect replaces the entry that would have been created; on pop it fixes the URL.
    return start(target, mode === "pop" || mode === "init" ? "replace" : mode, {
      ...o,
      redirects: n,
      force: true,
    });
  }

  function blocked(mode: Mode, o: StartOptions, id: number): boolean {
    if (id === navId) navigating.set(false);
    if (mode === "pop" && o.delta) history.go(-o.delta);
    return false;
  }

  function commitHashOnly(t: Target, mode: Mode, o: StartOptions): boolean {
    const c = cur!;
    if (mode === "push") history.push(fullUrl(t), o.state);
    else if (mode === "replace") history.replace(fullUrl(t), o.state);
    const key = history.location().key;
    batch(() => hashSig.set(t.hash));
    cur = { ...c, hash: t.hash, key, loc: { ...c.loc, hash: t.hash } };
    if (o.scroll !== false) scrollToHash(t.hash);
    return true;
  }

  function scrollToHash(hash: string): boolean {
    if (scroller === null || typeof document === "undefined") return false;
    if (!hash) return false;
    let id = hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep raw */
    }
    const el = document.getElementById(id);
    if (el === null) return false;
    scroller.scrollToElement(el);
    return true;
  }

  function commit(
    t: Target,
    mode: Mode,
    o: StartOptions,
    matched: Matched[],
    unmatched: boolean,
    id: number,
  ): boolean | Promise<boolean> {
    if (id !== navId || disposed) return false;
    const prev = cur;
    if (prev !== null && scroller !== null) {
      positions.set(prev.key, scroller.position());
      if (positions.size > 100)
        positions.delete(positions.keys().next().value!);
    }
    const url = fullUrl(t);
    if (mode === "push") history.push(url, o.state);
    else if (mode === "replace") history.replace(url, o.state);
    else if (historyUrl() !== url)
      history.replace(url, history.location().state);
    const key = o.key ?? history.location().key;
    const params = matched.at(-1)?.params ?? {};
    const next: Cur = {
      path: t.path,
      search: t.search,
      hash: t.hash,
      key,
      matches: matched,
      loc: locationOf(t, params),
    };
    let applied = false;
    const apply = (): void => {
      if (id !== navId || applied) return;
      applied = true;
      cur = next;
      batch(() => {
        pathSig.set(t.path);
        searchSig.set(t.search);
        querySig.set(next.loc.query);
        hashSig.set(t.hash);
        matchesSig.set(matched);
        notFoundSig.set(unmatched);
        navigating.set(false);
      });
    };
    const after = (): boolean => {
      if (!applied) return false;
      afterCommit(prev, next, mode, o, matched);
      return true;
    };
    const r = runTransition(apply);
    if (r instanceof Promise) return r.then(after);
    return after();
  }

  function afterCommit(
    prev: Cur | null,
    next: Cur,
    mode: Mode,
    o: StartOptions,
    matched: Matched[],
  ): void {
    const pathChanged = prev === null || prev.path !== next.path;
    // Title (not while server rendering: there is no real document to write to).
    if (typeof document !== "undefined" && serverUrl === undefined) {
      for (let i = matched.length - 1; i >= 0; i--) {
        const m = matched[i]!;
        const title = m.def.title;
        if (title === undefined) continue;
        const text =
          typeof title === "function"
            ? title({
                params: next.loc.params as never,
                query: next.loc.query,
                data: m.data,
              })
            : title;
        document.title = options.titleTemplate
          ? options.titleTemplate(text)
          : text;
        break;
      }
    }
    if (mode !== "init" && pathChanged) {
      if (options.announce !== false && typeof document !== "undefined") {
        const title = pageLabel(next.path);
        const msg =
          typeof options.announce === "function"
            ? options.announce(title, next.loc)
            : title;
        if (msg) announcer.say(msg);
      }
      if (options.focus !== false) focusContent(options.focus ?? "auto");
    }
    if (scroller !== null && o.scroll !== false) {
      if (mode === "pop") {
        const p = positions.get(next.key);
        if (p !== undefined) scroller.scrollTo(p.x, p.y);
        else if (!scrollToHash(next.hash)) scroller.scrollTo(0, 0);
      } else if (!scrollToHash(next.hash) && pathChanged && mode !== "init") {
        scroller.scrollTo(0, 0);
      }
    }
  }

  // ------------------------------------------------------------------ public
  const stopListening = history.listen((loc, delta) => {
    if (disposed) return;
    start(fromHistory(loc), "pop", {
      delta,
      key: loc.key,
      state: loc.state,
    }).catch(report);
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    navId++;
    inflight?.abort();
    for (const m of prefetched.values())
      for (const e of m.values()) e.ctrl.abort();
    prefetched.clear();
    stopListening();
    announcer.destroy();
  };
  if (getOwner() !== null) onCleanup(dispose);

  const isActive = (path: string, exact = true): boolean => {
    const target = resolveTo(path).path.replace(/\/+$/, "") || "/";
    const here = pathSig().replace(/\/+$/, "") || "/";
    if (exact || target === "/") return here === target;
    return here === target || here.startsWith(target + "/");
  };

  const prefetch = (path: string): Promise<void> => {
    if (isExternal(path)) return Promise.resolve();
    const t = resolveTo(path);
    const found = matchPath(canon(t.path));
    if (found === null) return Promise.resolve();
    const url = canon(t.path) + t.search;
    const loc = locationOf({ ...t, path: canon(t.path) }, found.params);
    const bucket = prefetched.get(url) ?? new Map();
    prefetched.set(url, bucket);
    const pending: Promise<unknown>[] = [];
    for (const def of found.branch.chain) {
      if (def.load === undefined) continue;
      const hit = bucket.get(def);
      if (hit && Date.now() - hit.at <= ttl) {
        pending.push(hit.promise);
        continue;
      }
      const ctrl = new AbortController();
      const promise = invokeLoad(def, loc, ctrl.signal);
      promise.catch(() => {});
      bucket.set(def, { at: Date.now(), promise, ctrl });
      pending.push(promise);
    }
    if (prefetched.size > 50) {
      const oldest = prefetched.keys().next().value!;
      for (const e of prefetched.get(oldest)!.values()) e.ctrl.abort();
      prefetched.delete(oldest);
    }
    return Promise.allSettled(pending).then(() => undefined);
  };

  const levelComponent = (depth: number) => {
    const level = computed(() => matchesSig()[depth] ?? null, {
      equals: (a, b) =>
        a === b ||
        (a != null && b != null && a.def === b.def && a.fail === b.fail),
    });
    return level;
  };

  const router: Router = {
    path: pathSig,
    query: querySig,
    params: paramsSig,
    hash: hashSig,
    matches: publicMatches,
    notFound: notFoundSig,
    navigating,
    ready: Promise.resolve(),
    history,
    data<D = unknown>(): D | undefined {
      const ms = matchesSig();
      for (let i = ms.length - 1; i >= 0; i--)
        if (ms[i]!.def.load !== undefined) return ms[i]!.data as D;
      return undefined;
    },
    navigate(to, o = {}) {
      let target: Target;
      try {
        target = resolveTo(to);
      } catch (e) {
        return Promise.reject(e);
      }
      return start(target, o.replace ? "replace" : "push", o);
    },
    replace: (to, o) => router.navigate(to, { ...o, replace: true }),
    back: () => history.back(),
    forward: () => history.forward(),
    go: (d) => history.go(d),
    setQuery(patch, o) {
      const q: Record<string, unknown> = { ...untrack(querySig) };
      for (const k of Object.keys(patch)) {
        if (patch[k] == null) delete q[k];
        else q[k] = patch[k];
      }
      const c = cur;
      return router.navigate(
        (c?.path ?? "/") + buildSearch(q) + (c?.hash ?? ""),
        o,
      );
    },
    outlet(): Child {
      const depth = OutletDepth.use();
      const level = levelComponent(depth);
      return () => {
        const m = level();
        if (m === null) return null;
        return untrack(() =>
          OutletDepth.provide(depth + 1, () => renderLevel(m, depth)),
        );
      };
    },
    link(path, o = {}) {
      if (isExternal(path)) return { href: path };
      const href = router.href(path);
      const mode =
        o.prefetch === true || o.prefetch === undefined
          ? (options.prefetch ?? "hover")
          : o.prefetch === false
            ? "none"
            : o.prefetch;
      const exact = o.exact ?? true;
      const spread: LinkSpread = {
        href,
        "aria-current": () =>
          isActive(path, true)
            ? "page"
            : !exact && isActive(path, false)
              ? "true"
              : null,
        "@click": function (this: Element, e: Event) {
          if (!shouldHandleClick(e as MouseEvent, this)) return;
          e.preventDefault();
          router
            .navigate(path, {
              replace: o.replace,
              state: o.state,
              scroll: o.scroll,
            })
            .catch(report);
        },
      };
      if (mode === "hover") {
        const warm = (): void => void prefetch(path);
        spread["@pointerenter"] = warm;
        spread["@focus"] = warm;
      } else if (
        mode === "visible" &&
        typeof IntersectionObserver !== "undefined"
      ) {
        spread.ref = (el: Element) => {
          const io = new IntersectionObserver((entries) => {
            if (entries.some((x) => x.isIntersecting)) {
              void prefetch(path);
              io.disconnect();
            }
          });
          io.observe(el);
          onCleanup(() => io.disconnect());
        };
      }
      return spread;
    },
    a(path, content, attrs = {}, o) {
      const spread = { ...attrs, ...router.link(path, o) };
      return html`<a ${spread}>${content}</a>`;
    },
    isActive,
    href(path) {
      if (isExternal(path)) return path;
      return history.href(fullUrl(resolveTo(path)));
    },
    url<P extends string>(
      pattern: P,
      params: ParamsOf<P>,
      query?: Record<string, unknown>,
    ): string {
      return (
        buildPath(pattern, params as Record<string, unknown>) +
        (query ? buildSearch(query) : "")
      );
    },
    prefetch,
    announce: (m) => announcer.say(m),
    dispose,
  };

  function renderLevel(m: Matched, depth: number): Child {
    if (m.fail !== null) {
      if (m.def.error === undefined) throw m.fail.e;
      const retry = (): void => {
        const c = cur;
        if (c)
          void router
            .navigate(c.path + c.search + c.hash, {
              replace: true,
              force: true,
            })
            .catch(report);
      };
      return m.def.error(m.fail.e, retry);
    }
    if (m.def.component === undefined) return router.outlet();
    const levelMatch = computed(() => matchesSig()[depth], {
      equals: (a, b) => a === b,
    });
    const props: RouteProps = {
      params: computed(() => levelMatch()?.params ?? {}, {
        equals: shallowEqual,
      }) as never,
      query: querySig,
      data: computed(() => levelMatch()?.data),
      router,
    };
    return m.def.component(props);
  }

  // Initial navigation from the history's current location.
  const initial = history.location();
  const ready = start(fromHistory(initial), "init", { key: initial.key }).then(
    () => undefined,
  );
  ready.catch(report);
  (router as { ready: Promise<void> }).ready = ready;
  return router;
}
