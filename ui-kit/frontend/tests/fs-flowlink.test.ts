import { describe, expect, test } from "vitest";
import { callFlow, routesOf } from "../templates/flow-studio/flowlink.ts";
import {
  addEdge,
  fieldsOf,
  type Model,
} from "../templates/flow-studio/model.ts";
import { crud } from "./fs-crud.ts";

/** the crud design with the shape of the requests said on the edge into each route */
function withClient(): Model {
  let m = crud();
  m = { ...m, nodes: m.nodes.concat([]) };
  const add = (from: string, to: string, payload: string) => {
    const r = addEdge(m, from, to, {
      kind: "request",
      msg: "http.request",
      payload: fieldsOf(payload),
    });
    if (!r) throw new Error("edge");
    m = r.model;
  };
  m = {
    ...m,
    nodes: [
      ...m.nodes,
      {
        ...m.nodes[0],
        id: "cl",
        kind: "external",
        title: "Client",
        plugin: "http",
      },
    ],
  };
  add(
    "cl",
    "rc",
    "method=POST; path=/customers; body.name:string=Bob; body.email:string=bob@x.test",
  );
  add(
    "cl",
    "rg",
    "method=GET; path=/customers/1; params.id:string=1; query.q:string=ann",
  );
  return m;
}

describe("the routes of a design", () => {
  test("method, path, params, the fields and the statuses it answers with", () => {
    const routes = routesOf(withClient());
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /customers",
      "GET /customers/:id",
    ]);
    expect(routes[0]).toMatchObject({
      msg: "customers.create",
      statuses: [201, 409],
      params: [],
    });
    expect(routes[0].body.map((f) => f.name)).toEqual(["name", "email"]);
    expect(routes[1]).toMatchObject({
      msg: "customers.get",
      params: ["id"],
      statuses: [200, 404],
    });
    expect(routes[1].query.map((f) => f.name)).toEqual(["q"]);
  });
});

describe("a call through the design", () => {
  const m = crud();

  test("is answered by the flow: status, data, and the tables after", () => {
    const a = callFlow(m, m.db, {
      method: "POST",
      url: "/customers",
      body: { name: "Bob", email: "bob@x.test" },
    });
    expect(a.status).toBe(201);
    expect(a.data).toMatchObject({ customer: { id: 2, name: "Bob" } });
    expect(a.db.customers.rows).toHaveLength(2);
    expect(a.trace.length).toBeGreaterThan(5);
    expect(a.delay).toBeGreaterThan(0);
  });

  test("the caller keeps the tables between calls", () => {
    const a = callFlow(m, m.db, {
      method: "POST",
      url: "/customers",
      body: { name: "Bob", email: "bob@x.test" },
    });
    const b = callFlow(m, a.db, { method: "GET", url: "/customers/2" });
    expect(b.status).toBe(200);
    expect(b.data).toMatchObject({ customer: { name: "Bob" } });
    expect(
      callFlow(m, m.db, { method: "GET", url: "/customers/2" }).status,
    ).toBe(404);
  });

  test("the params and the query of the url reach the flow", () => {
    expect(
      callFlow(m, m.db, {
        method: "GET",
        url: "https://api.test/customers/1?x=1",
      }).status,
    ).toBe(200);
    expect(
      callFlow(m, m.db, { method: "get", url: "/customers/7/" }).status,
    ).toBe(404);
  });

  test("a failure of the statement is the answer of the failure path", () => {
    const a = callFlow(m, m.db, {
      method: "POST",
      url: "/customers",
      body: { name: "A", email: "ann@x.test" },
    });
    expect(a.status).toBe(409);
    expect(a.db).toEqual(m.db);
  });

  test("a call no route takes is a 404 that names the call", () => {
    const a = callFlow(m, m.db, { method: "DELETE", url: "/customers/1" });
    expect(a).toMatchObject({ status: 404, route: "", db: m.db });
    expect(a.data).toEqual({
      error: "No route for DELETE /customers/1 in the diagram",
    });
  });

  test("a flow that never answers is a 500 that says what happened", () => {
    const silent: Model = {
      ...m,
      edges: m.edges.filter((e) => !(e.from === "hgd")),
    };
    const a = callFlow(silent, silent.db, {
      method: "GET",
      url: "/customers/1",
    });
    expect(a.status).toBe(500);
    expect(JSON.stringify(a.data)).toContain("did not answer");
  });
});
