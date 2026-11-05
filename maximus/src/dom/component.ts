/**
 * Component helpers. Props are plain objects whose values may be signals or
 * getters; these helpers keep that reactivity intact (nothing is read until it
 * is accessed).
 *
 * @module
 */
import { computed } from "../core/mod.ts";
import type { Accessor } from "../core/mod.ts";
import { isNode, toNodes } from "./insert.ts";
import type { Child } from "./insert.ts";

export type Component<P = Record<string, never>> = (props: P) => Child;

/**
 * Resolve a `children` thunk once into a flat, stable node list. Functions
 * inside are resolved (and tracked), arrays flattened, primitives become text.
 * Use it when a component needs to inspect or wrap its children.
 */
export function children(fn: () => Child): Accessor<Node[]> {
  const resolved = computed(() => toNodes(fn()));
  resolved.peek();
  return resolved;
}

type Source = object | (() => object | null | undefined) | null | undefined;

type Merge<T extends readonly unknown[]> = T extends readonly [
  infer H,
  ...infer R,
]
  ? Omit<Resolve<H>, keyof Merge<R>> & Merge<R>
  : unknown;
type Resolve<S> = S extends () => infer O ? NonNullable<O> : NonNullable<S>;

/**
 * Merge prop objects (later wins, `undefined` does not override). The result
 * is a live view: values are read from the sources at access time, so signals,
 * getters and reactive sources (a function returning an object) keep working.
 */
export function mergeProps<T extends readonly Source[]>(
  ...sources: T
): Merge<T> {
  const resolve = (s: Source): Record<PropertyKey, unknown> | null =>
    (typeof s === "function"
      ? (s as () => object | null | undefined)()
      : s) as Record<PropertyKey, unknown> | null;
  const find = (key: PropertyKey): Record<PropertyKey, unknown> | undefined => {
    for (let i = sources.length - 1; i >= 0; i--) {
      const o = resolve(sources[i]);
      if (o && key in o && o[key] !== undefined) return o;
    }
    return undefined;
  };
  return new Proxy({} as Record<PropertyKey, unknown>, {
    get(_t, key) {
      const o = find(key);
      return o === undefined ? undefined : o[key];
    },
    has(_t, key) {
      for (const s of sources) {
        const o = resolve(s);
        if (o && key in o) return true;
      }
      return false;
    },
    ownKeys() {
      const keys = new Set<string | symbol>();
      for (const s of sources) {
        const o = resolve(s);
        if (o) for (const k of Reflect.ownKeys(o)) keys.add(k);
      }
      return [...keys];
    },
    getOwnPropertyDescriptor(_t, key) {
      for (const s of sources) {
        const o = resolve(s);
        if (o && key in o) return { enumerable: true, configurable: true };
      }
      return undefined;
    },
    set() {
      return false;
    },
  }) as Merge<T>;
}

type Keys<T> = readonly (keyof T)[];
type Split<T, K extends readonly Keys<T>[]> = [
  ...{ [I in keyof K]: Pick<T, K[I][number & keyof K[I]] & keyof T> },
  Omit<T, K[number][number]>,
];

/**
 * Split props into groups by key without reading any value: each group exposes
 * getters onto the original props. The last element holds the remaining keys.
 */
export function splitProps<T extends object, K extends readonly Keys<T>[]>(
  props: T,
  ...groups: K
): Split<T, K> {
  const taken = new Set<PropertyKey>();
  const out: object[] = groups.map((keys) => {
    const g = {} as Record<PropertyKey, unknown>;
    for (const k of keys) {
      taken.add(k);
      Object.defineProperty(g, k, {
        enumerable: true,
        configurable: true,
        get: () => (props as Record<PropertyKey, unknown>)[k],
      });
    }
    return g;
  });
  const rest = new Proxy({} as Record<PropertyKey, unknown>, {
    get: (_t, key) =>
      taken.has(key) ? undefined : (props as Record<PropertyKey, unknown>)[key],
    has: (_t, key) => !taken.has(key) && key in props,
    ownKeys: () => Reflect.ownKeys(props).filter((k) => !taken.has(k)),
    getOwnPropertyDescriptor: (_t, key) =>
      !taken.has(key) && key in props
        ? { enumerable: true, configurable: true }
        : undefined,
    set: () => false,
  });
  out.push(rest);
  return out as unknown as Split<T, K>;
}

export { isNode };
