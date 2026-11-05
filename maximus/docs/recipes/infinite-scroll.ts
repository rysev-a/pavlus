import { each, html, onCleanup, signal } from "../../src/mod.ts";

/** The part of IntersectionObserver this recipe needs; tests pass a fake. */
export type ObserveFn = (el: Element, onVisible: () => void) => () => void;

export const intersectionObserve: ObserveFn = (el, onVisible) => {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) onVisible();
  });
  io.observe(el);
  return () => io.disconnect();
};

/**
 * Pages are loaded when the sentinel at the end of the list becomes visible.
 * `loadPage(n)` resolves to the items of page `n`, or an empty array at the end.
 */
export function InfiniteList(props: {
  loadPage: (page: number) => Promise<string[]>;
  observe?: ObserveFn;
}) {
  const items = signal<string[]>([]);
  const loading = signal(false);
  const done = signal(false);
  let page = 0;
  let alive = true;
  onCleanup(() => (alive = false));

  async function loadMore() {
    if (loading.peek() || done.peek()) return;
    loading.set(true);
    try {
      const next = await props.loadPage(page++);
      if (!alive) return; // disposed while the request was in flight
      if (next.length === 0) done.set(true);
      else items.update((all) => [...all, ...next]);
    } finally {
      loading.set(false);
    }
  }

  const observe = props.observe ?? intersectionObserve;
  const sentinel = (el: Element) => {
    // the ref callback runs before the element is attached; observing is fine
    const stop = observe(el, () => void loadMore());
    onCleanup(stop);
  };

  return html`
    <div>
      <ul>
        ${each(
          items,
          (s) => s,
          (s) => html`<li>${s}</li>`,
        )}
      </ul>
      <div class="sentinel" ref=${sentinel}>
        ${() => (done() ? "end" : loading() ? "loading..." : "")}
      </div>
    </div>
  `;
}
