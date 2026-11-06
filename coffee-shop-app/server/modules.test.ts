// Generated from the interfaces of the modules: each takes the example payload of
// each of its input ports and answers with effects, and ignores every other message.
import { describe, expect, it } from "vitest";
import type { Message } from "@service-laboratory/pavlus";
import type { ServerState } from "pavlus-server";
import { handle as mod_customers } from "./modules/customers.ts";
import { handle as mod_menu } from "./modules/menu.ts";
import { handle as mod_orders } from "./modules/orders.ts";
import { handle as mod_placeOrder } from "./modules/place-order.ts";
import { handle as mod_checkOrder } from "./modules/check-order.ts";
import { handle as mod_orderIntake } from "./modules/order-intake.ts";
import { handle as mod_loyalty } from "./modules/loyalty.ts";
import { handle as mod_dashboard } from "./modules/dashboard.ts";

const message = (id: string, payload: unknown): Message => ({
  id,
  payload,
  ctx: { rid: "r1", conn: "http" },
});
const state = (): ServerState =>
  ({ requests: { r1: {} }, shared: {} }) as unknown as ServerState;

/** what the runtime does with the effects that write the slice of the request */
function remember(st: ServerState, effects: unknown): void {
  for (const e of (effects ?? []) as {
    plugin?: string;
    type?: string;
    path?: string;
    value?: unknown;
  }[]) {
    if (e.plugin !== "requests") continue;
    if (e.type === "req.merge")
      Object.assign(st.requests.r1, e.value as Record<string, unknown>);
    else if (e.type === "req.set" && typeof e.path === "string")
      st.requests.r1[e.path] = e.value;
  }
}

describe("Customers", () => {
  const st = state();

  it("takes customers.list", () => {
    const out = mod_customers(message("customers.list", {}), st);
    remember(st, out);
    expect(out).toBeDefined();
  });

  it("takes customers.create", () => {
    const out = mod_customers(message("customers.create", {}), st);
    remember(st, out);
    expect(out).toBeDefined();
  });

  it("leaves the other messages to the others", () => {
    expect(mod_customers(message("nobody.takes.this", {}), st)).toBeUndefined();
  });
});

describe("Menu", () => {
  const st = state();

  it("takes menu.list", () => {
    const out = mod_menu(message("menu.list", {}), st);
    remember(st, out);
    expect(out).toBeDefined();
  });

  it("leaves the other messages to the others", () => {
    expect(mod_menu(message("nobody.takes.this", {}), st)).toBeUndefined();
  });
});

describe("Orders", () => {
  const st = state();

  it("takes orders.list", () => {
    const out = mod_orders(message("orders.list", {}), st);
    remember(st, out);
    expect(out).toBeDefined();
  });

  it("takes orders.setStatus", () => {
    const out = mod_orders(message("orders.setStatus", {}), st);
    remember(st, out);
    expect(out).toBeDefined();
  });

  it("leaves the other messages to the others", () => {
    expect(mod_orders(message("nobody.takes.this", {}), st)).toBeUndefined();
  });
});

describe("Place order", () => {
  const st = state();

  it("takes order.valid", () => {
    const out = mod_placeOrder(message("order.valid", {}), st);
    remember(st, out);
    expect(out).toBeDefined();
  });

  it("leaves the other messages to the others", () => {
    expect(
      mod_placeOrder(message("nobody.takes.this", {}), st),
    ).toBeUndefined();
  });
});

describe("Check order", () => {
  const st = state();

  it("takes orders.create", () => {
    const out = mod_checkOrder(
      message("orders.create", {
        body: {
          customerId: 1,
          customerName: "Maya Chen",
          items: [{ productId: 3, name: "Latte", qty: 2, price: 3.8 }],
          total: 7.6,
        },
      }),
      st,
    );
    remember(st, out);
    expect(out).toBeDefined();
    expect(out).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          plugin: "requests",
          type: "dispatch",
          message: expect.objectContaining({ id: "order.valid" }),
        }),
      ]),
    );
  });

  it("leaves the other messages to the others", () => {
    expect(
      mod_checkOrder(message("nobody.takes.this", {}), st),
    ).toBeUndefined();
  });
});

describe("Order intake", () => {
  const st = state();

  it("takes orders.create", () => {
    const out = mod_orderIntake(
      message("orders.create", {
        body: {
          customerId: 1,
          customerName: "Maya Chen",
          items: [{ productId: 3, name: "Latte", qty: 2, price: 3.8 }],
          total: 7.6,
        },
      }),
      st,
    );
    remember(st, out);
    expect(out).toBeDefined();
  });

  it("leaves the other messages to the others", () => {
    expect(
      mod_orderIntake(message("nobody.takes.this", {}), st),
    ).toBeUndefined();
  });
});

describe("Loyalty", () => {
  const st = state();

  it("takes order.created", () => {
    const out = mod_loyalty(
      message("order.created", {
        rows: [
          {
            id: 4,
            customer_id: 1,
            customer_name: "Maya Chen",
            total: 7.6,
            status: "new",
          },
        ],
      }),
      st,
    );
    remember(st, out);
    expect(out).toBeDefined();
    expect(out).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ plugin: "pg", type: "query" }),
      ]),
    );
  });

  it("takes loyalty.added", () => {
    const out = mod_loyalty(
      message("loyalty.added", {
        rows: [
          { id: 1, name: "Maya Chen", email: "maya@beans.test", points: 49 },
        ],
      }),
      st,
    );
    remember(st, out);
    expect(out).toBeDefined();
    expect(out).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ plugin: "mailer", type: "send" }),
        expect.objectContaining({ plugin: "http", type: "respond" }),
      ]),
    );
  });

  it("takes loyalty.failed", () => {
    const out = mod_loyalty(
      message("loyalty.failed", { code: "ERR", message: "failed" }),
      st,
    );
    remember(st, out);
    expect(out).toBeDefined();
    expect(out).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ plugin: "http", type: "respond" }),
      ]),
    );
  });

  it("leaves the other messages to the others", () => {
    expect(mod_loyalty(message("nobody.takes.this", {}), st)).toBeUndefined();
  });
});

describe("Dashboard", () => {
  const st = state();

  it("takes dashboard.get", () => {
    const out = mod_dashboard(message("dashboard.get", {}), st);
    remember(st, out);
    expect(out).toBeDefined();
  });

  it("leaves the other messages to the others", () => {
    expect(mod_dashboard(message("nobody.takes.this", {}), st)).toBeUndefined();
  });
});
