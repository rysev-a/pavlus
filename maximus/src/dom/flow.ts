/**
 * Control flow: show, each, match, portal, lazy, suspense, errorBoundary.
 * Every function returns a DocumentFragment delimited by two comment markers
 * (or, for `portal`, a placeholder comment); the content between the markers
 * is kept up to date by effects owned by the caller's owner.
 *
 * @module
 */
import {
  SuspenseCtx,
  catchError,
  computed,
  createOwner,
  disposeOwner,
  getOwner,
  onCleanup,
  registerPending,
  renderEffect,
  runWithOwner,
  signal,
  untrack,
  batch,
} from "../core/mod.ts";
import type { Accessor, Owner, SuspenseContext } from "../core/mod.ts";
import { doc, env } from "./env.ts";
import { region, removeRange, toNodes } from "./insert.ts";
import type { Child } from "./insert.ts";

// ------------------------------------------------------------------- show

/**
 * Render `then` while `when()` is truthy, otherwise `otherwise`. The branch is
 * only rebuilt when truthiness flips. `then` receives an accessor for the
 * (truthy) value.
 */
export function show<T>(
  when: () => T,
  then: (value: Accessor<NonNullable<T>>) => Child,
  otherwise?: () => Child,
): DocumentFragment {
  const value = computed(when);
  const truthy = computed(() => !!value());
  return region(() =>
    truthy()
      ? untrack(() => then(value as Accessor<NonNullable<T>>))
      : otherwise
        ? untrack(otherwise)
        : null,
  );
}

// ------------------------------------------------------------------ match

type MatchCases<K> = (string extends `${K & (string | number | boolean)}`
  ? { [k: string]: (() => Child) | undefined }
  : { [P in `${K & (string | number | boolean)}`]?: () => Child }) & {
  _?: () => Child;
};

/** Pick a branch by the string form of `source()`; `_` is the fallback. Re-renders only when the chosen branch changes. */
export function match<K extends string | number | boolean>(
  source: () => K,
  cases: MatchCases<K>,
): DocumentFragment {
  const selected = computed(() => {
    const k = String(source());
    return Object.prototype.hasOwnProperty.call(cases, k) ? k : "_";
  });
  return region(() => {
    const branch = (cases as Record<string, (() => Child) | undefined>)[
      selected()
    ];
    return branch ? untrack(branch) : null;
  });
}

// ----------------------------------------------------------------- portal

/** Render `view` into `target` (an element or a selector) instead of here. Removed when the owner is disposed. Returns a placeholder comment. */
export function portal(
  target: Element | string,
  view: (() => Child) | Child,
): Node {
  const d = doc();
  // portals render client-side only: there is no document to target on the server
  if (env.server) return d.createComment("portal-anchor");
  const t = typeof target === "string" ? d.querySelector(target) : target;
  if (t === null)
    throw new Error(`Maximus: portal target not found: ${String(target)}`);
  const start = d.createComment("portal");
  const end = d.createComment("/portal");
  const frag = d.createDocumentFragment();
  frag.appendChild(start);
  for (const n of toNodes(
    typeof view === "function" ? untrack(view as () => Child) : view,
  ))
    frag.appendChild(n);
  frag.appendChild(end);
  t.appendChild(frag);
  onCleanup(() => removeRange(start, end));
  return d.createComment("portal-anchor");
}

// -------------------------------------------------------------------- lazy

type Loaded<P> = ((props: P) => Child) | { default: (props: P) => Child };

/** Code-split a component. While loading, it registers with the nearest `suspense`. `Comp.preload()` starts the load early. */
export function lazy<P extends object>(
  loader: () => Promise<Loaded<P>>,
): ((props: P) => Child) & { preload(): Promise<unknown> } {
  let promise: Promise<void> | null = null;
  let comp: ((props: P) => Child) | null = null;
  let failure: { e: unknown } | null = null;
  const load = (): Promise<void> =>
    (promise ??= loader().then(
      (m) => {
        comp = typeof m === "function" ? m : m.default;
      },
      (e: unknown) => {
        failure = { e };
      },
    ));
  const component = (props: P): Child => {
    if (comp !== null) return untrack(() => comp!(props));
    const p = load();
    registerPending(p);
    const loaded = signal(false);
    void p.then(() => loaded.set(true));
    return region(() => {
      if (!loaded()) return null;
      if (failure !== null) throw (failure as { e: unknown }).e;
      return untrack(() => comp!(props));
    });
  };
  component.preload = load;
  return component;
}

// ---------------------------------------------------------------- suspense

function moveRange(first: Node, last: Node, into: Node): void {
  let n: Node | null = first;
  while (n !== null) {
    const next: Node | null = n === last ? null : n.nextSibling;
    into.appendChild(n);
    n = next;
  }
}

/**
 * Show `fallback` while anything registered below (`registerPending`, `lazy`,
 * wave-2 resources) is pending. The content is created immediately and kept
 * alive (detached) while the fallback shows, so loading starts right away.
 */
export function suspense(
  fallback: () => Child,
  view: () => Child,
): DocumentFragment {
  const d = doc();
  const self = getOwner();
  const frag = d.createDocumentFragment();
  const start = d.createComment("suspense");
  const end = d.createComment("/suspense");
  frag.append(start, end);

  const pending = signal(0);
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const ctx: SuspenseContext = {
    pending,
    register(p) {
      if (env.pending !== null) env.pending(p);
      pending.update((n) => n + 1);
      const done = (): void => {
        if (!disposed) pending.update((n) => n - 1);
      };
      void p.then(done, done);
    },
  };

  if (env.suspense !== null) env.suspense({ start, end, pending });
  const cs = d.createComment("content");
  const ce = d.createComment("/content");
  const holder = d.createDocumentFragment();
  holder.appendChild(cs);
  SuspenseCtx.provide(ctx, () => {
    for (const n of toNodes(untrack(view))) holder.appendChild(n);
  });
  holder.appendChild(ce);

  let showing = 0; // 0 nothing, 1 content, 2 fallback
  let fbOwner: Owner | null = null;
  let fbNodes: Node[] = [];
  renderEffect(() => {
    const wantFallback = pending() > 0;
    untrack(() => {
      const parent = end.parentNode;
      if (parent === null) return;
      if (wantFallback) {
        if (showing === 2) return;
        if (showing === 1) moveRange(cs, ce, holder);
        fbOwner = createOwner(self);
        fbNodes = runWithOwner(fbOwner, () => toNodes(fallback())) ?? [];
        for (const n of fbNodes) parent.insertBefore(n, end);
        showing = 2;
      } else {
        if (showing === 1) return;
        if (fbOwner !== null) {
          disposeOwner(fbOwner);
          fbOwner = null;
          for (const n of fbNodes) n.parentNode?.removeChild(n);
          fbNodes = [];
        }
        parent.insertBefore(holder, end);
        showing = 1;
      }
    });
  });
  return frag;
}

// ----------------------------------------------------------- errorBoundary

/**
 * Catch errors thrown while rendering `view` or by any effect, event handler
 * or resource created under it, and show `fallback(error, reset)` instead.
 * `reset()` discards the fallback and renders `view` afresh. Errors thrown by
 * the fallback itself propagate to the next boundary up.
 */
export function errorBoundary(
  fallback: (error: unknown, reset: () => void) => Child,
  view: () => Child,
): DocumentFragment {
  const attempt = signal(0);
  let failed: { e: unknown } | null = null;
  let inRun = false;
  const reset = (): void => {
    if (failed === null) return;
    failed = null;
    attempt.update((n) => n + 1);
  };
  const onError = (e: unknown): void => {
    if (failed !== null) return;
    failed = { e };
    if (!inRun) attempt.update((n) => n + 1);
  };
  return region(() => {
    attempt();
    const showFallback = (): Child => {
      const f = failed as { e: unknown };
      return untrack(() => fallback(f.e, reset));
    };
    if (failed !== null) return showFallback();
    inRun = true;
    try {
      const nodes = catchError(() => toNodes(untrack(view)), onError);
      if (failed !== null) return showFallback();
      return nodes;
    } finally {
      inRun = false;
    }
  });
}

// -------------------------------------------------------------------- each

interface Row<T> {
  key: unknown;
  value: T;
  i: number;
  itemSig: ReturnType<typeof signal<T>> | null;
  idxSig: ReturnType<typeof signal<number>> | null;
  owner: Owner;
  first: Node;
  last: Node;
}

/** Mark which positions of `seq` (ignoring -1) belong to a longest increasing subsequence. */
export function longestIncreasing(seq: Int32Array | number[]): boolean[] {
  const n = seq.length;
  const stay: boolean[] = new Array<boolean>(n).fill(false);
  const tails: number[] = [];
  const prev = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const v = seq[i]!;
    if (v < 0) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]!]! < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1]!;
    tails[lo] = i;
  }
  let k = tails.length > 0 ? tails[tails.length - 1]! : -1;
  while (k >= 0) {
    stay[k] = true;
    k = prev[k]!;
  }
  return stay;
}

/**
 * Keyed list. `item` and `index` are accessors (signals) that update in place
 * when the same key reappears with a new value or at a new position; DOM rows
 * are created once per key, moved with a minimal number of moves (longest
 * increasing subsequence) and disposed when their key disappears.
 */
export function each<T>(
  items: () => readonly T[] | null | undefined,
  key: (item: T, index: number) => unknown,
  render: (item: Accessor<T>, index: Accessor<number>) => Child,
  fallback?: () => Child,
): DocumentFragment {
  const d = doc();
  const frag = d.createDocumentFragment();
  const start = d.createComment("each");
  const end = d.createComment("/each");
  frag.append(start, end);
  const listOwner = createOwner(getOwner(), "each");

  let rows: Row<T>[] = [];
  let fbOwner: Owner | null = null;
  let fbNodes: Node[] = [];

  const createRow = (
    item: T,
    k: unknown,
    i: number,
  ): { row: Row<T>; nodes: Node[] } => {
    const o = createOwner(listOwner);
    const row = {
      key: k,
      value: item,
      i,
      itemSig: null,
      idxSig: null,
      owner: o,
      first: start,
      last: start,
    } as Row<T>;
    const itemAcc = (): T => (row.itemSig ??= signal(row.value))();
    const idxAcc = (): number => (row.idxSig ??= signal(row.i))();
    let nodes = runWithOwner(o, () => toNodes(render(itemAcc, idxAcc))) ?? [];
    if (nodes.length === 0) nodes = [d.createComment("")];
    row.first = nodes[0]!;
    row.last = nodes[nodes.length - 1]!;
    return { row, nodes };
  };

  const moveRow = (parent: Node, row: Row<T>, before: Node): void => {
    if (row.first === row.last) {
      parent.insertBefore(row.first, before);
      return;
    }
    let n: Node | null = row.first;
    while (n !== null) {
      const next: Node | null = n === row.last ? null : n.nextSibling;
      parent.insertBefore(n, before);
      n = next;
    }
  };

  const dropRow = (row: Row<T>): void => {
    disposeOwner(row.owner);
    removeRange(row.first, row.last);
  };

  const setValue = (row: Row<T>, item: T): void => {
    if (row.value !== item) {
      row.value = item;
      row.itemSig?.set(item);
    }
  };

  const setIndex = (row: Row<T>, i: number): void => {
    if (row.i !== i) {
      row.i = i;
      row.idxSig?.set(i);
    }
  };

  const showFallback = (on: boolean): void => {
    if (on && fallback && fbOwner === null) {
      fbOwner = createOwner(listOwner);
      fbNodes = runWithOwner(fbOwner, () => toNodes(fallback())) ?? [];
      const parent = end.parentNode;
      if (parent) for (const n of fbNodes) parent.insertBefore(n, end);
    } else if (!on && fbOwner !== null) {
      disposeOwner(fbOwner);
      fbOwner = null;
      for (const n of fbNodes) n.parentNode?.removeChild(n);
      fbNodes = [];
    }
  };

  const reconcile = (next: readonly T[]): void => {
    const parent = end.parentNode;
    if (parent === null) return;
    const n = next.length;
    const m = rows.length;
    if (n === 0) {
      if (m > 0) {
        for (const r of rows) disposeOwner(r.owner);
        let node: Node | null = start.nextSibling;
        while (node !== null && node !== end) {
          const nx: Node | null = node.nextSibling;
          if (!fbNodes.includes(node)) parent.removeChild(node);
          node = nx;
        }
        rows = [];
      }
      showFallback(true);
      return;
    }
    showFallback(false);
    const keys = new Array<unknown>(n);
    for (let i = 0; i < n; i++) keys[i] = key(next[i]!, i);

    if (m === 0) {
      const seen = new Set<unknown>();
      const out = new Array<Row<T>>(n);
      const f = d.createDocumentFragment();
      for (let i = 0; i < n; i++) {
        if (seen.has(keys[i]))
          throw new Error(`Maximus each(): duplicate key ${String(keys[i])}`);
        seen.add(keys[i]);
        const { row, nodes } = createRow(next[i]!, keys[i], i);
        out[i] = row;
        for (const nd of nodes) f.appendChild(nd);
      }
      parent.insertBefore(f, end);
      rows = out;
      return;
    }

    let a = 0;
    while (a < m && a < n && rows[a]!.key === keys[a]) {
      setValue(rows[a]!, next[a]!);
      a++;
    }
    let bo = m - 1;
    let bn = n - 1;
    while (bo >= a && bn >= a && rows[bo]!.key === keys[bn]) {
      setValue(rows[bo]!, next[bn]!);
      setIndex(rows[bo]!, bn);
      bo--;
      bn--;
    }
    const out = new Array<Row<T>>(n);
    for (let i = 0; i < a; i++) out[i] = rows[i]!;
    for (let i = bo + 1, j = bn + 1; i < m; i++, j++) out[j] = rows[i]!;
    const anchorAfter: Node = bo + 1 < m ? rows[bo + 1]!.first : end;

    if (a > bo) {
      // only insertions
      const f = d.createDocumentFragment();
      const seen = new Set<unknown>();
      for (let i = a; i <= bn; i++) {
        if (seen.has(keys[i]))
          throw new Error(`Maximus each(): duplicate key ${String(keys[i])}`);
        seen.add(keys[i]);
        const { row, nodes } = createRow(next[i]!, keys[i], i);
        out[i] = row;
        for (const nd of nodes) f.appendChild(nd);
      }
      parent.insertBefore(f, anchorAfter);
    } else if (a > bn) {
      for (let i = a; i <= bo; i++) dropRow(rows[i]!);
    } else {
      const span = bn - a + 1;
      const index = new Map<unknown, number>();
      for (let j = a; j <= bn; j++) {
        if (index.has(keys[j]))
          throw new Error(`Maximus each(): duplicate key ${String(keys[j])}`);
        index.set(keys[j], j);
      }
      const sources = new Int32Array(span).fill(-1);
      for (let i = a; i <= bo; i++) {
        const j = index.get(rows[i]!.key);
        if (j === undefined) dropRow(rows[i]!);
        else sources[j - a] = i;
      }
      const stay = longestIncreasing(sources);
      let anchor: Node = anchorAfter;
      for (let j = bn; j >= a; j--) {
        const src = sources[j - a]!;
        let row: Row<T>;
        if (src >= 0) {
          row = rows[src]!;
          setValue(row, next[j]!);
          setIndex(row, j);
          if (!stay[j - a]) moveRow(parent, row, anchor);
        } else {
          const created = createRow(next[j]!, keys[j], j);
          row = created.row;
          const f = d.createDocumentFragment();
          for (const nd of created.nodes) f.appendChild(nd);
          parent.insertBefore(f, anchor);
        }
        out[j] = row;
        anchor = row.first;
      }
    }
    // indexes of the rows shifted by a pure insert/remove at the front or middle
    for (let i = a; i < n; i++) setIndex(out[i]!, i);
    rows = out;
  };

  runWithOwner(listOwner, () =>
    renderEffect(() => {
      const list = items();
      const len = list ? list.length : 0;
      const next = new Array<T>(len);
      for (let i = 0; i < len; i++) next[i] = list![i]!;
      untrack(() => batch(() => reconcile(next)));
    }),
  );
  return frag;
}
