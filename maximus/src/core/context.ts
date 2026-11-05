import { Owner, getOwner, setOwner } from "./reactive.ts";

export interface Context<T> {
  readonly id: symbol;
  readonly defaultValue: T;
  /** Run `fn` with `value` visible to `use()` calls made (synchronously or later, by descendants) inside it. */
  provide<R>(value: T, fn: () => R): R;
  /** Nearest provided value up the owner chain, or the default. Needs an active owner (not after an `await`). */
  use(): T;
}

/** Create a context. `Theme.provide("dark", () => view)`, `Theme.use()`. */
export function createContext<T>(defaultValue: T): Context<T> {
  const id = Symbol("maximus.context");
  return {
    id,
    defaultValue,
    provide<R>(value: T, fn: () => R): R {
      const current = getOwner();
      const o = new Owner(current, true);
      o.context = new Map([[id, value]]);
      return runIn(o, fn);
    },
    use(): T {
      for (let o = getOwner(); o !== null; o = o.parent) {
        if (o.context !== null && o.context.has(id))
          return o.context.get(id) as T;
      }
      return defaultValue;
    },
  };
}

function runIn<R>(o: Owner, fn: () => R): R {
  const prev = setOwner(o);
  try {
    return fn();
  } finally {
    setOwner(prev);
  }
}
