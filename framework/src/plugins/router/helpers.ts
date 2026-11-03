import type { RouterEffect } from "./mod.ts";

type Of<T extends RouterEffect["type"]> = Extract<RouterEffect, { type: T }>;

/** Builders for router effects. */
export interface RouterEffector {
  /** Reports the location as message `onChange` now and on every change. */
  listen(onChange: string): Of<"listen">;
  /**
   * Goes to `url`; with `replace` the current history entry is replaced.
   * From a routed child, `url` is relative to the child's base unless
   * `absolute` is set.
   */
  navigate(
    url: string,
    options?: { replace?: boolean; absolute?: boolean },
  ): Of<"navigate">;
  back(): Of<"back">;
  forward(): Of<"forward">;
}

/**
 * ```ts
 * import { routerEffector as router } from "@service-laboratory/pavlus/plugins/router";
 *
 * return [router.listen("route.changed"), router.navigate("/users?page=2")];
 * ```
 */
export const routerEffector: RouterEffector = {
  listen: (onChange) => ({ plugin: "router", type: "listen", onChange }),
  navigate: (url, options = {}) => ({
    plugin: "router",
    type: "navigate",
    url,
    ...(options.replace !== undefined && { replace: options.replace }),
    ...(options.absolute !== undefined && { absolute: options.absolute }),
  }),
  back: () => ({ plugin: "router", type: "back" }),
  forward: () => ({ plugin: "router", type: "forward" }),
};
