// /healthz is liveness: the process answers. /readyz is readiness: migrations
// ran, we are not draining, and Postgres and Redis both answer right now.
// The two checks run in parallel; the slice joins them.
import {
  answer,
  at,
  pg,
  problem,
  redis,
  rq,
  sharedOf,
  sql,
  type Handler,
  type RouteFn,
} from "./kit.ts";

const live: RouteFn = (call) => answer(call.route, 200, { status: "ok" });

const ready: RouteFn = (call, state) => {
  const s = sharedOf(state);
  if (s.draining) return problem(call.route, 503, "draining", "shutting down");
  if (!s.ready) return problem(call.route, 503, "starting", "not ready yet");
  return [
    rq.merge({ step: "checks", checks: {} }),
    pg.query(sql`select 1 as ok`, {
      timeoutMs: 1000,
      replyTo: "health.pg",
      onError: "health.pgFailed",
    }),
    redis.cmd(["PING"], {
      timeoutMs: 1000,
      replyTo: "health.redis",
      onError: "health.redisFailed",
    }),
  ];
};

export const routes: Record<string, RouteFn> = {
  "health.live": live,
  "health.ready": ready,
};

export const health: Handler = (msg, state) => {
  const which: Record<string, [string, boolean]> = {
    "health.pg": ["pg", true],
    "health.pgFailed": ["pg", false],
    "health.redis": ["redis", true],
    "health.redisFailed": ["redis", false],
  };
  const hit = which[msg.id];
  if (!hit) return undefined;
  const r = at(state, msg, "checks");
  if (!r) return [];
  const checks = { ...(r.checks as Record<string, boolean>), [hit[0]]: hit[1] };
  if (Object.keys(checks).length < 2)
    return [rq.set(["checks", hit[0]], hit[1])];
  const allOk = Object.values(checks).every(Boolean);
  return [
    rq.set("step", "done"),
    ...answer(r.route, allOk ? 200 : 503, {
      status: allOk ? "ready" : "degraded",
      checks,
    }),
  ];
};
