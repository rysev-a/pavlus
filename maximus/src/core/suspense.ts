import { createContext } from "./context.ts";
import type { Accessor } from "./reactive.ts";

/**
 * What a `suspense()` boundary provides to async primitives (wave 2's
 * `resource`, `lazy`). While at least one registered promise is unsettled,
 * the boundary shows its fallback.
 */
export interface SuspenseContext {
  /** Track a promise. Rejections are not observed here (the resource surfaces them). */
  register(promise: Promise<unknown>): void;
  /** Number of unsettled registered promises (reactive). */
  pending: Accessor<number>;
}

export const SuspenseCtx = createContext<SuspenseContext | null>(null);

/** The nearest suspense boundary's context, or `null` outside any boundary. */
export function useSuspense(): SuspenseContext | null {
  return SuspenseCtx.use();
}

/**
 * Tell the nearest suspense boundary that `promise` is loading. Returns the
 * promise unchanged; a no-op outside a boundary.
 */
export function registerPending<T>(promise: Promise<T>): Promise<T> {
  useSuspense()?.register(promise);
  return promise;
}
