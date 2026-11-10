// The gate every routed request passes through, written as a state machine
// in `state.requests[rid].step`:
//
//   gate -> (INCR rate key) -> [EXPIRE on first hit] -> session lookup -> run
//
// Rate limiting is fail-open (Redis down must not take the API down),
// authentication is fail-closed (503 when sessions cannot be checked).
import type { Effect, Message } from "@pavlus/core";
import {
  type AppState,
  at,
  type Call,
  type Handler,
  type HttpReq,
  K,
  log,
  problem,
  type Req,
  redis,
  reqOf,
  rq,
  tokenOf,
  type User,
} from "./kit.ts";
import { HANDLERS } from "./registry.ts";
import { META, type RouteMeta } from "./routes.ts";

const callOf = (msg: Message, user?: User): Call => {
  const h = msg.payload as HttpReq;
  return {
    ctx: msg.ctx as Call["ctx"],
    route: META[msg.id]!.id,
    http: h,
    ...(user && { user }),
  };
};

/** Hand over to the route's own function. */
function run(call: Call, state: AppState): Effect[] {
  const fn = HANDLERS[call.route];
  if (!fn)
    return problem(call.route, 501, "not_implemented", "no handler for route");
  return [
    ...(call.user ? [rq.merge({ user: call.user, step: "run" })] : []),
    ...fn(call, state),
  ];
}

function authenticate(call: Call, state: AppState, meta: RouteMeta): Effect[] {
  if (!meta.auth) return run(call, state);
  const token = tokenOf(call.http);
  if (!token)
    return problem(call.route, 401, "unauthenticated", "login required");
  return [
    rq.set("step", "session"),
    redis.get(K.session(token), {
      replyTo: "gate.session",
      onError: "gate.sessionFailed",
    }),
  ];
}

export const gate: Handler = (msg, state) => {
  const meta = META[msg.id];
  if (meta) {
    const call = callOf(msg);
    const h = call.http;
    const base = rq.merge({ route: meta.id, http: h, step: "rate" });
    if (meta.limit === false) return [base, ...authenticate(call, state, meta)];
    return [
      base,
      redis.incr(K.rate(h.ip), {
        replyTo: "gate.counted",
        onError: "gate.rateFailed",
      }),
    ];
  }

  switch (msg.id) {
    case "gate.counted": {
      const r = at(state, msg, "rate");
      if (!r) return [];
      const n = msg.payload as number;
      const { limit, windowSec } = state.config.rateLimit;
      const route = r.route;
      if (n > limit)
        // how long until the window closes: ask Redis
        return [
          rq.set("step", "retry"),
          redis.ttl(K.rate(r.http.ip), {
            replyTo: "gate.ttl",
            onError: "gate.rateFailed",
          }),
        ];
      if (n === 1)
        return [
          rq.set("step", "arm"),
          redis.expire(K.rate(r.http.ip), windowSec, {
            replyTo: "gate.armed",
            onError: "gate.rateFailed",
          }),
        ];
      return authenticate(callOfReq(r, msg), state, META[route]!);
    }
    case "gate.armed": {
      const r = at(state, msg, "arm");
      if (!r) return [];
      return authenticate(callOfReq(r, msg), state, META[r.route]!);
    }
    case "gate.ttl": {
      const r = at(state, msg, "retry");
      if (!r) return [];
      const { windowSec } = state.config.rateLimit;
      const ttl = msg.payload as number;
      // ttl -1: the key has no expiry (a crash between INCR and EXPIRE): heal it
      const retryAfter = ttl > 0 ? ttl : windowSec;
      return [
        ...(ttl < 0
          ? [redis.expire(K.rate(r.http.ip), windowSec, { onError: "noop" })]
          : []),
        log.warn("rate limited", { route: r.route, ip: r.http.ip }),
        ...problem(
          r.route,
          429,
          "rate_limited",
          "too many requests",
          undefined,
          { headers: { "retry-after": retryAfter } },
        ),
      ];
    }
    case "gate.rateFailed": {
      const r = reqOf(state, msg);
      if (!r) return [];
      // fail open: log, and carry on as if the counter said "fine"
      return [
        log.warn("rate limiter unavailable, failing open", {
          error: msg.payload,
        }),
        ...authenticate(callOfReq(r, msg), state, META[r.route]!),
      ];
    }
    case "gate.session": {
      const r = at(state, msg, "session");
      if (!r) return [];
      const raw = msg.payload as string | null;
      let user: User | undefined;
      try {
        user = raw ? (JSON.parse(raw) as User) : undefined;
      } catch {
        user = undefined;
      }
      if (!user)
        return problem(r.route, 401, "unauthenticated", "session expired");
      const token = tokenOf(r.http)!;
      return [
        // sliding expiry; if it fails we only log (see `noop`)
        redis.expire(K.session(token), state.config.sessionTtlSec, {
          onError: "noop",
        }),
        ...run(callOfReq(r, msg, user), state),
      ];
    }
    case "gate.sessionFailed": {
      const r = reqOf(state, msg);
      if (!r) return [];
      return [
        log.error("session store unavailable", { error: msg.payload }),
        ...problem(r.route, 503, "unavailable", "cannot check the session"),
      ];
    }
    case "noop":
      // fire-and-forget effects name this as their onError: log, nothing else
      return [log.warn("background effect failed", { error: msg.payload })];
  }
  return undefined;
};

const callOfReq = (r: Req, msg: Message, user?: User): Call => ({
  ctx: msg.ctx as Call["ctx"],
  route: r.route,
  http: r.http,
  ...(user && { user }),
});
