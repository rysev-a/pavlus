// GET /slow?ms=N: a query that sleeps N ms inside Postgres. It exists to
// show two things:
//  * the request deadline: `request.timeout` arrives, the app answers 504,
//    and the runtime cancels the running query (pg_cancel_backend);
//  * a client that hangs up: `http.aborted` arrives and the same cancellation
//    happens. Neither leaves a query, a transaction or a timer behind.
import {
  answer,
  at,
  internal,
  invalid,
  pg,
  problem,
  rq,
  sql,
  type Handler,
  type RouteFn,
} from "./kit.ts";

const slow: RouteFn = (call) => {
  const raw = call.http.query.ms;
  const ms = typeof raw === "string" ? Number(raw) : 100;
  if (!Number.isFinite(ms) || ms < 0 || ms > 60_000)
    return invalid(call.route, { ms: "0 to 60000" });
  return [
    rq.set("step", "sleeping"),
    pg.query(sql`select pg_sleep(${ms / 1000}) as slept, ${ms}::int as ms`, {
      replyTo: "demo.slow.done",
      onError: "demo.slow.failed",
    }),
  ];
};

export const routes: Record<string, RouteFn> = { "demo.slow": slow };

export const demo: Handler = (msg, state) => {
  switch (msg.id) {
    case "demo.slow.done": {
      const r = at(state, msg, "sleeping");
      if (!r) return [];
      const { rows } = msg.payload as { rows: { ms: number }[] };
      return answer(r.route, 200, { sleptMs: rows[0]!.ms });
    }
    case "demo.slow.failed": {
      // 57014: Postgres cancelled the query at the request deadline
      const e = msg.payload as { code?: string };
      return e.code === "57014"
        ? problem("demo.slow", 504, "timeout", "the request took too long")
        : internal("demo.slow", "pg_sleep", e);
    }
  }
  return undefined;
};
