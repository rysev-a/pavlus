// How anything becomes the application. Structural on purpose: the frontend's
// Component and the backend's controllers both dispatch messages through a
// method, and neither package imports the other — this file is the seam.
import type { AppFn, Effect, Message } from "./types.ts";

/** An object that handles messages through a `dispatch(message, state)` method. */
export interface DispatchLike<S = any> {
  dispatch(message: Message, state: S): Effect[];
}

/**
 * Anything usable as the application: a function (`AppFn`), or an object with
 * a `dispatch(message, state)` method (a component on the frontend, a
 * controller on the backend). Plain objects are not accepted.
 */
export type ComponentLike<S = any> = AppFn<S> | DispatchLike<S>;

const handlers = new WeakMap<object, AppFn>();

/** Normalizes an application to the function form (cached per instance). */
export function toHandler<S = any>(c: ComponentLike<S>): AppFn<S> {
  if (typeof c === "function") {
    // a class of dispatchers: the prototype has the method, instances use it
    if (
      typeof (c.prototype as DispatchLike<S> | undefined)?.dispatch ===
      "function"
    ) {
      throw new Error(
        `pavlus: ${c.name} is a class: pass an instance (new ${c.name}()), not the class`,
      );
    }
    return c;
  }
  if (
    c === null ||
    typeof c !== "object" ||
    typeof (c as DispatchLike<S>).dispatch !== "function"
  ) {
    const kind =
      c === null || (typeof c !== "object" && typeof c !== "function")
        ? String(c)
        : Object.getPrototypeOf(c) === Object.prototype
          ? "a plain object (defineComponent is gone: write a class that extends Component)"
          : `an instance of ${Object.getPrototypeOf(c)?.constructor?.name ?? "an unknown class"}, which does not extend Component`;
    throw new Error(
      `pavlus: a component is a function or an instance of a class extending Component, got ${kind}`,
    );
  }
  let h = handlers.get(c);
  if (!h)
    handlers.set(
      c,
      (h = (m: Message, st: S) => (c as DispatchLike<S>).dispatch(m, st)),
    );
  return h as AppFn<S>;
}
