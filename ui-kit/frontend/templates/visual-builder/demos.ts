// The built-in demos. Each is a whole model; every HTTP call goes to a mock
// route, so they work on a static site.
import { coffeeUi } from "./demo-coffee.ts";
import { builder, go, http, key, notice, set } from "./build.ts";
import type { Action, MockRoute, Model } from "./model.ts";

const mock = (
  id: string,
  method: string,
  path: string,
  body: unknown,
  status = 200,
  delay = 400,
): MockRoute => ({
  id,
  method,
  path,
  status,
  body: JSON.stringify(body),
  delay,
});

const USERS = [
  {
    id: 1,
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines",
    city: "London",
  },
  {
    id: 2,
    name: "Alan Turing",
    email: "alan@example.com",
    company: "Bletchley",
    city: "Wilmslow",
  },
  {
    id: 3,
    name: "Grace Hopper",
    email: "grace@example.com",
    company: "US Navy",
    city: "New York",
  },
  {
    id: 4,
    name: "Linus Torvalds",
    email: "linus@example.com",
    company: "Linux Foundation",
    city: "Portland",
  },
  {
    id: 5,
    name: "Margaret Hamilton",
    email: "margaret@example.com",
    company: "MIT",
    city: "Boston",
  },
  {
    id: 6,
    name: "Dennis Ritchie",
    email: "dennis@example.com",
    company: "Bell Labs",
    city: "Murray Hill",
  },
  {
    id: 7,
    name: "Barbara Liskov",
    email: "barbara@example.com",
    company: "MIT",
    city: "Cambridge",
  },
  {
    id: 8,
    name: "Ken Thompson",
    email: "ken@example.com",
    company: "Bell Labs",
    city: "New Orleans",
  },
];

export function counterDemo(): Model {
  const b = builder(0);
  const page = b.page("Counter", "/", [
    b.section(
      "empty",
      "Counter",
      [
        b.el("heading", 0, 0, 8, 1, { text: "Counter", level: "1" }),
        b.el("kpi", 0, 1, 4, 3, {
          label: "Count",
          value: "{state.count}",
          delta: "step {state.step}",
        }),
        b.el(
          "badge",
          4,
          1,
          3,
          1,
          { text: "High", variant: "warning" },
          { visible: "state.count >= 10" },
        ),
        b.el("progress", 4, 2, 6, 1, {
          label: "Towards 20",
          value: "state.count * 5",
        }),
        b.el(
          "button",
          0,
          4,
          2,
          1,
          { text: "- {state.step}" },
          {
            events: { click: [set("count", "state.count - state.step")] },
          },
        ),
        b.el(
          "button",
          2,
          4,
          2,
          1,
          { text: "+ {state.step}" },
          {
            events: { click: [set("count", "state.count + state.step")] },
          },
        ),
        b.el(
          "button",
          4,
          4,
          2,
          1,
          { text: "Reset", variant: "outline" },
          {
            events: { click: [set("count", "0"), notice("Back to zero")] },
          },
        ),
        b.el(
          "input",
          0,
          5,
          4,
          2,
          { label: "Step", type: "number" },
          { bind: "step" },
        ),
        b.el("text", 0, 7, 8, 1, {
          text: "The count is {state.count}: change it with the buttons, or edit the model.",
        }),
      ],
      { rows: 8 },
    ),
  ]);
  return {
    name: "Counter",
    pages: [page],
    keys: [key("count", "number", "0"), key("step", "number", "1")],
    mocks: [],
    mockOn: true,
    flow: null,
    apiBase: "",
    seq: b.seq(),
  };
}

export function todoDemo(): Model {
  const b = builder(0);
  const add: Action[] = [
    {
      t: "push",
      key: "todos",
      value: 'obj("title", state.draft, "done", false)',
    },
    set("draft", '""'),
  ];
  const page = b.page("Todo", "/", [
    b.section(
      "empty",
      "Todo list",
      [
        b.el("heading", 0, 0, 8, 1, { text: "Todo list", level: "1" }),
        b.el(
          "input",
          0,
          1,
          6,
          2,
          { label: "New task", placeholder: "What needs doing?" },
          {
            bind: "draft",
            events: { enter: [...add] },
          },
        ),
        b.el(
          "button",
          6,
          2,
          2,
          1,
          { text: "Add", disabled: "len(trim(state.draft)) == 0" },
          {
            events: { click: [...add] },
          },
        ),
        b.el(
          "list",
          0,
          3,
          8,
          6,
          {
            source: "state.todos",
            itemText: "{item.title}",
            removable: "yes",
            empty: "All done!",
          },
          {
            events: { remove: [{ t: "remove", key: "todos", index: "index" }] },
          },
        ),
        b.el("text", 0, 9, 6, 1, { text: "{len(state.todos)} tasks" }),
        b.el(
          "button",
          0,
          10,
          3,
          1,
          { text: "Load samples", variant: "secondary" },
          {
            events: {
              click: [
                http("GET", "/api/todos", {
                  okKey: "todos",
                  loadingKey: "loading",
                  errKey: "error",
                }),
              ],
            },
          },
        ),
        b.el(
          "badge",
          3,
          10,
          3,
          1,
          { text: "Loading...", variant: "outline" },
          { visible: "state.loading" },
        ),
        b.el(
          "button",
          5,
          9,
          3,
          1,
          { text: "Save to server", variant: "outline" },
          {
            events: {
              click: [
                http("POST", "/api/todos", {
                  body: "state.todos",
                  then: [notice("Saved {len(state.todos)} tasks")],
                }),
              ],
            },
          },
        ),
      ],
      { rows: 11 },
    ),
  ]);
  return {
    name: "Todo list",
    pages: [page],
    keys: [
      key(
        "todos",
        "json",
        JSON.stringify([
          { title: "Try the builder", done: false },
          { title: "Open the diagram", done: false },
        ]),
      ),
      key("draft", "string", ""),
      key("loading", "boolean", "false"),
      key("error", "json", "null"),
    ],
    mocks: [
      mock("m1", "GET", "/api/todos", [
        { title: "Buy milk", done: false },
        { title: "Write the report", done: false },
        { title: "Call Ada", done: true },
      ]),
      mock("m2", "POST", "/api/todos", { saved: true }, 201, 300),
    ],
    mockOn: true,
    flow: null,
    apiBase: "",
    seq: b.seq(),
  };
}

export function directoryDemo(): Model {
  const b = builder(0);
  const page = b.page("Users", "/", [
    b.section(
      "empty",
      "User directory",
      [
        b.el("heading", 0, 0, 8, 1, { text: "User directory", level: "1" }),
        b.el(
          "input",
          0,
          1,
          6,
          2,
          { label: "Search", placeholder: "Name or email" },
          { bind: "q" },
        ),
        b.el(
          "button",
          6,
          2,
          3,
          1,
          { text: "Reload", variant: "outline" },
          {
            events: {
              click: [
                http("GET", "/api/users", {
                  okKey: "users",
                  loadingKey: "loading",
                  errKey: "error",
                }),
              ],
            },
          },
        ),
        b.el(
          "badge",
          9,
          2,
          3,
          1,
          { text: "Loading...", variant: "secondary" },
          { visible: "state.loading" },
        ),
        b.el(
          "text",
          0,
          3,
          12,
          1,
          { text: "Could not load: {state.error.message}" },
          { visible: "state.error" },
        ),
        b.el(
          "table",
          0,
          4,
          8,
          8,
          {
            source: "state.users",
            columns: "id, name, email, company",
            filter:
              "contains(row.name, state.q) || contains(row.email, state.q)",
            pageSize: "5",
            empty: "No users match.",
          },
          {
            events: {
              load: [
                http("GET", "/api/users", {
                  okKey: "users",
                  loadingKey: "loading",
                  errKey: "error",
                }),
              ],
              click: [
                set("selected", "row"),
                http("GET", "/api/users/{row.id}", { okKey: "detail" }),
              ],
            },
          },
        ),
        b.el(
          "card",
          8,
          4,
          4,
          5,
          {
            title: "{state.selected.name}",
            text: "{state.selected.email}, {state.selected.company}, {state.selected.city}",
          },
          {
            visible: "state.selected",
          },
        ),
        b.el(
          "card",
          8,
          4,
          4,
          3,
          { title: "No user selected", text: "Click a row of the table." },
          {
            visible: "!state.selected",
          },
        ),
        b.el(
          "text",
          8,
          9,
          4,
          2,
          {
            text: "Detail from the API: {state.detail.name} ({state.detail.id})",
          },
          {
            visible: "state.detail",
          },
        ),
      ],
      { rows: 12 },
    ),
  ]);
  return {
    name: "User directory",
    pages: [page],
    keys: [
      key("users", "json", "[]"),
      key("q", "string", ""),
      key("selected", "json", "null"),
      key("detail", "json", "null"),
      key("loading", "boolean", "false"),
      key("error", "json", "null"),
    ],
    mocks: [
      mock("m1", "GET", "/api/users", USERS),
      mock("m2", "GET", "/api/users/:id", {
        id: "$param:id",
        name: "Loaded by id",
        via: "mock",
      }),
    ],
    mockOn: true,
    flow: null,
    apiBase: "",
    seq: b.seq(),
  };
}

export function landingDemo(): Model {
  const b = builder(0);
  const home = b.page("Home", "/", [
    b.section(
      "hero",
      "Hero",
      [
        b.el(
          "heading",
          1,
          1,
          7,
          2,
          { text: "Ship your idea this week", level: "1" },
          { mobile: { x: 0, y: 0, w: 12, h: 2 } },
        ),
        b.el("text", 1, 3, 6, 2, {
          text: "Pages, forms and dashboards from blocks. No code until you want it.",
        }),
        b.el(
          "button",
          1,
          5,
          3,
          1,
          { text: "Get started" },
          { events: { click: [go("/pricing")] } },
        ),
        b.el("link", 4, 5, 3, 1, { text: "See pricing", page: "p_pricing" }),
        b.el(
          "image",
          8,
          1,
          4,
          5,
          { alt: "Hero picture" },
          { hide: { mobile: true } },
        ),
      ],
      { rows: 7, bg: "muted", pad: "lg" },
    ),
    b.section(
      "features",
      "Features",
      [
        b.el(
          "heading",
          0,
          0,
          12,
          1,
          { text: "Why teams pick us", level: "2" },
          { style: { align: "center" } },
        ),
        b.el("card", 0, 1, 4, 3, { title: "Fast", text: "Loads in a blink." }),
        b.el("card", 4, 1, 4, 3, {
          title: "Simple",
          text: "Nothing to learn.",
        }),
        b.el("card", 8, 1, 4, 3, {
          title: "Yours",
          text: "Change every part.",
        }),
      ],
      { rows: 4 },
    ),
    b.section(
      "form",
      "Lead form",
      [
        b.el(
          "heading",
          3,
          0,
          6,
          1,
          { text: "Talk to us", level: "2" },
          { style: { align: "center" } },
        ),
        b.el(
          "form",
          3,
          1,
          6,
          9,
          {
            title: "Request a call",
            submitLabel: "Send",
            errorsKey: "leadErrors",
          },
          {
            bind: "lead",
            tablet: { x: 1, y: 1, w: 10, h: 9 },
            fields: [
              {
                name: "name",
                label: "Name",
                type: "text",
                required: "yes",
                minLength: "2",
                maxLength: "",
                min: "",
                max: "",
                pattern: "",
                message: "",
                options: "",
              },
              {
                name: "email",
                label: "Email",
                type: "email",
                required: "yes",
                minLength: "",
                maxLength: "",
                min: "",
                max: "",
                pattern: "",
                message: "Enter a valid email",
                options: "",
              },
              {
                name: "seats",
                label: "Team size",
                type: "number",
                required: "yes",
                minLength: "",
                maxLength: "",
                min: "1",
                max: "500",
                pattern: "",
                message: "",
                options: "",
              },
              {
                name: "message",
                label: "Message",
                type: "textarea",
                required: "no",
                minLength: "10",
                maxLength: "200",
                min: "",
                max: "",
                pattern: "",
                message: "",
                options: "",
              },
            ],
            events: {
              invalid: [notice("Please fix the highlighted fields")],
              submit: [
                http("POST", "/api/leads", {
                  headers: "X-Source: landing",
                  body: "state.lead",
                  okKey: "lead_result",
                  loadingKey: "sending",
                  errKey: "send_error",
                  then: [go("/thanks")],
                  catch: [notice("Could not send: {error}")],
                }),
              ],
            },
          },
        ),
        b.el(
          "text",
          3,
          10,
          6,
          1,
          { text: "Sending..." },
          { visible: "state.sending" },
        ),
      ],
      { rows: 11 },
    ),
    b.section(
      "footer",
      "Footer",
      [
        b.el("text", 0, 0, 8, 1, { text: "Made with the Visual Builder." }),
        b.el("link", 8, 0, 2, 1, { text: "Pricing", page: "p_pricing" }),
        b.el("link", 10, 0, 2, 1, { text: "Home", page: "p_home" }),
      ],
      { rows: 1, bg: "secondary", pad: "sm" },
    ),
  ]);
  const pricing = b.page("Pricing", "/pricing", [
    b.section(
      "pricing",
      "Plans",
      [
        b.el(
          "heading",
          0,
          0,
          12,
          1,
          { text: "Pricing", level: "1" },
          { style: { align: "center" } },
        ),
        b.el(
          "tabs",
          3,
          1,
          6,
          2,
          {
            tabs: "Monthly, Yearly",
            panels: "Pay month by month | Two months free",
          },
          { bind: "billing" },
        ),
        b.el(
          "repeater",
          0,
          3,
          12,
          4,
          {
            source: "state.plans",
            title: "{item.name} {item.price}",
            text: "{item.note}",
            footer: "Choose",
          },
          {
            events: { click: [set("lead.plan", "item.name"), go("/")] },
          },
        ),
        b.el("link", 0, 7, 3, 1, { text: "Back home", page: "p_home" }),
      ],
      { rows: 8, bg: "muted" },
    ),
  ]);
  const thanks = b.page("Thanks", "/thanks", [
    b.section(
      "empty",
      "Thanks",
      [
        b.el(
          "heading",
          2,
          1,
          8,
          2,
          { text: "Thank you, {state.lead.name}!", level: "1" },
          { style: { align: "center" } },
        ),
        b.el(
          "text",
          2,
          3,
          8,
          1,
          {
            text: "We saved request {state.lead_result.id} and will write to {state.lead.email}.",
          },
          { style: { align: "center" } },
        ),
        b.el("link", 5, 5, 2, 1, { text: "Home", page: "p_home" }),
      ],
      { rows: 7 },
    ),
  ]);
  // the pages know each other by id: the links name them by slug-free ids
  const ids: Record<string, string> = {
    p_home: home.id,
    p_pricing: pricing.id,
  };
  for (const p of [home, pricing, thanks])
    for (const s of p.sections)
      for (const e of s.elements)
        if (e.props.page && ids[e.props.page]) e.props.page = ids[e.props.page];
  return {
    name: "Landing page + lead form",
    pages: [home, pricing, thanks],
    keys: [
      key("lead", "json", '{"name":"","email":"","seats":1,"message":""}'),
      key("leadErrors", "json", "{}"),
      key("sending", "boolean", "false"),
      key("lead_result", "json", "null"),
      key("send_error", "json", "null"),
      key("billing", "string", "Monthly"),
      key(
        "plans",
        "json",
        JSON.stringify([
          { name: "Free", price: "$0", note: "For a try" },
          { name: "Team", price: "$12", note: "Per seat" },
          { name: "Company", price: "$49", note: "Per seat" },
        ]),
      ),
    ],
    mocks: [
      mock(
        "m1",
        "POST",
        "/api/leads",
        { id: 1042, status: "queued" },
        201,
        700,
      ),
    ],
    mockOn: true,
    flow: null,
    apiBase: "",
    seq: b.seq(),
  };
}

const ORDERS = [
  { label: "Jan N", month: "Jan", region: "North", amount: 120, orders: 14 },
  { label: "Jan S", month: "Jan", region: "South", amount: 90, orders: 9 },
  { label: "Feb N", month: "Feb", region: "North", amount: 150, orders: 17 },
  { label: "Feb S", month: "Feb", region: "South", amount: 110, orders: 12 },
  { label: "Mar N", month: "Mar", region: "North", amount: 135, orders: 15 },
  { label: "Mar S", month: "Mar", region: "South", amount: 160, orders: 19 },
  { label: "Apr N", month: "Apr", region: "North", amount: 190, orders: 22 },
  { label: "Apr S", month: "Apr", region: "South", amount: 140, orders: 16 },
];

export function salesDemo(): Model {
  const b = builder(0);
  const pick = set(
    "shown",
    'state.region == "All" ? state.orders : where(state.orders, "region", state.region)',
  );
  const page = b.page("Sales", "/", [
    b.section(
      "dashboard",
      "Sales dashboard",
      [
        b.el("heading", 0, 0, 7, 1, { text: "Sales dashboard", level: "1" }),
        b.el(
          "select",
          8,
          0,
          4,
          2,
          { label: "Region", options: "All, North, South" },
          {
            bind: "region",
            events: { change: [pick] },
          },
        ),
        b.el("kpi", 0, 1, 3, 3, {
          label: "Revenue",
          value: '{sum(state.shown, "amount")}',
          delta: "{len(state.shown)} rows",
        }),
        b.el("kpi", 3, 1, 3, 3, {
          label: "Orders",
          value: '{sum(state.shown, "orders")}',
          delta: "all months",
        }),
        b.el("kpi", 6, 1, 2, 3, {
          label: "Best",
          value: '{max(state.shown, "amount")}',
        }),
        b.el("chart", 0, 4, 7, 6, {
          kind: "bar",
          title: "Revenue by month",
          source: "state.shown",
          labelField: "label",
          valueField: "amount",
        }),
        b.el("chart", 7, 4, 5, 6, {
          kind: "pie",
          title: "Share by region",
          source: "state.byRegion",
          labelField: "label",
          valueField: "value",
        }),
        b.el("chart", 0, 10, 12, 6, {
          kind: "line",
          title: "Orders",
          source: "state.shown",
          labelField: "label",
          valueField: "orders",
        }),
        b.el(
          "table",
          0,
          16,
          12,
          7,
          {
            source: "state.shown",
            columns: "month, region, amount, orders",
            search: "yes",
            pageSize: "4",
            rowActions: "Remove",
          },
          {
            events: {
              rowAction: [
                { t: "remove", key: "shown", index: "index" },
                notice("Removed {row.label}"),
              ],
            },
          },
        ),
        b.el(
          "button",
          8,
          2,
          4,
          1,
          { text: "Reload data", variant: "outline" },
          {
            events: {
              click: [
                http("GET", "/api/orders", {
                  okKey: "orders",
                  loadingKey: "loading",
                  errKey: "error",
                  then: [
                    pick,
                    set(
                      "byRegion",
                      '[obj("label", "North", "value", sum(where(state.orders, "region", "North"), "amount")), obj("label", "South", "value", sum(where(state.orders, "region", "South"), "amount"))]',
                    ),
                  ],
                  catch: [notice("Load failed: {error}")],
                }),
              ],
            },
          },
        ),
      ],
      { rows: 23 },
    ),
  ]);
  // the first load happens when the preview starts
  const heading = page.sections[0].elements[0];
  heading.events.load = [
    http("GET", "/api/orders", {
      okKey: "orders",
      loadingKey: "loading",
      errKey: "error",
      then: [
        pick,
        set(
          "byRegion",
          '[obj("label", "North", "value", sum(where(state.orders, "region", "North"), "amount")), obj("label", "South", "value", sum(where(state.orders, "region", "South"), "amount"))]',
        ),
      ],
    }),
  ];
  return {
    name: "Sales dashboard",
    pages: [page],
    keys: [
      key("orders", "json", JSON.stringify(ORDERS)),
      key("shown", "json", JSON.stringify(ORDERS)),
      key(
        "byRegion",
        "json",
        JSON.stringify([
          { label: "North", value: 595 },
          { label: "South", value: 500 },
        ]),
      ),
      key("region", "string", "All"),
      key("loading", "boolean", "false"),
      key("error", "json", "null"),
    ],
    mocks: [mock("m1", "GET", "/api/orders", ORDERS, 200, 600)],
    mockOn: true,
    flow: null,
    apiBase: "",
    seq: b.seq(),
  };
}

export interface Demo {
  id: string;
  title: string;
  about: string;
  make: () => Model;
}

export const DEMOS: Demo[] = [
  {
    id: "coffee",
    title: "Coffee shop CRM",
    about:
      "The front desk of a coffee shop: dashboard, customers, a new order, orders. No mock route: it is linked to the Flow Studio diagram of the same name, which is its backend.",
    make: coffeeUi,
  },
  {
    id: "counter",
    title: "Counter",
    about: "Buttons change a number; an input is bound to the step.",
    make: counterDemo,
  },
  {
    id: "todo",
    title: "Todo list",
    about:
      "Add and remove items of an array; load samples over a mock HTTP call.",
    make: todoDemo,
  },
  {
    id: "users",
    title: "User directory",
    about:
      "A mock API loads users into a table; search is bound to state; a detail card.",
    make: directoryDemo,
  },
  {
    id: "landing",
    title: "Landing page + lead form",
    about: "Three pages, sections, a validated form that POSTs to a mock API.",
    make: landingDemo,
  },
  {
    id: "sales",
    title: "Sales dashboard",
    about:
      "KPIs, bar / line / pie charts and a table from a mock API, filtered by a select.",
    make: salesDemo,
  },
];

export const demoOf = (id: string): Demo =>
  DEMOS.find((d) => d.id === id) ?? DEMOS[0];
