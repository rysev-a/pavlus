import type { Path, StoreEffect } from "./mod.ts";

type Of<T extends StoreEffect["type"]> = Extract<StoreEffect, { type: T }>;

/** The change effects answer with a message once they changed something. */
interface ChangeOptions {
  /** Message id dispatched after the change applied; skipped for a no-op. */
  onSuccess?: string;
}

const success = (options?: ChangeOptions): { onSuccess: string } | object =>
  options?.onSuccess === undefined ? {} : { onSuccess: options.onSuccess };

/** Builders for store effects. */
export interface StoreEffector {
  /**
   * Sets the value at `path`, creating missing parents. `options.onSuccess`
   * is the message sent once the value changed (never for a no-op).
   */
  set(path: Path, value: unknown, options?: ChangeOptions): Of<"set">;
  /** Shallow-merges `value` into the object at `path`. */
  merge(
    path: Path,
    value: Record<string, unknown>,
    options?: ChangeOptions,
  ): Of<"merge">;
  /** Removes the value at `path` (an array element is spliced out). */
  remove(path: Path, options?: ChangeOptions): Of<"remove">;
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
  set: (path, value, options) => ({
    plugin: "store",
    type: "set",
    path,
    value,
    ...success(options),
  }),
  merge: (path, value, options) => ({
    plugin: "store",
    type: "merge",
    path,
    value,
    ...success(options),
  }),
  remove: (path, options) => ({
    plugin: "store",
    type: "remove",
    path,
    ...success(options),
  }),
  undo: (steps) =>
    steps === undefined
      ? { plugin: "store", type: "undo" }
      : { plugin: "store", type: "undo", steps },
  restoreTo: (timestamp) => ({ plugin: "store", type: "restoreTo", timestamp }),
};
