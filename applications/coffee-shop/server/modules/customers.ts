// Customers (module): the handlers of this module. Pure: (msg, state) => effects.
// Every effect names its replyTo and onError; the runtime stamps the rid on them.

import {
  httpEffector as http,
  pgEffector as pg,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/frontend";

const json = (v: unknown): unknown =>
  v !== null && typeof v === "object" ? JSON.stringify(v) : v;

export const inputs = ["customers.list", "customers.create"] as const;
export const outputs = [
  "customers.listed",
  "customer.created",
  "customer.rejected",
] as const;

export function handle(msg: Message, state: ServerState): Effect[] | undefined {
  switch (msg.id) {
    case "customers.list": {
      // search by name or email
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [
        pg.query(
          "select * from customers where name ilike '%' || coalesce($1, '') || '%' or email ilike '%' || coalesce($2, '') || '%' order by name",
          { replyTo: "customers.listed", onError: "customers.listFailed" },
          [json(p?.query?.q), json(p?.query?.q)],
        ),
      ];
    }
    case "customers.listed": {
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [http.json({ customers: p?.rows }, 200)];
    }
    case "customers.listFailed": {
      return [http.json({ error: "The customers could not be loaded" }, 500)];
    }
    case "customers.create": {
      // a new customer, with no points yet
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [
        pg.query(
          "insert into customers (name, email, phone, points, created_at) values ($1, $2, $3, 0, now()) returning *",
          { replyTo: "customers.created", onError: "customers.failed" },
          [json(p?.body?.name), json(p?.body?.email), json(p?.body?.phone)],
        ),
      ];
    }
    case "customers.created": {
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [http.json({ customer: p?.rows?.[0] }, 201)];
    }
    case "customers.failed": {
      const p = (msg.payload ?? {}) as Record<string, any>;
      const out: Effect[] = [];
      if (p?.code == "23505")
        out.push(
          http.json(
            { error: "A customer with this email already exists" },
            409,
          ),
        );
      if (p?.code != "23505")
        out.push(http.json({ error: "The customer could not be saved" }, 500));
      return out;
    }
  }
  return undefined;
}
