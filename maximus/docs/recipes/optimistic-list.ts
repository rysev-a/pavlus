import { each, html, signal } from "../../src/mod.ts";

export interface Item {
  id: number;
  text: string;
  pending: boolean;
}

/**
 * Add an item to the list immediately, confirm or roll back when the server answers.
 * `save(text)` resolves to the server id or rejects.
 */
export function createOptimisticList(save: (text: string) => Promise<number>) {
  const items = signal<Item[]>([]);
  const error = signal<string | null>(null);
  let tempId = -1;

  async function add(text: string) {
    const temp = tempId--;
    error.set(null);
    items.update((all) => [...all, { id: temp, text, pending: true }]);
    try {
      const id = await save(text);
      items.update((all) =>
        all.map((i) => (i.id === temp ? { id, text, pending: false } : i)),
      );
    } catch (e) {
      items.update((all) => all.filter((i) => i.id !== temp)); // roll back
      error.set(e instanceof Error ? e.message : String(e));
    }
  }
  return { items, error, add };
}

export function OptimisticList(props: {
  list: ReturnType<typeof createOptimisticList>;
}) {
  const { list } = props;
  return html`
    <div>
      <form
        @submit.prevent=${(e: Event) => {
          const input = (e.target as HTMLFormElement).elements.namedItem(
            "text",
          ) as HTMLInputElement;
          void list.add(input.value);
          input.value = "";
        }}
      >
        <input name="text" /><button>add</button>
      </form>
      <p class="error">${() => list.error() ?? ""}</p>
      <ul>
        ${each(
          list.items,
          (i) => i.id,
          (i) =>
            html`<li class=${() => (i().pending ? "pending" : "")}>
              ${() => i().text}
            </li>`,
        )}
      </ul>
    </div>
  `;
}
