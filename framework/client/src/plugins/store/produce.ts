/**
 * Recipe-style state updates with structural sharing: the ergonomic answer to
 * `draft.users[3].qty++` without giving up the `prev === next` pruning both
 * view back ends rely on.
 *
 * A recipe mutates a proxy draft; {@link produce} returns the next state with
 * fresh references along every written path and shared references everywhere
 * else. A recipe that writes nothing returns the input reference unchanged.
 *
 * Plain objects and arrays are drafted (lazily, per accessed object). Any
 * other value — a `Date`, a `Map`, a class instance — passes through as-is:
 * writing it into a draft copies the reference; keeping such values in sync
 * stays the recipe's business, exactly as with hand-written spreads.
 *
 * @module
 */

interface DraftNode {
  base: unknown;
  parent: DraftNode | null;
  /** Key of the drafted object in its parent (unused for the root). */
  key: string | number;
  /** Copy-on-write: created on the first write, then the source of truth. */
  copy: Record<string | number, unknown> | null;
  /** Child drafts by key, so one object drafts once per produce call. */
  children: Map<string | number, object>;
}

/** The node of a proxy (traps with a receiver) and of its base (others). */
const NODE = new WeakMap<object, DraftNode>();
const BY_TARGET = new WeakMap<object, DraftNode>();

// Only plain objects and arrays are drafted: a Date or a Map would lose its
// internal slots behind a proxy (its methods would throw).
const draftable = (
  v: unknown,
): v is Record<string | number, unknown> | unknown[] => {
  if (typeof v !== "object" || v === null) return false;
  if (Array.isArray(v)) return true;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

const nodeOf = (v: unknown): DraftNode | null =>
  typeof v === "object" && v !== null ? (NODE.get(v) ?? null) : null;

/** Materializes `n.copy` (once), wiring the draft into every ancestor. */
function revise(n: DraftNode): void {
  if (n.copy !== null) return;
  n.copy = Array.isArray(n.base)
    ? ([...(n.base as unknown[])] as unknown as Record<
        string | number,
        unknown
      >)
    : { ...((n.base as Record<string | number, unknown>) ?? {}) };
  if (n.parent !== null) {
    revise(n.parent);
    n.parent.copy![n.key] = proxyFor(n);
  }
}

/** The one proxy for `n`, memoized on its parent (or created for the root). */
function proxyFor(n: DraftNode): object {
  if (n.parent !== null) {
    const existing = n.parent.children.get(n.key);
    if (existing !== undefined) return existing;
  }
  const p = new Proxy(n.base as object, traps);
  NODE.set(p, n);
  if (!BY_TARGET.has(n.base as object)) BY_TARGET.set(n.base as object, n);
  n.parent?.children.set(n.key, p);
  return p;
}

const traps: ProxyHandler<object> = {
  get(target, prop, recv) {
    const n = NODE.get(recv)!;
    if (n.copy !== null && prop in n.copy) {
      const cur = n.copy[prop as string | number];
      // A value seated in a copy may still need drafting: `draft.a.b = 1`
      // after the parent already copied must reach a proxy, not the original.
      if (typeof prop === "string" && draftable(cur) && !nodeOf(cur))
        return draftChild(n, prop, cur);
      return cur;
    }
    const v = Reflect.get(target, prop, recv);
    // Draft an object child on read, so `draft.a.b.c = 1` works. Array
    // methods stay generic: called with the proxy as `this`, they go through
    // these traps, so `draft.items.push(x)` copies before it writes.
    if (typeof prop === "string" && draftable(v) && !nodeOf(v))
      return draftChild(n, prop, v);
    return v;
  },
  set(target, prop, value, recv) {
    const key = prop as string | number;
    const n = NODE.get(recv)!;
    const cur =
      n.copy !== null && key in n.copy
        ? n.copy[key]
        : Reflect.get(target, prop, recv);
    if (Object.is(cur, value)) return true; // a no-op write keeps the reference
    revise(n);
    n.copy![key] = value;
    return true;
  },
  deleteProperty(target, prop) {
    const key = prop as string | number;
    const n = BY_TARGET.get(target as object) ?? NODE.get(target as object)!;
    if (!(key in (n.copy ?? (n.base as object)))) return true;
    revise(n);
    delete n.copy![key];
    return true;
  },
  // `has`, `ownKeys` and `getOwnPropertyDescriptor` have no receiver, so
  // they look the node up by the proxied base instead of the proxy.
  has(target, prop) {
    const n = BY_TARGET.get(target) ?? NODE.get(target)!;
    return prop in (n.copy ?? (n.base as object));
  },
  ownKeys(target) {
    const n = BY_TARGET.get(target) ?? NODE.get(target)!;
    return Reflect.ownKeys(n.copy ?? (n.base as object));
  },
  getOwnPropertyDescriptor(target, prop) {
    const n = BY_TARGET.get(target) ?? NODE.get(target)!;
    const d = Reflect.getOwnPropertyDescriptor(
      n.copy ?? (n.base as object),
      prop,
    );
    if (d) d.configurable = true; // a copy must stay configurable
    return d;
  },
};

function draftChild(
  n: DraftNode,
  prop: string,
  v: Record<string | number, unknown> | unknown[],
): object {
  // Memoized on the parent (by proxyFor); a drafted child is also seated in
  // a materialized copy, so finalize cannot miss it.
  const child: DraftNode = {
    base: v,
    parent: n,
    key: prop,
    copy: null,
    children: new Map(),
  };
  const p = proxyFor(child);
  if (n.copy !== null) n.copy[prop] = p;
  return p;
}

/** Rebuilds `n`: itself when untouched, a new object with finalized children. */
function finalize(n: DraftNode): unknown {
  if (n.copy === null) return n.base;
  const out = n.copy!;
  for (const k of Reflect.ownKeys(out)) {
    const child = nodeOf(out[k as string | number]);
    if (child !== null) out[k as string | number] = finalize(child);
  }
  return out;
}

/** Joined paths of every property the recipe wrote or deleted. */
function writtenPaths(n: DraftNode, prefix: (string | number)[]): string[] {
  const out: string[] = [];
  if (n.copy !== null) {
    const base = n.base as Record<string | number, unknown>;
    for (const k of Reflect.ownKeys(n.copy)) {
      const v = n.copy![k as string | number];
      // A drafted child sitting in the copy is wiring, not a write: the
      // recursion reports the real changes below it.
      if (nodeOf(v)?.parent === n) continue;
      if (!Object.is(base[k as string | number], v))
        out.push([...prefix, k].map(String).join("."));
    }
  }
  for (const [k, v] of n.children) {
    const child = NODE.get(v)!;
    if (child.copy !== null) out.push(...writtenPaths(child, [...prefix, k]));
  }
  return out;
}

/**
 * The shallowest `"a.b.0"` path that covers every change: the longest common
 * prefix of the written paths, or `""` (the root) when they diverge at the top.
 */
export function commonRoot(paths: string[]): string {
  if (paths.length === 0) return "";
  const prefix = paths[0].split(".");
  for (const p of paths.slice(1)) {
    const segs = p.split(".");
    let i = 0;
    while (i < prefix.length && i < segs.length && prefix[i] === segs[i]) i++;
    prefix.length = i;
  }
  return prefix.join(".");
}

export interface Produced<S> {
  /** The next state: new references along written paths, shared elsewhere. */
  next: S;
  /** `true` when the recipe wrote something (so `next !== base`). */
  changed: boolean;
  /** `"a.b.0"` paths of every written or deleted property. */
  paths: string[];
  /** The shallowest path covering every change (for a history restore). */
  root: string;
}

/** Runs `recipe` on a draft of `base` and reports what it changed. */
export function produceWithPaths<S>(
  base: S,
  recipe: (draft: S) => void,
): Produced<S> {
  if (!draftable(base))
    throw new Error("pavlus: produce needs an object or array state");
  const root: DraftNode = {
    base,
    parent: null,
    key: "",
    copy: null,
    children: new Map(),
  };
  const ret = recipe(proxyFor(root) as S);
  if (ret !== undefined)
    throw new Error("pavlus: a produce recipe must not return a value");
  const paths = writtenPaths(root, []);
  return {
    next: (root.copy === null ? base : finalize(root)) as S,
    changed: root.copy !== null,
    paths,
    root: commonRoot(paths),
  };
}

/** Runs `recipe` on a draft of `base`; returns the next state. */
export function produce<S>(base: S, recipe: (draft: S) => void): S {
  return produceWithPaths(base, recipe).next;
}
