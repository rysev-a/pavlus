// The shell, the projects page and the templates of a new project: pure functions.
import { describe, expect, it } from "vitest";
import type { Effect, Message } from "@service-laboratory/pavlus";
import { app, type AppState, initialState, parsePath } from "../app/app.ts";
import { parseProject as parseFlow } from "../../ui-kit/frontend/templates/flow-studio/model.ts";
import { parseProject as parseUi } from "../../ui-kit/frontend/templates/visual-builder/io.ts";
import {
  initialProjects,
  itemsOf,
  projectsPage,
  whenOf,
} from "../app/projects.ts";
import { docsOf, isTemplate } from "../app/templates.ts";

const msg = (id: string, payload?: unknown, event?: unknown): Message =>
  ({ id, payload, event }) as Message;

const sets = (effects: Effect[], path: string): unknown[] =>
  effects
    .filter(
      (e) =>
        (e as { plugin: string }).plugin === "store" &&
        (e as { path?: string }).path === path,
    )
    .map((e) => (e as unknown as { value: unknown }).value);

const ctx = {
  setRoute: (r: unknown): Effect[] => [
    {
      plugin: "store",
      type: "set",
      path: "route",
      value: r,
    } as unknown as Effect,
  ],
};
const routeTo = (state: AppState, path: string) =>
  (
    app.routeChanged as unknown as (
      m: Message,
      s: AppState,
      c: typeof ctx,
    ) => Effect[]
  )(msg("routeChanged", { path }), state, ctx);
/** the state after the store.set effects */
const after = (state: AppState, effects: Effect[]): AppState => {
  const next = { ...state } as Record<string, unknown>;
  for (const e of effects) {
    const s = e as unknown as {
      plugin: string;
      type: string;
      path: string;
      value: unknown;
    };
    if (s.plugin === "store" && s.type === "set") next[s.path] = s.value;
  }
  return next as unknown as AppState;
};

describe("addresses", () => {
  it("names the project and the editor", () => {
    expect(parsePath("/projects/12/flow")).toEqual({ id: 12, tab: "flow" });
    expect(parsePath("/projects/3/interface")).toEqual({
      id: 3,
      tab: "interface",
    });
  });
  it("is nothing for the other pages", () => {
    for (const p of [
      "/",
      "/projects",
      "/projects/0/flow",
      "/projects/x/flow",
      "/projects/3/other",
      "/projects/3/flow/x",
    ])
      expect(parsePath(p)).toEqual({ id: 0, tab: "" });
  });
});

describe("the editors start from the project", () => {
  const base = initialState();

  it("entering a project resets both editors and reads its name", () => {
    const e = routeTo(base, "/projects/4/flow");
    expect(sets(e, "flowStudio")).toHaveLength(1);
    expect(sets(e, "visualBuilder")).toHaveLength(1);
    expect(sets(e, "openId")).toEqual([4]);
    expect(e.some((x) => (x as { plugin: string }).plugin === "http")).toBe(
      true,
    );
  });

  it("moving between its two editors keeps them as they are", () => {
    const s = after(base, routeTo(base, "/projects/4/flow"));
    const e = routeTo(s, "/projects/4/interface");
    expect(sets(e, "flowStudio")).toHaveLength(0);
    expect(sets(e, "visualBuilder")).toHaveLength(0);
  });

  it("the interface starts again after the diagram was edited, and only then", () => {
    let s = after(base, routeTo(base, "/projects/4/flow"));
    const edited = (
      app.saved as unknown as (m: Message, s: AppState) => Effect[]
    )(msg("saved", { event: "changed", key: "flow" }), s);
    s = after(s, edited);
    expect(s.flowRev).toBe(1);
    const e = routeTo(s, "/projects/4/interface");
    expect(sets(e, "visualBuilder")).toHaveLength(1);
    s = after(s, e);
    expect(sets(routeTo(s, "/projects/4/flow"), "visualBuilder")).toHaveLength(
      0,
    );
    expect(
      sets(routeTo(s, "/projects/4/interface"), "visualBuilder"),
    ).toHaveLength(0);
  });

  it("an edit of the interface does not make the interface start again", () => {
    let s = after(base, routeTo(base, "/projects/4/interface"));
    s = after(
      s,
      (app.saved as unknown as (m: Message, s: AppState) => Effect[])(
        msg("saved", { event: "changed", key: "interface" }),
        s,
      ),
    );
    expect(s.save).toBe("saving");
    expect(sets(routeTo(s, "/projects/4/flow"), "visualBuilder")).toHaveLength(
      0,
    );
  });

  it("another project starts both again", () => {
    const s = after(base, routeTo(base, "/projects/4/flow"));
    const e = routeTo(s, "/projects/5/flow");
    expect(sets(e, "flowStudio")).toHaveLength(1);
    expect(sets(e, "openId")).toEqual([5]);
  });

  it("the save state follows the events", () => {
    const s = initialState();
    const say = (p: unknown) =>
      after(
        s,
        (app.saved as unknown as (m: Message, s: AppState) => Effect[])(
          msg("saved", p),
          s,
        ),
      );
    expect(say({ event: "saved" }).saveText).toBe("Saved");
    expect(say({ event: "error", detail: "x" }).save).toBe("error");
    expect(
      say({ event: "loadFailed", key: "flow", detail: "x" }).notice,
    ).toMatch(/not saved/);
  });
});

describe("the projects page", () => {
  it("says when", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    expect(whenOf("2026-11-06T11:59:40Z", now)).toBe("just now");
    expect(whenOf("2026-11-06T11:50:00Z", now)).toBe("10 min ago");
    expect(whenOf("2026-11-06T09:00:00Z", now)).toBe("3 h ago");
    expect(whenOf("2026-11-05T09:00:00Z", now)).toBe("yesterday");
    expect(whenOf("2026-10-01T09:00:00Z", now)).toBe("2026-10-01");
    expect(whenOf("nonsense", now)).toBe("");
  });

  it("shows a row with its links, and the one that waits for a second click", () => {
    const rows = [
      { id: 3, name: "A", updated_at: "2026-11-06T11:59:00Z", docs: [] },
    ];
    expect(itemsOf(rows, 3, Date.parse("2026-11-06T12:00:00Z"))[0]).toEqual({
      id: 3,
      name: "A",
      when: "1 min ago",
      flowHref: "/projects/3/flow",
      uiHref: "/projects/3/interface",
      asking: true,
    });
  });

  it("does not create a project without a name", () => {
    const create = projectsPage.create as unknown as (
      m: Message,
      s: ReturnType<typeof initialProjects>,
    ) => Effect[];
    const e = create(msg("create"), { ...initialProjects(), name: "  " });
    expect(sets(e, "error")).toEqual(["Give the project a name"]);
    expect(e.some((x) => (x as { plugin: string }).plugin === "http")).toBe(
      false,
    );
  });

  it("creates it from the template, with both documents", () => {
    const create = projectsPage.create as unknown as (
      m: Message,
      s: ReturnType<typeof initialProjects>,
    ) => Effect[];
    const e = create(msg("create"), {
      ...initialProjects(),
      name: " Cafe ",
      template: "blank",
    });
    const req = e.find(
      (x) => (x as { plugin: string }).plugin === "http",
    ) as unknown as {
      url: string;
      method: string;
      body: { name: string; docs: { flow: string; interface: string } };
    };
    expect(req.url).toBe("/api/projects");
    expect(req.method).toBe("POST");
    expect(req.body.name).toBe("Cafe");
    expect(Object.keys(req.body.docs)).toEqual(["flow", "interface"]);
  });

  it("opens the new project on its diagram", () => {
    const created = projectsPage.created as unknown as (m: Message) => Effect[];
    const e = created(msg("created", { data: { project: { id: 9 } } }));
    expect(e).toContainEqual(
      expect.objectContaining({
        plugin: "router",
        type: "navigate",
        url: "/projects/9/flow",
      }),
    );
  });
});

describe("what a new project starts from", () => {
  it("is two documents the editors can open", () => {
    for (const t of ["blank", "coffee"] as const) {
      const docs = docsOf(t, "My app");
      const flow = parseFlow(docs.flow);
      const ui = parseUi(docs.interface);
      expect(typeof flow).not.toBe("string");
      expect(typeof ui).not.toBe("string");
      if (typeof ui !== "string") expect(ui.name).toBe("My app");
    }
  });

  it("a blank project is empty, and the coffee shop has its whole backend", () => {
    const blank = parseFlow(docsOf("blank", "x").flow);
    const coffee = parseFlow(docsOf("coffee", "x").flow);
    if (typeof blank === "string" || typeof coffee === "string")
      throw new Error("bad");
    expect(blank.nodes).toHaveLength(0);
    expect(coffee.nodes.length).toBeGreaterThan(40);
    const ui = parseUi(docsOf("coffee", "x").interface);
    if (typeof ui === "string") throw new Error("bad");
    expect(ui.flow?.nodes.length).toBe(coffee.nodes.length);
  });

  it("knows its templates", () => {
    expect(isTemplate("coffee")).toBe(true);
    expect(isTemplate("nope")).toBe(false);
  });
});
