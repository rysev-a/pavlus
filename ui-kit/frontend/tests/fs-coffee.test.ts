// The coffee shop CRM demo: its flows are run for real, call after call, against its
// own tables, the way the Visual Builder will use it.
import { describe, expect, test } from "vitest";
import { parseSync } from "vite";
import { generateAll } from "../templates/flow-studio/codegen.ts";
import { runCode } from "../templates/flow-studio/code.ts";
import {
  COFFEE_DB,
  MAILER,
  coffeeDemo,
} from "../templates/flow-studio/demo-coffee.ts";
import { catalogOf } from "../templates/flow-studio/catalog.ts";
import { outcomes, runFlow, stepsOf } from "../templates/flow-studio/engine.ts";
import {
  type FlowCall,
  callFlow,
  routesOf,
} from "../templates/flow-studio/flowlink.ts";
import { lint } from "../templates/flow-studio/lint.ts";
import { buildSequence } from "../templates/flow-studio/sequence.ts";
import type { Db } from "../templates/flow-studio/store.ts";

const m = coffeeDemo();

/** a session: calls one after another, the tables kept between them */
function session() {
  let db: Db = m.db;
  return {
    get db() {
      return db;
    },
    call(method: string, url: string, body?: unknown) {
      const a = callFlow(m, db, { method, url, body } as FlowCall);
      db = a.db;
      return a;
    },
  };
}

const newOrder = (over: Record<string, unknown> = {}) => ({
  customerId: 1,
  customerName: "Maya Chen",
  items: [{ productId: 3, name: "Latte", qty: 2, price: 3.8 }],
  total: 7.6,
  ...over,
});

describe("the design", () => {
  test("opens ready to run: four requests, all answered", () => {
    const r = runFlow(m, m.scenario, 1);
    expect(
      outcomes(r.trace).map((o) => `${o.rid}:${o.result}:${o.status}`),
    ).toEqual([
      "r1:responded:200",
      "r2:responded:201",
      "r3:responded:201",
      "r4:responded:200",
    ]);
  });

  test("the order of the scenario changes the tables: a customer, an order, the points", () => {
    const r = runFlow(m, m.scenario, 1);
    expect(r.db.customers.rows.map((c) => [c.name, c.points])).toEqual([
      ["Maya Chen", 49],
      ["Leo Park", 17],
      ["Ines Duarte", 8],
      ["Sam Okoye", 0],
      ["Dan Fox", 0],
    ]);
    expect(r.db.orders.rows).toHaveLength(4);
    // the tables of the design are the starting point, not changed
    expect(m.db.customers.rows).toHaveLength(4);
    expect(m.db).toEqual(COFFEE_DB);
  });

  test("uses what the slices built: modules, a code module, a pipe, a plugin, tables", () => {
    expect(m.modules.map((d) => `${d.name}:${d.body}`)).toEqual([
      "Customers:graph",
      "Menu:graph",
      "Orders:graph",
      "Place order:graph",
      "Check order:code",
      "Order intake:pipe",
      "Loyalty:code",
      "Dashboard:graph",
    ]);
    expect(m.plugins).toEqual([MAILER]);
    expect(Object.keys(m.db)).toEqual(["customers", "products", "orders"]);
  });

  test("has no error in the checks", () => {
    expect(lint(m).filter((i) => i.severity === "error")).toEqual([]);
    expect(lint(m).filter((i) => i.severity === "warn")).toEqual([]);
  });

  test("its routes are the ones the Visual Builder will ask", () => {
    expect(routesOf(m).map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /customers",
      "POST /customers",
      "GET /menu",
      "GET /orders",
      "POST /orders",
      "PATCH /orders/:id",
      "GET /dashboard",
    ]);
    const post = routesOf(m).find(
      (r) => r.method === "POST" && r.path === "/orders",
    )!;
    expect(post.body.map((f) => f.name)).toEqual([
      "customerId",
      "customerName",
      "items",
      "total",
    ]);
    // the answer of Loyalty, the refusal of the check, the failure of the intake
    expect(post.statuses).toEqual([201, 422, 500]);
  });

  test("the views read it: the sequence, the catalog", () => {
    expect(buildSequence(m).lifelines.map((l) => l.id)).toContain("mailer");
    expect(catalogOf(m).some((r) => r.id === "order.valid")).toBe(true);
  });
});

describe("customers", () => {
  test("the list, searched by name or email, in the order of the names", () => {
    const s = session();
    const all = s.call("GET", "/customers").data as {
      customers: { name: string }[];
    };
    expect(all.customers.map((c) => c.name)).toEqual([
      "Ines Duarte",
      "Leo Park",
      "Maya Chen",
      "Sam Okoye",
    ]);
    const byName = s.call("GET", "/customers?q=PARK").data as {
      customers: { name: string }[];
    };
    expect(byName.customers.map((c) => c.name)).toEqual(["Leo Park"]);
    const byMail = s.call("GET", "/customers?q=SAM@").data as {
      customers: unknown[];
    };
    expect(byMail.customers).toHaveLength(1);
    // the emails all say "beans": a search looks at both the name and the email
    const both = s.call("GET", "/customers?q=an").data as {
      customers: unknown[];
    };
    expect(both.customers).toHaveLength(4);
    const none = s.call("GET", "/customers?q=zzz").data as {
      customers: unknown[];
    };
    expect(none.customers).toEqual([]);
  });

  test("a new customer starts with no points and shows in the list", () => {
    const s = session();
    const a = s.call("POST", "/customers", {
      name: "Dan Fox",
      email: "dan@beans.test",
      phone: "555-0105",
    });
    expect(a.status).toBe(201);
    expect(a.data).toMatchObject({
      customer: { id: 5, name: "Dan Fox", points: 0 },
    });
    const list = s.call("GET", "/customers?q=dan").data as {
      customers: unknown[];
    };
    expect(list.customers).toHaveLength(1);
  });

  test("the same email twice is refused with 409 and changes nothing", () => {
    const s = session();
    const a = s.call("POST", "/customers", {
      name: "Other Maya",
      email: "maya@beans.test",
      phone: "1",
    });
    expect(a.status).toBe(409);
    expect(a.data).toEqual({
      error: "A customer with this email already exists",
    });
    expect(s.db.customers.rows).toHaveLength(4);
  });
});

describe("the menu", () => {
  test("lists what is on sale, by category and name; the retired item is not there", () => {
    const names = new (class {
      v = session().call("GET", "/menu").data as {
        products: { name: string }[];
      };
    })().v.products.map((p) => p.name);
    expect(names).toEqual([
      "Americano",
      "Cappuccino",
      "Cold brew",
      "Espresso",
      "Flat white",
      "Latte",
      "Blueberry muffin",
      "Croissant",
    ]);
    expect(names).not.toContain("Pumpkin latte");
  });
});

describe("orders", () => {
  test("the list is newest first, and can be filtered by status", () => {
    const s = session();
    const all = s.call("GET", "/orders").data as { orders: { id: number }[] };
    expect(all.orders.map((o) => o.id)).toEqual([3, 2, 1]);
    const open = s.call("GET", "/orders?status=preparing").data as {
      orders: { id: number }[];
    };
    expect(open.orders.map((o) => o.id)).toEqual([2]);
  });

  test("placing an order goes through the pipe, saves it, adds the points and mails the receipt", () => {
    const s = session();
    const a = s.call("POST", "/orders", newOrder());
    expect(a.status).toBe(201);
    expect(a.data).toMatchObject({
      order: {
        id: 4,
        customer_id: 1,
        status: "new",
        total: 7.6,
        items: [{ name: "Latte", qty: 2 }],
      },
      customer: { id: 1, name: "Maya Chen", points: 49 },
      earned: 7,
    });
    expect(s.db.orders.rows).toHaveLength(4);
    expect(s.db.customers.rows[0].points).toBe(49);
    const mail = a.trace.find(
      (x) => (x.effect as { plugin?: string } | null)?.plugin === "mailer",
    )!;
    expect(mail.effect).toMatchObject({ plugin: "mailer", type: "send" });
    expect(JSON.stringify(mail.effect)).toContain("maya@beans.test");
    expect(JSON.stringify(mail.effect)).toContain("49 points");
  });

  test("the points add up over orders", () => {
    const s = session();
    s.call("POST", "/orders", newOrder());
    const b = s.call("POST", "/orders", newOrder({ total: 12.4 }));
    expect(b.data).toMatchObject({ customer: { points: 61 }, earned: 12 });
  });

  test("the check refuses what cannot be an order, each with its own words, and saves nothing", () => {
    const s = session();
    const cases: [Record<string, unknown>, string][] = [
      [{ customerId: 0 }, "Pick the customer of the order"],
      [{ items: [] }, "An order needs at least one item"],
      [{ total: 0 }, "The total of an order must be more than zero"],
    ];
    for (const [over, error] of cases) {
      const a = s.call("POST", "/orders", newOrder(over));
      expect(a.status).toBe(422);
      expect(a.data).toEqual({ error });
    }
    expect(s.db.orders.rows).toHaveLength(3);
    expect(s.db.customers.rows[0].points).toBe(42);
  });

  test("a status change is saved; an order that is not there is a 404", () => {
    const s = session();
    const a = s.call("PATCH", "/orders/3", { status: "ready" });
    expect(a.status).toBe(200);
    expect(a.data).toMatchObject({ order: { id: 3, status: "ready" } });
    expect(s.db.orders.rows.find((o) => o.id === 3)!.status).toBe("ready");
    const missing = s.call("PATCH", "/orders/99", { status: "ready" });
    expect(missing.status).toBe(404);
    expect(missing.data).toEqual({ error: "No such order" });
  });
});

describe("the dashboard", () => {
  test("counts what is open, the customers, the revenue of done orders and the leaders", () => {
    const s = session();
    expect(s.call("GET", "/dashboard").data).toEqual({
      openOrders: 2,
      customers: 4,
      revenue: 7.6,
      leaders: [
        { name: "Maya Chen", points: 42 },
        { name: "Leo Park", points: 17 },
        { name: "Ines Duarte", points: 8 },
      ],
    });
  });

  test("follows the work: a finished order adds to the revenue and leaves the open ones", () => {
    const s = session();
    s.call("PATCH", "/orders/3", { status: "done" });
    s.call(
      "POST",
      "/orders",
      newOrder({ customerId: 4, customerName: "Sam Okoye", total: 5 }),
    );
    expect(s.call("GET", "/dashboard").data).toMatchObject({
      openOrders: 2,
      revenue: 11.8,
      leaders: [
        { name: "Maya Chen", points: 42 },
        { name: "Leo Park", points: 17 },
        { name: "Ines Duarte", points: 8 },
      ],
    });
  });
});

describe("failures", () => {
  test("a database that fails answers the failure path of each module", () => {
    const faults = [
      {
        id: "f",
        kind: "error" as const,
        target: "plugin:pg",
        rid: "",
        code: "",
        ms: 0,
        on: true,
      },
    ];
    const run = (entry: string, data: Record<string, unknown>) => {
      const r = runFlow(
        m,
        {
          ...m.scenario,
          faults,
          requests: [{ rid: "r1", entry, at: 0, payload: {}, data }],
        },
        1,
      );
      return outcomes(r.trace)[0].status;
    };
    expect(run("rtCustList", { query: {} })).toBe(500);
    expect(run("rtMenu", {})).toBe(500);
    expect(run("rtDash", {})).toBe(500);
    expect(run("rtCustNew", { body: { name: "x", email: "x@x.test" } })).toBe(
      500,
    );
    // the order is saved by the pipe, whose module answers 500 itself
    expect(run("rtOrderNew", { body: newOrder() })).toBe(500);
  });

  test("a failure while adding the points tells the truth: the order is saved", () => {
    const faults = [
      {
        id: "f",
        kind: "error" as const,
        target: "pgPoints",
        rid: "",
        code: "",
        ms: 0,
        on: true,
      },
    ];
    const r = runFlow(
      m,
      {
        ...m.scenario,
        faults,
        requests: [
          {
            rid: "r1",
            entry: "rtOrderNew",
            at: 0,
            payload: {},
            data: { body: newOrder() },
          },
        ],
      },
      1,
    );
    expect(outcomes(r.trace)[0].status).toBe(500);
    expect(r.db.orders.rows).toHaveLength(4);
    expect(r.db.customers.rows[0].points).toBe(42);
    const answer = stepsOf(r.trace, "r1").find(
      (s) =>
        (s.effect as { plugin?: string })?.plugin === "http" &&
        s.type === "effect",
    )!;
    expect(JSON.stringify(answer.effect)).toContain("order is saved");
  });
});

describe("the code made from it", () => {
  const files = generateAll(m);

  test("every file parses", () => {
    for (const f of files.filter((x) => x.path.endsWith(".ts"))) {
      const r = parseSync(f.path, f.code, { lang: "ts" });
      expect(r.errors.map((e) => `${f.path}: ${e.message}`)).toEqual([]);
    }
  });

  test("a file per module, the pipe of the intake, the stub of the mailer", () => {
    const paths = files.map((f) => f.path);
    for (const p of [
      "server/modules/customers.ts",
      "server/modules/menu.ts",
      "server/modules/orders.ts",
      "server/modules/place-order.ts",
      "server/modules/check-order.ts",
      "server/modules/order-intake.ts",
      "server/modules/loyalty.ts",
      "server/modules/dashboard.ts",
      "server/modules/emit.ts",
      "server/plugins/mailer.ts",
      "server/modules.test.ts",
    ])
      expect(paths).toContain(p);
  });

  test("the sql of a node keeps its values out of the text", () => {
    const code = files.find(
      (f) => f.path === "server/modules/customers.ts",
    )!.code;
    expect(code).toContain(
      "insert into customers (name, email, phone, points, created_at) values ($1, $2, $3, 0, now()) returning *",
    );
    expect(code).toContain(
      "json(p?.body?.name), json(p?.body?.email), json(p?.body?.phone)",
    );
    expect(code).toContain("if ((p?.code == '23505')) out.push(");
  });

  test("the code of a module is in its file, with the plugin it calls imported", () => {
    const loyalty = files.find(
      (f) => f.path === "server/modules/loyalty.ts",
    )!.code;
    expect(loyalty).toContain(
      'import { mailerEffector as mailer } from "../plugins/mailer.ts";',
    );
    expect(loyalty).toContain("mailer.send(");
    const check = files.find(
      (f) => f.path === "server/modules/check-order.ts",
    )!.code;
    expect(check).toContain("Pick the customer of the order");
    const app = files.find((f) => f.path === "server/app.ts")!.code;
    expect(app).toContain("order-intake.ts");
    expect(app).not.toContain("modules/check-order.ts");
    expect(app).not.toContain("modules/place-order.ts");
  });
});

describe("the builders of a plugin of the project, in code", () => {
  test("mailer.send is a builder in the sandbox; without the manifest it is unknown", () => {
    const src = `return [mailer.send("hello", { onError: "mail.failed" })];`;
    const msg = { id: "x", payload: {}, ctx: { rid: "r1" } };
    const state = { requests: { r1: {} }, shared: {}, client: {} };
    const ok = runCode(src, msg, state, [MAILER]);
    if (!("effects" in ok)) throw new Error(ok.error);
    expect(ok.effects[0]).toMatchObject({
      plugin: "mailer",
      type: "send",
      port: "mailer.send",
      args: { detail: "hello" },
      onError: "mail.failed",
    });
    expect(runCode(src, msg, state)).toMatchObject({
      error: expect.stringContaining("mailer"),
    });
  });
});
