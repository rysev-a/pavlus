import type { Message, PluginContext } from "../core/types.ts";
import { viewOf } from "../component/mod.ts";
import { DomPlugin } from "../plugins/dom/mod.ts";
import type { View } from "../runtime/vnode.ts";

export interface DomHarness<S> {
  root: HTMLElement;
  dom: DomPlugin;
  /** Messages the DOM plugin dispatched (from user events). */
  messages: Message[];
  /** Change the state and let the DOM plugin apply the diff as a patch. */
  set(next: S): void;
  unmount(): void;
}

/**
 * Mounts a view, or a component with a view, in a fresh container without
 * the full core (tests). Mount the component when its template has an
 * `+outlet`, so `routing` is available.
 */
export function mountView<S>(
  viewOrComponent: View<S> | { view?: View<S> },
  initial: S,
  doc: Document = document,
): DomHarness<S> {
  const view = viewOf(viewOrComponent);
  if (!view) throw new Error("pavlus/testing: mountView needs a view");
  let state = initial;
  const messages: Message[] = [];
  const root = doc.createElement("div");
  doc.body.appendChild(root);
  const dom = new DomPlugin({ document: doc });
  const ctx: PluginContext<S> = {
    dispatch: (m) => messages.push(m),
    getState: () => state,
    dispatchEffect() {},
  };
  dom.init(ctx);
  dom.mount(root, view, { ctx });
  return {
    root,
    dom,
    messages,
    set(next) {
      const prev = state;
      state = next;
      // The harness plays the component: it diffs the pair and hands the
      // plugin the patches, like a paint handler does.
      dom.update(root, view.diff(prev, next));
    },
    unmount() {
      dom.unmount(root);
    },
  };
}
