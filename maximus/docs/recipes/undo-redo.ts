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
