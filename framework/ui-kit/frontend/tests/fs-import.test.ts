// Import of a Visual Builder project: its elements with events fill the Browser lane,
// its HTTP actions become edges to routes, and the result runs.
import { describe, expect, test } from "vitest";
import {
  VB_PREFIX,
  importVisualBuilder,
  importVisualBuilderText,
  pathOfUrl,
} from "../templates/flow-studio/import-vb.ts";
import { generateFrontend } from "../templates/flow-studio/codegen.ts";
import { outcomes, simulate } from "../templates/flow-studio/engine.ts";
import { lint } from "../templates/flow-studio/lint.ts";
import {
  addNode,
  emptyModel,
  findNode,
  laneOf,
} from "../templates/flow-studio/model.ts";
import { DEMOS as VB } from "../templates/visual-builder/demos.ts";
import { projectText } from "../templates/visual-builder/io.ts";

const vb = (id: string) => VB.find((d) => d.id === id)!.make();

describe("paths of urls", () => {
  test("host, query and params", () => {
    expect(pathOfUrl("/api/todos")).toBe("/api/todos");
    expect(pathOfUrl("https://api.example.com/users/{row.id}?x=1#top")).toBe(
      "/users/:id",
    );
    expect(pathOfUrl("items")).toBe("/items");
    expect(pathOfUrl("/a/{state.q}")).toBe("/a/:q");
    expect(pathOfUrl("")).toBe("/");
  });
});

describe("the todo project", () => {
  const r = importVisualBuilder(vb("todo"));
  const m = r.model;

  test("elements with events become UI events and frontend handlers in the Browser lane", () => {
    const ui = m.nodes.filter((n) => n.kind === "ui-event");
    const fe = m.nodes.filter((n) => n.kind === "fe-handler");
    expect(ui.length).toBeGreaterThanOrEqual(3);
    expect(r.summary.events).toBe(ui.length);
    expect(ui.every((n) => laneOf(n) === "browser")).toBe(true);
    for (const n of [...ui, ...fe])
      expect(n.id.startsWith(VB_PREFIX)).toBe(true);
    expect(ui.some((n) => n.title.startsWith("click "))).toBe(true);
    // every event leads to its handler
    for (const e of ui)
      expect(
        m.edges.some(
          (x) => x.from === e.id && findNode(m, x.to)!.kind === "fe-handler",
        ),
      ).toBe(true);
  });
  test("each HTTP action becomes an edge from a handler to a route", () => {
    const routes = m.nodes
      .filter((n) => n.kind === "route")
      .map((n) => n.title);
    expect(routes).toContain("GET /api/todos");
    expect(routes).toContain("POST /api/todos");
    expect(r.summary.routes).toBe(2);
    const toRoute = m.edges.filter((e) => findNode(m, e.to)!.kind === "route");
    expect(toRoute.length).toBe(r.summary.calls);
    for (const e of toRoute) {
      expect(findNode(m, e.from)!.kind).toBe("fe-handler");
      expect(e.msg).toBe("http.request");
      expect(e.kind).toBe("request");
      expect(e.rid).toBe(true);
      expect(e.payload.map((f) => f.name)).toContain("method");
    }
  });
  test("the mock route of the project is the response", () => {
    const get = m.nodes.find(
      (n) => n.kind === "route" && n.title === "GET /api/todos",
    )!;
    const ok = m.nodes.find((n) => n.id === `${get.id}-ok`)!;
    expect(ok).toMatchObject({
      kind: "effect",
      title: "http.respond",
      status: 200,
    });
    expect(ok.detail.length).toBeGreaterThan(5);
    expect(() => JSON.parse(ok.detail)).not.toThrow();
  });
  test("the response keys become state keys with a store.set", () => {
    const keys = m.nodes
      .filter((n) => n.kind === "fe-state")
      .map((n) => n.title);
    expect(keys.length).toBeGreaterThan(0);
    const sets = m.edges.filter((e) => e.msg === "store.set");
    expect(sets.length).toBe(keys.length);
  });
  test("set actions become the browser state of the handler", () => {
    const withSets = m.nodes.filter(
      (n) => n.kind === "fe-handler" && Object.keys(n.clientSet).length,
    );
    expect(withSets.length).toBeGreaterThan(0);
  });
  test("the imported flow runs from the UI event to the response and the state", () => {
    expect(m.scenario.requests.length).toBeGreaterThan(0);
    const t = simulate(m, m.scenario, 1);
    const o = outcomes(t);
    expect(o.length).toBeGreaterThan(0);
    for (const x of o) expect(["responded", "completed"]).toContain(x.result);
    expect(o.some((x) => x.result === "responded" && x.status === 200)).toBe(
      true,
    );
    const last = t[t.length - 1];
    expect(Object.keys(last.client).length).toBeGreaterThan(0);
  });
  test("it is laid out in lanes and passes the checks", () => {
    expect(m.nodes.every((n) => n.x >= 0 && n.y >= 0)).toBe(true);
    expect(lint(m).filter((i) => i.severity === "error")).toEqual([]);
  });
  test("a client node is added for the sequence diagram and the codegen", () => {
    expect(
      m.nodes.some((n) => n.kind === "external" && n.plugin === "http"),
    ).toBe(true);
    const code = generateFrontend(m)[0].code;
    expect(code).toContain("http.request({");
    expect(code).toContain('url: "/api/todos"');
  });
});

describe("the other projects", () => {
  test("a landing page: a validated form that POSTs", () => {
    const m = importVisualBuilder(vb("landing")).model;
    expect(
      m.nodes.some(
        (n) => n.kind === "route" && n.title.startsWith("POST /api/leads"),
      ),
    ).toBe(true);
    expect(
      m.nodes
        .filter((n) => n.kind === "ui-event")
        .some((n) => n.title.startsWith("submit")),
    ).toBe(true);
  });
  test("a directory: a path with a parameter", () => {
    const m = importVisualBuilder(vb("users")).model;
    expect(
      m.nodes.some(
        (n) => n.kind === "route" && n.title === "GET /api/users/:id",
      ),
    ).toBe(true);
  });
  test("a project with no events makes an empty browser lane", () => {
    const r = importVisualBuilder(vb("counter"));
    expect(r.summary.calls).toBe(0);
    expect(r.model.nodes.filter((n) => n.kind === "route")).toEqual([]);
  });
});

describe("merging into a flow", () => {
  test("the nodes of the flow stay; a second import replaces the first", () => {
    let base = emptyModel();
    base = addNode(base, "handler", "mine.keep", { id: "keep" }).model;
    const once = importVisualBuilder(vb("todo"), base).model;
    expect(findNode(once, "keep")).toBeDefined();
    const twice = importVisualBuilder(vb("todo"), once).model;
    expect(twice.nodes.length).toBe(once.nodes.length);
    expect(twice.edges.length).toBe(once.edges.length);
    expect(findNode(twice, "keep")).toBeDefined();
    const other = importVisualBuilder(vb("users"), once).model;
    expect(other.nodes.filter((n) => n.title === "GET /api/todos")).toEqual([]);
  });
  test("an existing route is reused, not duplicated", () => {
    let base = emptyModel();
    base = addNode(base, "route", "GET /api/todos", { id: "mine" }).model;
    const m = importVisualBuilder(vb("todo"), base).model;
    expect(
      m.nodes.filter((n) => n.kind === "route" && n.title === "GET /api/todos"),
    ).toHaveLength(1);
  });
  test("the name of an empty flow becomes the project name", () => {
    expect(importVisualBuilder(vb("todo")).model.name).toBe(vb("todo").name);
  });
});

describe("from text", () => {
  test("exported JSON is read", () => {
    const r = importVisualBuilderText(projectText(vb("todo")));
    expect(typeof r).not.toBe("string");
    expect((r as Exclude<typeof r, string>).summary.routes).toBe(2);
  });
  test("what is not a project gives a message", () => {
    expect(importVisualBuilderText("{")).toMatch(/Not valid JSON/);
    expect(importVisualBuilderText('{"nodes":[]}')).toMatch(
      /not a Visual Builder project/,
    );
  });
});
