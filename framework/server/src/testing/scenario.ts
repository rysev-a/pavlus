// `scenario` plays a whole flow against a handler: inject a message, assert
// the effects, answer one of them with a scripted reply (same ctx), assert the
// next effects... and finally the state. No network, database or clock.
import type { ComponentLike, Effect, Message } from "@pavlus/core";
import { fail, reply } from "../ctx.ts";
import type { ServerState } from "../plugins/requests/mod.ts";
import { type FlowOptions, flow } from "./flow.ts";
import { mismatch, type Pattern, show } from "./match.ts";

export type Step =
  /** Inject a message. */
  | { send: Message }
  /**
   * Assert the effects produced by the previous step. `exact` (default) wants
   * as many effects as patterns; with `exact: false` the patterns must match
   * a subsequence. `reply` answers the effect at `from` (default: the first
   * one matched) with the same ctx; `error` answers its `onError`.
   */
  | {
      expect: Pattern | Pattern[];
      exact?: boolean;
      from?: number;
      reply?:
        | { id?: string; payload?: unknown }
        | ((effect: Effect) => { id?: string; payload?: unknown });
      error?: unknown | ((effect: Effect) => unknown);
    }
  /** Assert (partially) the state. */
  | { state: Pattern };

export class ScenarioError extends Error {}

export interface ScenarioResult<S extends ServerState> {
  state: S;
  /** Effects produced by the last executed step. */
  effects: Effect[];
}

export function scenario<S extends ServerState = ServerState>(
  handler: ComponentLike<S>,
  steps: Step[],
  opts: FlowOptions<S> = {},
): ScenarioResult<S> {
  const f = flow(handler, opts);
  let current: Effect[] = [];
  const bad = (i: number, msg: string): never => {
    throw new ScenarioError(
      `scenario step ${i + 1}: ${msg}\n  effects: ${show(current)}`,
    );
  };
  steps.forEach((step, i) => {
    if ("send" in step) {
      current = f.send(step.send);
    } else if ("expect" in step) {
      const patterns = Array.isArray(step.expect) ? step.expect : [step.expect];
      const exact = step.exact ?? true;
      let matched: number[] = [];
      if (exact) {
        if (current.length !== patterns.length)
          bad(
            i,
            `expected ${patterns.length} effect(s), got ${current.length}`,
          );
        patterns.forEach((p, k) => {
          const m = mismatch(current[k], p, `effect[${k}]`);
          if (m) bad(i, m);
        });
        matched = patterns.map((_, k) => k);
      } else {
        let at = 0;
        for (const p of patterns) {
          while (at < current.length && mismatch(current[at], p) !== undefined)
            at++;
          if (at >= current.length)
            bad(i, `no effect matches ${show(p)} (in order)`);
          matched.push(at++);
        }
      }
      if (step.reply !== undefined || step.error !== undefined) {
        const target = current[step.from ?? matched[0] ?? 0];
        if (!target) return bad(i, "no effect to answer");
        let msg: Message | undefined;
        if (step.error !== undefined) {
          const err =
            typeof step.error === "function" ? step.error(target) : step.error;
          msg = fail(target, err);
          if (!msg) return bad(i, "the effect has no onError to answer");
        } else {
          const r =
            typeof step.reply === "function" ? step.reply(target) : step.reply!;
          const id = r.id ?? (target.replyTo as string | undefined);
          if (!id)
            return bad(i, "the effect has no replyTo and the reply has no id");
          msg = reply(target, { id, payload: r.payload });
        }
        current = f.send(msg);
      }
    } else {
      const m = mismatch(f.state, step.state, "state");
      if (m) bad(i, m);
    }
  });
  return { state: f.state, effects: current };
}
