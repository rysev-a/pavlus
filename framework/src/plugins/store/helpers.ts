import type { Path, StoreEffect } from "./mod.ts";

type Of<T extends StoreEffect["type"]> = Extract<StoreEffect, { type: T }>;

/** Builders for store effects. */
export interface StoreEffector {
  /** Sets the value at `path`, creating missing parents. */
  set(path: Path, value: unknown): Of<"set">;
  /** Shallow-merges `value` into the object at `path`. */
  merge(path: Path, value: Record<string, unknown>): Of<"merge">;
  /** Removes the value at `path` (an array element is spliced out). */
  remove(path: Path): Of<"remove">;
  /** Reverts the last `steps` recorded changes (default 1). */
  undo(steps?: number): Of<"undo">;
  /** Reverts every change recorded after `timestamp`. */
  restoreTo(timestamp: number): Of<"restoreTo">;
}

/**
 * Application code reads `store.set(...)` instead of spelling out
 * `{ plugin: "store", type: "set", ... }`.
 *
 * ```ts
 * import { storeEffector as store } from "@service-laboratory/pavlus/plugins/store";
 *
 * return [store.set("user.name", "Ann"), store.remove("draft")];
 * ```
 */
export const storeEffector: StoreEffector = {
  set: (path, value) => ({ plugin: "store", type: "set", path, value }),
  merge: (path, value) => ({ plugin: "store", type: "merge", path, value }),
  remove: (path) => ({ plugin: "store", type: "remove", path }),
  undo: (steps) =>
    steps === undefined
      ? { plugin: "store", type: "undo" }
      : { plugin: "store", type: "undo", steps },
  restoreTo: (timestamp) => ({ plugin: "store", type: "restoreTo", timestamp }),
};
