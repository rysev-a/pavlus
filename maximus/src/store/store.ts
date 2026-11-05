/**
 * Deep reactive objects with per-path tracking. `createStore(obj)` returns a
 * Proxy; a read inside a computation subscribes to exactly that property (a
 * lazily created signal per object+key), a write notifies exactly the
 * readers of that property (plus structural readers when keys are added or
 * removed: `Object.keys`, `for...in`, spreading, array `length`).
 *
 * Only plain objects and arrays are made reactive (class instances, Date, Map,
 * Set... are stored as opaque values). The initial object is used as the
 * backing storage, not copied: mutate it only through the proxy afterwards.
 *
 * @module
 */
import { batch, isTracking, signal, untrack } from "../core/mod.ts";
import type { Signal } from "../core/mod.ts";

const RAW = Symbol("maximus.store.raw");
const SELF = Symbol("maximus.store.self");

type Nodes = Map<PropertyKey, Signal<unknown>>;
const proxies = new WeakMap<object, object>();
const nodeMaps = new WeakMap<object, Nodes>();
const hasOwn = (o: object, k: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

const MUTATORS: ReadonlySet<PropertyKey> = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);

function wrappable(v: unknown): v is object {
  if (typeof v !== "object" || v === null) return false;
  if (Array.isArray(v)) return !Object.isFrozen(v);
  const proto = Object.getPrototypeOf(v);
  return (proto === Object.prototype || proto === null) && !Object.isFrozen(v);
}

/** Raw object behind a store proxy (identity for anything else). */
export function unwrap<T>(v: T): T {
  return (
    (typeof v === "object" && v !== null
      ? ((v as Record<symbol, unknown>)[RAW] as T | undefined)
      : undefined) ?? v
  );
}

export function isStore(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Record<symbol, unknown>)[RAW] !== undefined
  );
}

function trackKey(target: object, key: PropertyKey): void {
  let m = nodeMaps.get(target);
  if (m === undefined) nodeMaps.set(target, (m = new Map()));
  let n = m.get(key);
  if (n === undefined) {
    n =
      key === SELF
        ? signal<unknown>(0, { equals: false })
        : signal<unknown>((target as Record<PropertyKey, unknown>)[key]);
    m.set(key, n);
  }
  n();
}

function notify(target: object, key: PropertyKey, value: unknown): void {
  nodeMaps.get(target)?.get(key)?.set(value);
}

function notifySelf(target: object): void {
  nodeMaps.get(target)?.get(SELF)?.set(0);
}

const handler: ProxyHandler<object> = {
  get(target, key, receiver) {
    if (key === RAW) return target;
    const value = Reflect.get(target, key, receiver) as unknown;
    if (typeof key === "symbol") return value;
    if (typeof value === "function") {
      if (Array.isArray(target) && MUTATORS.has(key)) {
        return (...args: unknown[]) =>
          batch(() =>
            untrack(() =>
              (value as (...a: unknown[]) => unknown).apply(
                receiver,
                args.map(unwrap),
              ),
            ),
          );
      }
      if (!hasOwn(target, key)) return value;
    }
    if (isTracking()) trackKey(target, key);
    return wrappable(value) ? wrap(value) : value;
  },
  has(target, key) {
    if (key === RAW) return true;
    if (typeof key === "string" && isTracking()) trackKey(target, key);
    return Reflect.has(target, key);
  },
  ownKeys(target) {
    if (isTracking()) trackKey(target, SELF);
    return Reflect.ownKeys(target);
  },
  set(target, key, value) {
    if (typeof key === "symbol") return Reflect.set(target, key, value);
    const raw = unwrap(value);
    const had = hasOwn(target, key);
    const prev = (target as Record<PropertyKey, unknown>)[key];
    if (had && Object.is(prev, raw)) return true;
    const isArr = Array.isArray(target);
    batch(() => {
      if (isArr && key === "length") {
        const old = (target as unknown[]).length;
        (target as unknown[]).length = raw as number;
        for (let i = raw as number; i < old; i++)
          notify(target, String(i), undefined);
        notify(target, "length", raw);
        notifySelf(target);
      } else {
        (target as Record<PropertyKey, unknown>)[key] = raw;
        notify(target, key, raw);
        if (!had) notifySelf(target);
        if (isArr) notify(target, "length", (target as unknown[]).length);
      }
    });
    return true;
  },
  deleteProperty(target, key) {
    if (typeof key === "symbol" || !hasOwn(target, key))
      return Reflect.deleteProperty(target, key);
    batch(() => {
      delete (target as Record<PropertyKey, unknown>)[key];
      notify(target, key, undefined);
      notifySelf(target);
    });
    return true;
  },
  defineProperty(target, key, desc) {
    const ok = Reflect.defineProperty(target, key, desc);
    if (ok && typeof key === "string") {
      batch(() => {
        notify(target, key, (target as Record<PropertyKey, unknown>)[key]);
        notifySelf(target);
      });
    }
    return ok;
  },
};

function wrap<T extends object>(raw: T): T {
  if ((raw as Record<symbol, unknown>)[RAW] !== undefined) return raw; // already a store proxy
  let p = proxies.get(raw);
  if (p === undefined) {
    p = new Proxy(raw, handler);
    proxies.set(raw, p);
  }
  return p as T;
}

/** Make `initial` (a plain object or array) reactive. Mutate the result directly: `state.user.name = "b"`. */
export function createStore<T extends object>(initial: T): T {
  if (!wrappable(initial))
    throw new TypeError("Maximus createStore expects a plain object or array");
  return wrap(unwrap(initial));
}

/** Run `fn` with the store as argument inside a batch: all writes notify once. Returns the store. */
export function produce<T extends object>(state: T, fn: (draft: T) => void): T {
  batch(() => untrack(() => fn(state)));
  return state;
}

export interface ReconcileOptions {
  /** Property name or function identifying array items; items with the same key keep their identity (and subscribers). Without it, arrays are matched by position. */
  key?: string | ((item: never) => unknown);
}

type Obj = Record<PropertyKey, unknown>;

function sameKind(a: unknown, b: unknown): a is object {
  return wrappable(a) && wrappable(b) && Array.isArray(a) === Array.isArray(b);
}

function diff(
  t: Obj,
  next: Obj,
  keyFn: ((item: unknown) => unknown) | undefined,
): void {
  const raw = unwrap(t);
  if (Array.isArray(raw)) {
    const n = next as unknown as unknown[];
    const arr = t as unknown as unknown[];
    const len = n.length;
    const byKey = new Map<unknown, unknown>();
    if (keyFn)
      for (const old of raw as unknown[])
        if (wrappable(old)) byKey.set(keyFn(old), old);
    for (let i = 0; i < len; i++) {
      const ni = n[i];
      let chosen = ni;
      let old: unknown;
      if (keyFn) {
        if (wrappable(ni)) {
          const k = keyFn(ni);
          old = byKey.get(k);
          byKey.delete(k);
        }
      } else old = (raw as unknown[])[i];
      if (old !== undefined && sameKind(old, ni)) {
        if (old !== ni) diff(wrap(old as Obj), ni as Obj, keyFn);
        chosen = old;
      }
      if ((raw as unknown[])[i] !== chosen) arr[i] = chosen;
    }
    if (arr.length !== len) arr.length = len;
    return;
  }
  for (const k of Object.keys(raw)) if (!hasOwn(next, k)) delete t[k];
  for (const k of Object.keys(next)) {
    const nv = next[k];
    const ov = (raw as Obj)[k];
    if (Object.is(ov, nv)) continue;
    if (sameKind(ov, nv)) diff(wrap(ov as Obj), nv as Obj, keyFn);
    else t[k] = nv;
  }
}

/**
 * Update a store (or part of one, e.g. `state.todos`) to equal `next`, writing
 * only what differs, so only readers of changed paths run. Array items are
 * matched by `options.key`, which preserves item identity across reorders.
 */
export function reconcile<T extends object>(
  target: T,
  next: T,
  options: ReconcileOptions = {},
): T {
  if (!isStore(target))
    throw new TypeError(
      "Maximus reconcile expects a store (or a part of one) as its target",
    );
  const k = options.key;
  const keyFn =
    k === undefined
      ? undefined
      : typeof k === "function"
        ? (k as (i: unknown) => unknown)
        : (i: unknown) => (i as Obj)[k];
  batch(() => untrack(() => diff(target as Obj, unwrap(next) as Obj, keyFn)));
  return target;
}
