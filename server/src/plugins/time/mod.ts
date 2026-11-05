import type { Plugin, PluginContext } from "@service-laboratory/pavlus";
import { type Cancellable, type Ctx, ridOf } from "../_reply.ts";
import { type Clock, systemClock } from "./clock.ts";
import { nextCron, parseCron } from "./cron.ts";

export { timeEffector } from "./helpers.ts";
export type { TimeEffector } from "./helpers.ts";
export { createFakeClock, systemClock } from "./clock.ts";
export type { Clock, FakeClock } from "./clock.ts";
export { nextCron, parseCron } from "./cron.ts";

type Base = { plugin: "time"; ctx?: Ctx };

export type TimeEffect =
  /** One-shot timer; replies `replyTo` with `payload` (and the effect's ctx). */
  | (Base & {
      type: "timer.after";
      id?: string;
      ms: number;
      replyTo: string;
      payload?: unknown;
    })
  | (Base & {
      type: "timer.every";
      id?: string;
      ms: number;
      replyTo: string;
      payload?: unknown;
    })
  | (Base & { type: "timer.cancel"; id: string })
  /** Scheduled job: every tick dispatches `replyTo` with a fresh ctx `{rid, conn: "job"}`. */
  | (Base & {
      type: "cron";
      id?: string;
      expr: string;
      tz?: string;
      replyTo: string;
      payload?: unknown;
    })
  | (Base & { type: "cron.cancel"; id: string });

export interface TimePluginOptions {
  clock?: Clock;
}

export interface TimePlugin extends Plugin<TimeEffect, any>, Cancellable {
  /** Ids of timers (not cron jobs) currently running. */
  active(): string[];
  /** Ids of registered cron jobs. */
  jobs(): string[];
}

const MAX_DELAY = 2 ** 31 - 1;

export function createTimePlugin(opts: TimePluginOptions = {}): TimePlugin {
  const clock = opts.clock ?? systemClock;
  const timers = new Map<string, { stop: () => void; rid?: string }>();
  const jobs = new Map<string, () => void>();
  let anon = 0;
  let ctxRef: PluginContext | undefined;

  const stopTimer = (id: string) => {
    timers.get(id)?.stop();
    timers.delete(id);
  };
  const stopJob = (id: string) => {
    jobs.get(id)?.();
    jobs.delete(id);
  };

  /** setTimeout that survives delays beyond the 32-bit limit. */
  function sleepUntil(at: number, fn: () => void): () => void {
    let h: unknown;
    let stopped = false;
    const arm = () => {
      const left = at - clock.now();
      if (left <= 0) return fn();
      h = clock.setTimeout(() => !stopped && arm(), Math.min(left, MAX_DELAY));
    };
    arm();
    return () => {
      stopped = true;
      clock.clearTimeout(h);
    };
  }

  return {
    name: "time",
    init(ctx) {
      ctxRef = ctx;
    },
    handle(effect, ctx) {
      ctxRef = ctx;
      switch (effect.type) {
        case "timer.after": {
          const id = effect.id ?? `timer-${++anon}`;
          stopTimer(id);
          const h = clock.setTimeout(
            () => {
              timers.delete(id);
              ctx.dispatch({
                id: effect.replyTo,
                payload: effect.payload,
                ...(effect.ctx && { ctx: effect.ctx }),
              });
            },
            Math.min(effect.ms, MAX_DELAY),
          );
          timers.set(id, {
            stop: () => clock.clearTimeout(h),
            rid: ridOf(effect),
          });
          return;
        }
        case "timer.every": {
          const id = effect.id ?? `timer-${++anon}`;
          stopTimer(id);
          let h: unknown;
          const tick = () => {
            h = clock.setTimeout(() => {
              ctx.dispatch({
                id: effect.replyTo,
                payload: effect.payload,
                ...(effect.ctx && { ctx: effect.ctx }),
              });
              if (timers.has(id)) tick();
            }, effect.ms);
          };
          tick();
          timers.set(id, {
            stop: () => clock.clearTimeout(h),
            rid: ridOf(effect),
          });
          return;
        }
        case "timer.cancel":
          return stopTimer(effect.id);
        case "cron": {
          const id = effect.id ?? `cron-${++anon}`;
          stopJob(id);
          const spec = parseCron(effect.expr);
          const tz = effect.tz ?? "UTC";
          let stop = () => {};
          const schedule = (from: number) => {
            const at = nextCron(spec, from, tz);
            stop = sleepUntil(at, () => {
              ctx.dispatch({
                id: effect.replyTo,
                payload: effect.payload ?? { job: id, at },
                ctx: { rid: `job:${id}:${at}`, conn: "job" },
              });
              schedule(at);
            });
          };
          schedule(clock.now());
          jobs.set(id, () => stop());
          return;
        }
        case "cron.cancel":
          return stopJob(effect.id);
      }
    },
    /** Clears the timers of that request; cron jobs belong to nobody and stay. */
    cancel(rid) {
      for (const [id, t] of [...timers]) if (t.rid === rid) stopTimer(id);
    },
    active: () => [...timers.keys()],
    jobs: () => [...jobs.keys()],
    dispose() {
      for (const id of [...timers.keys()]) stopTimer(id);
      for (const id of [...jobs.keys()]) stopJob(id);
      void ctxRef;
    },
  };
}
