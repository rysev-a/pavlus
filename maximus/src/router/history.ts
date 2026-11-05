/**
 * History drivers behind one interface. `memory` (tests, SSR), `browser`
 * (History API) and `hash` (`#/path`). A driver only reports **pops**
 * (back/forward/go and the user editing the URL); `push`/`replace` are
 * silent because the router already knows what it asked for.
 *
 * @module
 */

export interface HistoryLocation {
  /** Pathname, always starting with `/`. */
  path: string;
  /** Query string including the leading `?`, or `""`. */
  search: string;
  /** Fragment including the leading `#`, or `""`. */
  hash: string;
  /** State given to `push`/`replace`. */
  state: unknown;
  /** Identifies this entry (stable across reloads in browsers); scroll positions hang on it. */
  key: string;
}

export type PopListener = (location: HistoryLocation, delta: number) => void;

export interface History {
  readonly kind: "memory" | "browser" | "hash";
  location(): HistoryLocation;
  push(url: string, state?: unknown): void;
  replace(url: string, state?: unknown): void;
  go(delta: number): void;
  back(): void;
  forward(): void;
  /** Subscribe to pops. `delta` is the move relative to the previous entry (0 when unknown). */
  listen(listener: PopListener): () => void;
  /** What an `<a href>` for `url` should contain (`#/x` for hash history). */
  href(url: string): string;
  /** Detach DOM listeners. */
  destroy(): void;
}

/** Split `"/a/b?x=1#h"` into its three parts. Missing pieces are `""`; the path defaults to `/`. */
export function parseUrl(url: string): {
  path: string;
  search: string;
  hash: string;
} {
  let rest = url;
  let hash = "";
  const h = rest.indexOf("#");
  if (h >= 0) {
    hash = rest.slice(h);
    rest = rest.slice(0, h);
  }
  let search = "";
  const q = rest.indexOf("?");
  if (q >= 0) {
    search = rest.slice(q);
    rest = rest.slice(0, q);
  }
  if (search === "?") search = "";
  if (hash === "#") hash = "";
  if (!rest.startsWith("/")) rest = "/" + rest;
  return { path: rest, search, hash };
}

let keyCounter = 0;
const newKey = (): string =>
  `${Date.now().toString(36)}${(++keyCounter).toString(36)}`;

// ------------------------------------------------------------------ memory

/** In-memory stack. Pops (`back`/`forward`/`go`) notify listeners synchronously. */
export function createMemoryHistory(
  initial: readonly string[] = ["/"],
  index?: number,
): History {
  const entries: HistoryLocation[] = (initial.length ? initial : ["/"]).map(
    (u) => ({ ...parseUrl(u), state: undefined, key: newKey() }),
  );
  let at = Math.min(Math.max(index ?? entries.length - 1, 0), entries.length - 1);
  const listeners = new Set<PopListener>();
  const go = (delta: number): void => {
    const next = at + delta;
    if (delta === 0 || next < 0 || next >= entries.length) return;
    at = next;
    const loc = entries[at]!;
    for (const l of [...listeners]) l(loc, delta);
  };
  return {
    kind: "memory",
    location: () => entries[at]!,
    push(url, state) {
      entries.length = at + 1;
      entries.push({ ...parseUrl(url), state, key: newKey() });
      at++;
    },
    replace(url, state) {
      entries[at] = { ...parseUrl(url), state, key: entries[at]!.key };
    },
    go,
    back: () => go(-1),
    forward: () => go(1),
    listen(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    href: (url) => url,
    destroy() {
      listeners.clear();
    },
  };
}

// --------------------------------------------------- browser and hash share

interface Marker {
  key: string;
  idx: number;
}
interface Stored {
  __mx: Marker;
  state: unknown;
}

function readStored(raw: unknown): Stored | null {
  if (typeof raw === "object" && raw !== null && "__mx" in raw)
    return raw as Stored;
  return null;
}

function createDomHistory(
  kind: "browser" | "hash",
  win: Window,
): History {
  const hist = win.history;
  try {
    hist.scrollRestoration = "manual";
  } catch {
    /* not supported */
  }
  const read = (): string =>
    kind === "browser"
      ? win.location.pathname + win.location.search + win.location.hash
      : win.location.hash.slice(1) || "/";
  const makeHref = (url: string): string => (kind === "hash" ? "#" + url : url);

  let stored = readStored(hist.state);
  if (stored === null) {
    stored = { __mx: { key: newKey(), idx: 0 }, state: undefined };
    hist.replaceState(stored, "", makeHref(read()));
  }
  let idx = stored.__mx.idx;
  let lastUrl = read();
  const listeners = new Set<PopListener>();

  const location = (): HistoryLocation => {
    const s = readStored(hist.state);
    return {
      ...parseUrl(read()),
      state: s?.state,
      key: s?.__mx.key ?? "default",
    };
  };
  const onPop = (): void => {
    const url = read();
    const s = readStored(hist.state);
    const nextIdx = s?.__mx.idx ?? idx;
    // popstate and hashchange both fire for the same hash navigation: report once.
    if (url === lastUrl && nextIdx === idx) return;
    const delta = s === null ? 0 : nextIdx - idx;
    idx = nextIdx;
    lastUrl = url;
    const loc = location();
    for (const l of [...listeners]) l(loc, delta);
  };
  win.addEventListener("popstate", onPop);
  if (kind === "hash") win.addEventListener("hashchange", onPop);

  const write = (mode: "pushState" | "replaceState", url: string, state: unknown) => {
    const nextIdx = mode === "pushState" ? idx + 1 : idx;
    const key =
      mode === "pushState" ? newKey() : (readStored(hist.state)?.__mx.key ?? newKey());
    hist[mode]({ __mx: { key, idx: nextIdx }, state } satisfies Stored, "", makeHref(url));
    idx = nextIdx;
    lastUrl = read();
  };

  return {
    kind,
    location,
    push: (url, state) => write("pushState", url, state),
    replace: (url, state) => write("replaceState", url, state),
    go: (d) => hist.go(d),
    back: () => hist.back(),
    forward: () => hist.forward(),
    listen(l) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    href: makeHref,
    destroy() {
      win.removeEventListener("popstate", onPop);
      win.removeEventListener("hashchange", onPop);
      listeners.clear();
    },
  };
}

/** History API driver (`pushState`, `popstate`). */
export function createBrowserHistory(win: Window = window): History {
  return createDomHistory("browser", win);
}

/** `#/path?query` driver for static hosting. */
export function createHashHistory(win: Window = window): History {
  return createDomHistory("hash", win);
}
