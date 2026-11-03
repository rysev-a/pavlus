import type { TimeEffect } from "./mod.ts";

type Of<T extends TimeEffect["type"]> = Extract<TimeEffect, { type: T }>;

/** Builders for time effects. */
export interface TimeEffector {
  /** Replies with the current time (ms since epoch) as message `replyTo`. */
  now(replyTo: string): Of<"now">;
  /** Fires message `replyTo` (with `payload`) once after `ms`. Restarts timer `id`. */
  setTimeout(
    id: string,
    ms: number,
    replyTo: string,
    payload?: unknown,
  ): Of<"setTimeout">;
  /** Fires message `replyTo` (with `payload`) every `ms`. Restarts timer `id`. */
  setInterval(
    id: string,
    ms: number,
    replyTo: string,
    payload?: unknown,
  ): Of<"setInterval">;
  /** Stops timer `id` (timeout or interval). */
  cancel(id: string): Of<"cancel">;
  /** Stops every timer. */
  cancelAll(): Of<"cancelAll">;
}

/**
 * ```ts
 * import { timeEffector as time } from "@service-laboratory/pavlus/plugins/time";
 *
 * // debounce: starting the same id again cancels the previous timer
 * return [time.setTimeout("search", 300, "searchFire", query)];
 * ```
 */
export const timeEffector: TimeEffector = {
  now: (replyTo) => ({ plugin: "time", type: "now", replyTo }),
  setTimeout: (id, ms, replyTo, payload) =>
    payload === undefined
      ? { plugin: "time", type: "setTimeout", id, ms, replyTo }
      : { plugin: "time", type: "setTimeout", id, ms, replyTo, payload },
  setInterval: (id, ms, replyTo, payload) =>
    payload === undefined
      ? { plugin: "time", type: "setInterval", id, ms, replyTo }
      : { plugin: "time", type: "setInterval", id, ms, replyTo, payload },
  cancel: (id) => ({ plugin: "time", type: "cancel", id }),
  cancelAll: () => ({ plugin: "time", type: "cancelAll" }),
};
