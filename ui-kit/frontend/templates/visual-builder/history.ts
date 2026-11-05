// Undo / redo of the whole model. The model is immutable, so a history is just
// the list of the previous values.

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** the coalescing tag of the last commit */
  tag: string;
}

export const LIMIT = 100;

export const start = <T>(present: T): History<T> => ({ past: [], present, future: [], tag: "" });

/**
 * Records `next`. With a `tag` equal to the tag of the previous commit (typing
 * in one field) the present is replaced instead, so one undo reverts the whole
 * edit. A value equal to the present records nothing.
 */
export function commit<T>(h: History<T>, next: T, tag = ""): History<T> {
  if (next === h.present) return h;
  if (tag !== "" && tag === h.tag) return { ...h, present: next, future: [] };
  const past = [...h.past, h.present];
  if (past.length > LIMIT) past.shift();
  return { past, present: next, future: [], tag };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;

export function undo<T>(h: History<T>): History<T> {
  if (!canUndo(h)) return h;
  const past = h.past.slice(0, -1);
  return { past, present: h.past[h.past.length - 1], future: [h.present, ...h.future], tag: "" };
}

export function redo<T>(h: History<T>): History<T> {
  if (!canRedo(h)) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), tag: "" };
}
