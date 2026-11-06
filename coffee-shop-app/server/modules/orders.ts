// Orders (module): the handlers of this module. Pure: (msg, state) => effects.
// Every effect names its replyTo and onError; the runtime stamps the rid on them.
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  type ServerState,
  pgEffector as pg,
  httpEffector as http,
} from "pavlus-server";

const json = (v: unknown): unknown =>
  v !== null && typeof v === "object" ? JSON.stringify(v) : v;

export const inputs = ["orders.list", "orders.setStatus"] as const;
export const outputs = [
  "orders.listed",
  "order.updated",
  "order.missing",
] as const;

export function handle(msg: Message, state: ServerState): Effect[] | undefined {
  switch (msg.id) {
    case "orders.list": {
      // newest first, optionally one status
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [
        pg.query(
          "select * from orders where $1::text is null or $2::text = '' or status = $3 order by id desc",
          { replyTo: "orders.listed", onError: "orders.failed" },
          [
            json(p?.query?.status),
            json(p?.query?.status),
            json(p?.query?.status),
          ],
        ),
      ];
    }
    case "orders.listed": {
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [http.json({ orders: p?.rows }, 200)];
    }
    case "orders.setStatus": {
      // new, preparing, ready, done
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [
        pg.query(
          "update orders set status = $1 where id = $2 returning *",
          { replyTo: "orders.statusSet", onError: "orders.failed" },
          [json(p?.body?.status), json(p?.params?.id)],
        ),
      ];
    }
    case "orders.statusSet": {
      const p = (msg.payload ?? {}) as Record<string, any>;
      const out: Effect[] = [];
      if (p?.rowCount > 0) out.push(http.json({ order: p?.rows?.[0] }, 200));
      if (p?.rowCount == 0)
        out.push(http.json({ error: "No such order" }, 404));
      return out;
    }
    case "orders.failed": {
      return [http.json({ error: "The orders could not be read" }, 500)];
    }
  }
  return undefined;
}
