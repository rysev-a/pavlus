// `flow` runs a handler without any plugin: send a message, get the effects
// (stamped with the message's ctx, as the runtime would), and the state moves
// as the `requests` plugin would move it.
import {
  toHandler,
  type ComponentLike,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  applyRequestsEffect,
  type ServerState,
} from "../plugins/requests/mod.ts";
import {
  dispatchRoute,
  toRouter,
  type RouteTable,
  type Router,
} from "../routing.ts";

export interface FlowOptions<S extends ServerState> {
  state?: Partial<S>;
  routes?: RouteTable | Router;
}

export interface Flow<S extends ServerState> {
  /** Handles one message: returns the effects, applies state effects. */
  send(message: Message): Effect[];
  readonly state: S;
  /** Every `[message, effects]` so far. */
  readonly log: readonly (readonly [Message, Effect[]])[];
}

export function flow<S extends ServerState = ServerState>(
  handler: ComponentLike<S>,
  opts: FlowOptions<S> = {},
): Flow<S> {
  const fn = toHandler(handler);
  const router = opts.routes ? toRouter(opts.routes) : undefined;
  let state = {
    ...opts.state,
    requests: { ...opts.state?.requests }, // the map is updated in place
    shared: opts.state?.shared ?? {},
  } as S;
  const log: (readonly [Message, Effect[]])[] = [];
  return {
    get state() {
      return state;
    },
    log,
    send(message) {
      let msg = message;
      const rid = msg.ctx?.rid;
      if (typeof rid === "string" && !(rid in state.requests))
        state.requests[rid] = {};
      let produced: Effect[];
      const routed =
        router && msg.id === "http.request"
          ? dispatchRoute(router, msg)
          : undefined;
      if (routed && "effects" in routed) produced = routed.effects;
      else {
        if (routed) msg = routed.message;
        produced = fn(msg, state);
      }
      const effects = msg.ctx
        ? produced.map((e) => (e.ctx ? e : { ...e, ctx: msg.ctx }))
        : produced;
      for (const e of effects) state = applyRequestsEffect(state, e);
      log.push([message, effects]);
      return effects;
    },
  };
}
