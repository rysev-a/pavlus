// Dashboard (module): the handlers of this module. Pure: (msg, state) => effects.
// Every effect names its replyTo and onError; the runtime stamps the rid on them.
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  type ServerState,
  pgEffector as pg,
  httpEffector as http,
  requestsEffector as rq,
} from "pavlus-server";

const json = (v: unknown): unknown =>
  v !== null && typeof v === "object" ? JSON.stringify(v) : v;

export const inputs = ["dashboard.get"] as const;
export const outputs = ["dashboard.ready"] as const;

export function handle(msg: Message, state: ServerState): Effect[] | undefined {
  switch (msg.id) {
    case "dashboard.get": {
      // four numbers for the front desk
      return [
        pg.query(
          "select count(*)::int as n from orders where status != 'done'",
          { replyTo: "dashboard.open", onError: "dashboard.failed" },
        ),
      ];
    }
    case "dashboard.open": {
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [
        rq.merge({ open: p?.rows?.[0]?.n }),
        pg.query("select count(*)::int as n from customers", {
          replyTo: "dashboard.customers",
          onError: "dashboard.failed",
        }),
      ];
    }
    case "dashboard.customers": {
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [
        rq.merge({ customers: p?.rows?.[0]?.n }),
        pg.query(
          "select coalesce(sum(total), 0) as revenue from orders where status = 'done'",
          { replyTo: "dashboard.revenue", onError: "dashboard.failed" },
        ),
      ];
    }
    case "dashboard.revenue": {
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [
        rq.merge({ revenue: p?.rows?.[0]?.revenue }),
        pg.query(
          "select name, points from customers order by points desc limit 3",
          { replyTo: "dashboard.leaders", onError: "dashboard.failed" },
        ),
      ];
    }
    case "dashboard.leaders": {
      const p = (msg.payload ?? {}) as Record<string, any>;
      const req = (state.requests[msg.ctx!.rid as string] ?? {}) as Record<
        string,
        any
      >;
      return [
        http.json(
          {
            openOrders: req?.open,
            customers: req?.customers,
            revenue: req?.revenue,
            leaders: p?.rows,
          },
          200,
        ),
      ];
    }
    case "dashboard.failed": {
      return [http.json({ error: "The numbers could not be worked out" }, 500)];
    }
  }
  return undefined;
}
