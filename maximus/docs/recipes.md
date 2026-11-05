# Recipes

Ten short patterns. Every one is **code that runs**: the source is in [`recipes/`](./recipes) and the behaviour is pinned by [`recipes/recipes.test.ts`](./recipes/recipes.test.ts) (vitest + jsdom, using `maximus/testing`). Async parts are implemented with plain signals on purpose, to show the primitives; `resource` and `action` (see [async](./concepts/async.md)) automate most of them. Imports point at `../../src/mod.ts`; in your project use `maximus`.

Run them: `npx vitest run docs`.

## 1. Debounced search

A `debounced(source, ms)` helper built from `effect` + `onCleanup`, and a search box that filters on the settled value. The timer is owned by the component, so unmounting clears it.

```ts
// recipes/debounced-search.ts
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
```

Pattern: derive a _slower_ signal from a fast one. The only tracked read in the effect is `source()`; the timer is plain state.

## 2. Infinite scroll

Load the next page when a sentinel enters the viewport. The observer is injected (`observe`) so tests need no `IntersectionObserver`; the default implementation uses the real one. A `loading` guard prevents duplicate loads, and an `alive` flag drops results that arrive after unmount.

```ts
// recipes/infinite-scroll.ts
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
```

Plain signals stand in for `resource`. `ref=${fn}` gets the element before attachment; observing at that point is fine, the observer is stopped with `onCleanup`.

## 3. Modal with focus trap

A portal-based dialog: focus moves in on open (`onMount`, after attachment), Tab/Shift+Tab wrap, Escape closes, and focus returns to the opener in `onCleanup`.

```ts
// recipes/modal-focus-trap.ts
import { html, onCleanup, onMount, portal, show } from "../../src/mod.ts";
import type { Accessor, Child } from "../../src/mod.ts";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keep Tab / Shift+Tab inside `root`. Returns the keydown handler. */
export function trapFocus(root: HTMLElement) {
  return (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !root.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !root.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };
}

function ModalBody(props: { onClose: () => void; children: () => Child }) {
  const opener = document.activeElement as HTMLElement | null;
  let dialog!: HTMLElement;
  const trap = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.onClose();
    else trapFocus(dialog)(e);
  };
  onMount(() => {
    // the node is attached now: move focus inside
    (dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus();
  });
  // restore focus when the modal goes away
  onCleanup(() => opener?.focus());
  return html`
    <div class="backdrop">
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        ref=${(el: HTMLElement) => (dialog = el)}
        @keydown=${trap}
      >
        ${props.children()}
      </div>
    </div>
  `;
}

/** Render `children` in a modal on document.body while `open()` is true. */
export function Modal(props: {
  open: Accessor<boolean>;
  onClose: () => void;
  children: () => Child;
}) {
  return show(props.open, () =>
    portal(document.body, () =>
      ModalBody({ onClose: props.onClose, children: props.children }),
    ),
  );
}
```

`show` rebuilds the branch when `open` flips, which creates and disposes the modal's owner: that is exactly the lifecycle focus restoration needs.

## 4. Toast queue

A toaster with at most `max` visible toasts, a FIFO queue behind them, and per-toast auto-dismiss timers. Rendered with a keyed `each`.

```ts
// recipes/toast-queue.ts
import { each, html, onCleanup, signal } from "../../src/mod.ts";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

/** A toast queue: at most `max` visible, each auto-dismissed after `ttl` ms. */
export function createToaster(options: { max?: number; ttl?: number } = {}) {
  const max = options.max ?? 3;
  const ttl = options.ttl ?? 4000;
  const toasts = signal<Toast[]>([]);
  const queue: Toast[] = [];
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;

  function show() {
    while (toasts.peek().length < max && queue.length > 0) {
      const t = queue.shift()!;
      toasts.update((all) => [...all, t]);
      timers.set(
        t.id,
        setTimeout(() => dismiss(t.id), ttl),
      );
    }
  }
  function dismiss(id: number) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    toasts.update((all) => all.filter((t) => t.id !== id));
    show(); // a slot is free: promote the next queued toast
  }
  function push(text: string, kind: Toast["kind"] = "info") {
    const id = nextId++;
    queue.push({ id, text, kind });
    show();
    return id;
  }
  // Call inside a component or root so pending timers die with it.
  function disposeWith() {
    onCleanup(() => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      queue.length = 0;
    });
  }
  return { toasts, push, dismiss, disposeWith };
}

export function Toasts(props: { toaster: ReturnType<typeof createToaster> }) {
  props.toaster.disposeWith();
  return html`
    <div class="toasts" role="status" aria-live="polite">
      ${each(
        props.toaster.toasts,
        (t) => t.id,
        (t) => html`
          <div class=${() => "toast " + t().kind}>
            ${() => t().text}
            <button
              aria-label="dismiss"
              @click=${() => props.toaster.dismiss(t().id)}
            >
              x
            </button>
          </div>
        `,
      )}
    </div>
  `;
}
```

The timers live in the toaster, and `disposeWith()` registers their cleanup on whatever owner calls it (the `Toasts` component).

## 5. Optimistic list

Show a new item immediately with a `pending` flag, replace the temporary id when the server answers, roll back and show the error if it fails.

```ts
// recipes/optimistic-list.ts
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
```

This is what `resource.mutate` + `action` automate; with signals it is 15 lines.

## 6. Dark mode with context

The context value is a **signal**, so every consumer reacts to a toggle without re-providing. The provider reads storage, then the system preference, and writes both `data-theme` and storage from one effect.

```ts
// recipes/dark-mode.ts
import { createContext, effect, html, signal } from "../../src/mod.ts";
import type { Child, Signal } from "../../src/mod.ts";

export type Theme = "light" | "dark";

/** The context value is a signal, so consumers react to changes without re-providing. */
export const ThemeContext = createContext<Signal<Theme>>(
  signal<Theme>("light"),
);

export function useTheme() {
  const theme = ThemeContext.use();
  return {
    theme,
    toggle: () => theme.update((t) => (t === "dark" ? "light" : "dark")),
  };
}

/**
 * Provide a theme to `children`. The initial value comes from storage, then
 * from the system preference. Changes are written back and reflected on `root`.
 */
export function ThemeProvider(props: {
  children: () => Child;
  storage?: Pick<Storage, "getItem" | "setItem">;
  prefersDark?: () => boolean;
  root?: HTMLElement;
}) {
  const storage = props.storage;
  const stored = storage?.getItem("theme");
  const initial: Theme =
    stored === "dark" || stored === "light"
      ? stored
      : props.prefersDark?.()
        ? "dark"
        : "light";
  const theme = signal<Theme>(initial);
  const root = props.root ?? document.documentElement;
  effect(() => {
    root.dataset.theme = theme();
    storage?.setItem("theme", theme());
  });
  return ThemeContext.provide(theme, props.children);
}

export function ThemeButton() {
  const { theme, toggle } = useTheme();
  return html`<button @click=${toggle}>theme: ${theme}</button>`;
}
```

Context is not reactive by itself: provide a signal. `useTheme()` must be called while an owner is active (component body), not after an `await`.

## 7. Drag reorder with each

HTML5 drag and drop on a keyed list. Because `each` keys rows by id, a reorder moves the existing `<li>` nodes (verified in the test: the dragged node is the same object afterwards).

```ts
// recipes/drag-reorder.ts
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
```

Drag events are not delegated, so they are real listeners; `@dragover.prevent` is what makes the row a drop target.

## 8. Undo/redo with a store

Snapshot history around a `createStore`. `change(mutator)` records the previous snapshot; `undo`/`redo` restore with `reconcile`, which only touches what differs, so unchanged rows keep their DOM.

```ts
// recipes/undo-redo.ts
import {
  computed,
  createStore,
  reconcile,
  signal,
  unwrap,
} from "../../src/mod.ts";

/**
 * Undo/redo over a store by snapshots. The store stays the single source of
 * truth for the UI (fine-grained updates); history is just a list of plain
 * JSON-like copies. `reconcile` restores a snapshot by changing only what
 * differs, so a row whose data did not change keeps its DOM and listeners.
 */
export function createHistory<T extends object>(initial: T, limit = 100) {
  const state = createStore(structuredClone(initial));
  const past = signal<T[]>([]);
  const future = signal<T[]>([]);
  const snapshot = (): T => structuredClone(unwrap(state)) as T;

  /** Run a mutation as one undoable step. */
  function change(mutate: (draft: T) => void) {
    const before = snapshot();
    mutate(state);
    past.update((p) => [...p, before].slice(-limit));
    future.set([]);
  }
  function undo() {
    const p = past.peek();
    if (p.length === 0) return;
    future.update((f) => [...f, snapshot()]);
    past.set(p.slice(0, -1));
    reconcile(state, p[p.length - 1]!);
  }
  function redo() {
    const f = future.peek();
    if (f.length === 0) return;
    past.update((p) => [...p, snapshot()]);
    future.set(f.slice(0, -1));
    reconcile(state, f[f.length - 1]!);
  }
  return {
    state,
    change,
    undo,
    redo,
    canUndo: computed(() => past().length > 0),
    canRedo: computed(() => future().length > 0),
  };
}
```

`unwrap` gives the raw object for `structuredClone`; `reconcile(state, snapshot)` writes it back fine-grained.

## 9. WebSocket subscription with onCleanup

`useSocket(url)` opens a socket for the lifetime of the current owner and closes it with `onCleanup`. Status, last message and a bounded log are signals. The socket factory is injectable for tests.

```ts
// recipes/websocket.ts
import { onCleanup, signal } from "../../src/mod.ts";

/** The slice of WebSocket used here, so tests can pass a fake. */
export interface SocketLike {
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: ((e: unknown) => void) | null;
  close(): void;
}

export type Status = "connecting" | "open" | "closed";

/**
 * Subscribe to a socket for the lifetime of the current owner. Call it inside
 * a component (or `root`): the socket is closed by `onCleanup`, so unmounting
 * the component is all it takes to avoid a leak.
 */
export function useSocket<T>(
  url: string,
  options: {
    create?: (url: string) => SocketLike;
    parse?: (s: string) => T;
  } = {},
) {
  const create =
    options.create ??
    ((u: string) => new WebSocket(u) as unknown as SocketLike);
  const parse = options.parse ?? ((s: string) => JSON.parse(s) as T);
  const status = signal<Status>("connecting");
  const last = signal<T | undefined>(undefined);
  const log = signal<T[]>([]);
  const ws = create(url);
  ws.onopen = () => status.set("open");
  ws.onclose = () => status.set("closed");
  ws.onmessage = (e) => {
    const v = parse(e.data);
    last.set(v);
    log.update((all) => [...all.slice(-99), v]);
  };
  onCleanup(() => {
    ws.onopen = ws.onmessage = ws.onclose = null; // no late writes
    ws.close();
  });
  return { status, last, log };
}
```

The test asserts `debugStats()` returns to its starting value after dispose: nothing leaks.

## 10. i18n with a signal-backed dictionary

`t(key, params)` reads the current locale's dictionary signal, so any binding calling it re-renders on locale change or when a dictionary is added lazily. Supports `{name}` placeholders, `key.one`/`key.other` plurals through `Intl.PluralRules`, and a fallback locale.

```ts
// recipes/i18n.ts
import { computed, signal } from "../../src/mod.ts";

export type Dict = Record<string, string>;

/**
 * A signal-backed dictionary. `t("key", {n: 3})` reads the current locale's
 * dictionary, so any binding that calls it re-renders when the locale (or a
 * lazily loaded dictionary) changes. Placeholders are `{name}`, plural
 * variants are `key.one` / `key.other` chosen by Intl.PluralRules.
 */
export function createI18n(
  dictionaries: Record<string, Dict>,
  initial: string,
  fallback = initial,
) {
  const locale = signal(initial);
  const dicts = signal(dictionaries);
  const dict = computed(() => dicts()[locale()] ?? {});
  const rules = computed(() => new Intl.PluralRules(locale()));

  function t(
    key: string,
    params: Record<string, string | number> = {},
  ): string {
    const plural =
      typeof params.n === "number"
        ? `${key}.${rules().select(params.n)}`
        : null;
    const lookup = (d: Dict | undefined) =>
      (plural === null ? undefined : d?.[plural]) ?? d?.[key];
    const text = lookup(dict()) ?? lookup(dicts()[fallback]) ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name: string) =>
      name in params ? String(params[name]) : `{${name}}`,
    );
  }
  /** Add or replace a dictionary (for example after `import("./fr.json")`). */
  function addDictionary(loc: string, d: Dict) {
    dicts.update((all) => ({ ...all, [loc]: d }));
  }
  return { locale, t, addDictionary };
}
```

Wrap calls in a function in templates (`${() => t('hello')}`): the call must run inside the binding to be tracked.
