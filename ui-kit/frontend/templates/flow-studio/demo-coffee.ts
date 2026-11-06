// The demo of the brief: the data flow of a CRM for a coffee shop, drawn once and
// run for real. Customers with loyalty points, the menu, orders, a dashboard. It is
// the backend of the Visual Builder demo of the same name (templates/visual-builder):
// the Visual Builder asks these routes, this design answers from its own tables.
//
// What it uses of Flow Studio: modules with ports (Customers, Menu, Orders,
// Dashboard), a module whose body is code (Check order, Loyalty), a pipe (Order
// intake: Check order, then Place order), a plugin of the project (mailer, for the
// receipts), tables for the simulation, and conditions that read the data.
import { Draw, req } from "./draw.ts";
import { type Model, type PluginManifest } from "./model.ts";
import { parseEffectLines } from "./plugins.ts";
import type { Db } from "./store.ts";

const at = (d: string) => `2026-01-${d}T09:00:00.000Z`;

/** the starting tables: a few regulars, the menu, three orders in different states */
export const COFFEE_DB: Db = {
  customers: {
    unique: ["email"],
    rows: [
      {
        id: 1,
        name: "Maya Chen",
        email: "maya@beans.test",
        phone: "555-0101",
        points: 42,
        created_at: at("03"),
      },
      {
        id: 2,
        name: "Leo Park",
        email: "leo@beans.test",
        phone: "555-0102",
        points: 17,
        created_at: at("05"),
      },
      {
        id: 3,
        name: "Ines Duarte",
        email: "ines@beans.test",
        phone: "555-0103",
        points: 8,
        created_at: at("09"),
      },
      {
        id: 4,
        name: "Sam Okoye",
        email: "sam@beans.test",
        phone: "555-0104",
        points: 0,
        created_at: at("12"),
      },
    ],
  },
  products: {
    unique: ["name"],
    rows: [
      { id: 1, name: "Espresso", category: "Coffee", price: 2.5, active: true },
      { id: 2, name: "Americano", category: "Coffee", price: 3, active: true },
      { id: 3, name: "Latte", category: "Coffee", price: 3.8, active: true },
      {
        id: 4,
        name: "Cappuccino",
        category: "Coffee",
        price: 3.6,
        active: true,
      },
      {
        id: 5,
        name: "Flat white",
        category: "Coffee",
        price: 3.9,
        active: true,
      },
      {
        id: 6,
        name: "Cold brew",
        category: "Coffee",
        price: 4.2,
        active: true,
      },
      { id: 7, name: "Croissant", category: "Food", price: 2.9, active: true },
      {
        id: 8,
        name: "Blueberry muffin",
        category: "Food",
        price: 3.2,
        active: true,
      },
      {
        id: 9,
        name: "Pumpkin latte",
        category: "Coffee",
        price: 4.5,
        active: false,
      },
    ],
  },
  orders: {
    unique: [],
    rows: [
      {
        id: 1,
        customer_id: 1,
        customer_name: "Maya Chen",
        items: [{ productId: 3, name: "Latte", qty: 2, price: 3.8 }],
        total: 7.6,
        status: "done",
        created_at: at("14"),
      },
      {
        id: 2,
        customer_id: 2,
        customer_name: "Leo Park",
        items: [
          { productId: 5, name: "Flat white", qty: 1, price: 3.9 },
          { productId: 7, name: "Croissant", qty: 1, price: 2.9 },
        ],
        total: 6.8,
        status: "preparing",
        created_at: at("15"),
      },
      {
        id: 3,
        customer_id: 3,
        customer_name: "Ines Duarte",
        items: [{ productId: 6, name: "Cold brew", qty: 1, price: 4.2 }],
        total: 4.2,
        status: "new",
        created_at: at("15"),
      },
    ],
  },
};

/** the mailer: receipts go out by mail, nothing comes back */
export const MAILER: PluginManifest = {
  name: "mailer",
  about: "sends the receipts of the orders",
  external: "Mail server",
  latency: 40,
  timeout: 3000,
  errorCode: "ECONNREFUSED",
  effects: parseEffectLines(
    "mailer",
    "send | send an email | to: {email}, subject: your receipt | fire",
  ),
};

const CHECK_ORDER = `// The order must name a customer, hold something and cost something.
const b = msg.payload.body || {};
if (!b.customerId)
  return [http.json({ error: "Pick the customer of the order" }, 422)];
if (!Array.isArray(b.items) || b.items.length === 0)
  return [http.json({ error: "An order needs at least one item" }, 422)];
if (!(b.total > 0))
  return [http.json({ error: "The total of an order must be more than zero" }, 422)];
return [emit("order.valid", msg.payload)];
`;

const LOYALTY = `// One point for each whole currency unit of the order. The receipt goes out by mail.
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
      mailer.send("receipt to " + customer.email + ": order " + mine.order.id + ", " + mine.order.total + ", " + customer.points + " points"),
      http.json({ order: mine.order, customer, earned: mine.points }, 201),
    ];
  }
  case "loyalty.failed":
    return [http.json({ error: "The order is saved, but its points could not be added" }, 500)];
}
return [];
`;

export function coffeeDemo(): Model {
  const d = new Draw("Coffee shop CRM");
  d.m = { ...d.m, plugins: [MAILER], db: COFFEE_DB };

  // ---- the modules of the backend ----

  d.module(
    "customers",
    "Customers",
    "backend",
    (b) => {
      b.n("hl", "handler", "customers.list", {
        detail: "search by name or email",
      })
        .n("ql", "effect", "pg.query", {
          detail:
            "select * from customers where name ilike '%' || coalesce({payload.query.q}, '') || '%' or email ilike '%' || coalesce({payload.query.q}, '') || '%' order by name",
        })
        .n("hld", "handler", "customers.listed")
        .n("rl", "effect", "http.respond", {
          status: 200,
          detail: '{"customers":"{payload.rows}"}',
        })
        .n("el", "error", "customers.listFailed")
        .n("rle", "effect", "http.respond", {
          status: 500,
          detail: '{"error":"The customers could not be loaded"}',
        })
        .n("hc", "handler", "customers.create", {
          detail: "a new customer, with no points yet",
        })
        .n("qc", "effect", "pg.query", {
          detail:
            "insert into customers (name, email, phone, points, created_at) values ({payload.body.name}, {payload.body.email}, {payload.body.phone}, 0, now()) returning *",
        })
        .n("hcd", "handler", "customers.created")
        .n("rc", "effect", "http.respond", {
          status: 201,
          detail: '{"customer":"{payload.rows.0}"}',
        })
        .n("ec", "error", "customers.failed")
        .n("rdup", "effect", "http.respond", {
          status: 409,
          detail: '{"error":"A customer with this email already exists"}',
        })
        .n("rcerr", "effect", "http.respond", {
          status: 500,
          detail: '{"error":"The customer could not be saved"}',
        })
        .e("hl", "ql", "pg.query")
        .e("ql", "hld", "customers.listed")
        .err("ql", "el")
        .e("hld", "rl", "http.respond")
        .e("el", "rle", "http.respond")
        .e("hc", "qc", "pg.query")
        .e("qc", "hcd", "customers.created")
        .err("qc", "ec")
        .e("hcd", "rc", "http.respond")
        .e("ec", "rdup", "http.respond", { cond: "payload.code == '23505'" })
        .e("ec", "rcerr", "http.respond", { cond: "payload.code != '23505'" });
    },
    [
      ["customers.list", "hl"],
      ["customers.create", "hc"],
    ],
    [
      ["customers.listed", "rl"],
      ["customer.created", "rc"],
      ["customer.rejected", "rdup"],
    ],
    ["pg"],
  );

  d.module(
    "menu",
    "Menu",
    "backend",
    (b) => {
      b.n("h", "handler", "menu.list", { detail: "what can be ordered" })
        .n("q", "effect", "pg.query", {
          detail:
            "select * from products where active = true order by category, name",
        })
        .n("hd", "handler", "menu.listed")
        .n("r", "effect", "http.respond", {
          status: 200,
          detail: '{"products":"{payload.rows}"}',
        })
        .n("e", "error", "menu.failed")
        .n("re", "effect", "http.respond", {
          status: 500,
          detail: '{"error":"The menu could not be loaded"}',
        })
        .e("h", "q", "pg.query")
        .e("q", "hd", "menu.listed")
        .err("q", "e")
        .e("hd", "r", "http.respond")
        .e("e", "re", "http.respond");
    },
    [["menu.list", "h"]],
    [["menu.listed", "r"]],
    ["pg"],
  );

  d.module(
    "orders",
    "Orders",
    "backend",
    (b) => {
      b.n("hl", "handler", "orders.list", {
        detail: "newest first, optionally one status",
      })
        .n("ql", "effect", "pg.query", {
          detail:
            "select * from orders where {payload.query.status}::text is null or {payload.query.status}::text = '' or status = {payload.query.status} order by id desc",
        })
        .n("hld", "handler", "orders.listed")
        .n("rl", "effect", "http.respond", {
          status: 200,
          detail: '{"orders":"{payload.rows}"}',
        })
        .n("hs", "handler", "orders.setStatus", {
          detail: "new, preparing, ready, done",
        })
        .n("qs", "effect", "pg.query", {
          detail:
            "update orders set status = {payload.body.status} where id = {payload.params.id} returning *",
        })
        .n("hsd", "handler", "orders.statusSet")
        .n("rok", "effect", "http.respond", {
          status: 200,
          detail: '{"order":"{payload.rows.0}"}',
        })
        .n("rmiss", "effect", "http.respond", {
          status: 404,
          detail: '{"error":"No such order"}',
        })
        .n("e", "error", "orders.failed")
        .n("re", "effect", "http.respond", {
          status: 500,
          detail: '{"error":"The orders could not be read"}',
        })
        .e("hl", "ql", "pg.query")
        .e("ql", "hld", "orders.listed")
        .err("ql", "e")
        .e("hld", "rl", "http.respond")
        .e("hs", "qs", "pg.query")
        .e("qs", "hsd", "orders.statusSet")
        .err("qs", "e")
        .e("hsd", "rok", "http.respond", { cond: "payload.rowCount > 0" })
        .e("hsd", "rmiss", "http.respond", { cond: "payload.rowCount == 0" })
        .e("e", "re", "http.respond");
    },
    [
      ["orders.list", "hl"],
      ["orders.setStatus", "hs"],
    ],
    [
      ["orders.listed", "rl"],
      ["order.updated", "rok"],
      ["order.missing", "rmiss"],
    ],
    ["pg"],
  );

  d.module(
    "place",
    "Place order",
    "backend",
    (b) => {
      b.n("hv", "handler", "order.valid", {
        detail: "the order was checked: save it",
        reqSet: { step: "insert" },
      })
        .n("q", "effect", "pg.query", {
          detail:
            "insert into orders (customer_id, customer_name, items, total, status, created_at) values ({payload.body.customerId}, {payload.body.customerName}, {payload.body.items}, {payload.body.total}, 'new', now()) returning *",
        })
        .n("hp", "handler", "order.placed", {
          detail: "saved: hand it on",
          reqSet: { step: "placed" },
        })
        .n("e", "error", "order.failed")
        .n("re", "effect", "http.respond", {
          status: 500,
          detail: '{"error":"The order could not be saved"}',
        })
        .e("hv", "q", "pg.query")
        .e("q", "hp", "order.placed")
        .err("q", "e")
        .e("e", "re", "http.respond");
    },
    [["order.valid", "hv"]],
    [["order.created", "hp", true]],
    ["pg"],
  );

  d.codeModule(
    "check",
    "Check order",
    "backend",
    CHECK_ORDER,
    [
      {
        name: "orders.create",
        fields:
          'body.customerId:number=1; body.customerName:string=Maya Chen; body.items:array=[{"productId":3,"name":"Latte","qty":2,"price":3.8}]; body.total:number=7.6',
      },
    ],
    [{ name: "order.valid", pass: true }, { name: "http.respond" }],
  );

  d.pipe("intake", "Order intake", ["check", "place"]);

  d.codeModule(
    "loyalty",
    "Loyalty",
    "backend",
    LOYALTY,
    [
      {
        name: "order.created",
        fields:
          'rows:array=[{"id":4,"customer_id":1,"customer_name":"Maya Chen","total":7.6,"status":"new"}]',
      },
      {
        name: "loyalty.added",
        fields:
          'rows:array=[{"id":1,"name":"Maya Chen","email":"maya@beans.test","points":49}]',
      },
      {
        name: "loyalty.failed",
        fields: "code:string=ERR; message:string=failed",
      },
    ],
    [{ name: "pg.query" }, { name: "mailer.send" }, { name: "http.respond" }],
    ["pg", "mailer"],
  );

  d.module(
    "dashboard",
    "Dashboard",
    "backend",
    (b) => {
      b.n("h0", "handler", "dashboard.get", {
        detail: "four numbers for the front desk",
      })
        .n("q1", "effect", "pg.query", {
          detail:
            "select count(*)::int as n from orders where status != 'done'",
        })
        .n("h1", "handler", "dashboard.open", {
          reqSet: { open: "{payload.rows.0.n}" },
        })
        .n("q2", "effect", "pg.query", {
          detail: "select count(*)::int as n from customers",
        })
        .n("h2", "handler", "dashboard.customers", {
          reqSet: { customers: "{payload.rows.0.n}" },
        })
        .n("q3", "effect", "pg.query", {
          detail:
            "select coalesce(sum(total), 0) as revenue from orders where status = 'done'",
        })
        .n("h3", "handler", "dashboard.revenue", {
          reqSet: { revenue: "{payload.rows.0.revenue}" },
        })
        .n("q4", "effect", "pg.query", {
          detail:
            "select name, points from customers order by points desc limit 3",
        })
        .n("h4", "handler", "dashboard.leaders")
        .n("r", "effect", "http.respond", {
          status: 200,
          detail:
            '{"openOrders":"{req.open}","customers":"{req.customers}","revenue":"{req.revenue}","leaders":"{payload.rows}"}',
        })
        .n("e", "error", "dashboard.failed")
        .n("re", "effect", "http.respond", {
          status: 500,
          detail: '{"error":"The numbers could not be worked out"}',
        })
        .e("h0", "q1", "pg.query")
        .e("q1", "h1", "dashboard.open")
        .err("q1", "e")
        .e("h1", "q2", "pg.query")
        .e("q2", "h2", "dashboard.customers")
        .err("q2", "e")
        .e("h2", "q3", "pg.query")
        .e("q3", "h3", "dashboard.revenue")
        .err("q3", "e")
        .e("h3", "q4", "pg.query")
        .e("q4", "h4", "dashboard.leaders")
        .err("q4", "e")
        .e("h4", "r", "http.respond")
        .e("e", "re", "http.respond");
    },
    [["dashboard.get", "h0"]],
    [["dashboard.ready", "r"]],
    ["pg"],
  );

  // ---- the routes, and the modules behind them ----

  d.n("rtCustList", "route", "GET /customers", { detail: "customers.list" })
    .n("rtCustNew", "route", "POST /customers", { detail: "customers.create" })
    .n("rtMenu", "route", "GET /menu", { detail: "menu.list" })
    .n("rtOrders", "route", "GET /orders", { detail: "orders.list" })
    .n("rtOrderNew", "route", "POST /orders", { detail: "orders.create" })
    .n("rtOrderSet", "route", "PATCH /orders/:id", {
      detail: "orders.setStatus",
    })
    .n("rtDash", "route", "GET /dashboard", { detail: "dashboard.get" })
    .n("mCust", "module", "Customers", { ref: "customers", lane: "app" })
    .n("mMenu", "module", "Menu", { ref: "menu", lane: "app" })
    .n("mOrders", "module", "Orders", { ref: "orders", lane: "app" })
    .n("mIntake", "module", "Order intake", { ref: "intake", lane: "app" })
    .n("mLoyal", "module", "Loyalty", { ref: "loyalty", lane: "app" })
    .n("mDash", "module", "Dashboard", { ref: "dashboard", lane: "app" })
    // the effects the code of Loyalty and Check order ask for are made by these nodes
    .n("pgPoints", "effect", "pg.query", {
      detail: "(the code of Loyalty says the sql)",
    })
    .n("mailReceipt", "effect", "mailer.send", {
      detail: "(the code of Loyalty says the mail)",
    })
    .n("rOrder", "effect", "http.respond", {
      status: 201,
      detail: "(the code of Loyalty says the answer)",
    })
    .n("rInvalid", "effect", "http.respond", {
      status: 422,
      detail: "(the code of Check order says the answer)",
    })
    .n("xc", "external", "Client", { plugin: "http" })
    .n("xpg", "external", "Postgres", { plugin: "pg" })
    .n("xmail", "external", "Mail server", { plugin: "mailer" })
    .e("rtCustList", "mCust", "customers.list")
    .e("rtCustNew", "mCust", "customers.create")
    .e("rtMenu", "mMenu", "menu.list")
    .e("rtOrders", "mOrders", "orders.list")
    .e("rtOrderNew", "mIntake", "orders.create")
    .e("rtOrderSet", "mOrders", "orders.setStatus")
    .e("rtDash", "mDash", "dashboard.get")
    // the intake hands the saved order to Loyalty; a refusal is answered by the check
    .e("mIntake", "mLoyal", "order.created", { out: "order.created" })
    .e("mIntake", "rInvalid", "http.respond", {
      kind: "effect",
      out: "http.respond",
    })
    .e("mLoyal", "pgPoints", "pg.query", { kind: "effect", out: "pg.query" })
    .e("pgPoints", "mLoyal", "loyalty.added", {
      kind: "reply",
      into: "loyalty.added",
      payload:
        'rows:array=[{"id":1,"name":"Maya Chen","email":"maya@beans.test","points":49}]',
    })
    .e("pgPoints", "mLoyal", "loyalty.failed", {
      port: "err",
      into: "loyalty.failed",
      payload: "code:string=ECONNRESET; message:string=dependency failed",
    })
    .e("mLoyal", "mailReceipt", "mailer.send", {
      kind: "effect",
      out: "mailer.send",
    })
    .e("mLoyal", "rOrder", "http.respond", {
      kind: "effect",
      out: "http.respond",
    });

  // ---- the browser: what the person does, and the state it fills ----

  const ui = (id: string, title: string) => d.n(id, "ui-event", title);
  const fh = (id: string, title: string, set: Record<string, string> = {}) =>
    d.n(id, "fe-handler", title, { clientSet: set });
  const state = (id: string, key: string, value: string) =>
    d.n(id, "fe-state", key, { detail: value });

  ui("uCust", "open Customers")
    .n("fLoadCust", "fe-handler", "loadCustomers", {
      clientSet: { search: "{payload.search}", loading: "true" },
    })
    .n("fCust", "fe-handler", "onCustomers", {
      clientSet: { loading: "false" },
    })
    .e("uCust", "fLoadCust", "ui.open")
    .e("fLoadCust", "rtCustList", "http.request", {
      payload: "method=GET; path=/customers; query.q={client.search}",
    })
    .e("mCust", "fCust", "onCustomers", {
      kind: "reply",
      out: "customers.listed",
    });
  state("sCust", "customers", "{payload.body.customers}").e(
    "fCust",
    "sCust",
    "store.set",
  );

  ui("uNewCust", "submit New customer")
    .n("fNewCust", "fe-handler", "createCustomer", {
      clientSet: {
        name: "{payload.name}",
        email: "{payload.email}",
        phone: "{payload.phone}",
        formError: "",
      },
    })
    .n("fCustOk", "fe-handler", "onCustomerCreated", {
      clientSet: { formError: "" },
    })
    .n("fCustNo", "fe-handler", "onCustomerRejected", {
      clientSet: { formError: "{payload.body.error}" },
    })
    .e("uNewCust", "fNewCust", "ui.submit")
    .e("fNewCust", "rtCustNew", "http.request", {
      payload:
        "method=POST; path=/customers; body.name={client.name}; body.email={client.email}; body.phone={client.phone}",
    })
    .e("mCust", "fCustOk", "onCustomerCreated", {
      kind: "reply",
      out: "customer.created",
    })
    .e("mCust", "fCustNo", "onCustomerRejected", {
      kind: "reply",
      out: "customer.rejected",
    });
  state("sFormError", "formError", "{payload.body.error}").e(
    "fCustNo",
    "sFormError",
    "store.set",
  );

  ui("uMenu", "open Menu")
    .n("fLoadMenu", "fe-handler", "loadMenu")
    .n("fMenu", "fe-handler", "onMenu")
    .e("uMenu", "fLoadMenu", "ui.open")
    .e("fLoadMenu", "rtMenu", "http.request", {
      payload: "method=GET; path=/menu",
    })
    .e("mMenu", "fMenu", "onMenu", { kind: "reply", out: "menu.listed" });
  state("sMenu", "menu", "{payload.body.products}").e(
    "fMenu",
    "sMenu",
    "store.set",
  );

  ui("uOrders", "open Orders")
    .n("fLoadOrders", "fe-handler", "loadOrders", {
      clientSet: { filter: "{payload.status}" },
    })
    .n("fOrders", "fe-handler", "onOrders")
    .e("uOrders", "fLoadOrders", "ui.open")
    .e("fLoadOrders", "rtOrders", "http.request", {
      payload: "method=GET; path=/orders; query.status={client.filter}",
    })
    .e("mOrders", "fOrders", "onOrders", {
      kind: "reply",
      out: "orders.listed",
    });
  state("sOrders", "orders", "{payload.body.orders}").e(
    "fOrders",
    "sOrders",
    "store.set",
  );

  ui("uPlace", "click Place order")
    .n("fPlace", "fe-handler", "placeOrder", {
      clientSet: {
        customerId: "{payload.customerId}",
        customerName: "{payload.customerName}",
        items: "{payload.items}",
        total: "{payload.total}",
        formError: "",
      },
    })
    .n("fPlaced", "fe-handler", "onOrderPlaced", {
      clientSet: { formError: "" },
    })
    .n("fRefused", "fe-handler", "onOrderRefused", {
      clientSet: { formError: "{payload.body.error}" },
    })
    .e("uPlace", "fPlace", "ui.click")
    .e("fPlace", "rtOrderNew", "http.request", {
      payload:
        "method=POST; path=/orders; body.customerId:number={client.customerId}; body.customerName={client.customerName}; body.items:array={client.items}; body.total:number={client.total}",
    })
    .e("rOrder", "fPlaced", "onOrderPlaced", { kind: "reply" })
    .e("rInvalid", "fRefused", "onOrderRefused", { kind: "reply" });
  state("sLast", "lastOrder", "{payload.body.order}").e(
    "fPlaced",
    "sLast",
    "store.set",
  );

  ui("uSet", "click Mark ready")
    .n("fSet", "fe-handler", "setStatus", {
      clientSet: { orderId: "{payload.id}", status: "{payload.status}" },
    })
    .n("fSetOk", "fe-handler", "onOrderUpdated")
    .n("fSetNo", "fe-handler", "onOrderMissing")
    .e("uSet", "fSet", "ui.click")
    .e("fSet", "rtOrderSet", "http.request", {
      payload:
        "method=PATCH; path=/orders/2; params.id={client.orderId}; body.status={client.status}",
    })
    .e("mOrders", "fSetOk", "onOrderUpdated", {
      kind: "reply",
      out: "order.updated",
    })
    .e("mOrders", "fSetNo", "onOrderMissing", {
      kind: "reply",
      out: "order.missing",
    });

  ui("uDash", "open Dashboard")
    .n("fLoadDash", "fe-handler", "loadDashboard")
    .n("fDash", "fe-handler", "onDashboard")
    .e("uDash", "fLoadDash", "ui.open")
    .e("fLoadDash", "rtDash", "http.request", {
      payload: "method=GET; path=/dashboard",
    })
    .e("mDash", "fDash", "onDashboard", {
      kind: "reply",
      out: "dashboard.ready",
    });
  state("sKpi", "kpi", "{payload.body}").e("fDash", "sKpi", "store.set");

  d.requests([
    req("r1", "uCust", 0, { search: "an" }),
    req("r2", "uNewCust", 6, {
      name: "Dan Fox",
      email: "dan@beans.test",
      phone: "555-0105",
    }),
    req("r3", "uPlace", 14, {
      customerId: "1",
      customerName: "Maya Chen",
      items: '[{"productId":3,"name":"Latte","qty":2,"price":3.8}]',
      total: "7.6",
    }),
    req("r4", "uDash", 60),
  ]);
  return d.done();
}
