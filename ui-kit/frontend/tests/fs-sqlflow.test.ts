import { describe, expect, test } from "vitest";
import { parseSync } from "vite";
import { exprToTs, generateServer } from "../templates/flow-studio/codegen.ts";
import {
  outcomes,
  runFlow,
  simulate,
  stepsOf,
} from "../templates/flow-studio/engine.ts";
import { lint } from "../templates/flow-studio/lint.ts";
import {
  type Model,
  addEdge,
  addNode,
  emptyModel,
  fieldsOf,
  isExprCond,
  parseProject,
  projectText,
} from "../templates/flow-studio/model.ts";
import type { Db } from "../templates/flow-studio/store.ts";
import { crud, seed } from "./fs-crud.ts";

const call = (
  m: Model,
  entry: string,
  data: Record<string, unknown>,
  db?: Db,
) =>
  runFlow(
    m,
    {
      ...m.scenario,
      requests: [{ rid: "r1", entry, at: 0, payload: {}, data }],
    },
    1,
    db,
  );
const answer = (r: ReturnType<typeof call>) => {
  const s = stepsOf(r.trace, "r1").find(
    (x) =>
      x.type === "effect" &&
      (x.effect as { plugin?: string })?.plugin === "http",
  );
  return s ? (s.effect as { status: number; json: unknown }) : null;
};

describe("a flow against tables", () => {
  const m = crud();

  test("the insert runs, the reply is the real row, the tables come back changed", () => {
    const r = call(m, "rc", { body: { name: "Bob", email: "bob@x.test" } });
    expect(answer(r)).toMatchObject({
      status: 201,
      json: { customer: { id: 2, name: "Bob", email: "bob@x.test" } },
    });
    expect(r.db.customers.rows.map((x) => x.name)).toEqual(["Ann", "Bob"]);
    // the design's own tables are untouched
    expect(m.db.customers.rows).toHaveLength(1);
  });

  test("the effect shows the sql with parameters, not the values pasted in", () => {
    const r = call(m, "rc", { body: { name: "Bob", email: "bob@x.test" } });
    const eff = stepsOf(r.trace, "r1").find(
      (s) => s.type === "effect" && s.to === "ic",
    )!.effect as { sql: string; params: unknown[] };
    expect(eff.sql).toBe(
      "insert into customers (name, email) values ($1, $2) returning *",
    );
    expect(eff.params).toEqual(["Bob", "bob@x.test"]);
  });

  test("a second run with the tables of the first sees its data", () => {
    const first = call(m, "rc", { body: { name: "Bob", email: "bob@x.test" } });
    const second = call(m, "rg", { params: { id: "2" } }, first.db);
    expect(answer(second)).toMatchObject({
      status: 200,
      json: { customer: { name: "Bob" } },
    });
    const lost = call(m, "rg", { params: { id: "2" } });
    expect(answer(lost)).toMatchObject({ status: 404 });
  });

  test("a failed statement is the failure of the effect: the error edge, its code in a condition", () => {
    const r = call(m, "rc", {
      body: { name: "Ann again", email: "ann@x.test" },
    });
    expect(answer(r)).toMatchObject({ status: 409 });
    expect(r.db.customers.rows).toHaveLength(1);
    const work = stepsOf(r.trace, "r1").find(
      (s) => s.type === "work" && s.status === "error",
    )!;
    expect(work.payload).toMatchObject({
      code: "23505",
      constraint: "customers_email_key",
    });
  });

  test("a condition on a reply reads the reply: found, and not found", () => {
    expect(answer(call(m, "rg", { params: { id: "1" } }))).toMatchObject({
      status: 200,
    });
    expect(answer(call(m, "rg", { params: { id: "99" } }))).toMatchObject({
      status: 404,
    });
  });

  test("two requests at once see each other in the order the run says", () => {
    const both = runFlow(
      m,
      {
        ...m.scenario,
        requests: [
          {
            rid: "a",
            entry: "rc",
            at: 0,
            payload: {},
            data: { body: { name: "X", email: "x@x.test" } },
          },
          {
            rid: "b",
            entry: "rc",
            at: 1,
            payload: {},
            data: { body: { name: "Y", email: "x@x.test" } },
          },
        ],
      },
      1,
    );
    expect(
      outcomes(both.trace)
        .map((o) => `${o.rid}:${o.status}`)
        .sort(),
    ).toEqual(["a:201", "b:409"]);
    expect(both.db.customers.rows).toHaveLength(2);
  });

  test("without tables a pg.query is as it was: the example of its reply", () => {
    const bare = { ...m, db: {} };
    const t = simulate(
      bare,
      {
        ...bare.scenario,
        requests: [
          {
            rid: "r1",
            entry: "rg",
            at: 0,
            payload: {},
            data: { params: { id: "1" } },
          },
        ],
      },
      1,
    );
    const eff = stepsOf(t, "r1").find(
      (s) => s.type === "effect" && s.to === "sg",
    )!.effect as { sql: string };
    expect(eff.sql).toContain("select * from customers where id =");
  });

  test("the tables are saved with the project; the conditions are not names", () => {
    expect(parseProject(projectText(m))).toEqual(m);
    expect(isExprCond("payload.rowCount == 0")).toBe(true);
    expect(isExprCond("limited")).toBe(false);
    expect(isExprCond("!limited")).toBe(false);
    expect(isExprCond("")).toBe(false);
    expect(lint(m).filter((i) => i.rule === "cond-undefined")).toEqual([]);
  });
});

describe("the generated server", () => {
  const m = crud();
  const code = generateServer(m)
    .map((f) => f.code)
    .join("\n");

  test("a {ref} in the sql is a parameter", () => {
    expect(code).toContain(
      "insert into customers (name, email) values ($1, $2) returning *",
    );
    expect(code).toContain("json(p?.body?.name), json(p?.body?.email)");
    expect(code).not.toContain("{payload.body.name}");
  });

  test("an expression condition becomes a test on the message", () => {
    expect(code).toContain("if ((p?.rowCount > 0)) out.push(");
    expect(code).toContain("if ((p?.rowCount == 0)) out.push(");
    expect(code).toContain(
      "const p = (msg.payload ?? {}) as Record<string, any>;",
    );
    for (const f of generateServer(m).filter((x) => x.path.endsWith(".ts"))) {
      const r = parseSync(f.path, f.code, { lang: "ts" });
      expect(r.errors.map((x) => x.message)).toEqual([]);
    }
  });

  test("exprToTs", () => {
    expect(exprToTs("payload.rows[0].id == 3")).toBe("p?.rows?.[0]?.id == 3");
    expect(exprToTs("req.user.id != payload.x")).toBe("req?.user?.id != p?.x");
    expect(exprToTs("shared.mode == 'open'")).toBe(
      "(state.shared as any).mode == 'open'",
    );
  });
});
