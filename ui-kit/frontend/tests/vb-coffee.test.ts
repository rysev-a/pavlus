// The Visual Builder project of the coffee shop, run through its own action engine
// with the Flow Studio diagram as the backend: what the preview does, call by call.
import { describe, expect, test } from "vitest";
import {
  type Run,
  type Step,
  envOf,
  finish,
  fire,
  formInput,
  formSubmit,
  startRun,
} from "../templates/visual-builder/actions.ts";
import { getPath } from "../templates/visual-builder/bind.ts";
import { coffeeUi } from "../templates/visual-builder/demo-coffee.ts";
import { DEMOS } from "../templates/visual-builder/demos.ts";
import {
  type El,
  type EventName,
  type Model,
  allElements,
} from "../templates/visual-builder/model.ts";
import { callFlow, routesOf } from "../templates/flow-studio/flowlink.ts";
import { COFFEE_DB } from "../templates/flow-studio/demo-coffee.ts";

const m: Model = coffeeUi();
const env = envOf(m);

/** the preview: answers the requests with the diagram until nothing is asked */
function pump(start: Step, model = m): Run {
  let run = start.run;
  const asked = [...start.requests];
  let guard = 0;
  while (asked.length && guard++ < 50) {
    const r = asked.shift()!;
    const a = callFlow(model.flow!, run.db, {
      method: r.method,
      url: r.url,
      body: r.body,
      headers: r.headers,
    });
    run = { ...run, db: a.db };
    const next = finish(
      run,
      r.slot,
      { status: a.status, data: a.data },
      envOf(model),
    );
    run = next.run;
    asked.push(...next.requests);
  }
  return run;
}

const page = (name: string) => m.pages.find((p) => p.name === name)!;
const els = (p: string): El[] => page(p).sections.flatMap((s) => s.elements);
const find = (p: string, type: El["type"], text?: string): El =>
  els(p).find(
    (e) =>
      e.type === type &&
      (text === undefined ||
        [e.props.text, e.props.title, e.props.label].includes(text)),
  )!;

/** go to a page: the address changes and its `load` events run */
function goto(run: Run, name: string): Run {
  const p = page(name);
  let step: Step = {
    run: { ...run, page: p.id, location: p.slug },
    requests: [],
    opens: [],
  };
  for (const el of els(name))
    if (el.events.load?.length) {
      const next = fire(el, "load", step.run, {}, env);
      step = {
        run: next.run,
        requests: [...step.requests, ...next.requests],
        opens: [],
      };
    }
  return pump(step);
}

const trigger = (
  run: Run,
  el: El,
  event: EventName,
  extras: Record<string, unknown> = {},
): Run => pump(fire(el, event, run, extras, env));

describe("the project", () => {
  test("is a demo, linked to a diagram, with no mock route", () => {
    expect(DEMOS.map((d) => d.id)).toContain("coffee");
    expect(m.flow?.name).toBe("Coffee shop CRM");
    expect(m.mocks).toEqual([]);
    expect(m.pages.map((p) => p.name)).toEqual([
      "Dashboard",
      "Customers",
      "New order",
      "Orders",
    ]);
  });

  test("every http action calls a route the diagram has", () => {
    const routes = new Set(
      routesOf(m.flow!).map((r) => `${r.method} ${r.path}`),
    );
    const seen: string[] = [];
    const walk = (
      list: import("../templates/visual-builder/model.ts").Action[],
    ): void => {
      for (const a of list) {
        if (a.t === "http") {
          const path = (a.url ?? "").split("?")[0].replace(/\{[^}]*\}/g, ":p");
          seen.push(`${a.method} ${path}`);
          walk(a.then ?? []);
          walk(a.catch ?? []);
        }
      }
    };
    for (const el of allElements(m))
      for (const chain of Object.values(el.events)) walk(chain ?? []);
    expect(seen.length).toBeGreaterThan(8);
    for (const s of seen) {
      const [method, path] = s.split(" ");
      expect(
        [...routes].some(
          (r) =>
            r.split(" ")[0] === method &&
            r.split(" ")[1].replace(/:\w+/g, ":p") === path,
        ),
      ).toBe(true);
    }
  });

  test("a fresh preview starts with the tables of the diagram", () => {
    expect(startRun(m).db).toEqual(COFFEE_DB);
    expect(startRun(m).db).not.toBe(m.flow!.db);
  });
});

describe("the dashboard", () => {
  test("loads the numbers when the page opens", () => {
    const run = goto(startRun(m), "Dashboard");
    expect(run.data.kpi).toMatchObject({
      openOrders: 2,
      customers: 4,
      revenue: 7.6,
    });
    expect((run.data.kpi as { leaders: unknown[] }).leaders).toHaveLength(3);
    expect(run.log.some((l) => l.includes("ok"))).toBe(true);
  });
});

describe("customers", () => {
  test("the page lists them, a search narrows the list", () => {
    let run = goto(startRun(m), "Customers");
    expect((run.data.customers as unknown[]).length).toBe(4);
    expect(run.data.customerNames).toEqual([
      "Ines Duarte",
      "Leo Park",
      "Maya Chen",
      "Sam Okoye",
    ]);
    run = { ...run, data: { ...run.data, search: "park" } };
    run = trigger(run, find("Customers", "button", "Search"), "click");
    expect(
      (run.data.customers as { name: string }[]).map((c) => c.name),
    ).toEqual(["Leo Park"]);
  });

  test("the form adds a customer, who shows in the list, and the same email is refused", () => {
    const form = find("Customers", "form");
    let run = goto(startRun(m), "Customers");
    for (const [k, v] of [
      ["name", "Dan Fox"],
      ["email", "dan@beans.test"],
      ["phone", "555-0105"],
    ])
      run = formInput(form, run, k, v);
    run = pump(formSubmit(form, run, env));
    expect(run.notice).toBe("Added Dan Fox");
    expect(
      (run.data.customers as { name: string }[]).map((c) => c.name),
    ).toContain("Dan Fox");
    expect(run.db.customers.rows).toHaveLength(5);

    for (const [k, v] of [
      ["name", "Dan Again"],
      ["email", "dan@beans.test"],
      ["phone", ""],
    ])
      run = formInput(form, run, k, v);
    run = pump(formSubmit(form, run, env));
    expect(run.notice).toBe("A customer with this email already exists");
    expect(run.db.customers.rows).toHaveLength(5);
  });

  test("an empty form is stopped before the diagram hears of it", () => {
    const form = find("Customers", "form");
    const run = goto(startRun(m), "Customers");
    const step = formSubmit(form, run, env);
    expect(step.requests).toEqual([]);
  });
});

describe("an order, from the customers to the dashboard", () => {
  test("the whole day: order, mark it, and the numbers follow", () => {
    let run = goto(startRun(m), "Customers");
    // "Order" on the row of Maya takes her to the new order page
    const maya = (run.data.customers as { id: number; name: string }[]).find(
      (c) => c.name === "Maya Chen",
    )!;
    run = trigger(run, find("Customers", "table"), "rowAction", {
      row: maya,
      index: 0,
    });
    expect(run.data.customer).toMatchObject({ id: 1, name: "Maya Chen" });
    expect(run.location).toBe("/new-order");

    run = goto(run, "New order");
    expect((run.data.menu as unknown[]).length).toBe(8);
    const latte = (run.data.menu as { id: number; name: string }[]).find(
      (p) => p.name === "Latte",
    )!;
    const menu = find("New order", "table");
    run = trigger(run, menu, "rowAction", { row: latte, index: 0 });
    run = trigger(run, menu, "rowAction", { row: latte, index: 0 });
    expect(run.data.cart).toHaveLength(2);
    expect(run.data.total).toBe(7.6);

    // a line can be taken out of the order again
    const cart = find("New order", "list");
    let run2 = trigger(run, cart, "remove", { index: 1, item: run.data.cart });
    expect(run2.data.cart).toHaveLength(1);
    expect(run2.data.total).toBe(3.8);

    run = trigger(run, find("New order", "button", "Place order"), "click");
    expect(run.notice).toBe(
      "Order 4 placed for Maya Chen: 7 points earned, now 49",
    );
    expect(run.data.cart).toEqual([]);
    expect(run.data.total).toBe(0);
    expect(run.db.orders.rows).toHaveLength(4);
    expect(run.db.customers.rows[0].points).toBe(49);

    // the orders page shows it first; its status moves on
    run = goto(run, "Orders");
    const list = run.data.orders as { id: number; status: string }[];
    expect(list.map((o) => o.id)).toEqual([4, 3, 2, 1]);
    run = trigger(run, find("Orders", "table"), "rowAction", {
      row: list[0],
      index: 0,
    });
    expect(run.notice).toBe("Order 4 is preparing");
    expect(
      (run.data.orders as { id: number; status: string }[])[0],
    ).toMatchObject({ id: 4, status: "preparing" });

    // the dashboard follows what happened
    run = goto(run, "Dashboard");
    expect(run.data.kpi).toMatchObject({
      openOrders: 3,
      customers: 4,
      revenue: 7.6,
    });
    expect(
      (run.data.kpi as { leaders: { name: string; points: number }[] })
        .leaders[0],
    ).toEqual({ name: "Maya Chen", points: 49 });
  });

  test("an order with no customer is refused with the words of the check", () => {
    let run = goto(startRun(m), "New order");
    const menu = find("New order", "table");
    const latte = (
      run.data.menu as { id: number; name: string; price: number }[]
    )[2];
    run = trigger(run, menu, "rowAction", { row: latte, index: 0 });
    run = trigger(run, find("New order", "button", "Place order"), "click");
    expect(run.notice).toBe("Pick the customer of the order");
    expect(run.db.orders.rows).toHaveLength(3);
  });

  test("the orders page filters by status", () => {
    let run = goto(startRun(m), "Orders");
    expect((run.data.orders as unknown[]).length).toBe(3);
    run = { ...run, data: { ...run.data, filter: "preparing" } };
    run = trigger(run, find("Orders", "select"), "change");
    expect(run.data.status).toBe("preparing");
    expect((run.data.orders as { id: number }[]).map((o) => o.id)).toEqual([2]);
    run = { ...run, data: { ...run.data, filter: "All" } };
    run = trigger(run, find("Orders", "select"), "change");
    expect((run.data.orders as unknown[]).length).toBe(3);
  });

  test("a preview that is started again forgets the day", () => {
    let run = goto(startRun(m), "Customers");
    const form = find("Customers", "form");
    for (const [k, v] of [
      ["name", "Dan Fox"],
      ["email", "dan@beans.test"],
      ["phone", ""],
    ])
      run = formInput(form, run, k, v);
    run = pump(formSubmit(form, run, env));
    expect(run.db.customers.rows).toHaveLength(5);
    expect(startRun(m).db.customers.rows).toHaveLength(4);
    expect(getPath(startRun(m).data, "cart")).toEqual([]);
  });
});
