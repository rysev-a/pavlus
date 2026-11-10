// A worked example plugin: `mail.send`. Not part of the package; it lives here
// so that docs/plugins.md is compiled and tested. It shows the whole contract:
// effects in, replies with the effect's ctx out, `cancel(rid)`, `stop()`,
// `closed()` and `dispose()`.
// #region plugin
import type { Plugin, PluginContext } from "@pavlus/core";
import {
  type Cancellable,
  deliver,
  type EffectCtx,
  fail,
  ok,
  ridOf,
} from "../../../src/ctx.ts";

export type MailEffect = {
  plugin: "mail";
  type: "send";
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  onError?: string;
  ctx?: EffectCtx;
};

/** How mail really leaves the building. Swappable, so tests never need SMTP. */
export type Transport = (
  mail: { to: string; subject: string; text: string },
  signal: AbortSignal,
) => Promise<{ id: string }>;

export interface MailPlugin extends Plugin<MailEffect, any>, Cancellable {
  stop(): void;
  closed(): Promise<void>;
  stats(): { queued: number; sending: number; sent: number; cancelled: number };
}

export function createMailPlugin(o: {
  transport: Transport;
  concurrency?: number;
}): MailPlugin {
  const max = o.concurrency ?? 2;
  const queue: Job[] = [];
  const byRid = new Map<string, Set<Job>>();
  let sending = 0,
    sent = 0,
    cancelled = 0,
    stopped = false;
  let idle: (() => void) | undefined;
  type Job = {
    effect: MailEffect;
    ctx: PluginContext<any>;
    ac: AbortController;
  };

  const pump = () => {
    while (sending < max && queue.length) {
      const job = queue.shift()!;
      sending++;
      o.transport(job.effect, job.ac.signal)
        .then(
          (r) =>
            !job.ac.signal.aborted &&
            deliver(job.ctx.dispatch, ok(job.effect, r)), // reply with the effect's ctx
          (e) =>
            !job.ac.signal.aborted &&
            deliver(
              job.ctx.dispatch,
              fail(
                job.effect,
                { code: "MAIL", message: String(e?.message ?? e) },
                "mail.error",
              ),
            ),
        )
        .finally(() => {
          sending--;
          sent++;
          const rid = ridOf(job.effect);
          if (rid) byRid.get(rid)?.delete(job);
          pump();
          if (!sending && !queue.length) idle?.();
        });
    }
  };

  return {
    name: "mail",
    handle(effect, ctx) {
      if (stopped) {
        // after stop(): refuse, but still answer, so the flow can react
        deliver(
          ctx.dispatch,
          fail(
            effect,
            { code: "STOPPED", message: "mailer is stopping" },
            "mail.error",
          ),
        );
        return;
      }
      const job: Job = { effect, ctx, ac: new AbortController() };
      const rid = ridOf(effect);
      if (rid) (byRid.get(rid) ?? byRid.set(rid, new Set()).get(rid)!).add(job);
      queue.push(job);
      pump();
    },
    // the request is over: forget its mails, abort the ones in flight, send no reply
    cancel(rid) {
      for (const job of byRid.get(rid) ?? []) {
        job.ac.abort();
        const i = queue.indexOf(job);
        if (i >= 0) queue.splice(i, 1);
        cancelled++;
      }
      byRid.delete(rid);
    },
    stop() {
      stopped = true; // stop accepting; what is queued still goes out
    },
    closed: () =>
      sending || queue.length
        ? new Promise<void>((r) => (idle = r))
        : Promise.resolve(),
    dispose() {
      stopped = true;
      for (const job of [...queue]) job.ac.abort();
      queue.length = 0;
    },
    stats: () => ({ queued: queue.length, sending, sent, cancelled }),
  };
}

export const mailEffector = {
  send: (
    to: string,
    subject: string,
    text: string,
    o: { replyTo?: string; onError?: string } = {},
  ): MailEffect => ({
    plugin: "mail",
    type: "send",
    to,
    subject,
    text,
    ...o,
  }),
};
// #endregion plugin
