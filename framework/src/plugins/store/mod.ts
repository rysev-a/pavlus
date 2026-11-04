import type { PluginContext, StatefulPlugin } from "../../core/types.ts";

/** `"user.email"` or `["user", "email"]`. Numeric segments index arrays. */
export type Path = string | readonly (string | number)[];

/**
 * `onSuccess` is the message dispatched once the change landed — `payload`
 * is `{ prev, next }`, the state before and after the write — and only when
 * it changed anything (a no-op never answers). How the application learns
 * about its own writes: set, then decide in the next message. The pair is
 * is exactly what a view diff takes, so an answer can be turned into
 * `DomPlugin.update(patches, target)` directly.
 */
export type StoreEffect =
  | {
      plugin: "store";
      type: "set";
      path: Path;
      value: unknown;
      onSuccess?: string;
    }
  | {
      plugin: "store";
      type: "merge";
      path: Path;
      value: Record<string, unknown>;
      onSuccess?: string;
    }
  | { plugin: "store"; type: "remove"; path: Path; onSuccess?: string }
  /** Revert the last `steps` (default 1) recorded changes. */
  | { plugin: "store"; type: "undo"; steps?: number }
  /** Revert everything recorded after `timestamp`. */
  | { plugin: "store"; type: "restoreTo"; timestamp: number };

/** A change that can be applied (`set` / `merge` / `remove`). */
export type StoreChange = Extract<
  StoreEffect,
  { type: "set" | "merge" | "remove" }
>;

export interface HistoryEntry {
  timestamp: number;
  effect: StoreChange;
  /** Applying this to the state after `effect` restores the state before it. */
  restoreEffect: StoreChange;
}

export interface StorePluginOptions {
  /** Clock for history timestamps. Defaults to `Date.now`. */
  now?: () => number;
  /** Oldest entries are dropped beyond this size. Default 1000. */
  maxHistory?: number;
}

export interface StorePlugin<S> extends StatefulPlugin<S, StoreEffect> {
  readonly history: readonly HistoryEntry[];
}

const segments = (p: Path): (string | number)[] =>
  typeof p === "string" ? (p === "" ? [] : p.split(".")) : [...p];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** Reads a value; `exists` tells `undefined` apart from "not there". */
export function getIn(
  state: unknown,
  path: Path,
): { exists: boolean; value: unknown } {
  let cur = state;
  for (const seg of segments(path)) {
    if (!isObj(cur) || !(seg in cur))
      return { exists: false, value: undefined };
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return { exists: true, value: cur };
}

function setAt(
  state: unknown,
  segs: (string | number)[],
  value: unknown,
): unknown {
  if (segs.length === 0) return value;
  const [head, ...rest] = segs;
  const base: Record<string | number, unknown> | unknown[] = isObj(state)
    ? state
    : /^\d+$/.test(String(head))
      ? []
      : {};
  const child = (base as Record<string | number, unknown>)[head];
  const next = setAt(child, rest, value);
  if (next === child && head in base) return state;
  if (Array.isArray(base)) {
    const copy: unknown[] = [...base];
    copy[Number(head)] = next;
    return copy;
  }
  return { ...base, [head]: next };
}

function removeAt(state: unknown, segs: (string | number)[]): unknown {
  if (segs.length === 0) return undefined;
  if (!isObj(state)) return state;
  const [head, ...rest] = segs;
  if (!(head in state)) return state;
  if (rest.length === 0) {
    if (Array.isArray(state)) return state.filter((_, i) => i !== Number(head));
    const { [head]: _removed, ...others } = state as Record<string, unknown>;
    return others;
  }
  const child = (state as Record<string | number, unknown>)[head];
  const next = removeAt(child, rest);
  if (next === child) return state;
  if (Array.isArray(state)) {
    const copy = [...state];
    copy[Number(head)] = next;
    return copy;
  }
  return { ...state, [head]: next };
}

/** Pure state transition for a change. Structural sharing keeps `===` valid. */
export function applyChange(state: unknown, change: StoreChange): unknown {
  const segs = segments(change.path);
  switch (change.type) {
    case "set":
      return setAt(state, segs, change.value);
    case "remove":
      return removeAt(state, segs);
    case "merge": {
      const cur = getIn(state, segs).value;
      return setAt(state, segs, {
        ...(isObj(cur) ? cur : {}),
        ...change.value,
      });
    }
  }
}

/** Computes the effect that undoes `change` when applied to the result. */
function restoreFor(before: unknown, change: StoreChange): StoreChange {
  const segs = segments(change.path);
  const set = (path: Path, value: unknown): StoreChange => ({
    plugin: "store",
    type: "set",
    path,
    value,
  });
  const old = getIn(before, segs);

  // Where does the change first touch something that did not exist (or, for
  // `remove`, which element goes away)? Everything below that point is new.
  let depth = segs.length;
  if (!old.exists) {
    depth = 0;
    while (
      depth < segs.length &&
      getIn(before, segs.slice(0, depth + 1)).exists
    )
      depth++;
    depth++;
  }
  const parentPath = segs.slice(0, depth - 1);
  const parent = getIn(before, parentPath);
  if (
    depth > 0 &&
    Array.isArray(parent.value) &&
    (change.type === "remove" || !old.exists)
  ) {
    // Adding or removing an array element shifts indices: restore the whole array.
    return set(parentPath, parent.value);
  }
  return old.exists
    ? set(change.path, old.value)
    : { plugin: "store", type: "remove", path: segs.slice(0, depth) };
}

/**
 * Holds the application state and a history of every change. Each entry
 * stores the effect and the `restoreEffect` that reverts it, so state can
 * be rolled back (undo, time travel) without snapshots.
 */
export function createStorePlugin<S>(
  initial: S,
  opts: StorePluginOptions = {},
): StorePlugin<S> {
  const now = opts.now ?? Date.now;
  const max = opts.maxHistory ?? 1000;
  let state = initial;
  const history: HistoryEntry[] = [];

  const change = (effect: StoreChange, record: boolean): boolean => {
    const next = applyChange(state, effect) as S;
    if (next === state) return false;
    if (record) {
      history.push({
        timestamp: now(),
        effect,
        restoreEffect: restoreFor(state, effect),
      });
      if (history.length > max) history.shift();
    }
    state = next;
    return true;
  };

  const undo = (): boolean => {
    const entry = history.pop();
    if (!entry) return false;
    change(entry.restoreEffect, false);
    return true;
  };

  return {
    name: "store",
    get history() {
      return history;
    },
    getState: () => state,
    handle(effect: StoreEffect, ctx) {
      switch (effect.type) {
        case "set":
        case "merge":
        case "remove": {
          const prev = state;
          if (change(effect, true) && effect.onSuccess !== undefined)
            ctx.dispatch({
              id: effect.onSuccess,
              payload: { prev, next: state },
            });
          return;
        }
        case "undo":
          for (let i = 0; i < (effect.steps ?? 1) && undo(); i++);
          return;
        case "restoreTo":
          while (
            history.length &&
            history[history.length - 1].timestamp > effect.timestamp
          )
            undo();
          return;
      }
    },
  };
}

export { storeEffector } from "./helpers.ts";
export type { StoreEffector } from "./helpers.ts";
