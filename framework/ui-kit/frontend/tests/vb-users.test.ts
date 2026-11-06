// The simplest example, run through the action engine with its diagram as the backend:
// load the users, create one, change the selected one, remove it.
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
import { usersUi } from "../templates/visual-builder/demo-users.ts";
import { columnsOf } from "../templates/visual-builder/stage.ts";
import { DEMOS } from "../templates/visual-builder/demos.ts";
import type { El, EventName } from "../templates/visual-builder/model.ts";
import { DEMOS as FLOW_DEMOS } from "../templates/flow-studio/demos.ts";
import { callFlow, routesOf } from "../templates/flow-studio/flowlink.ts";
import { lint } from "../templates/flow-studio/lint.ts";
import { USERS_DB } from "../templates/flow-studio/demo-users.ts";

const m = usersUi();
const env = envOf(m);
const els: El[] = m.pages.flatMap((p) => p.sections.flatMap((s) => s.elements));
const find = (type: El["type"], text?: string): El =>
  els.find(
    (e) =>
      e.type === type &&
      (text === undefined ||
        [e.props.text, e.props.title, e.props.label].includes(text)),
  )!;

/** the preview: answers the requests with the diagram until nothing is asked */
function pump(start: Step): Run {
  let run = start.run;
  const asked = [...start.requests];
  let guard = 0;
  while (asked.length && guard++ < 50) {
    const r = asked.shift()!;
    const a = callFlow(m.flow!, run.db, {
      method: r.method,
      url: r.url,
      body: r.body,
      headers: r.headers,
    });
    run = { ...run, db: a.db };
    const next = finish(run, r.slot, { status: a.status, data: a.data }, env);
    run = next.run;
    asked.push(...next.requests);
  }
  return run;
}

const trigger = (
  run: Run,
  el: El,
  event: EventName,
  extras: Record<string, unknown> = {},
): Run => pump(fire(el, event, run, extras, env));

/** open the page: its `load` events run */
const open = (): Run => {
  let step: Step = { run: startRun(m), requests: [], opens: [] };
  for (const el of els)
    if (el.events.load?.length) {
      const next = fire(el, "load", step.run, {}, env);
      step = {
        run: next.run,
        requests: [...step.requests, ...next.requests],
        opens: [],
      };
    }
  return pump(step);
};
const names = (run: Run) =>
  (run.data.users as { name: string }[]).map((u) => u.name);

describe("the simplest example", () => {
  test("is a demo of both tools, linked, with no mock route", () => {
    expect(DEMOS.map((d) => d.id)).toContain("users-crud");
    expect(FLOW_DEMOS.map((d) => d.id)).toContain("users-crud");
    expect(m.flow?.name).toBe("Users CRUD");
    expect(m.mocks).toEqual([]);
    expect(m.pages.map((p) => p.name)).toEqual(["Users"]);
  });

  test("the diagram has the four routes, one table, and no problem the checks find", () => {
    expect(
      routesOf(m.flow!)
        .map((r) => `${r.method} ${r.path}`)
        .sort(),
    ).toEqual([
      "DELETE /users/:id",
      "GET /users",
      "PATCH /users/:id",
      "POST /users",
    ]);
    expect(Object.keys(m.flow!.db)).toEqual(["users"]);
    expect(lint(m.flow!).filter((i) => i.severity === "error")).toEqual([]);
  });

  test("opening the page loads the users from the backend into the table", () => {
    const run = open();
    expect(names(run)).toEqual(["Ada Lovelace", "Grace Hopper", "Alan Turing"]);
    expect(run.db.users.rows).toEqual(USERS_DB.users.rows);
  });

  test("create: a user is added, the list is loaded again, and the form is empty", () => {
    const form = find("form", "New user");
    let run = open();
    run = formInput(form, run, "name", "Edsger Dijkstra");
    run = formInput(form, run, "email", "edsger@example.test");
    run = pump(formSubmit(form, run, env));
    expect(run.notice).toBe("Created Edsger Dijkstra");
    expect(names(run)).toContain("Edsger Dijkstra");
    expect(run.db.users.rows).toHaveLength(4);
    expect(run.data.newForm).toEqual({});
  });

  test("create: an email that is taken is refused, and nothing is added", () => {
    const form = find("form", "New user");
    let run = open();
    run = formInput(form, run, "name", "Ada Again");
    run = formInput(form, run, "email", "ada@example.test");
    run = pump(formSubmit(form, run, env));
    expect(run.notice).toBe("A user with this email already exists");
    expect(run.db.users.rows).toHaveLength(3);
  });

  test("an empty form is stopped before the backend hears of it", () => {
    const step = formSubmit(find("form", "New user"), open(), env);
    expect(step.requests).toEqual([]);
  });

  test("update: Edit takes a row into the form, Save changes it", () => {
    const table = find("table");
    const form = find("form", "Selected user");
    let run = open();
    run = trigger(run, table, "rowAction", {
      row: (run.data.users as unknown[])[1],
      item: (run.data.users as unknown[])[1],
      index: 1,
      action: "Edit",
    });
    expect(run.data.editForm).toMatchObject({ id: 2, name: "Grace Hopper" });
    run = formInput(form, run, "name", "Grace B. Hopper");
    run = pump(formSubmit(form, run, env));
    expect(run.notice).toBe("Saved Grace B. Hopper");
    expect(names(run)).toEqual([
      "Ada Lovelace",
      "Grace B. Hopper",
      "Alan Turing",
    ]);
    expect(run.db.users.rows[1]).toMatchObject({
      id: 2,
      name: "Grace B. Hopper",
    });
  });

  test("remove: Delete on a row takes that user, and does not select it", () => {
    const table = find("table");
    let run = open();
    run = trigger(run, table, "rowAction", {
      row: (run.data.users as unknown[])[2],
      item: (run.data.users as unknown[])[2],
      index: 2,
      action: "Delete",
    });
    expect(run.notice).toBe("Deleted Alan Turing");
    expect(names(run)).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(run.db.users.rows).toHaveLength(2);
    // the condition of the other actions of the chain was not true
    expect(run.data.selected).toBeNull();
    expect(run.data.editForm).toEqual({});
  });

  test("one chain tells the two row actions apart: Edit selects and deletes nothing", () => {
    const table = find("table");
    let run = open();
    run = trigger(run, table, "rowAction", {
      row: (run.data.users as unknown[])[0],
      item: (run.data.users as unknown[])[0],
      index: 0,
      action: "Edit",
    });
    expect(run.data.selected).toMatchObject({ id: 1 });
    expect(run.db.users.rows).toHaveLength(3);
    expect(run.log.some((l) => l.includes("skipped"))).toBe(true);
  });

  test("the table is configured with labels, a number column, check boxes and two row actions", () => {
    const p = find("table").props;
    expect(columnsOf(p.columns).map((c) => [c.key, c.label, c.kind])).toEqual([
      ["id", "id", "number"],
      ["name", "Full name", "text"],
      ["email", "Email address", "text"],
    ]);
    expect([p.select, p.search, p.rowActions]).toEqual([
      "yes",
      "yes",
      "Edit, Delete",
    ]);
  });
});
