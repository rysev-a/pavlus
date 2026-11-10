/**
 * Runtime helpers that compiled `.pavlus` templates import. They are written
 * once here instead of being pasted into every compiled template.
 *
 * Application code does not need these; the compiler decides which ones a
 * template uses and imports exactly those.
 *
 * @module
 */

import type { View } from "./vnode.ts";

/** Interpolated value as text. `null`, `undefined` and `false` render as nothing. */
export function toText(value: unknown): string {
  return value == null || value === false ? "" : String(value);
}

/**
 * Attribute value. `null` means "no attribute" (for `null`, `undefined` and
 * `false`), `true` renders an empty attribute, anything else is its string.
 */
export function toAttr(value: unknown): string | null {
  if (value == null || value === false) return null;
  return value === true ? "" : String(value);
}

/** Joins class names, skipping empty ones. `null` when nothing is left. */
export function joinClasses(names: unknown[]): string | null {
  const joined = names.filter(Boolean).join(" ");
  return joined === "" ? null : joined;
}

/** Sets an attribute unless its value is `null` (absent). */
export function setAttr(
  attrs: Record<string, string>,
  name: string,
  value: string | null,
): void {
  if (value !== null) attrs[name] = value;
}

/**
 * Event payload equality: identical values, or arrays (several handler
 * arguments) with identical elements.
 */
export function sameValues(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((item, index) => item === b[index])
  );
}

/**
 * The view behind the value of a dynamic embed (`+{expr}`): a view itself, or
 * a component that has one. `null` for "nothing".
 */
export function asView(value: unknown): View | null {
  if (value == null) return null;
  const view = (value as { view?: View }).view ?? (value as View);
  if (typeof view.render !== "function") {
    throw new Error("pavlus: +{...} needs a view or a component with a view");
  }
  return view;
}

/** What `diffKeyedList` asks the compiled template to do. */
export interface KeyedListOps {
  /** The item is gone: remove its range. */
  remove(key: string): void;
  /** A new item at `index` of the next list: render it before `beforeId`. */
  insert(index: number, beforeId: string): void;
  /** The item exists but is in the wrong place: move its range before `beforeId`. */
  move(key: string, beforeId: string): void;
  /** The item is on both sides: diff its content. */
  common(prevIndex: number, nextIndex: number): void;
}

function indexKeys(keys: string[]): Map<string, number> {
  const indices = new Map<string, number>();
  keys.forEach((key, index) => {
    if (indices.has(key)) throw new Error(`pavlus: duplicate key ${key}`);
    indices.set(key, index);
  });
  return indices;
}

/**
 * Reconciles two keyed lists: removes first, then inserts and moves walking
 * from the end (so the node an item goes before always exists), then
 * `common` for items present on both sides. Simple, not minimal: moving the
 * last item to the front costs a move for every item it passes (a longest
 * increasing subsequence would cost one).
 *
 * @param itemStartId id of the start marker of an item, by key
 * @param listEndId id of the end marker of the whole list
 */
export function diffKeyedList(
  prevKeys: string[],
  nextKeys: string[],
  itemStartId: (key: string) => string,
  listEndId: string,
  ops: KeyedListOps,
): void {
  const prevIndex = indexKeys(prevKeys);
  const nextIndex = indexKeys(nextKeys);

  // `order` follows the DOM order of the items that survive.
  const order: string[] = [];
  for (const key of prevKeys) {
    if (nextIndex.has(key)) order.push(key);
    else ops.remove(key);
  }

  for (let index = nextKeys.length - 1; index >= 0; index--) {
    const key = nextKeys[index];
    const following =
      index + 1 < nextKeys.length ? nextKeys[index + 1] : undefined;
    const beforeId =
      following === undefined ? listEndId : itemStartId(following);
    const slot = () =>
      following === undefined ? order.length : order.indexOf(following);

    if (!prevIndex.has(key)) {
      ops.insert(index, beforeId);
      order.splice(slot(), 0, key);
      continue;
    }
    const position = order.indexOf(key);
    if (order[position + 1] !== following) {
      ops.move(key, beforeId);
      order.splice(position, 1);
      order.splice(slot(), 0, key);
    }
  }

  nextKeys.forEach((key, index) => {
    const before = prevIndex.get(key);
    if (before !== undefined) ops.common(before, index);
  });
}

export { childEnv, resolveOutlet } from "../routing/mod.ts";
