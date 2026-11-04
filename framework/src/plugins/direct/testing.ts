import type { Message, PluginContext } from "../../core/types.ts";
import {
  createDirectDomPlugin,
  type DirectDomPlugin,
  type DirectMountable,
} from "./mod.ts";

export interface DirectHarness<S> {
  root: HTMLElement;
  dom: DirectDomPlugin;
  /** Messages the plugin dispatched (from user events). */
  messages: Message[];
  /** Errors reported by bindings. */
  errors: unknown[];
  /** Change state and repaint (an explicit `update` effect). */
  set(next: S): void;
  unmount(): void;
}

/**
 * Mounts a direct view (or a component whose `view` is one) in a fresh
 * container without the full core: the direct twin of `mountView`.
 */
export function mountDirect<S>(
  view: DirectMountable,
  initial: S,
  doc: Document = document,
): DirectHarness<S> {
  let state = initial;
  const messages: Message[] = [];
  const errors: unknown[] = [];
  const root = doc.createElement("div");
  doc.body.appendChild(root);
  const dom = createDirectDomPlugin({
    document: doc,
    onError: (e) => errors.push(e),
  });
  const ctx: PluginContext<S> = {
    dispatch: (m) => messages.push(m),
    getState: () => state,
    dispatchEffect() {},
  };
  dom.init!(ctx);
  dom.handle({ plugin: "dom", type: "mount", target: root, view }, ctx);
  return {
    root,
    dom,
    messages,
    errors,
    set(next) {
      const prev = state;
      state = next;
      dom.handle({ plugin: "dom", type: "update", prev, next }, ctx);
    },
    unmount() {
      dom.handle({ plugin: "dom", type: "unmount", target: root }, ctx);
    },
  };
}
