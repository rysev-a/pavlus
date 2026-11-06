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

describe("the colour theme", () => {
  type Handler = (m: Message, s: AppState) => Effect[];
  const run = (name: string, s: AppState, m: Message): AppState =>
    after(s, (app as unknown as Record<string, Handler>)[name](m, s));
  const base = initialState();

  it("starts dark, with the look of Flow Studio", () => {
    expect(base.look.mode).toBe("dark");
  });

  it("a theme is chosen, shown, and remembered", () => {
    const m = msg("themepanel.palette", ["vs-dracula", "dark"]);
    const effects = (app as unknown as Record<string, Handler>)[
      "themepanel.palette"
    ](m, base);
    const apply = effects.find(
      (e) => (e as { plugin: string }).plugin === "theme",
    ) as unknown as {
      look: { palette: string };
      persist: boolean;
    };
    expect(apply.look.palette).toBe("vs-dracula");
    expect(apply.persist).toBe(true);
    const s = after(base, effects);
    expect(s.look.palette).toBe("vs-dracula");
    expect(s.css).toContain("--background");
  });

  it("the light / dark switch goes to the other mode of the same theme family", () => {
    const dracula = run(
      "themepanel.palette",
      base,
      msg("themepanel.palette", ["vs-dracula", "dark"]),
    );
    const light = run("toggleMode", dracula, msg("toggleMode"));
    expect(light.look.mode).toBe("light");
    expect(light.look.palette).not.toBe("vs-dracula");
    expect(run("toggleMode", light, msg("toggleMode")).look.mode).toBe("dark");
  });

  it("opens the panel for a theme and closes it with the same button", () => {
    const open = run("openPanel", base, msg("openPanel", "editor"));
    expect(open.panelOpen).toBe(true);
    expect(open.target).toBe("editor");
    expect(run("openPanel", open, msg("openPanel", "editor")).panelOpen).toBe(
      false,
    );
    expect(
      run("themepanel.close", open, msg("themepanel.close")).panelOpen,
    ).toBe(false);
  });

  it("picks a colour family tab", () => {
    const s = run(
      "themepanel.family",
      base,
      msg("themepanel.family", undefined, { value: "vscode" }),
    );
    expect(s.family).toBe("vscode");
    expect(s.shown.id).toBe("vscode");
  });

  it("a random theme asks the random plugin, and applies the answer", () => {
    const ask = (app as unknown as Record<string, () => Effect[]>)[
      "themepanel.random"
    ]();
    expect(ask[0]).toMatchObject({ plugin: "random" });
    const s = run("randomPicked", base, msg("randomPicked", 0));
    expect(s.look.palette).toBeTruthy();
  });

  it("resets to the default look of the current mode", () => {
    const s = run(
      "themepanel.reset",
      run(
        "themepanel.palette",
        base,
        msg("themepanel.palette", ["vs-nord", "dark"]),
      ),
      msg("themepanel.reset"),
    );
    expect(s.look.palette).not.toBe("vs-nord");
    expect(s.look.mode).toBe("dark");
  });
});

describe("the theme of the app being designed", () => {
  type Handler = (m: Message, s: AppState) => Effect[];
  const call = (name: string, s: AppState, m: Message): Effect[] =>
    (app as unknown as Record<string, Handler>)[name](m, s);
  const run = (name: string, s: AppState, m: Message): AppState =>
    after(s, call(name, s, m));
  const inProject = after(
    initialState(),
    routeTo(initialState(), "/projects/4/interface"),
  );
  const http = (e: Effect[]) =>
    e.filter((x) => (x as { plugin: string }).plugin === "http") as unknown as {
      id: string;
      url: string;
      method?: string;
      body?: { text: string };
    }[];

  it("is the editor's until the project says otherwise, and is asked for when a project opens", () => {
    expect(initialState().appLook).toBeNull();
    const e = routeTo(initialState(), "/projects/4/interface");
    expect(http(e).map((r) => r.url)).toContain("/api/projects/4/docs/theme");
    expect(e).toContainEqual(
      expect.objectContaining({ plugin: "app-theme", vars: null }),
    );
  });

  it("the panel changes the theme of the app when it is open for it, and not the editor's", () => {
    const s0 = run("openPanel", inProject, msg("openPanel", "app"));
    expect(s0.target).toBe("app");
    const effects = call(
      "themepanel.palette",
      s0,
      msg("themepanel.palette", ["vs-dracula", "dark"]),
    );
    const s = after(s0, effects);
    expect(s.appLook?.palette).toBe("vs-dracula");
    expect(s.look.palette).toBe(inProject.look.palette);
    // shown in the frame, kept with the project, and nothing is set on <html>
    expect(effects).toContainEqual(
      expect.objectContaining({ plugin: "app-theme" }),
    );
    expect(
      effects.some((x) => (x as { plugin: string }).plugin === "theme"),
    ).toBe(false);
    const put = http(effects)[0];
    expect(put.method).toBe("PUT");
    expect(put.url).toBe("/api/projects/4/docs/theme");
    expect(JSON.parse(put.body!.text).palette).toBe("vs-dracula");
  });

  it("the editor's theme is still the editor's when the panel is open for it", () => {
    const s0 = run("openPanel", inProject, msg("openPanel", "editor"));
    const effects = call(
      "themepanel.palette",
      s0,
      msg("themepanel.palette", ["vs-nord", "dark"]),
    );
    expect(effects).toContainEqual(
      expect.objectContaining({ plugin: "theme" }),
    );
    expect(http(effects)).toHaveLength(0);
    expect(after(s0, effects).appLook).toBeNull();
  });

  it("reset gives the app the editor's theme back", () => {
    let s = run("openPanel", inProject, msg("openPanel", "app"));
    s = run(
      "themepanel.palette",
      s,
      msg("themepanel.palette", ["vs-nord", "dark"]),
    );
    const effects = call("themepanel.reset", s, msg("themepanel.reset"));
    expect(after(s, effects).appLook).toBeNull();
    expect(JSON.parse(http(effects)[0].body!.text)).toBeNull();
  });

  it("the theme the project has is shown when it arrives, and a bad one is ignored", () => {
    const text = JSON.stringify({ mode: "dark", palette: "vs-dracula" });
    const s = run(
      "themeLoaded",
      inProject,
      msg("themeLoaded", { data: { text } }),
    );
    expect(s.appLook?.palette).toBe("vs-dracula");
    expect(
      run(
        "themeLoaded",
        inProject,
        msg("themeLoaded", { data: { text: null } }),
      ).appLook,
    ).toBeNull();
    expect(
      run(
        "themeLoaded",
        inProject,
        msg("themeLoaded", { data: { text: "{broken" } }),
      ).appLook,
    ).toBeNull();
    expect(
      run(
        "themeLoaded",
        inProject,
        msg("themeLoaded", { data: { text: "null" } }),
      ).appLook,
    ).toBeNull();
  });

  it("another project starts without the theme of the previous one", () => {
    const withTheme = { ...inProject, appLook: inProject.look };
    const e = routeTo(withTheme, "/projects/5/interface");
    expect(sets(e, "appLook")).toEqual([null]);
  });

  it("the list of the projects is the editor's panel again", () => {
    const s = run("openPanel", inProject, msg("openPanel", "app"));
    expect(after(s, routeTo(s, "/")).target).toBe("editor");
  });
});
