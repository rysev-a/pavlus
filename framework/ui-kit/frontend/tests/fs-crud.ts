// A small CRUD design over tables, for the tests (not a test itself).
import {
  type Model,
  addEdge,
  addNode,
  emptyModel,
} from "../templates/flow-studio/model.ts";
import type { Db } from "../templates/flow-studio/store.ts";

export const seed = (): Db => ({
  customers: {
    unique: ["email"],
    rows: [{ id: 1, name: "Ann", email: "ann@x.test", points: 5 }],
  },
});

/**
 * POST /customers: insert, then 201 with the row; a duplicate email answers 409.
 * GET /customers/:id: 200 with the row, 404 when there is none (a condition on
 * the reply: payload.rowCount).
 */
export function crud(): Model {
  let m: Model = { ...emptyModel(), db: seed() };
  const n = (
    id: string,
    kind: Parameters<typeof addNode>[1],
    title: string,
    patch = {},
  ) => {
    m = addNode(m, kind, title, { id, x: 0, ...patch }).model;
  };
  const e = (
    from: string,
    to: string,
    o: Parameters<typeof addEdge>[3] = {},
  ) => {
    const r = addEdge(m, from, to, o);
    if (!r) throw new Error(`${from}->${to}`);
    m = r.model;
  };
  n("xc", "external", "Client", { plugin: "http" });
  n("rc", "route", "POST /customers", { detail: "customers.create" });
  n("hc", "handler", "customers.create");
  n("ic", "effect", "pg.query", {
    detail:
      "insert into customers (name, email) values ({payload.body.name}, {payload.body.email}) returning *",
  });
  n("hcd", "handler", "customers.created");
  n("hce", "error", "customers.failed");
  n("r201", "effect", "http.respond", {
    status: 201,
    detail: '{"customer":"{payload.rows.0}"}',
  });
  n("r409", "effect", "http.respond", {
    status: 409,
    detail: '{"error":"email taken"}',
  });
  n("rg", "route", "GET /customers/:id", { detail: "customers.get" });
  n("hg", "handler", "customers.get");
  n("sg", "effect", "pg.query", {
    detail: "select * from customers where id = {payload.params.id}",
  });
  n("hgd", "handler", "customers.found");
  n("r200", "effect", "http.respond", {
    status: 200,
    detail: '{"customer":"{payload.rows.0}"}',
  });
  n("r404", "effect", "http.respond", {
    status: 404,
    detail: '{"error":"no such customer"}',
  });
  e("rc", "hc", { msg: "customers.create" });
  e("hc", "ic", { kind: "effect" });
  e("ic", "hcd", { kind: "reply", msg: "customers.created" });
  e("ic", "hce", { port: "err", msg: "customers.failed" });
  e("hcd", "r201", { kind: "effect" });
  e("hce", "r409", { kind: "effect", cond: "payload.code == '23505'" });
  e("rg", "hg", { msg: "customers.get" });
  e("hg", "sg", { kind: "effect" });
  e("sg", "hgd", { kind: "reply", msg: "customers.found" });
  e("hgd", "r200", { kind: "effect", cond: "payload.rowCount > 0" });
  e("hgd", "r404", { kind: "effect", cond: "payload.rowCount == 0" });
  return m;
}
