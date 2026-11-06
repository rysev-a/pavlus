/** An order-the-lines exercise: put steps or lines in the right sequence with move buttons. */

export interface OrderItem {
  id: string;
  text: string;
}

export interface OrderExercise {
  prompt: string;
  /** The lines in their right order. */
  items: OrderItem[];
  /** Other orders that are also right (ids), besides the one above. */
  alternatives?: string[][];
  /** Show the lines as code. */
  mono?: boolean;
}

/** Pure: a small seeded random generator (the same seed, the same numbers). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Pure: a shuffled copy; the same seed gives the same order. */
export function shuffleSeeded<T>(list: T[], seed: number): T[] {
  const rand = seeded(seed);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Every order that counts as right (ids). */
export const solutions = (ex: OrderExercise): string[][] => [
  ex.items.map((i) => i.id),
  ...(ex.alternatives ?? []),
];

const sameOrder = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** Pure: a starting order that is shuffled and never already a solution. */
export function scramble(ex: OrderExercise, seed: number): string[] {
  const ids = ex.items.map((i) => i.id);
  if (ids.length < 2) return ids;
  const right = solutions(ex);
  for (let attempt = 0; attempt < 20; attempt++) {
    const order = shuffleSeeded(ids, seed + attempt * 7919);
    if (!right.some((s) => sameOrder(s, order))) return order;
  }
  // a last resort: swap the first two of the solution
  return [ids[1], ids[0], ...ids.slice(2)];
}

/** Pure: move one line up (-1) or down (1). Moving past an end changes nothing. */
export function moveItem(order: string[], id: string, dir: -1 | 1): string[] {
  const at = order.indexOf(id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/** Pure: is the order one of the right ones? */
export function checkOrder(ex: OrderExercise, order: string[]): boolean {
  return solutions(ex).some((s) => sameOrder(s, order));
}

export interface OrderRow {
  id: string;
  text: string;
  pos: number;
  first: boolean;
  last: boolean;
  /** After a failed check: is the line already where it belongs? */
  mark: "" | "ok" | "bad";
}

export interface OrderProps {
  prompt: string;
  mono: boolean;
  locked: boolean;
  rows: OrderRow[];
}

/** Pure: what the block shows. `checked` turns on the marks. */
export function orderProps(
  ex: OrderExercise,
  order: string[],
  checked: boolean,
  locked: boolean,
): OrderProps {
  const text = new Map(ex.items.map((i) => [i.id, i.text]));
  const right = solutions(ex);
  return {
    prompt: ex.prompt,
    mono: ex.mono === true,
    locked,
    rows: order.map((id, i) => ({
      id,
      text: text.get(id) ?? id,
      pos: i + 1,
      first: i === 0,
      last: i === order.length - 1,
      mark: !checked ? "" : right.some((s) => s[i] === id) ? "ok" : "bad",
    })),
  };
}
