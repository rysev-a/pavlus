import { batch, devtoolsActive, root } from "../core/mod.ts";
import { installDevtools } from "../core/mod.ts";
import { removeRange, toNodes } from "./insert.ts";
import type { Child } from "./insert.ts";

/**
 * Mount `fn()` into `container` (appending; existing children are kept) in a
 * new root scope. Returns the dispose function, which tears down every effect
 * and listener and removes the nodes. Effects created during the first render
 * (`effect`, `onMount`) run after the nodes are attached.
 */
export function render(
  fn: () => Child,
  container: Element | DocumentFragment,
): () => void {
  return root((disposeRoot) => {
    const d = container.ownerDocument ?? document;
    const start = d.createComment("mx");
    const end = d.createComment("/mx");
    try {
      batch(() => {
        const nodes = toNodes(fn());
        container.appendChild(start);
        for (const n of nodes) container.appendChild(n);
        container.appendChild(end);
        if (devtoolsActive())
          installDevtools().emit({
            type: "mount",
            container: (container as Element).tagName ?? "#fragment",
          });
      });
    } catch (e) {
      disposeRoot();
      removeRange(start, end);
      throw e;
    }
    let done = false;
    return () => {
      if (done) return;
      done = true;
      disposeRoot();
      removeRange(start, end);
      if (devtoolsActive()) installDevtools().emit({ type: "unmount" });
    };
  });
}
