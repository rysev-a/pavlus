import type { Plugin } from "../../core/types.ts";

export type RouterEffect =
  /** Starts reporting the location. Replies immediately and on every change. */
  | { plugin: "router"; type: "listen"; onChange: string }
  /**
   * Inside a routed child, `url` is relative to the child's base unless
   * `absolute` is set (see docs/routing.md).
   */
  | {
      plugin: "router";
      type: "navigate";
      url: string;
      replace?: boolean;
      absolute?: boolean;
    }
  | { plugin: "router"; type: "back" }
  | { plugin: "router"; type: "forward" };

export interface Location {
  path: string;
  search: string;
  hash: string;
}

export interface RouterOptions {
  /** Defaults to the global `window`. */
  window?: Window;
}

/** URL routing on top of the History API. */
export function createRouterPlugin(
  opts: RouterOptions = {},
): Plugin<RouterEffect, any> {
  const win = opts.window ?? globalThis.window;
  let stop: (() => void) | undefined;

  const where = (): Location => ({
    path: win.location.pathname,
    search: win.location.search,
    hash: win.location.hash,
  });

  return {
    name: "router",
    handle(effect, ctx) {
      switch (effect.type) {
        case "listen": {
          stop?.();
          const report = () =>
            ctx.dispatch({ id: effect.onChange, payload: where() });
          win.addEventListener("popstate", report);
          stop = () => win.removeEventListener("popstate", report);
          return report();
        }
        case "navigate":
          if (effect.replace) win.history.replaceState(null, "", effect.url);
          else win.history.pushState(null, "", effect.url);
          // pushState fires no event: report it ourselves
          return win.dispatchEvent(new PopStateEvent("popstate"));
        case "back":
          return win.history.back();
        case "forward":
          return win.history.forward();
      }
    },
    dispose() {
      stop?.();
    },
  };
}

export { routerEffector } from "./helpers.ts";
export type { RouterEffector } from "./helpers.ts";
