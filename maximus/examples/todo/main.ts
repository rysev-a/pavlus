import {
  batch,
  computed,
  createStore,
  each,
  effect,
  html,
  produce,
  render,
  show,
  signal,
} from "../../src/mod.ts";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}
type Filter = "all" | "active" | "done";

const KEY = "maximus-todos";

function load(): Todo[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Todo[]) : [];
  } catch {
    return [];
  }
}

function filterFromHash(): Filter {
  const h = location.hash.slice(1);
  return h === "active" || h === "done" ? h : "all";
}

function TodoApp() {
  const state = createStore({ todos: load() });
  const filter = signal<Filter>(filterFromHash());
  const editing = signal<number | null>(null);
  let nextId = state.todos.reduce((m, t) => Math.max(m, t.id), 0) + 1;

  const visible = computed(() => {
    const f = filter();
    return state.todos.filter((t) =>
      f === "all" ? true : f === "done" ? t.done : !t.done,
    );
  });
  const remaining = computed(() => state.todos.filter((t) => !t.done).length);
  const doneCount = computed(() => state.todos.length - remaining());

  // persist: reads every todo field, so any change re-saves
  effect(() => localStorage.setItem(KEY, JSON.stringify(state.todos)));
  const onHash = () => filter.set(filterFromHash());
  window.addEventListener("hashchange", onHash);

  const add = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const text = input.value.trim();
    if ((e as KeyboardEvent).key !== "Enter" || !text) return;
    state.todos.push({ id: nextId++, text, done: false });
    input.value = "";
  };

  const clearDone = () =>
    produce(state, (s) => {
      for (let i = s.todos.length - 1; i >= 0; i--)
        if (s.todos[i]!.done) s.todos.splice(i, 1);
    });

  const toggleAll = () => {
    const target = remaining() > 0;
    produce(state, (s) => s.todos.forEach((t) => (t.done = target)));
  };

  const Item = (todo: () => Todo) =>
    html`<li class=${() => ({ done: todo().done })} data-id=${() => todo().id}>
      <input
        type="checkbox"
        class="toggle"
        .checked=${() => todo().done}
        @change=${() => (todo().done = !todo().done)}
      />
      ${show(
        () => editing() === todo().id,
        () =>
          html`<input
            class="edit"
            .value=${() => todo().text}
            ref=${(el: Element) => queueMicrotask(() => (el as HTMLInputElement).focus())}
            @blur=${() => editing.set(null)}
            @keydown=${(e: Event) => {
              const k = (e as KeyboardEvent).key;
              const input = e.target as HTMLInputElement;
              if (k === "Enter" && input.value.trim())
                batch(
                  () => ((todo().text = input.value.trim()), editing.set(null)),
                );
              if (k === "Escape") editing.set(null);
            }}
          />`,
        () =>
          html`<label @dblclick=${() => editing.set(todo().id)}
            >${() => todo().text}</label
          >`,
      )}
      <button
        class="destroy"
        aria-label="delete"
        @click=${() => (
          state.todos.splice(
            state.todos.findIndex((t) => t.id === todo().id),
            1,
          ),
          undefined
        )}
      >
        ✕
      </button>
    </li>`;

  const FilterButton = (name: Filter, label: string) =>
    html`<button
      class=${() => ({ on: filter() === name })}
      data-filter=${name}
      @click=${() => (filter.set(name), (location.hash = name === "all" ? "" : name))}
    >
      ${label}
    </button>`;

  return html`
    <section class="todoapp">
      <header>
        <h1>Maximus todo</h1>
        <input
          class="new"
          placeholder="What needs doing?"
          autofocus
          @keydown=${add}
        />
        <label
          style="display:block;margin-top:.5rem;font-size:.85rem;color:#6b7090"
        >
          <input
            type="checkbox"
            class="toggle-all"
            .checked=${() => state.todos.length > 0 && remaining() === 0}
            @change=${toggleAll}
          />
          mark all done
        </label>
      </header>
      <ul>
        ${each(
          visible,
          (t) => t.id,
          (todo) => Item(todo),
          () => html`<li class="empty">Nothing here.</li>`,
        )}
      </ul>
      ${show(
        () => state.todos.length > 0,
        () => html`
          <footer>
            <span class="count"
              ><strong>${remaining}</strong
              >${() => (remaining() === 1 ? " item left" : " items left")}</span
            >
            <span class="filters"
              >${FilterButton("all", "All")}${FilterButton("active", "Active")}${FilterButton("done", "Done")}</span
            >
            ${show(doneCount, () => html`<button class="clear" @click=${() => clearDone()}>Clear done (${doneCount})</button>`)}
          </footer>
        `,
      )}
    </section>
  `;
}

render(() => TodoApp(), document.getElementById("app")!);
