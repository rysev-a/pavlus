// The link of the Visual Builder to a Flow Studio diagram: the panel, the preview
// that runs against it, the picker of a route in an HTTP action, the saved project.
import { describe, expect, test } from "vitest";
import type { Effect, Message } from "@service-laboratory/pavlus";
import { routeAction, routesOf } from "../templates/flow-studio/flowlink.ts";
import { coffeeDemo } from "../templates/flow-studio/demo-coffee.ts";
import { projectText as flowText } from "../templates/flow-studio/model.ts";
import { parseProject, projectText } from "../templates/visual-builder/io.ts";
import {
  actionFields,
  applyEdit,
} from "../templates/visual-builder/inspector.ts";
import { coffeeUi } from "../templates/visual-builder/demo-coffee.ts";
import { emptyModel, allElements } from "../templates/visual-builder/model.ts";
import {
  type VbState,
  page,
  stateOf,
} from "../templates/visual-builder/visual-builder.ts";

function apply(state: VbState, effects: Effect[]): VbState {
  let s = state;
  for (const e of effects)
    if (e.plugin === "store" && e.type === "merge")
      s = { ...s, ...(e.value as object) };
  return s;
}
function sim(state: VbState) {
  const self = {
    state,
    effects: [] as Effect[],
    send(id: string, payload?: unknown, event?: Message["event"]) {
      const fx = page.dispatch({ id, payload, event }, self.state);
      self.state = apply(self.state, fx);
      self.effects.push(...fx);
      return self;
    },
  };
  return self;
}
function settle(s: ReturnType<typeof sim>): void {
  for (let i = 0; i < 20; i++) {
    const timers = s.effects.filter(
      (e) =>
        e.plugin === "time" &&
        e.type === "setTimeout" &&
        String(e.id).startsWith("vb-mock-"),
    );
    s.effects = s.effects.filter((e) => !timers.includes(e));
    if (!timers.length) return;
    for (const t of timers) s.send(t.replyTo as string);
  }
}
const model = (s: ReturnType<typeof sim>) => s.state.hist.present;
const blank = () => sim({ ...stateOf(emptyModel()), ready: true });

describe("the panel", () => {
  test("a project with no diagram offers to link one", () => {
    const s = blank().send("setLeft", "mock");
    expect(s.state.flowV.on).toBe(false);
    expect(s.state.flowV.demos.map((d) => d.id)).toContain("coffee");
    expect(s.state.mockHint).toContain("routes");
  });

  test("a demo diagram is linked from the list, and unlinked again", () => {
    const s = blank().send("flowConnect", undefined, {
      type: "change",
      value: "coffee",
    });
    expect(model(s).flow?.name).toBe("Coffee shop CRM");
    expect(s.state.flowV.on).toBe(true);
    expect(s.state.flowV.name).toBe("Coffee shop CRM");
    expect(s.state.flowV.tables).toBe(
      "customers (4), products (9), orders (3)",
    );
    expect(s.state.flowV.routes.map((r) => r.label)).toContain(
      "PATCH /orders/:id",
    );
    expect(
      s.state.flowV.routes.find((r) => r.label === "POST /orders")!.detail,
    ).toContain("answers 201, 422, 500");
    expect(s.state.mockHint).toContain("Coffee shop CRM");
    s.send("flowDisconnect");
    expect(model(s).flow).toBeNull();
    s.send("undo");
    expect(model(s).flow?.name).toBe("Coffee shop CRM");
  });

  test("an unknown diagram is not linked", () => {
    const s = blank().send("flowConnect", undefined, {
      type: "change",
      value: "nope",
    });
    expect(model(s).flow).toBeNull();
  });

  test("a diagram pasted as JSON is linked; text that is not one says so", () => {
    const s = blank()
      .send("sheet", "flow")
      .send("importText", undefined, {
        type: "input",
        value: flowText(coffeeDemo()),
      });
    s.send("flowApply");
    expect(model(s).flow?.name).toBe("Coffee shop CRM");
    expect(s.state.sheet.open).toBe("");
    const bad = blank()
      .send("sheet", "flow")
      .send("importText", undefined, { type: "input", value: "{nope" });
    bad.send("flowApply");
    expect(bad.state.sheet.error).toContain("Not valid JSON");
    expect(model(bad).flow).toBeNull();
  });
});

describe("the preview, with the diagram as the backend", () => {
  test("starts: the dashboard loads from the diagram, no request leaves for the network", () => {
    const s = sim({ ...stateOf(coffeeUi()), ready: true }).send(
      "setTab",
      "preview",
    );
    expect(s.effects.some((e) => e.plugin === "http")).toBe(false);
    settle(s);
    expect(s.state.run.data.kpi).toMatchObject({ openOrders: 2, customers: 4 });
    expect(s.state.run.log.some((l) => l.includes("the diagram"))).toBe(true);
    expect(s.state.run.db.customers.rows).toHaveLength(4);
  });

  test("the backend switch turns the diagram off: the mock routes (none) answer", () => {
    const s = sim({ ...stateOf(coffeeUi()), ready: true }).send("mockToggle");
    expect(model(s).mockOn).toBe(false);
    s.send("setTab", "preview");
    expect(s.effects.some((e) => e.plugin === "http")).toBe(true);
  });

  test("restarting the preview starts from the tables of the diagram again", () => {
    const s = sim({ ...stateOf(coffeeUi()), ready: true }).send(
      "setTab",
      "preview",
    );
    settle(s);
    const db = s.state.run.db;
    s.send("previewRestart");
    settle(s);
    expect(s.state.run.db).toEqual(db);
    expect(s.state.run.db).not.toBe(model(s).flow!.db);
  });
});

describe("the route picker of an HTTP action", () => {
  const m = coffeeUi();
  const place = allElements(m).find(
    (e) => e.type === "button" && e.props.text === "Place order",
  )!;
  const ctx = `act:${place.id}:click:0`;
  const pick = (route: string) => {
    const r = applyEdit(m, ctx, "flowRoute", route, "desktop")!;
    const el = allElements(r.model).find((e) => e.id === place.id)!;
    return el.events.click![0];
  };

  test("the field lists the routes and shows the one the action calls", () => {
    const routes = routesOf(m.flow!);
    const a = place.events.click![0];
    const f = actionFields(ctx, a, routes).find((x) => x.name === "flowRoute")!;
    expect(f.value).toBe("POST /orders");
    expect(f.choices.map((c) => c.v)).toEqual([
      "",
      ...routes.map((r) => `${r.method} ${r.path}`),
    ]);
    expect(actionFields(ctx, a, []).some((x) => x.name === "flowRoute")).toBe(
      false,
    );
  });

  test("a route fills in the method, the url, the body and where the answer goes", () => {
    // the diagram says the browser sends `q` in the query: the url reads it from the state
    expect(pick("GET /customers")).toMatchObject({
      method: "GET",
      url: "/customers?q={state.q}",
      body: "",
      okKey: "customers",
      okPath: "customers",
    });
    expect(pick("GET /orders")).toMatchObject({
      url: "/orders?status={state.status}",
      okKey: "orders",
      okPath: "orders",
    });
    expect(pick("POST /customers")).toMatchObject({
      method: "POST",
      url: "/customers",
      body: 'obj("name", state.name, "email", state.email, "phone", state.phone)',
      okKey: "customer",
      okPath: "customer",
      errKey: "apiError",
      loadingKey: "loading",
    });
    expect(pick("PATCH /orders/:id")).toMatchObject({
      method: "PATCH",
      url: "/orders/{state.orderId}",
    });
    expect(pick("GET /dashboard")).toMatchObject({
      url: "/dashboard",
      okPath: "",
    });
  });

  test("a route with several keys in its answer keeps the whole answer", () => {
    const a = routeAction(
      routesOf(m.flow!).find((r) => r.path === "/dashboard")!,
    );
    expect(
      routesOf(m.flow!).find((r) => r.path === "/dashboard")!.keys,
    ).toEqual(["openOrders", "customers", "revenue", "leaders"]);
    expect(a.okKey).toBe("dashboardResult");
    expect(a.okPath).toBe("");
  });

  test("the choice of nothing leaves the action as it was", () => {
    const r = applyEdit(m, ctx, "flowRoute", "", "desktop")!;
    expect(
      allElements(r.model).find((e) => e.id === place.id)!.events.click![0],
    ).toEqual(place.events.click![0]);
  });
});

describe("saving", () => {
  test("a project keeps its diagram through its own JSON", () => {
    const m = coffeeUi();
    const back = parseProject(projectText(m));
    expect(typeof back).not.toBe("string");
    expect((back as typeof m).flow).toEqual(m.flow);
    expect((back as typeof m).flow!.db.customers.rows).toHaveLength(4);
  });

  test("a project without one reads as before, and a diagram that is not one is dropped", () => {
    const old = JSON.parse(projectText(emptyModel()));
    delete old.flow;
    expect(
      (parseProject(JSON.stringify(old)) as { flow: unknown }).flow,
    ).toBeNull();
    old.flow = { nope: true };
    expect(
      (parseProject(JSON.stringify(old)) as { flow: unknown }).flow,
    ).toBeNull();
  });
});
