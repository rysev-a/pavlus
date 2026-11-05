/**
 * `action`: mutations with pending/error/result signals, optimistic updates
 * and invalidation of resources by key.
 *
 * @module
 */
import { batch, signal } from "../core/mod.ts";
import type { Accessor } from "../core/mod.ts";
import { invalidate } from "./cache.ts";
import type { QueryKey } from "./cache.ts";

export interface ActionContext {
  /** Aborted when a newer run supersedes this one (`concurrency: "latest"`). */
  signal: AbortSignal;
  /**
   * Apply an optimistic change now. `apply` may return a rollback function
   * (`resource.mutate(...)` does); it runs, newest first, if the action fails
   * or is superseded.
   */
  optimistic(apply: () => void | (() => void)): void;
}

export interface ActionOptions<I, R> {
  /** Key prefixes of resources to refetch after a successful run. */
  invalidates?:
    | readonly QueryKey[]
    | ((input: I, result: R) => readonly QueryKey[]);
  /**
   * What happens when `run` is called while a run is active:
   * `latest` (default) aborts and replaces it, `queue` runs one after another,
   * `parallel` runs them side by side.
   */
  concurrency?: "latest" | "queue" | "parallel";
  onSuccess?: (result: R, input: I) => void;
  onError?: (error: unknown, input: I) => void;
}

export interface Action<I, R> {
  /** Run the action. Resolves with the result, or `undefined` if it failed or was superseded; it never rejects (see `error()`). */
  run(input: I): Promise<R | undefined>;
  /** True while any run (including its invalidation refetch) is active or queued. */
  pending: Accessor<boolean>;
  /** The error of the latest failed run; cleared when a run starts. */
  error: Accessor<unknown>;
  /** The result of the latest successful run. */
  result: Accessor<R | undefined>;
  /** Clear `error` and `result` (does not cancel runs). */
  reset(): void;
}

interface Run {
  ctrl: AbortController;
  rollbacks: Array<() => void>;
  superseded: boolean;
}

export function action<I = void, R = void>(
  fn: (input: I, ctx: ActionContext) => Promise<R> | R,
  options: ActionOptions<I, R> = {},
): Action<I, R> {
  const mode = options.concurrency ?? "latest";
  const count = signal(0);
  const error = signal<unknown>(undefined, { equals: false });
  const result = signal<R | undefined>(undefined);
  const active = new Set<Run>();
  let tail: Promise<unknown> = Promise.resolve();
  let seq = 0;

  const rollback = (r: Run): void => {
    const list = r.rollbacks.splice(0).reverse();
    for (const undo of list) {
      try {
        undo();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const execute = async (input: I): Promise<R | undefined> => {
    const r: Run = { ctrl: new AbortController(), rollbacks: [], superseded: false };
    const id = ++seq;
    active.add(r);
    batch(() => error.set(undefined));
    const ctx: ActionContext = {
      signal: r.ctrl.signal,
      optimistic(apply) {
        const undo = apply();
        if (typeof undo === "function") r.rollbacks.push(undo);
      },
    };
    try {
      const value = await fn(input, ctx);
      if (r.superseded) return undefined;
      r.rollbacks.length = 0;
      const keys =
        typeof options.invalidates === "function"
          ? options.invalidates(input, value)
          : (options.invalidates ?? []);
      for (const k of keys) await invalidate(k);
      if (r.superseded) return undefined;
      batch(() => {
        // In parallel mode the newest started run owns result/error.
        if (mode !== "parallel" || id === seq) result.set(value);
      });
      options.onSuccess?.(value, input);
      return value;
    } catch (e) {
      rollback(r);
      if (r.superseded) return undefined;
      batch(() => error.set(e ?? new Error("rejected")));
      options.onError?.(e, input);
      return undefined;
    } finally {
      active.delete(r);
      count.update((n) => n - 1);
    }
  };

  return {
    run(input) {
      count.update((n) => n + 1);
      if (mode === "latest") {
        for (const r of active) {
          r.superseded = true;
          rollback(r);
          r.ctrl.abort();
        }
        active.clear();
      }
      if (mode === "queue") {
        const p = tail.then(() => execute(input));
        tail = p;
        return p;
      }
      return execute(input);
    },
    pending: () => count() > 0,
    error: () => error(),
    result: () => result(),
    reset() {
      batch(() => {
        error.set(undefined);
        result.set(undefined);
      });
    },
  };
}
