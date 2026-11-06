import type { Effect } from "@pavlus/frontend";
import { expect, test } from "vitest";
import {
  firstEnabled,
  matches,
  moveActive,
  type Option,
  toggle,
} from "../lib/multiselect.ts";
import { initial } from "../pages/multi-select/multi-select.ts";
import {
  DEBOUNCE_MS,
  MultiSelect,
  PAGE,
  type SelectState,
  selectState,
} from "../pages/multi-select/select.ts";

const opt = (id: string, label = id, extra: Partial<Option> = {}): Option => ({
  id,
  label,
  ...extra,
});

test("an option matches its label or its hint, ignoring case", () => {
  const o = opt("a", "Ann Lee", { hint: "ann@example.com · Design" });
  expect(matches(o, "")).toBe(true);
  expect(matches(o, "  ")).toBe(true);
  expect(matches(o, "LEE")).toBe(true);
  expect(matches(o, "design")).toBe(true);
  expect(matches(o, "bob")).toBe(false);
});

test("toggling adds, removes, stops at the limit and skips disabled options", () => {
  const [a, b, c] = [opt("a"), opt("b"), opt("c")];
  let r = toggle([], a, 2);
  expect(r).toEqual({ selected: [a], full: false });
  r = toggle(r.selected, b, 2);
  expect(r.selected).toEqual([a, b]);
  expect(toggle(r.selected, c, 2)).toEqual({ selected: [a, b], full: true });
  expect(toggle(r.selected, a, 2).selected).toEqual([b]);
  expect(toggle(r.selected, c, 0).selected).toEqual([a, b, c]); // 0 = no limit
  expect(toggle([], opt("x", "x", { disabled: true }), 0)).toEqual({
    selected: [],
    full: false,
  });
});

test("the highlighted row moves with the arrows, wraps around and skips disabled rows", () => {
  const list = [
    opt("a"),
    opt("b", "b", { disabled: true }),
    opt("c"),
    opt("d"),
  ];
  expect(moveActive(-1, 1, list)).toBe(0);
  expect(moveActive(-1, -1, list)).toBe(3);
  expect(moveActive(0, 1, list)).toBe(2); // b is skipped
  expect(moveActive(3, 1, list)).toBe(0); // wraps
  expect(moveActive(0, -1, list)).toBe(3);
  expect(moveActive(0, 1, [])).toBe(-1);
  expect(moveActive(0, 1, [opt("x", "x", { disabled: true })])).toBe(-1);
  expect(firstEnabled([opt("x", "x", { disabled: true }), opt("y")])).toBe(1);
});

// ---- the component, driven through its handlers ----

type Handler = (m: unknown, s: SelectState) => Effect[];

function drive(state: SelectState) {
  const c = new MultiSelect() as unknown as Record<string, Handler>;
  const log: Effect[] = [];
  const out = {
    state,
    log,
    send(
      id: string,
      payload?: unknown,
      event?: { value?: string; key?: string },
    ) {
      const effects = c[id]({ id, payload, event }, out.state);
      const next = { ...out.state } as Record<string, unknown>;
      for (const e of effects) {
        if (e.plugin === "store" && e.type === "set")
          next[e.path as string] = e.value;
        else log.push(e);
      }
      out.state = next as unknown as SelectState;
      return effects;
    },
  };
  return out;
}

const people: Option[] = Array.from({ length: 30 }, (_, i) => ({
  id: `p${i}`,
  label: `Person ${i}`,
  hint: i % 2 ? "odd" : "even",
}));

test("a sync multi-select filters as you type and picks with the keys", () => {
  const d = drive(initial.sync);
  expect(d.state.selected.map((o) => o.label)).toEqual(["Pavlus"]);
  d.send("type", undefined, { value: "sv" });
  expect(d.state.open).toBe(true);
  expect(d.state.rows.map((r) => r.label)).toEqual(["Svelte", "SvelteKit"]);
  expect(d.log).toEqual([]); // sync: no timer, no request
  d.send("key", undefined, { key: "ArrowDown" });
  d.send("key", undefined, { key: "ArrowDown" });
  expect(d.state.rows.map((r) => r.active)).toEqual([false, true]);
  d.send("key", undefined, { key: "Enter" });
  expect(d.state.selected.map((o) => o.label)).toEqual(["Pavlus", "SvelteKit"]);
  expect(d.state.query).toBe(""); // a sync list starts over after a pick
  expect(d.state.rows.length).toBe(24);
  // a no-match query says so
  d.send("type", undefined, { value: "zzz" });
  expect(d.state.empty).toBe(true);
  expect(d.state.emptyText).toBe('No results for "zzz"');
  // Backspace on an empty box removes the last chip; Escape closes
  d.send("type", undefined, { value: "" });
  d.send("key", undefined, { key: "Backspace" });
  expect(d.state.selected.map((o) => o.label)).toEqual(["Pavlus"]);
  d.send("key", undefined, { key: "Escape" });
  expect(d.state.open).toBe(false);
  d.send("clear");
  expect(d.state.hasSelection).toBe(false);
  expect(d.state.selectedText).toBe("nothing");
});

test("a limit stops the picks with a message that goes away", () => {
  const d = drive(initial.limited);
  for (const id of ["bug", "docs", "design"]) d.send("toggle", id);
  expect(d.state.selected).toHaveLength(3);
  d.send("toggle", "security");
  expect(d.state.selected).toHaveLength(3);
  expect(d.state.message).toBe("You can pick up to 3.");
  d.send("remove", "docs");
  expect(d.state.message).toBe("");
  expect(d.state.selected.map((o) => o.id)).toEqual(["bug", "design"]);
});

test("an async multi-select asks on open, waits for a pause in typing, and keeps its picks", () => {
  const d = drive(
    selectState({
      uid: "x",
      label: "X",
      placeholder: "",
      kind: "async",
      url: "/data/people.json",
    }),
  );
  // opening asks at once
  let fx = d.send("openList");
  expect(d.state).toMatchObject({
    open: true,
    status: "loading",
    loading: true,
  });
  expect(fx.find((e) => e.plugin === "http")).toMatchObject({
    type: "request",
    id: "options",
    url: "/data/people.json?q=",
    onSuccess: "loaded",
    onError: "failed",
  });
  // the answer: the first PAGE of what matches
  d.send("loaded", { status: 200, data: people });
  expect(d.state).toMatchObject({ status: "ready", loading: false, total: 30 });
  expect(d.state.rows).toHaveLength(PAGE);
  expect(d.state.note).toBe("Showing 8 of 30: keep typing to narrow it down");
  expect(d.state.rows[0].active).toBe(true);
  // a pick
  d.send("toggle", "p3");
  expect(d.state.selected.map((o) => o.id)).toEqual(["p3"]);
  // typing: a debounced timer, not a request
  fx = d.send("type", undefined, { value: "person 2" });
  expect(fx.some((e) => e.plugin === "http")).toBe(false);
  expect(fx.find((e) => e.plugin === "time")).toMatchObject({
    type: "setTimeout",
    id: "search",
    ms: DEBOUNCE_MS,
    replyTo: "searchFire",
    payload: "person 2",
  });
  expect(d.state.loading).toBe(true);
  expect(d.state.emptyText).toBe("Searching...");
  // the timer fires: now the request, with the query
  fx = d.send("searchFire", "person 2");
  expect(fx[0]).toMatchObject({
    plugin: "http",
    url: "/data/people.json?q=person%202",
  });
  // the answer is filtered by the query as it is now; the pick survives
  d.send("loaded", { status: 200, data: people });
  expect(d.state.total).toBe(11); // Person 2, Person 20..29
  expect(d.state.rows.map((r) => r.label).slice(0, 2)).toEqual([
    "Person 2",
    "Person 20",
  ]);
  expect(d.state.selected.map((o) => o.id)).toEqual(["p3"]);
  expect(d.state.note).toContain("Showing 8 of 11");
  // nothing matches
  d.send("type", undefined, { value: "zzz" });
  d.send("loaded", { status: 200, data: people });
  expect(d.state).toMatchObject({
    empty: true,
    emptyText: 'No results for "zzz"',
    note: "",
  });
});

test("a failed request says so and can be tried again; leaving stops the timer and the request", () => {
  const d = drive(
    selectState({
      uid: "x",
      label: "X",
      placeholder: "",
      kind: "async",
      url: "/u",
    }),
  );
  d.send("openList");
  d.send("failed", { error: "offline" });
  expect(d.state).toMatchObject({
    status: "failed",
    failed: true,
    empty: true,
    loading: false,
  });
  expect(d.state.emptyText).toBe("The options could not be loaded.");
  const fx = d.send("retry");
  expect(d.state.status).toBe("loading");
  expect(fx.some((e) => e.plugin === "http")).toBe(true);
  const leaving = new MultiSelect().leave();
  expect(leaving).toEqual([
    { plugin: "time", type: "cancel", id: "search" },
    { plugin: "http", type: "cancel", id: "options" },
  ]);
});
