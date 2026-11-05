import { each, html, signal } from "../../src/mod.ts";

/** Move the element at `from` so it ends up at index `to`. Pure, returns a new array. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * Drag-to-reorder with `each`. Rows keep their identity (keyed by id), so
 * moving one row moves its DOM node: focus, inputs and scroll inside are kept.
 * Drag events are not delegated, they are real listeners on the row.
 */
export function SortableList(props: {
  items: ReturnType<typeof signal<{ id: string; label: string }[]>>;
}) {
  const dragging = signal<string | null>(null);
  const indexOf = (id: string) =>
    props.items.peek().findIndex((i) => i.id === id);
  return html`
    <ul>
      ${each(
        props.items,
        (i) => i.id,
        (item) => html`
          <li
            draggable="true"
            class=${() => (dragging() === item().id ? "dragging" : "")}
            @dragstart=${() => dragging.set(item().id)}
            @dragover.prevent=${() => {}}
            @drop.prevent=${() => {
              const from = dragging.peek();
              if (from !== null)
                props.items.update((all) =>
                  move(all, indexOf(from), indexOf(item().id)),
                );
              dragging.set(null);
            }}
            @dragend=${() => dragging.set(null)}
          >
            ${() => item().label}
          </li>
        `,
      )}
    </ul>
  `;
}
