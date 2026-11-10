// The stateful half of the store: the plugin that owns the state and a
// history of every change (each entry with the effect that reverts it, so
// undo and time travel need no snapshots). The pure half — paths, change
// effects, `applyChange`, `getIn` — lives in @pavlus/core and is re-exported
// here so existing import paths keep working.
import {
  applyChange,
  getIn,
  type Path,
  type StoreChange,
  type StoreEffect,
  type UpdateEffect,
} from "@pavlus/core";
import type { PluginContext, StatefulPlugin } from "../../core/types.ts";
import { produceWithPaths } from "./produce.ts";

export type {
  Path,
  StoreChange,
  StoreEffect,
  UpdateEffect,
} from "@pavlus/core";
export { applyChange, getIn } from "@pavlus/core";
export {
  commonRoot,
  type Produced,
  produce,
  produceWithPaths,
} from "./produce.ts";

export interface HistoryEntry {
  timestamp: number;
  effect: StoreChange | UpdateEffect;
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

  const update = (effect: UpdateEffect, record: boolean): boolean => {
    const { next, changed, root } = produceWithPaths(
      state,
      effect.recipe as (s: S) => void,
    );
    if (!changed) return false;
    if (record) {
      history.push({
        timestamp: now(),
        effect,
        restoreEffect: {
          plugin: "store",
          type: "set",
          path: root,
          value: getIn(state, root).value,
        },
      });
      if (history.length > max) history.shift();
    }
    state = next;
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
        case "update": {
          const prev = state;
          if (update(effect, true) && effect.onSuccess !== undefined)
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

export type { StoreEffector } from "./helpers.ts";
export { storeEffector } from "./helpers.ts";
