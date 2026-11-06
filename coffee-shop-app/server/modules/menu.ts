// Menu (module): the handlers of this module. Pure: (msg, state) => effects.
// Every effect names its replyTo and onError; the runtime stamps the rid on them.
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  type ServerState,
  pgEffector as pg,
  httpEffector as http,
} from "pavlus-server";

const json = (v: unknown): unknown =>
  v !== null && typeof v === "object" ? JSON.stringify(v) : v;

export const inputs = ["menu.list"] as const;
export const outputs = ["menu.listed"] as const;

export function handle(msg: Message, state: ServerState): Effect[] | undefined {
  switch (msg.id) {
    case "menu.list": {
      // what can be ordered
      return [
        pg.query(
          "select * from products where active = true order by category, name",
          { replyTo: "menu.listed", onError: "menu.failed" },
        ),
      ];
    }
    case "menu.listed": {
      const p = (msg.payload ?? {}) as Record<string, any>;
      return [http.json({ products: p?.rows }, 200)];
    }
    case "menu.failed": {
      return [http.json({ error: "The menu could not be loaded" }, 500)];
    }
  }
  return undefined;
}
