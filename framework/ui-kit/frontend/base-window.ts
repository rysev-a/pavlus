/**
 * The site lives under a base path on GitHub Pages (`/pavlus/`), but the
 * pages are routed as `/button`, `/tabs`... The router plugin takes a
 * `window` option, so main.ts gives it this view of the real window: the
 * location without the base, and `pushState` / `replaceState` with it put
 * back. The application never sees the base, only `root` (see app.ts) to
 * build real `href`s.
 */

/** `"/pavlus/"` → `"/pavlus"`, `"/"` → `""`. */
export const rootOf = (base: string): string => base.replace(/\/+$/, "");

/** `/pavlus/button` → `/button`; a path outside the base is left alone. */
export function stripBase(root: string, pathname: string): string {
  if (!root) return pathname;
  if (pathname === root) return "/";
  return pathname.startsWith(root + "/")
    ? pathname.slice(root.length)
    : pathname;
}

/** `/button?x=1` → `/pavlus/button?x=1`; `/` → `/pavlus/`. */
export function withBase(root: string, url: string): string {
  return url.startsWith("/") ? root + url : url;
}

export function windowAt(root: string, win: Window = window): Window {
  const location = {
    get pathname() {
      return stripBase(root, win.location.pathname);
    },
    get search() {
      return win.location.search;
    },
    get hash() {
      return win.location.hash;
    },
  };
  const history = {
    pushState: (state: unknown, title: string, url?: string | URL | null) =>
      win.history.pushState(
        state,
        title,
        typeof url === "string" ? withBase(root, url) : url,
      ),
    replaceState: (state: unknown, title: string, url?: string | URL | null) =>
      win.history.replaceState(
        state,
        title,
        typeof url === "string" ? withBase(root, url) : url,
      ),
    back: () => win.history.back(),
    forward: () => win.history.forward(),
  };
  return {
    location,
    history,
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
    dispatchEvent: win.dispatchEvent.bind(win),
  } as unknown as Window;
}
