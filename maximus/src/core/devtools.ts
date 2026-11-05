/**
 * Devtools hook. `globalThis.__MAXIMUS__` is the only integration point: when
 * it is absent, or has no listener, the runtime does no extra work (events are
 * built lazily, behind {@link devtoolsActive}).
 *
 * A tool can either install its own hook object (`{ listeners: Set<fn> }`, with
 * an optional `emit`) before the app loads, or call {@link installDevtools}.
 *
 * @module
 */

export interface DevtoolsEvent {
  /** `signal:write`, `computed:update`, `effect:run`, `owner:create`, `owner:dispose`, `error`, `mount`, `unmount`, ... */
  type: string;
  [key: string]: unknown;
}

export type DevtoolsListener = (event: DevtoolsEvent) => void;

export interface DevtoolsHook {
  version: number;
  listeners: Set<DevtoolsListener>;
  /** Subscribe; returns the unsubscribe function. */
  on(listener: DevtoolsListener): () => void;
  emit(event: DevtoolsEvent): void;
}

type Host = { __MAXIMUS__?: DevtoolsHook };

/** Install (or fetch) the hook object and return it. */
export function installDevtools(): DevtoolsHook {
  const host = globalThis as Host;
  if (host.__MAXIMUS__ === undefined) {
    const listeners = new Set<DevtoolsListener>();
    host.__MAXIMUS__ = {
      version: 1,
      listeners,
      on(listener) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      emit(event) {
        for (const l of listeners) l(event);
      },
    };
  }
  return host.__MAXIMUS__;
}

/** True only when a hook exists and somebody listens. Guard event construction with it. */
export function devtoolsActive(): boolean {
  const h = (globalThis as Host).__MAXIMUS__;
  return h !== undefined && h.listeners !== undefined && h.listeners.size > 0;
}

/** Emit an event; callers should check {@link devtoolsActive} first so nothing is allocated otherwise. */
export function emit(event: DevtoolsEvent): void {
  const h = (globalThis as Host).__MAXIMUS__;
  if (h === undefined) return;
  if (h.emit !== undefined) h.emit(event);
  else for (const l of h.listeners) l(event);
}
