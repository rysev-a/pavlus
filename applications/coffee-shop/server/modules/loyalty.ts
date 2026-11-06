// Loyalty (server module, code body)
// A pure function: (msg, state) => effects. The body below is the one of the design.

import {
  httpEffector as http,
  pgEffector as pg,
  requestsEffector as rq,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/frontend";
import { mailerEffector as mailer } from "../plugins/mailer.ts";

export const inputs = [
  "order.created",
  "loyalty.added",
  "loyalty.failed",
] as const;
export const outputs = ["pg.query", "mailer.send", "http.respond"] as const;

/** the payload of order.created */
export interface OrderCreatedPayload {
  rows: unknown[];
}

/** the payload of loyalty.added */
export interface LoyaltyAddedPayload {
  rows: unknown[];
}

/** the payload of loyalty.failed */
export interface LoyaltyFailedPayload {
  code: string;
  message: string;
}

export function handle(
  message: Message,
  serverState: ServerState,
): Effect[] | undefined {
  if (!(inputs as readonly string[]).includes(message.id)) return undefined;
  // the body reads the payload and the slices of the requests as plain data
  const msg = message as Message & { payload: any; ctx: { rid: string } };
  const state = serverState as unknown as {
    requests: Record<string, any>;
    shared: Record<string, any>;
  };
  void msg;
  void state;
  const effects: Effect[] = (() => {
    // One point for each whole currency unit of the order. The receipt goes out by mail.
    switch (msg.id) {
      case "order.created": {
        const order = msg.payload.rows[0];
        const points = Math.floor(order.total);
        return [
          rq.merge({ order, points }),
          pg.query(
            "update customers set points = points + $1 where id = $2 returning id, name, email, points",
            { replyTo: "loyalty.added", onError: "loyalty.failed" },
            [points, order.customer_id],
          ),
        ];
      }
      case "loyalty.added": {
        const mine = state.requests[msg.ctx.rid];
        const customer = msg.payload.rows[0];
        return [
          mailer.send(
            "receipt to " +
              customer.email +
              ": order " +
              mine.order.id +
              ", " +
              mine.order.total +
              ", " +
              customer.points +
              " points",
          ),
          http.json({ order: mine.order, customer, earned: mine.points }, 201),
        ];
      }
      case "loyalty.failed":
        return [
          http.json(
            { error: "The order is saved, but its points could not be added" },
            500,
          ),
        ];
    }
    return [];
  })();
  return effects;
}
