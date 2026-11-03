import type { Plugin } from "../../core/types.ts";

export type TimeEffect =
  /** Reply with the current time in ms since epoch. */
  | { plugin: "time"; type: "now"; replyTo: string }
  /** (Re)starts the timer `id`. A running timer with the same id is cancelled. */
  | {
      plugin: "time";
      type: "setTimeout";
      id: string;
      ms: number;
      replyTo: string;
      payload?: unknown;
    }
  | {
      plugin: "time";
      type: "setInterval";
      id: string;
      ms: number;
      replyTo: string;
      payload?: unknown;
    }
  | { plugin: "time"; type: "cancel"; id: string }
  | { plugin: "time"; type: "cancelAll" };

export interface TimePluginOptions {
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface TimePlugin extends Plugin<TimeEffect, any> {
  /** Ids of timers currently running. */
  active(): string[];
}

/** Everything about time: the clock, timeouts and intervals, all cancellable by id. */
export function createTimePlugin(opts: TimePluginOptions = {}): TimePlugin {
  const now = opts.now ?? Date.now;
  const st = opts.setTimeout ?? ((f, ms) => globalThis.setTimeout(f, ms));
  const ct = opts.clearTimeout ?? ((h) => globalThis.clearTimeout(h as number));
  const si = opts.setInterval ?? ((f, ms) => globalThis.setInterval(f, ms));
  const ci =
    opts.clearInterval ?? ((h) => globalThis.clearInterval(h as number));
  const timers = new Map<string, () => void>();

  const cancel = (id: string): void => {
    timers.get(id)?.();
    timers.delete(id);
  };

  return {
    name: "time",
    handle(effect, ctx) {
      switch (effect.type) {
        case "now":
          return ctx.dispatch({ id: effect.replyTo, payload: now() });
        case "setTimeout": {
          cancel(effect.id);
          const h = st(() => {
            timers.delete(effect.id);
            ctx.dispatch({ id: effect.replyTo, payload: effect.payload });
          }, effect.ms);
          timers.set(effect.id, () => ct(h));
          return;
        }
        case "setInterval": {
          cancel(effect.id);
          const h = si(
            () => ctx.dispatch({ id: effect.replyTo, payload: effect.payload }),
            effect.ms,
          );
          timers.set(effect.id, () => ci(h));
          return;
        }
        case "cancel":
          return cancel(effect.id);
        case "cancelAll":
          for (const id of [...timers.keys()]) cancel(id);
      }
    },
    active: () => [...timers.keys()],
    dispose() {
      for (const id of [...timers.keys()]) cancel(id);
    },
  };
}

export { timeEffector } from "./helpers.ts";
export type { TimeEffector } from "./helpers.ts";
