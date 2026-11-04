import { expect, test } from "vitest";
import type { Effect, Message } from "@service-laboratory/pavlus";
import { ENTITIES } from "../templates/phone-retail-crm/entities.ts";
import {
  page,
  initialState,
  type CrmState,
} from "../templates/phone-retail-crm/phone-retail-crm.ts";
import { seedDb } from "../templates/phone-retail-crm/seed.ts";

/** Runs a message through the page and applies its `store.set` effects, like the store plugin. */
function send(
  state: CrmState,
  id: string,
  payload?: unknown,
  event?: { value?: string; checked?: boolean },
): { state: CrmState; effects: Effect[] } {
  const effects = page.dispatch(
    {
      id,
      payload,
      event: event && { type: "input", value: "", ...event },
    } as Message,
    state,
  );
  const next = { ...state } as Record<string, unknown>;
  for (const e of effects) {
    const x = e as unknown as {
      plugin: string;
      type: string;
      path: string;
      value: unknown;
    };
    if (x.plugin === "store" && x.type === "set") next[x.path] = x.value;
  }
  return { state: next as unknown as CrmState, effects };
}
const plugins = (effects: Effect[], name: string) =>
  effects.filter(
    (e) => (e as { plugin: string }).plugin === name,
  ) as unknown as Record<string, unknown>[];

function ready(): CrmState {
  let s = initialState();
  expect(s.view).toBe("loading");
  s = send(s, "loaded", { data: seedDb(), empty: false }).state;
  return s;
}

test("a first visit seeds the database and writes it", () => {
  const { state, effects } = send(initialState(), "loaded", {
    data: {},
    empty: true,
  });
  expect(state.status).toBe("ready");
  expect(state.db.users).toHaveLength(200);
  const write = plugins(effects, "idb").find((e) => e.type === "replaceAll")!;
  expect(Object.keys(write.data as object)).toContain("orders");
  expect(state.notice).toMatch(/Sample data/);
});

test("every table has a list with its sort column, a form and a count in the navigation", () => {
  let s = ready();
  for (const e of ENTITIES) {
    s = send(s, "nav.go", e.screen).state;
    expect(s.view, e.screen).toBe("list");
    expect(s.grid.all, e.screen).toBe(s.db[e.key].length);
    expect(s.grid.columns.length, e.screen).toBeGreaterThanOrEqual(2);
    s = send(s, "table.add").state;
    expect(s.view, e.screen).toBe("form");
    expect(s.form.fields.length, e.screen).toBe(e.fields.length);
    s = send(s, "form.cancel").state;
  }
  const badge = (id: string) =>
    s.groups.flatMap((g) => g.items).find((i) => i.id === id)?.badge;
  expect([
    badge("users"),
    badge("roles"),
    badge("permissions"),
    badge("sessions"),
    badge("shops"),
    badge("shopCategories"),
    badge("orders"),
  ]).toEqual(["200", "50", "100", "20", "50", "5", "500"]);
});

test("create: the form is checked, then the row is saved and written", () => {
  let s = send(ready(), "nav.go", "manufacturers").state;
  s = send(s, "table.add").state;
  s = send(s, "form.save").state;
  expect(s.view).toBe("form");
  expect(s.errors.name).toBe("Name is required");
  s = send(s, "form.change", "name", { value: "Fairphone" }).state;
  s = send(s, "form.change", "country", { value: "Netherlands" }).state;
  const done = send(s, "form.save");
  expect(done.state.view).toBe("list");
  expect(done.state.db.manufacturers.at(-1)).toMatchObject({
    id: 9,
    name: "Fairphone",
    country: "Netherlands",
  });
  expect(
    plugins(done.effects, "idb").find((e) => e.type === "put"),
  ).toMatchObject({ table: "manufacturers" });
});

test("update an order: the total follows the lines", () => {
  let s = send(ready(), "nav.go", "orders").state;
  s = send(s, "table.edit", 1).state;
  s = send(s, "form.lineSet", ["items", 0, "qty"], { value: "4" }).state;
  const saved = send(s, "form.save").state;
  const order = saved.db.orders.find((o) => o.id === 1)!;
  expect(order.total).toBe(
    Math.round(order.items.reduce((a, i) => a + i.qty * i.price, 0) * 100) /
      100,
  );
  expect(order.items[0].qty).toBe(4);
});

test("delete: a role in use is refused, a free row asks first and then goes (with its writes)", () => {
  let s = send(ready(), "nav.go", "roles").state;
  const used = s.db.roles.find((r) =>
    s.db.users.some((u) => u.roleId === r.id),
  )!;
  s = send(s, "table.remove", used.id).state;
  expect(s.guardNote).toMatch(/is used by \d+ users?/);
  expect(s.db.roles.some((r) => r.id === used.id)).toBe(true);

  s = send(s, "nav.go", "sessions").state;
  s = send(s, "table.remove", 5).state;
  expect(s.confirm.open).toBe(true);
  const gone = send(s, "confirmYes");
  expect(gone.state.db.sessions.some((x) => x.id === 5)).toBe(false);
  expect(
    plugins(gone.effects, "idb").find((e) => e.type === "remove"),
  ).toMatchObject({ table: "sessions", ids: [5] });
});

test("deleting a permission takes it out of the roles that had it", () => {
  let s = send(ready(), "nav.go", "permissions").state;
  const pid = s.db.roles.find((r) => r.permissionIds.length > 0)!
    .permissionIds[0];
  s = send(s, "table.remove", pid).state;
  const gone = send(s, "confirmYes").state;
  expect(gone.db.roles.every((r) => !r.permissionIds.includes(pid))).toBe(true);
});

test("settings: export asks for a file, import replaces the data, a bad file is explained, reset reseeds", () => {
  let s = send(ready(), "nav.go", "settings").state;
  expect(s.settings.total).toBeGreaterThan(1200);
  const exp = send(s, "settingsExport");
  const file = plugins(exp.effects, "files").find(
    (e) => e.type === "download",
  )!;
  expect(String(file.name)).toMatch(/phone-retail-crm.*\.json/);
  const text = String(file.text);

  // import what was exported, with fewer sessions
  const snap = JSON.parse(text);
  snap.data.sessions = snap.data.sessions.slice(0, 2);
  const imp = send(s, "importPicked", {
    name: "x.json",
    text: JSON.stringify(snap),
  });
  expect(imp.state.db.sessions).toHaveLength(2);
  expect(
    plugins(imp.effects, "idb").find((e) => e.type === "replaceAll"),
  ).toBeTruthy();

  const bad = send(s, "importPicked", { name: "bad.json", text: "{}" });
  expect(bad.state.settings.importError).toMatch(/bad\.json/);
  expect(bad.state.db).toBe(s.db);

  s = send(imp.state, "settingsAskReset").state;
  expect(s.settings.askReset).toBe(true);
  const reset = send(s, "settingsReset");
  expect(reset.state.db.sessions).toHaveLength(20);
});

test("the dashboards and the map are derived for their screens only", () => {
  let s = ready();
  s = send(s, "nav.go", "shopsMap").state;
  expect(s.map.points).toHaveLength(50);
  s = send(s, "map.map.pick", "3").state;
  expect(s.map.picked?.id).toBe("3");
  s = send(s, "nav.go", "sales").state;
  expect(s.sales.revenue.points).toHaveLength(12);
  s = send(s, "nav.go", "budget").state;
  expect(s.budgetDash.months).toHaveLength(12);
});
