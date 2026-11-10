// The Visual Builder project of the brief: the front desk of a coffee shop. Four pages
// (the dashboard, the customers, a new order, the orders), and no mock route: it is
// linked to the Flow Studio diagram of the same name, which is its backend. Every HTTP
// action here calls a route of that diagram, and the preview runs the diagram against
// its own tables, so a customer added on one page is in the list of the next.
import { coffeeDemo } from "../flow-studio/demo-coffee.ts";
import { type Builder, builder, go, http, key, notice, set } from "./build.ts";
import { type Action, type El, type Model, blankField } from "./model.ts";

const ERR = { errKey: "apiError", loadingKey: "loading" } as const;
const FAIL: Action[] = [notice("{error}")];

/** the four buttons at the top of every page */
function nav(b: Builder, active: number): El[] {
  const pages: [string, string][] = [
    ["Dashboard", "/"],
    ["Customers", "/customers"],
    ["New order", "/new-order"],
    ["Orders", "/orders"],
  ];
  return pages.map(([text, url], i) =>
    b.el(
      "button",
      i * 3,
      0,
      3,
      1,
      { text, variant: i === active ? "default" : "outline" },
      { events: { click: [go(url)] } },
    ),
  );
}

const loadCustomers = (): Action =>
  http("GET", "/customers?q={state.search}", {
    okKey: "customers",
    okPath: "customers",
    ...ERR,
    then: [set("customerNames", 'pick(state.customers, "name")')],
    catch: FAIL,
  });

const loadOrders = (): Action =>
  http("GET", "/orders?status={state.status}", {
    okKey: "orders",
    okPath: "orders",
    ...ERR,
    catch: FAIL,
  });

const loadDashboard = (): Action =>
  http("GET", "/dashboard", { okKey: "kpi", ...ERR, catch: FAIL });

export function coffeeUi(): Model {
  const b = builder(0);

  // ---- the dashboard ----
  const dashHeading = b.el("heading", 0, 1, 12, 1, {
    text: "Coffee shop front desk",
    level: "1",
  });
  dashHeading.events.load = [loadDashboard()];
  const dashboard = b.page("Dashboard", "/", [
    b.section(
      "empty",
      "Dashboard",
      [
        ...nav(b, 0),
        dashHeading,
        b.el("kpi", 0, 2, 3, 3, {
          label: "Open orders",
          value: "{state.kpi.openOrders}",
          delta: "new, preparing or ready",
        }),
        b.el("kpi", 3, 2, 3, 3, {
          label: "Customers",
          value: "{state.kpi.customers}",
          delta: "in the loyalty programme",
        }),
        b.el("kpi", 6, 2, 3, 3, {
          label: "Revenue",
          value: "{round(state.kpi.revenue, 2)}",
          delta: "orders that are done",
        }),
        b.el("kpi", 9, 2, 3, 3, {
          label: "Points of the top 3",
          value: '{sum(state.kpi.leaders, "points")}',
          delta: "the best customers",
        }),
        b.el("heading", 0, 5, 12, 1, { text: "Loyalty leaders", level: "2" }),
        b.el("list", 0, 6, 7, 5, {
          source: "state.kpi.leaders",
          itemText: "{item.name}: {item.points} points",
          removable: "no",
          empty: "No customers yet.",
        }),
        b.el(
          "button",
          0,
          11,
          3,
          1,
          { text: "Refresh", variant: "secondary" },
          { events: { click: [loadDashboard()] } },
        ),
      ],
      { rows: 13 },
    ),
  ]);

  // ---- the customers ----
  const custHeading = b.el("heading", 0, 1, 12, 1, {
    text: "Customers",
    level: "1",
  });
  custHeading.events.load = [loadCustomers()];
  const customers = b.page("Customers", "/customers", [
    b.section(
      "empty",
      "Customers",
      [
        ...nav(b, 1),
        custHeading,
        b.el(
          "input",
          0,
          2,
          6,
          2,
          {
            label: "Search by name or email",
            placeholder: "maya, leo@...",
            type: "text",
          },
          { bind: "search", events: { enter: [loadCustomers()] } },
        ),
        b.el(
          "button",
          6,
          3,
          2,
          1,
          { text: "Search", variant: "default" },
          { events: { click: [loadCustomers()] } },
        ),
        b.el(
          "table",
          0,
          4,
          12,
          8,
          {
            source: "state.customers",
            columns: "name, email, phone, points",
            search: "no",
            pageSize: "6",
            rowActions: "Order",
            empty: "No customer found.",
          },
          {
            events: {
              rowAction: [
                set("customer", "row"),
                set("cart", "[]"),
                set("total", "0"),
                go("/new-order"),
              ],
            },
          },
        ),
        b.el(
          "form",
          0,
          12,
          6,
          8,
          {
            title: "New customer",
            submitLabel: "Add customer",
            errorsKey: "formErrors",
            okText: "",
          },
          {
            bind: "customerForm",
            fields: [
              blankField("name", "Name", "text", "yes"),
              blankField("email", "Email", "email", "yes"),
              blankField("phone", "Phone", "text", "no"),
            ],
            events: {
              submit: [
                http("POST", "/customers", {
                  body: "state.customerForm",
                  okKey: "lastCustomer",
                  okPath: "customer",
                  ...ERR,
                  then: [
                    notice("Added {state.lastCustomer.name}"),
                    set("customerForm", "obj()"),
                    loadCustomers(),
                  ],
                  catch: FAIL,
                }),
              ],
            },
          },
        ),
      ],
      { rows: 21 },
    ),
  ]);

  // ---- a new order ----
  const orderHeading = b.el("heading", 0, 1, 12, 1, {
    text: "New order",
    level: "1",
  });
  orderHeading.events.load = [
    http("GET", "/menu", {
      okKey: "menu",
      okPath: "products",
      ...ERR,
      catch: FAIL,
    }),
    loadCustomers(),
  ];
  const recount = set("total", 'round(sum(state.cart, "price"), 2)');
  const newOrder = b.page("New order", "/new-order", [
    b.section(
      "empty",
      "New order",
      [
        ...nav(b, 2),
        orderHeading,
        b.el(
          "select",
          0,
          2,
          6,
          2,
          { label: "Customer", options: "{state.customerNames}" },
          {
            bind: "customerName",
            events: {
              change: [
                set(
                  "customer",
                  'first(where(state.customers, "name", state.customerName))',
                ),
              ],
            },
          },
        ),
        b.el(
          "text",
          6,
          2,
          6,
          2,
          {
            text: "{state.customer.name} has {state.customer.points} points. An order earns one point for each whole unit of its total.",
          },
          { visible: "state.customer" },
        ),
        b.el("heading", 0, 4, 7, 1, { text: "Menu", level: "2" }),
        b.el(
          "table",
          0,
          5,
          7,
          8,
          {
            source: "state.menu",
            columns: "name, category, price",
            search: "yes",
            pageSize: "8",
            rowActions: "Add",
            empty: "The menu is empty.",
          },
          {
            events: {
              rowAction: [
                {
                  t: "push",
                  key: "cart",
                  value:
                    'obj("productId", row.id, "name", row.name, "qty", 1, "price", row.price)',
                },
                recount,
              ],
            },
          },
        ),
        b.el("heading", 7, 4, 5, 1, { text: "The order", level: "2" }),
        b.el(
          "list",
          7,
          5,
          5,
          5,
          {
            source: "state.cart",
            itemText: "{item.name}: {item.price}",
            removable: "yes",
            empty: "Add something from the menu.",
          },
          {
            events: {
              remove: [{ t: "remove", key: "cart", index: "index" }, recount],
            },
          },
        ),
        b.el("text", 7, 10, 5, 1, { text: "Total: {state.total}" }),
        b.el(
          "button",
          7,
          11,
          5,
          1,
          {
            text: "Place order",
            variant: "default",
            disabled: "len(state.cart) == 0",
          },
          {
            events: {
              click: [
                http("POST", "/orders", {
                  body: 'obj("customerId", state.customer.id, "customerName", state.customer.name, "items", state.cart, "total", state.total)',
                  okKey: "orderResult",
                  ...ERR,
                  then: [
                    notice(
                      "Order {state.orderResult.order.id} placed for {state.orderResult.customer.name}: {state.orderResult.earned} points earned, now {state.orderResult.customer.points}",
                    ),
                    set("cart", "[]"),
                    set("total", "0"),
                  ],
                  catch: FAIL,
                }),
              ],
            },
          },
        ),
      ],
      { rows: 14 },
    ),
  ]);

  // ---- the orders ----
  const ordersHeading = b.el("heading", 0, 1, 12, 1, {
    text: "Orders",
    level: "1",
  });
  ordersHeading.events.load = [loadOrders()];
  const orders = b.page("Orders", "/orders", [
    b.section(
      "empty",
      "Orders",
      [
        ...nav(b, 3),
        ordersHeading,
        b.el(
          "select",
          0,
          2,
          4,
          2,
          { label: "Show", options: "All, new, preparing, ready, done" },
          {
            bind: "filter",
            events: {
              change: [
                set("status", 'state.filter == "All" ? "" : state.filter'),
                loadOrders(),
              ],
            },
          },
        ),
        b.el(
          "table",
          0,
          4,
          12,
          9,
          {
            source: "state.orders",
            columns: "id, customer_name, total, status, created_at",
            search: "no",
            pageSize: "6",
            rowActions: "Next status",
            empty: "No orders.",
          },
          {
            events: {
              rowAction: [
                http("PATCH", "/orders/{row.id}", {
                  body: 'obj("status", row.status == "new" ? "preparing" : row.status == "preparing" ? "ready" : "done")',
                  okKey: "lastOrder",
                  okPath: "order",
                  ...ERR,
                  then: [
                    notice(
                      "Order {state.lastOrder.id} is {state.lastOrder.status}",
                    ),
                    loadOrders(),
                  ],
                  catch: FAIL,
                }),
              ],
            },
          },
        ),
      ],
      { rows: 14 },
    ),
  ]);

  return {
    name: "Coffee shop CRM",
    pages: [dashboard, customers, newOrder, orders],
    keys: [
      key(
        "kpi",
        "json",
        '{"openOrders":0,"customers":0,"revenue":0,"leaders":[]}',
      ),
      key("customers", "json", "[]"),
      key("customerNames", "json", "[]"),
      key("customer", "json", "null"),
      key("customerName", "string", ""),
      key("search", "string", ""),
      key("customerForm", "json", "{}"),
      key("formErrors", "json", "{}"),
      key("lastCustomer", "json", "null"),
      key("menu", "json", "[]"),
      key("cart", "json", "[]"),
      key("total", "number", "0"),
      key("orderResult", "json", "null"),
      key("orders", "json", "[]"),
      key("filter", "string", "All"),
      key("status", "string", ""),
      key("lastOrder", "json", "null"),
      key("loading", "boolean", "false"),
      key("apiError", "json", "null"),
    ],
    mocks: [],
    mockOn: true,
    // the diagram is the backend
    flow: coffeeDemo(),
    // switch the simulation off and the requests go to the generated server (coffee-shop-app)
    apiBase: "/crm-api",
    seq: b.seq(),
  };
}
