import {
  computed,
  html,
  each,
  onCleanup,
  effect,
  signal,
} from "../../src/mod.ts";
import type { Accessor } from "../../src/mod.ts";

/**
 * A signal that follows `source` after it has been quiet for `ms`.
 * The timer belongs to the calling owner: disposing the component clears it.
 */
export function debounced<T>(source: Accessor<T>, ms: number): Accessor<T> {
  const out = signal(source());
  let timer: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    const value = source(); // the only tracked read
    clearTimeout(timer);
    timer = setTimeout(() => out.set(value), ms);
  });
  onCleanup(() => clearTimeout(timer));
  return out;
}

export function SearchBox(props: { items: string[]; delay?: number }) {
  const query = signal("");
  const settled = debounced(query, props.delay ?? 250);
  const results = computed(() => {
    const q = settled().trim().toLowerCase();
    return q === ""
      ? []
      : props.items.filter((s) => s.toLowerCase().includes(q));
  });
  return html`
    <div>
      <input
        type="search"
        placeholder="search"
        @input=${(e: Event) => query.set((e.target as HTMLInputElement).value)}
      />
      <ul>
        ${each(
          results,
          (s) => s,
          (s) => html`<li>${s}</li>`,
          () => html`<li class="empty">nothing</li>`,
        )}
      </ul>
    </div>
  `;
}
