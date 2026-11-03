import type { DomEffect } from "./mod.ts";

type Of<T extends DomEffect["type"]> = Extract<DomEffect, { type: T }>;

/** Builders for DOM effects. */
export interface DomEffector {
  /**
   * Renders `view` (a compiled template, or `viewOf(component)`) into
   * `target` and keeps it in sync with the state. `onMounted` is the message
   * sent once it is in the DOM. The root of an application is mounted by
   * `createApp({ mount })` instead.
   */
  mount(
    target: string | Element,
    view: Of<"mount">["view"],
    options?: { onMounted?: string },
  ): Of<"mount">;
  /** Removes what was mounted into `target`, with all its listeners. */
  unmount(target: string | Element): Of<"unmount">;
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
  mount: (target, view, options = {}) =>
    options.onMounted === undefined
      ? { plugin: "dom", type: "mount", target, view }
      : {
          plugin: "dom",
          type: "mount",
          target,
          view,
          onMounted: options.onMounted,
        },
  unmount: (target) => ({ plugin: "dom", type: "unmount", target }),
  focus: (selector) => ({ plugin: "dom", type: "focus", selector }),
  blur: (selector) => ({ plugin: "dom", type: "blur", selector }),
};
