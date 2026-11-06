// The workspace: where the studios keep their project. A fake `fetch` plays the API.

import type { Effect } from "@pavlus/frontend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localEffector as local } from "../../../framework/ui-kit/frontend/local.ts";
import { demoOf } from "../../../framework/ui-kit/frontend/templates/flow-studio/demos.ts";
import { STORAGE_KEY as FLOW_KEY } from "../../../framework/ui-kit/frontend/templates/flow-studio/flow-studio.ts";
import { projectText as flowText } from "../../../framework/ui-kit/frontend/templates/flow-studio/model.ts";
import { coffeeUi } from "../../../framework/ui-kit/frontend/templates/visual-builder/demo-coffee.ts";
import { projectText as uiText } from "../../../framework/ui-kit/frontend/templates/visual-builder/io.ts";
import { emptyModel as emptyUi } from "../../../framework/ui-kit/frontend/templates/visual-builder/model.ts";
import { STORAGE_KEY as UI_KEY } from "../../../framework/ui-kit/frontend/templates/visual-builder/visual-builder.ts";
import {
  createWorkspace,
  linked,
  type SaveEvent,
  workspaceEffector,
} from "../frontend/workspace.ts";

type Msg = { id: string; payload?: unknown };

/** a tiny server: the documents of the projects in memory */
function fakeApi(opts: { down?: () => boolean } = {}) {
  const docs = new Map<string, string>();
  const puts: string[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    if (opts.down?.()) throw new TypeError("fetch failed");
    const m = /\/projects\/(\d+)\/docs\/(\w+)$/.exec(url);
    if (!m) return new Response("{}", { status: 404 });
    const k = `${m[1]}/${m[2]}`;
    if (init?.method === "PUT") {
      const { text } = JSON.parse(String(init.body));
      docs.set(k, text);
      puts.push(k);
      return new Response('{"saved":true}', { status: 200 });
    }
    return new Response(JSON.stringify({ text: docs.get(k) ?? null }), {
      status: 200,
    });
  });
  return { docs, puts, fetchFn: fetchFn as unknown as typeof fetch };
}

function setup(projectId: number | null, api = fakeApi()) {
  const ws = createWorkspace({
    fetch: api.fetchFn,
    projectId: () => projectId,
    delayMs: 50,
    retryMs: 200,
    window: {
      addEventListener: () => {},
      location: { pathname: "/" } as Location,
    },
  });
  const sent: Msg[] = [];
  const ctx = {
    dispatch: (m: Msg) => sent.push(m),
    getState: () => ({}),
    dispatchEffect: () => {},
  };
  const run = (e: Effect) =>
    (ws.local.handle as (e: Effect, c: typeof ctx) => void)(e, ctx);
  (ws.workspace.handle as (e: Effect, c: typeof ctx) => void)(
    workspaceEffector.listen("saved"),
    ctx,
  );
  const events = () =>
    sent.filter((m) => m.id === "saved").map((m) => m.payload as SaveEvent);
  const answers = (id: string) => sent.filter((m) => m.id === id);
  return { ...ws, api, sent, run, events, answers };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("loading", () => {
  it("answers a load with the text on the server", async () => {
    const t = setup(7);
    t.api.docs.set("7/flow", "FLOW TEXT");
    t.run(local.load(FLOW_KEY, "loaded"));
    await vi.advanceTimersByTimeAsync(10);
    expect(t.answers("loaded")[0].payload).toEqual({
      text: "FLOW TEXT",
      keepEmpty: true,
    });
  });

  it("answers null for a document that is not there yet", async () => {
    const t = setup(7);
    t.run(local.load(FLOW_KEY, "loaded"));
    await vi.advanceTimersByTimeAsync(10);
    expect(
      (t.answers("loaded")[0].payload as { text: unknown }).text,
    ).toBeNull();
  });

  it("opens the studio on its sample when the server is down, and tells", async () => {
    const t = setup(7, fakeApi({ down: () => true }));
    t.run(local.load(FLOW_KEY, "loaded"));
    await vi.advanceTimersByTimeAsync(10);
    expect(
      (t.answers("loaded")[0].payload as { text: unknown }).text,
    ).toBeNull();
    expect(t.events()).toContainEqual(
      expect.objectContaining({ event: "loadFailed", key: "flow" }),
    );
  });

  it("is not about the project outside a project: the plain local plugin answers", async () => {
    const t = setup(null);
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    t.run(local.save(FLOW_KEY, "kept here"));
    t.run(local.load(FLOW_KEY, "loaded"));
    expect(store.get(FLOW_KEY)).toBe("kept here");
    expect(t.answers("loaded")[0].payload).toEqual({ text: "kept here" });
    expect(t.api.fetchFn).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("saving", () => {
  it("waits for the edits to settle, then saves the last one once", async () => {
    const t = setup(7);
    t.run(local.load(FLOW_KEY, "loaded"));
    await vi.advanceTimersByTimeAsync(10);
    for (const text of ["a", "ab", "abc"]) t.run(local.save(FLOW_KEY, text));
    expect(t.api.puts).toEqual([]);
    await vi.advanceTimersByTimeAsync(80);
    expect(t.api.puts).toEqual(["7/flow"]);
    expect(t.api.docs.get("7/flow")).toBe("abc");
    expect(t.events().map((e) => e.event)).toEqual([
      "changed",
      "changed",
      "changed",
      "saved",
    ]);
  });

  it("does not save a text that is the one on the server (a studio saves what it just opened)", async () => {
    const t = setup(7);
    t.api.docs.set("7/flow", "SAME");
    t.run(local.load(FLOW_KEY, "loaded"));
    await vi.advanceTimersByTimeAsync(10);
    t.run(local.save(FLOW_KEY, "SAME"));
    await vi.advanceTimersByTimeAsync(100);
    expect(t.api.puts).toEqual([]);
    expect(t.events().map((e) => e.event)).not.toContain("changed");
  });

  it("never writes over a document that could not be read", async () => {
    let down = true;
    const t = setup(7, fakeApi({ down: () => down }));
    t.run(local.load(FLOW_KEY, "loaded"));
    await vi.advanceTimersByTimeAsync(10);
    down = false;
    t.run(local.save(FLOW_KEY, "the sample, edited"));
    await vi.advanceTimersByTimeAsync(200);
    expect(t.api.puts).toEqual([]);
  });

  it("tries again after a failure, with the newest text", async () => {
    let down = false;
    const t = setup(7, fakeApi({ down: () => down }));
    t.run(local.load(FLOW_KEY, "loaded"));
    await vi.advanceTimersByTimeAsync(10);
    down = true;
    t.run(local.save(FLOW_KEY, "one"));
    await vi.advanceTimersByTimeAsync(80);
    expect(t.events().some((e) => e.event === "error")).toBe(true);
    t.run(local.save(FLOW_KEY, "two"));
    down = false;
    await vi.advanceTimersByTimeAsync(400);
    expect(t.api.docs.get("7/flow")).toBe("two");
    expect(t.events().at(-1)).toEqual({ event: "saved" });
  });

  it("a load waits for the saves before it: what was just edited is what is read", async () => {
    const t = setup(7);
    t.run(local.load(UI_KEY, "loaded"));
    await vi.advanceTimersByTimeAsync(10);
    t.run(local.save(UI_KEY, "fresh"));
    t.run(local.load(UI_KEY, "again"));
    await vi.advanceTimersByTimeAsync(10);
    expect((t.answers("again")[0].payload as { text: string }).text).toBe(
      "fresh",
    );
  });
});

describe("the interface is wired to the diagram", () => {
  const flow = { ...demoOf("coffee").make(), name: "The diagram" };

  it("sets flow to the diagram of the project, and turns the simulated backend on the first time", () => {
    const ui = JSON.parse(uiText({ ...emptyUi(), mockOn: false }));
    const out = JSON.parse(
      linked(JSON.stringify(ui), flowText(flow)) as string,
    );
    expect(out.flow.name).toBe("The diagram");
    expect(out.mockOn).toBe(true);
  });

  it("keeps the choice of the person after that", () => {
    const first = JSON.parse(
      linked(uiText({ ...emptyUi(), mockOn: false }), flowText(flow)) as string,
    );
    const off = JSON.stringify({ ...first, mockOn: false });
    const again = JSON.parse(
      linked(off, flowText({ ...flow, name: "Newer" })) as string,
    );
    expect(again.flow.name).toBe("Newer");
    expect(again.mockOn).toBe(false);
  });

  it("leaves the interface alone when there is no good diagram", () => {
    const ui = uiText(coffeeUi());
    expect(linked(ui, null)).toBe(ui);
    expect(linked(ui, "not json")).toBe(ui);
    expect(linked(null, flowText(flow))).toBeNull();
    expect(linked("{broken", flowText(flow))).toBe("{broken");
  });

  it("the load of the interface reads the diagram from the server", async () => {
    const t = setup(7);
    t.api.docs.set("7/flow", flowText(flow));
    t.api.docs.set("7/interface", uiText({ ...emptyUi(), flow: null }));
    t.run(local.load(UI_KEY, "loaded"));
    await vi.advanceTimersByTimeAsync(10);
    const text = (t.answers("loaded")[0].payload as { text: string }).text;
    expect(JSON.parse(text).flow.name).toBe("The diagram");
  });
});
