/**
 * Point-wise patches for keyed lists, from application code alone
 * (the design and the reasoning: docs/render_lists.md).
 *
 * A handler that changes a rendered list knows _what_ it did — removed these
 * keys, replaced that one, re-sorted, added these. These helpers turn that
 * knowledge (a {@link ListNote}) directly into patches, skipping the generic
 * reconciliation walk, and verify it cheaply first: a note that does not
 * describe prev → next exactly is rejected (null) and the caller falls back to
 * `view.diff` — a wrong note can cost a wasted scan, never wrong DOM.
 *
 * Everything here is pure: patches are plain data, no DOM is touched, so the
 * helpers run anywhere the app runs and are testable without a browser.
 */

import type { Patch, View, VNode } from "@pavlus/frontend";
import { diffKeyedList } from "@pavlus/frontend/runtime";

/** What the handler did to the rendered list. Rides with the write. */
export type ListNote =
  | { kind: "add"; keys: string[] } // these keys appeared
  | { kind: "remove"; keys: string[] } // these keys went away
  | { kind: "update"; keys: string[] } // these keys' items were replaced
  | { kind: "sort" } // same items, new order
  | { kind: "replace" }; // anything else — force the generic diff

/** One `for` block of one template. */
export interface ListBinding<S, I> {
  /** The state field the template loops over: `for user in rows` → "rows". */
  field: keyof S & string;
  /** The item key — the template's `key` expression, as a string. */
  keyOf: (item: I) => string;
  /** Marker before the item with `key`: `"#<key>N["`. */
  start: (key: string) => string;
  /** Marker after the item with `key`: `"#<key>N]"`. */
  end: (key: string) => string;
  /** The marker after the last item: `"Ne"`. */
  listEnd: string;
}

/** The items of a state's list field — the template's `(state.rows) || []`. */
const itemsOf = <S, I>(b: ListBinding<S, I>, s: S): readonly I[] =>
  ((s as Record<string, unknown>)[b.field] ?? []) as readonly I[];

/** The state with its list field replaced — synthetic pairs are built on it. */
const withItems = <S, I>(b: ListBinding<S, I>, s: S, items: I[]): S =>
  ({ ...(s as object), [b.field]: items }) as S;

/** `remove` patches for the noted keys. O(k) — ids only, no rendering. */
export function removePatches<S, I>(
  b: ListBinding<S, I>,
  keys: string[],
): Patch[] {
  return keys.map(
    (key): Patch => ({
      op: "remove",
      from: b.start(key),
      to: b.end(key),
    }),
  );
}

/**
 * The noted items' content patches: one synthetic diff through the real
 * template. Both sides hold the same keys in the same order, so the keyed
 * walk touches only the noted items — it cannot even see the rest of the
 * list, which is not in the synthetic pair.
 */
export function updatePatches<S, I>(
  view: View<S>,
  b: ListBinding<S, I>,
  prev: S,
  next: S,
  keys: string[],
): Patch[] {
  const wanted = new Set(keys);
  const pick = (list: readonly I[]): I[] =>
    list.filter((item) => wanted.has(b.keyOf(item)));
  return view.diff(
    withItems(b, next, pick(itemsOf(b, prev))),
    withItems(b, next, pick(itemsOf(b, next))),
  );
}

/** `insert` patches for the noted keys, at their real positions. */
export function addPatches<S, I>(
  view: View<S>,
  b: ListBinding<S, I>,
  next: S,
  keys: string[],
): Patch[] {
  const wanted = new Set(keys);
  const patches: Patch[] = [];
  let run: I[] = [];
  let anchor: string | null = null;

  const flush = (): void => {
    if (run.length === 0) return;
    const before = anchor ?? b.listEnd;
    // The synthetic pair flips every block that reads the list — the
    // empty-state `if rows.length == 0`, for one. Keep only the inserts
    // that are the run's items: each starts with its key-derived marker.
    const starts = new Set(run.map((item) => b.start(b.keyOf(item))));
    for (const p of view.diff(
      withItems(b, next, []),
      withItems(b, next, run),
    )) {
      if (p.op !== "insert") continue;
      const first = p.nodes[0];
      if (first?.t === "marker" && starts.has(first.id))
        patches.push({ ...p, before });
    }
    run = [];
  };

  for (const item of itemsOf(b, next)) {
    if (wanted.has(b.keyOf(item))) {
      run.push(item); // part of the added run
      continue;
    }
    if (run.length > 0) anchor = b.start(b.keyOf(item)); // first survivor after it
    flush();
  }
  anchor = null; // a trailing run goes before the list end
  flush();
  return patches;
}

/** `move` patches that turn the prev order into the next order. */
export function sortPatches<S, I>(
  b: ListBinding<S, I>,
  prev: readonly I[],
  next: readonly I[],
): Patch[] {
  const moves: Patch[] = [];
  diffKeyedList(prev.map(b.keyOf), next.map(b.keyOf), b.start, b.listEnd, {
    remove: () => {},
    insert: () => {},
    move: (key, beforeId) =>
      moves.push({
        op: "move",
        from: b.start(key),
        to: b.end(key),
        before: beforeId,
      }),
    common: () => {},
  });
  return moves;
}

/**
 * Patches for a verified note, or null when the note does not describe
 * prev → next exactly (then the caller uses view.diff). Verification reads
 * keys and references only — never item contents.
 */
export function listPatches<S, I>(
  view: View<S>,
  b: ListBinding<S, I>,
  prev: S,
  next: S,
  note: ListNote,
): Patch[] | null {
  const a = itemsOf(b, prev);
  const z = itemsOf(b, next);
  switch (note.kind) {
    case "replace":
      return null;
    case "remove":
      // empty ↔ non-empty can flip a same-field `if` (the "No users match"
      // row): that insert lives outside this list — take the generic diff
      if (a.length === 0 || z.length === 0) return null;
      return removedExactly(a, z, b.keyOf, note.keys)
        ? removePatches(b, note.keys)
        : null;
    case "add":
      if (a.length === 0 || z.length === 0) return null;
      return addedExactly(a, z, b.keyOf, note.keys)
        ? addPatches(view, b, next, note.keys)
        : null;
    case "update":
      return updatedExactly(a, z, b.keyOf, note.keys)
        ? updatePatches(view, b, prev, next, note.keys)
        : null;
    case "sort":
      return sortedExactly(a, z, b.keyOf) ? sortPatches(b, a, z) : null;
  }
}

/** next is prev without `gone` — survivors identical, order kept. */
function removedExactly<I>(
  a: readonly I[],
  z: readonly I[],
  keyOf: (i: I) => string,
  gone: string[],
): boolean {
  const drop = new Set(gone);
  let i = 0;
  for (const item of a) {
    const key = keyOf(item);
    if (drop.has(key)) {
      drop.delete(key);
      continue;
    }
    if (i >= z.length || z[i] !== item || keyOf(z[i]) !== key) return false;
    i++;
  }
  return i === z.length && drop.size === 0;
}

/** prev is next without `added` — survivors identical, order kept. */
function addedExactly<I>(
  a: readonly I[],
  z: readonly I[],
  keyOf: (i: I) => string,
  added: string[],
): boolean {
  const extra = new Set(added);
  let i = 0;
  for (const item of z) {
    const key = keyOf(item);
    if (extra.has(key)) {
      extra.delete(key);
      continue;
    }
    if (i >= a.length || a[i] !== item || keyOf(a[i]) !== key) return false;
    i++;
  }
  return i === a.length && extra.size === 0;
}

/** same keys, same order; only noted items may be different references. */
function updatedExactly<I>(
  a: readonly I[],
  z: readonly I[],
  keyOf: (i: I) => string,
  keys: string[],
): boolean {
  if (a.length !== z.length) return false;
  const wanted = new Set(keys);
  for (let i = 0; i < a.length; i++) {
    const key = keyOf(a[i]);
    if (keyOf(z[i]) !== key) return false; // a key never moves on an update
    if (!wanted.has(key) && a[i] !== z[i]) return false; // an unnoted item changed
  }
  return true;
}

/** the very same items, possibly in another order. */
function sortedExactly<I>(
  a: readonly I[],
  z: readonly I[],
  keyOf: (i: I) => string,
): boolean {
  if (a.length !== z.length) return false;
  const pool = new Set(a);
  const keys = new Set<string>();
  for (const item of z) {
    if (!pool.has(item)) return false;
    const key = keyOf(item);
    if (keys.has(key)) return false; // duplicate keys would throw deeper down
    keys.add(key);
  }
  return keys.size === new Set(a.map(keyOf)).size;
}

/**
 * Dev-time guard: the binding's markers must exist in the rendered view.
 * Catches a stale binding (the template changed, the marker numbers moved)
 * on the first render instead of mis-addressing patches.
 */
export function assertBinding<S, I>(
  view: View<S>,
  b: ListBinding<S, I>,
  s: S,
): void {
  const ids = new Set<string>();
  const walk = (nodes: VNode[]): void => {
    for (const n of nodes) {
      if (n.id !== undefined) ids.add(n.id);
      if (n.t === "el") walk(n.children);
    }
  };
  walk(view.render(s));
  const first = itemsOf(b, s)[0];
  const ok =
    ids.has(b.listEnd) &&
    (first === undefined ||
      (ids.has(b.start(b.keyOf(first))) && ids.has(b.end(b.keyOf(first)))));
  if (!ok)
    throw new Error(
      `list binding is stale: no markers for "${b.field}" in the rendered view (template changed?)`,
    );
}
