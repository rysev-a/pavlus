import type { DomEffect } from "./mod.ts";

type Of<T extends DomEffect["type"]> = Extract<DomEffect, { type: T }>;

/** Builders for DOM effects. */
export interface DomEffector {
  /**
   * Renders `view` (a compiled template, or `viewOf(component)`) into
   * `target`. With `followState` the mount is re-diffed on every application
   * state change; without it, it renders once and the application repaints
   * it with `update` when it decides to. `onMounted` is the message sent
   * once it is in the DOM. The root of an application is mounted by
   * `createApp({ mount })` instead.
   */
  mount(
    target: string | Element,
    view: Of<"mount">["view"],
    options?: { onMounted?: string; followState?: boolean },
  ): Of<"mount">;
  /** Removes what was mounted into `target`, with all its listeners. */
  unmount(target: string | Element): Of<"unmount">;
  /**
   * Repaints by re-diffing the view against the current application state.
   * With `target`, that one mount (throws when nothing is mounted there);
   * without it, every mount.
   */
  update(target?: string | Element): Of<"update">;
  /** Focuses the first element matching `selector`. */
  focus(selector: string): Of<"focus">;
  /** Removes focus from the first element matching `selector`. */
  blur(selector: string): Of<"blur">;
}

/**
 * ```ts
 * import { domEffector as dom } from "@service-laboratory/pavlus/plugins/dom";
 *
 * return [dom.mount("#panel", panelView, { onMounted: "panelMounted" })];
 * ```
 */
export const domEffector: DomEffector = {
  mount: (target, view, options = {}) => ({
    plugin: "dom",
    type: "mount",
    target,
    view,
    ...(options.onMounted !== undefined && { onMounted: options.onMounted }),
    ...(options.followState === true && { followState: true }),
  }),
  unmount: (target) => ({ plugin: "dom", type: "unmount", target }),
  update: (target) =>
    target === undefined
      ? { plugin: "dom", type: "update" }
      : { plugin: "dom", type: "update", target },
  focus: (selector) => ({ plugin: "dom", type: "focus", selector }),
  blur: (selector) => ({ plugin: "dom", type: "blur", selector }),
};
