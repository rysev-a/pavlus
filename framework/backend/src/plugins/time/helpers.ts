import type { TimeEffect } from "./mod.ts";

type Of<T extends TimeEffect["type"]> = Extract<TimeEffect, { type: T }>;

export interface TimeEffector {
  /** Replies `replyTo` after `ms` with the request's ctx. Restarts timer `id` if given. */
  after(
    ms: number,
    replyTo: string,
    o?: { id?: string; payload?: unknown },
  ): Of<"timer.after">;
  every(
    ms: number,
    replyTo: string,
    o?: { id?: string; payload?: unknown },
  ): Of<"timer.every">;
  cancel(id: string): Of<"timer.cancel">;
  /** 5-field cron expression; each tick is a new `job` request. */
  cron(
    expr: string,
    replyTo: string,
    o?: { id?: string; tz?: string; payload?: unknown },
  ): Of<"cron">;
  cancelCron(id: string): Of<"cron.cancel">;
}

const opt = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export const timeEffector: TimeEffector = {
  after: (ms, replyTo, o = {}) =>
    ({
      plugin: "time",
      type: "timer.after",
      ms,
      replyTo,
      ...opt(o),
    }) as Of<"timer.after">,
  every: (ms, replyTo, o = {}) =>
    ({
      plugin: "time",
      type: "timer.every",
      ms,
      replyTo,
      ...opt(o),
    }) as Of<"timer.every">,
  cancel: (id) => ({ plugin: "time", type: "timer.cancel", id }),
  cron: (expr, replyTo, o = {}) =>
    ({ plugin: "time", type: "cron", expr, replyTo, ...opt(o) }) as Of<"cron">,
  cancelCron: (id) => ({ plugin: "time", type: "cron.cancel", id }),
};
