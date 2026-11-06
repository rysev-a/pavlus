// The application: one pure function. Each module answers the messages of its
// route and returns undefined for the others, so the modules compose with a loop.
import type { Effect, Message } from "@service-laboratory/pavlus";
import type { ServerState } from "pavlus-server";
import { handle as mod_customers } from "./modules/customers.ts";
import { handle as mod_menu } from "./modules/menu.ts";
import { handle as mod_orders } from "./modules/orders.ts";
import { handle as mod_orderIntake } from "./modules/order-intake.ts";
import { handle as mod_loyalty } from "./modules/loyalty.ts";
import { handle as mod_dashboard } from "./modules/dashboard.ts";

const modules = [
  mod_customers,
  mod_menu,
  mod_orders,
  mod_orderIntake,
  mod_loyalty,
  mod_dashboard,
];

export const app = (msg: Message, state: ServerState): Effect[] => {
  for (const handle of modules) {
    const effects = handle(msg, state);
    if (effects) return effects;
  }
  return [];
};
