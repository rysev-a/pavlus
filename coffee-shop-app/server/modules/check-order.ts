// Check order (server module, code body)
// A pure function: (msg, state) => effects. The body below is the one of the design.
import type { Effect, Message } from "@service-laboratory/pavlus";
import { type ServerState, httpEffector as http } from "pavlus-server";
import { emit } from "./emit.ts";

export const inputs = ["orders.create"] as const;
export const outputs = ["order.valid", "http.respond"] as const;

/** the payload of orders.create */
export interface OrdersCreatePayload {
  body: {
    customerId: number;
    customerName: string;
    items: unknown[];
    total: number;
  };
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
    // The order must name a customer, hold something and cost something.
    const b = msg.payload.body || {};
    if (!b.customerId)
      return [http.json({ error: "Pick the customer of the order" }, 422)];
    if (!Array.isArray(b.items) || b.items.length === 0)
      return [http.json({ error: "An order needs at least one item" }, 422)];
    if (!(b.total > 0))
      return [
        http.json(
          { error: "The total of an order must be more than zero" },
          422,
        ),
      ];
    return [emit("order.valid", msg.payload)];
  })();
  return effects;
}
