// Place order (module): the handlers of this module. Pure: (msg, state) => effects.
// Every effect names its replyTo and onError; the runtime stamps the rid on them.

import {
  httpEffector as http,
  pgEffector as pg,
  requestsEffector as rq,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/frontend";
import { emit } from "./emit.ts";

const json = (v: unknown): unknown =>
  v !== null && typeof v === "object" ? JSON.stringify(v) : v;

export const inputs = ["order.valid"] as const;
export const outputs = ["order.created"] as const;

export function handle(msg: Message, state: ServerState): Effect[] | undefined {
  switch (msg.id) {
    case "order.valid": {
      // the order was checked: save it
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [
        rq.merge({ step: "insert" }),
        pg.query(
          "insert into orders (customer_id, customer_name, items, total, status, created_at) values ($1, $2, $3, $4, 'new', now()) returning *",
          { replyTo: "order.placed", onError: "order.failed" },
          [
            json(p?.body?.customerId),
            json(p?.body?.customerName),
            json(p?.body?.items),
            json(p?.body?.total),
          ],
        ),
      ];
    }
    case "order.placed": {
      // saved: hand it on
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [rq.merge({ step: "placed" }), emit("order.created", p)];
    }
    case "order.failed": {
      return [http.json({ error: "The order could not be saved" }, 500)];
    }
  }
  return undefined;
}
