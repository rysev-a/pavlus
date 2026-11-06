import type { Path, StoreEffect, UpdateEffect } from "./mod.ts";

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
  /** Sets `value` at the state root (same as `set("", value)`). */
  set(value: unknown, options?: ChangeOptions): Of<"set">;
  /** Shallow-merges `value` into the object at `path`. */
  merge(
    path: Path,
    value: Record<string, unknown>,
    options?: ChangeOptions,
  ): Of<"merge">;
  /** Shallow-merges `value` into the state root (same as `merge("", ...)`). */
  merge(value: Record<string, unknown>, options?: ChangeOptions): Of<"merge">;
  /** Removes the value at `path` (an array element is spliced out). */
  remove(path: Path, options?: ChangeOptions): Of<"remove">;
  /**
   * Rebuilds the state from a recipe over a draft (see `produce`): one
   * effect, one history entry, one answer — however many fields it touches.
   * Untouched branches keep their references (structural sharing), and a
   * recipe that changes nothing answers nothing.
   */
  update<S>(recipe: (draft: S) => void, options?: ChangeOptions): UpdateEffect;
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
 * import { storeEffector as store } from "@pavlus/frontend/plugins/store";
 *
 * return [store.set("user.name", "Ann"), store.remove("draft")];
 * ```
 */
type MaybePathed =
  | [path: Path, value: unknown, options?: ChangeOptions]
  | [value: unknown, options?: ChangeOptions];

// Matches TS overload order: a string/array first argument with a second
// argument present is a path; anything else writes the first argument to
// the root. An array value at the root needs the explicit `set("", ...)`.
const resolve = (
  args: MaybePathed,
): [Path, unknown, ChangeOptions | undefined] =>
  args.length >= 2 && (typeof args[0] === "string" || Array.isArray(args[0]))
    ? [args[0] as Path, args[1], args[2] as ChangeOptions | undefined]
    : ["", args[0], args[1] as ChangeOptions | undefined];

export const storeEffector: StoreEffector = {
  set: ((...args: MaybePathed) => {
    const [path, value, options] = resolve(args);
    return {
      plugin: "store",
      type: "set",
      path,
      value,
      ...success(options),
    };
  }) as StoreEffector["set"],
  merge: ((...args: MaybePathed) => {
    const [path, value, options] = resolve(args);
    return {
      plugin: "store",
      type: "merge",
      path,
      value,
      ...success(options),
    };
  }) as StoreEffector["merge"],
  remove: (path, options) => ({
    plugin: "store",
    type: "remove",
    path,
    ...success(options),
  }),
  update: <S>(
    recipe: (draft: S) => void,
    options?: ChangeOptions,
  ): UpdateEffect => ({
    plugin: "store",
    type: "update",
    recipe: recipe as (draft: never) => void,
    ...success(options),
  }),
  undo: (steps) =>
    steps === undefined
      ? { plugin: "store", type: "undo" }
      : { plugin: "store", type: "undo", steps },
  restoreTo: (timestamp) => ({ plugin: "store", type: "restoreTo", timestamp }),
};
