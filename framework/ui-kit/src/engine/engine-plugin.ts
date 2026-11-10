import type { Effect, Plugin } from "@pavlus/client";

/** What the Template engine page asks of the `engine` plugin. */
export type EngineEffect = Effect & { plugin: "engine"; type: "trace" } & {
  template: string;
  prev: string;
  next: string;
  onSuccess: string;
  onError: string;
};

export const engineEffector = {
  /** Run every stage of the template engine on a template. */
  trace: (
    template: string,
    prev: string,
    next: string,
    onSuccess: string,
    onError: string,
  ): EngineEffect => ({
    plugin: "engine",
    type: "trace",
    template,
    prev,
    next,
    onSuccess,
    onError,
  }),
};

/**
 * Loads the compiler on demand (it is large) and answers with the trace of
 * the template: the effect only asks, the plugin does the I/O.
 */
export function createEnginePlugin(): Plugin<EngineEffect, unknown> {
  return {
    name: "engine",
    handle(effect, ctx) {
      import("./trace.ts").then(
        ({ traceTemplate }) =>
          ctx.dispatch({
            id: effect.onSuccess,
            payload: traceTemplate(effect.template, effect.prev, effect.next),
          }),
        () => ctx.dispatch({ id: effect.onError, payload: null }),
      );
    },
  };
}
