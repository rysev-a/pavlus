import type { Effect, Message } from "@pavlus/frontend";
import { describe, expect, test } from "vitest";
import { createLocalPlugin, localEffector as local } from "../local.ts";
import { initialData } from "../templates/visual-builder/bind.ts";
import {
  DEMOS,
  directoryDemo,
  landingDemo,
  todoDemo,
} from "../templates/visual-builder/demos.ts";
import {
  parseProject,
  projectText,
  readModel,
} from "../templates/visual-builder/io.ts";
import { meta } from "../templates/visual-builder/meta.ts";
import {
  ELEMENTS,
  allElements,
  emptyModel,
  findElement,
} from "../templates/visual-builder/model.ts";
import {
  initial,
  page,
  STORAGE_KEY,
  stateOf,
  type VbState,
} from "../templates/visual-builder/visual-builder.ts";

/** The store plugin's `merge` at the component's root, and nothing else. */
function apply(state: VbState, effects: Effect[]): VbState {
  let s = state;
  for (const e of effects)
    if (e.plugin === "store" && e.type === "merge")
      s = { ...s, ...(e.value as object) };
  return s;
}

interface Sim {
  state: VbState;
  effects: Effect[];
  send(id: string, payload?: unknown, event?: Message["event"]): Sim;
}

/** Runs messages through the component and the store; keeps every effect. */
function sim(state: VbState): Sim {
  const self: Sim = {
    state,
    effects: [],
    send(id, payload, event) {
      const fx = page.dispatch({ id, payload, event }, self.state);
      self.state = apply(self.state, fx);
      self.effects.push(...fx);
      return self;
    },
  };
  return self;
}

/** like the time plugin: fire the `vb-mock-*` timers the effects started */
function settle(s: Sim): void {
  for (let i = 0; i < 20; i++) {
    const timers = s.effects.filter(
      (e) =>
        e.plugin === "time" &&
        e.type === "setTimeout" &&
        String(e.id).startsWith("vb-mock-"),
    );
    s.effects = s.effects.filter((e) => !timers.includes(e));
    if (!timers.length) return;
    for (const t of timers) s.send(t.replyTo as string);
  }
}

const blank = (): Sim => sim({ ...stateOf(emptyModel()), ready: true });
const model = (s: Sim) => s.state.hist.present;

describe("the page", () => {
  test("meta and the initial state", () => {
    expect(meta.title).toBe("Visual Builder");
    expect(initial.tab).toBe("design");
    expect(initial.stage.sections.length).toBeGreaterThan(0);
  });

  test("the saved project is opened on enter, a broken one is ignored", () => {
    const s = sim(stateOf(emptyModel()));
    const fx = page.dispatch({ id: "enter" }, s.state);
    expect(fx.some((e) => e.plugin === "local" && e.type === "load")).toBe(
      true,
    );
    expect(fx.some((e) => e.plugin === "local" && e.type === "keys")).toBe(
      true,
    );
    s.send("loaded", { text: projectText(todoDemo()) });
    expect(model(s).name).toBe("Todo list");
    expect(s.state.ready).toBe(true);
    const t = sim(stateOf(emptyModel()));
    t.send("loaded", { text: "{ nope" });
    expect(t.state.ready).toBe(true);
    expect(model(t).name).toBe("Untitled");
  });
});

describe("designing", () => {
  test("add by click creates a section when needed and selects the element", () => {
    const s = blank().send("addEl", "heading").send("addEl", "button");
    expect(model(s).pages[0].sections).toHaveLength(1);
    expect(allElements(model(s))).toHaveLength(2);
    expect(s.state.sel.kind).toBe("element");
    expect(s.state.stage.sections[0].items).toHaveLength(2);
    expect(
      s.effects.some((e) => e.plugin === "local" && e.type === "save"),
    ).toBe(true);
  });

  test("a click-added element never overlaps another", () => {
    const s = blank();
    for (let i = 0; i < 5; i++) s.send("addEl", "card");
    const styles = s.state.stage.sections[0].items.map((i) => i.style);
    expect(new Set(styles).size).toBe(5);
  });

  // A drag is a press, then the pointer followed by the window (`local.drag`), which says
  // what cell it is over; letting go over a cell drops it there.
  const cell = (secId: string, x: number, y: number) => `${secId}|${x}|${y}`;
  const move = (
    s: Sim,
    x: number,
    y: number,
    over: string | null = null,
    done = false,
  ) => s.send("dragMove", { x, y, over, done });

  test("drag from the palette: a press starts it, the pointer shows where it would land, letting go drops it", () => {
    const s = blank().send("addSection", "empty");
    const secId = model(s).pages[0].sections[0].id;
    const press = page.dispatch(
      { id: "dragPalette", payload: "badge" },
      s.state,
    );
    expect(press).toContainEqual(local.drag("dragMove"));
    s.send("dragPalette", "badge");
    // the press, then the pointer moves a little: still a click
    move(s, 100, 100);
    move(s, 102, 101, cell(secId, 5, 2));
    expect(s.state.dragLive).toBe(false);
    expect(s.state.stage.sections[0].drops).toEqual([]);
    // far enough: it is a drag, the cells are there
    move(s, 140, 150, cell(secId, 5, 2));
    expect(s.state.dragLive).toBe(true);
    expect(s.state.stage.sections[0].drops.length).toBe(
      12 * (s.state.stage.sections[0].rows + 1),
    );
    // and the place it would take is shown: the size of a badge, at that cell
    const badge = ELEMENTS.badge;
    expect(s.state.stage.sections[0].ghost?.style).toBe(
      `grid-column: 6 / span ${badge.w}; grid-row: 3 / span ${badge.h}`,
    );
    move(s, 150, 160, cell(secId, 5, 2), true);
    const el = allElements(model(s))[0];
    expect(el.pos.desktop).toMatchObject({ x: 5, y: 2 });
    expect(s.state.drag).toBeNull();
    expect(s.state.stage.sections[0].drops).toEqual([]);
    expect(s.state.stage.sections[0].ghost).toBeNull();
  });

  test("the place follows the pointer from cell to cell, and goes when the pointer is over none", () => {
    const s = blank().send("addSection", "empty");
    const secId = model(s).pages[0].sections[0].id;
    s.send("dragPalette", "card");
    move(s, 10, 10);
    move(s, 60, 60, cell(secId, 1, 1));
    const first = s.state.stage.sections[0].ghost?.style;
    expect(first).toContain("grid-column: 2 /");
    move(s, 90, 60, cell(secId, 4, 1));
    expect(s.state.stage.sections[0].ghost?.style).toContain(
      "grid-column: 5 /",
    );
    move(s, 90, 600, null);
    expect(s.state.stage.sections[0].ghost).toBeNull();
    // let go over nothing: nothing is dropped
    move(s, 90, 600, null, true);
    expect(allElements(model(s))).toHaveLength(0);
    expect(s.state.drag).toBeNull();
  });

  test("a press that does not move is a click: no drop, and the drag is gone", () => {
    const s = blank().send("addSection", "empty");
    const secId = model(s).pages[0].sections[0].id;
    s.send("dragPalette", "badge");
    move(s, 10, 10);
    move(s, 12, 11, cell(secId, 3, 3), true);
    expect(allElements(model(s))).toHaveLength(0);
    expect(s.state.drag).toBeNull();
  });

  test("the first sample is where the press was: a quick drag with one move at the far end is a drag", () => {
    const s = blank().send("addSection", "empty");
    const secId = model(s).pages[0].sections[0].id;
    s.send("dragPalette", "badge");
    move(s, 10, 10);
    move(s, 400, 300, cell(secId, 7, 4), true);
    expect(allElements(model(s))[0].pos.desktop).toMatchObject({ x: 7, y: 4 });
  });

  test("an element that is moved keeps its size in the place shown, and is selected when the drag starts", () => {
    const s = blank().send("addEl", "text");
    const el = allElements(model(s))[0];
    const secId = model(s).pages[0].sections[0].id;
    s.send("select", "none");
    s.send("dragEl", el.id);
    move(s, 5, 5);
    move(s, 60, 80, cell(secId, 6, 3));
    const r = el.pos.desktop;
    expect(s.state.stage.sections[0].ghost?.style).toBe(
      `grid-column: 7 / span ${r.w}; grid-row: 4 / span ${r.h}`,
    );
    expect(s.state.sel).toEqual({ kind: "element", id: el.id });
    move(s, 60, 80, cell(secId, 6, 3), true);
    expect(findElement(model(s), el.id)!.el.pos.desktop).toMatchObject({
      x: 6,
      y: 3,
    });
  });

  test("a resize shows the rectangle from the corner of the element to the cell, in its own section only", () => {
    const s = blank().send("addEl", "text").send("addSection", "empty");
    const m = model(s);
    const el = allElements(m)[0];
    const [first, second] = m.pages[0].sections;
    s.send("dragResize", el.id);
    move(s, 5, 5);
    move(s, 80, 40, cell(first.id, 3, 0));
    expect(s.state.stage.sections[0].ghost?.style).toBe(
      "grid-column: 1 / span 4; grid-row: 1 / span 1",
    );
    // over another section: nothing to show
    move(s, 80, 400, cell(second.id, 3, 0));
    expect(s.state.stage.sections[1].ghost).toBeNull();
    expect(s.state.stage.sections[0].ghost).toBeNull();
    move(s, 80, 40, cell(first.id, 3, 0), true);
    expect(findElement(model(s), el.id)!.el.pos.desktop).toMatchObject({
      w: 4,
      h: 1,
    });
  });

  test("the cells and the place are for the design, not the preview", () => {
    const s = blank().send("addSection", "empty").send("addEl", "text");
    const secId = model(s).pages[0].sections[0].id;
    s.send("setTab", "preview");
    s.send("dragPalette", "badge");
    move(s, 0, 0);
    move(s, 90, 90, cell(secId, 2, 2));
    expect(s.state.stage.sections[0].drops).toEqual([]);
    expect(s.state.stage.sections[0].ghost).toBeNull();
  });

  test("move and resize by drag; a collision pushes down", () => {
    const s = blank().send("addEl", "text").send("addEl", "text");
    const [a, b] = allElements(model(s));
    const secId = model(s).pages[0].sections[0].id;
    s.send("dragBegin", { kind: "move", id: b.id }).send("drop", [secId, 0, 0]);
    const after = findElement(model(s), a.id)!.el.pos.desktop;
    expect(after.y).toBeGreaterThanOrEqual(2); // a was pushed below b
    s.send("dragBegin", { kind: "resize", id: b.id }).send("drop", [
      secId,
      3,
      0,
    ]);
    expect(findElement(model(s), b.id)!.el.pos.desktop).toMatchObject({
      w: 4,
      h: 1,
    });
  });

  test("an element moves between sections", () => {
    const s = blank().send("addEl", "text").send("addSection", "empty");
    const m = model(s);
    const el = allElements(m)[0];
    const second = m.pages[0].sections[1];
    s.send("dragBegin", { kind: "move", id: el.id }).send("drop", [
      second.id,
      1,
      1,
    ]);
    expect(findElement(model(s), el.id)!.section.id).toBe(second.id);
    expect(model(s).pages[0].sections[0].elements).toHaveLength(0);
  });

  test("devices keep their own layouts", () => {
    const s = blank().send("addEl", "text");
    const el = allElements(model(s))[0];
    s.send("setBp", "mobile");
    expect(s.state.stage.sections[0].items[0].style).toContain("span 12");
    s.send("elHide");
    expect(s.state.stage.sections[0].items).toHaveLength(0);
    s.send("setBp", "desktop");
    expect(s.state.stage.sections[0].items).toHaveLength(1);
    expect(findElement(model(s), el.id)!.el.hide).toEqual({ mobile: true });
  });

  test("fields edit through one message; typing merges into one undo step", () => {
    const s = blank().send("addEl", "heading");
    const id = s.state.sel.id;
    for (const v of ["H", "He", "Hel"])
      s.send("f.edit", [`el:${id}`, "text"], { type: "input", value: v });
    expect(findElement(model(s), id)!.el.props.text).toBe("Hel");
    s.send("f.edit", [`style:${id}`, "tone"], {
      type: "change",
      value: "primary",
    });
    expect(findElement(model(s), id)!.el.style.tone).toBe("primary");
    s.send("undo");
    expect(findElement(model(s), id)!.el.style.tone).toBeUndefined();
    s.send("undo");
    expect(findElement(model(s), id)!.el.props.text).toBe("A heading");
    s.send("redo").send("redo");
    expect(findElement(model(s), id)!.el.props.text).toBe("Hel");
    expect(s.state.canRedo).toBe(false);
  });

  test("the text shows the live state; a bad expression is flagged", () => {
    const s = sim(stateOf(todoDemo()));
    const heading = allElements(model(s)).find((e) => e.type === "heading")!;
    s.send("f.edit", [`el:${heading.id}`, "text"], {
      type: "input",
      value: "{len(state.todos)} todos",
    });
    expect(
      s.state.stage.sections[0].items.find((i) => i.id === heading.id)!.text,
    ).toBe("2 todos");
    s.send("select", heading.id);
    s.send("f.edit", [`vis:${heading.id}`, "visible"], {
      type: "input",
      value: "1 +",
    });
    expect(s.state.inspector.visible!.error).not.toBe("");
  });

  test("keyboard: arrows nudge, shift resizes, Delete removes, Ctrl+Z undoes, Escape clears", () => {
    const s = blank().send("addEl", "text");
    const id = s.state.sel.id;
    const pos = () => findElement(model(s), id)!.el.pos.desktop;
    s.send("key", { key: "ArrowRight", ctrl: false, shift: false });
    s.send("key", { key: "ArrowDown", ctrl: false, shift: false });
    expect(pos()).toMatchObject({ x: 1, y: 1 });
    s.send("key", { key: "ArrowRight", ctrl: false, shift: true });
    expect(pos().w).toBe(7);
    s.send("key", { key: "z", ctrl: true, shift: false });
    expect(pos().w).toBe(6);
    s.send("key", { key: "d", ctrl: true, shift: false });
    expect(allElements(model(s))).toHaveLength(2);
    s.send("key", { key: "Delete", ctrl: false, shift: false });
    expect(allElements(model(s))).toHaveLength(1);
    s.send("key", { key: "Escape", ctrl: false, shift: false });
    expect(s.state.sel.kind).toBe("none");
    s.send("key", { key: "y", ctrl: true, shift: false });
    expect(s.state.canRedo).toBe(false);
  });

  test("sections: add from the library, move, duplicate, delete; pages: add, rename, delete", () => {
    const s = blank().send("addSection", "hero").send("addSection", "footer");
    const [hero, footer] = model(s).pages[0].sections;
    s.send("secMove", [footer.id, -1]);
    expect(model(s).pages[0].sections[0].id).toBe(footer.id);
    s.send("secDup", hero.id);
    expect(model(s).pages[0].sections).toHaveLength(3);
    s.send("secDel", hero.id);
    expect(model(s).pages[0].sections).toHaveLength(2);
    s.send("pageAdd");
    expect(model(s).pages).toHaveLength(2);
    const pid = model(s).pages[1].id;
    s.send("f.edit", [`page:${pid}`, "name"], {
      type: "input",
      value: "Pricing",
    });
    s.send("f.edit", [`page:${pid}`, "slug"], {
      type: "input",
      value: "pricing",
    });
    expect(model(s).pages[1]).toMatchObject({
      name: "Pricing",
      slug: "/pricing",
    });
    s.send("pageDel", pid);
    expect(model(s).pages).toHaveLength(1);
    s.send("pageDel", model(s).pages[0].id);
    expect(model(s).pages).toHaveLength(1); // never the last one
  });

  test("state keys and mock routes", () => {
    const s = blank().send("keyAdd");
    expect(model(s).keys[0].key).toBe("key1");
    s.send("f.edit", ["key:key1", "key"], { type: "input", value: "count" });
    s.send("f.edit", ["key:count", "type"], {
      type: "change",
      value: "number",
    });
    s.send("f.edit", ["key:count", "initial"], { type: "input", value: "5" });
    expect(model(s).keys[0]).toEqual({
      key: "count",
      type: "number",
      initial: "5",
    });
    s.send("f.edit", ["key:count", "key"], { type: "input", value: "1bad" });
    expect(model(s).keys[0].key).toBe("count");
    s.send("mockAdd");
    expect(model(s).mocks).toHaveLength(1);
    s.send("mockToggle");
    expect(model(s).mockOn).toBe(false);
    s.send("mockDel", model(s).mocks[0].id);
    s.send("keyDel", "count");
    expect(model(s).keys).toHaveLength(0);
  });

  test("an action chain is edited in the inspector", () => {
    const s = blank().send("addEl", "button");
    s.send("actAdd", ["", "http"]);
    const id = s.state.sel.id;
    const ev = () => findElement(model(s), id)!.el.events.click!;
    expect(ev()[0].t).toBe("http");
    s.send("actAdd", ["0.then", "notice"]);
    s.send("actAdd", ["", "toggle"]);
    expect(ev()).toHaveLength(2);
    expect(ev()[0].then).toHaveLength(1);
    expect(
      s.state.inspector.chain.some(
        (r) => r.isLabel && r.label.startsWith("then"),
      ),
    ).toBe(true);
    s.send("f.edit", [`act:${id}:click:0`, "url"], {
      type: "input",
      value: "/api/x",
    });
    expect(ev()[0].url).toBe("/api/x");
    s.send("actMove", ["1", -1]);
    expect(ev()[0].t).toBe("toggle");
    s.send("actDel", "0");
    s.send("actDel", "0");
    expect(findElement(model(s), id)!.el.events.click).toBeUndefined();
  });

  test("form fields can be added and removed", () => {
    const s = blank().send("addEl", "form");
    const id = s.state.sel.id;
    const n = findElement(model(s), id)!.el.fields.length;
    s.send("formFieldAdd");
    expect(findElement(model(s), id)!.el.fields).toHaveLength(n + 1);
    s.send("f.edit", [`form:${id}:0`, "required"], {
      type: "change",
      value: "no",
    });
    expect(findElement(model(s), id)!.el.fields[0].required).toBe("no");
    s.send("formFieldDel", 0);
    expect(findElement(model(s), id)!.el.fields).toHaveLength(n);
  });
});

describe("project", () => {
  test("demos open (undoable), export and import round-trip", () => {
    const s = blank();
    for (const d of DEMOS) {
      s.send("loadDemo", d.id);
      expect(model(s).name).toBe(d.make().name);
    }
    s.send("undo");
    expect(model(s).name).toBe(DEMOS[DEMOS.length - 2].make().name);
    const ex = page.dispatch({ id: "exportJson" }, s.state);
    const file = ex.find((e) => e.plugin === "files")!;
    expect(file.name).toMatch(/\.json$/);
    const back = parseProject(file.text as string);
    expect(typeof back).toBe("object");
    s.send("sheet", "import")
      .send("importText", undefined, {
        type: "input",
        value: file.text as string,
      })
      .send("importApply");
    expect(s.state.sheet.open).toBe("");
    s.send("sheet", "import")
      .send("importText", undefined, { type: "input", value: "{" })
      .send("importApply");
    expect(s.state.sheet.error).toContain("Not valid JSON");
    s.send("importText", undefined, {
      type: "input",
      value: '{"pages":[]}',
    }).send("importApply");
    expect(s.state.sheet.error).toContain("no pages");
  });

  test("an imported project is sanitised", () => {
    const evil = {
      pages: [
        {
          id: "p1",
          name: 5,
          slug: "/",
          sections: [
            {
              id: "s1",
              elements: [
                {
                  id: "e9",
                  type: "heading",
                  props: { text: 3, level: "1" },
                  events: {
                    click: [{ t: "bogus" }, { t: "set", key: "a", value: "1" }],
                  },
                  pos: { desktop: { x: "a" } },
                },
                { id: "e10", type: "nope" },
              ],
            },
          ],
        },
      ],
      keys: [
        { key: "ok", type: "string", initial: "" },
        { key: "1x", type: "string" },
        { key: "j", type: "weird" },
      ],
    };
    const m = readModel(evil);
    expect(typeof m).toBe("object");
    if (typeof m === "string") return;
    expect(m.pages[0].sections[0].elements).toHaveLength(1);
    const el = m.pages[0].sections[0].elements[0];
    expect(el.events.click).toHaveLength(1);
    expect(el.props.text).toBe("A heading");
    expect(el.pos.desktop).toMatchObject({ x: 0 });
    expect(m.keys).toHaveLength(1);
    expect(m.seq).toBeGreaterThanOrEqual(9);
  });

  test("copy as pavlus code", () => {
    const s = sim({ ...stateOf(landingDemo()), ready: true }).send("copyCode");
    expect(s.state.sheet.open).toBe("code");
    expect(s.state.codeText).toContain("home.pavlus");
    expect(
      s.effects.some((e) => e.plugin === "local" && e.type === "copy"),
    ).toBe(true);
  });
});

describe("the diagram", () => {
  test("a link made from an event port to a key adds an action; the edge removes it", () => {
    const s = sim({ ...stateOf(todoDemo()), ready: true }).send(
      "setTab",
      "diagram",
    );
    const add = allElements(model(s)).find((e) => e.props.text === "Add")!;
    const before = JSON.stringify(add.events);
    s.send("dgPort", { el: add.id, event: "hover" });
    expect(s.state.dg.armed).toBe(`${add.id}:hover`);
    s.send("dgDrop", { id: "k:loading" });
    expect(findElement(model(s), add.id)!.el.events.hover).toEqual([
      { t: "toggle", key: "loading" },
    ]);
    expect(JSON.stringify(findElement(model(s), add.id)!.el.events.click)).toBe(
      JSON.stringify(add.events.click),
    );
    void before;
    expect(s.state.dg.armed).toBe("");
    // select the new edge and remove it
    s.send("dgEdge", { id: `write:c:${add.id}:hover>k:loading:toggle:0` });
    expect(s.state.edgeInfo?.removable).toBe(true);
    s.send("dgRemove");
    expect(findElement(model(s), add.id)!.el.events.hover).toBeUndefined();
  });

  test("clicking a node selects the element or the key; a page folds", () => {
    const s = sim({ ...stateOf(directoryDemo()), ready: true }).send(
      "setTab",
      "diagram",
    );
    const table = allElements(model(s)).find((e) => e.type === "table")!;
    s.send("dgNode", { id: `e:${table.id}` });
    expect(s.state.sel).toEqual({ kind: "element", id: table.id });
    s.send("dgNode", { id: "k:users" });
    expect(s.state.sel).toEqual({ kind: "key", id: "users" });
    expect(s.state.inspector.mode).toBe("key");
    const pid = model(s).pages[0].id;
    s.send("dgToggle", { id: pid });
    expect(s.state.dg.collapsed[pid]).toBe(true);
    s.send("dgHover", { id: "k:users" });
    expect(s.state.dg.hover).toBe("k:users");
    const fx = s.effects.filter((e) => e.plugin === "svg");
    expect(fx.length).toBeGreaterThan(0);
    expect(fx.every((e) => e.target === "#vb-diagram")).toBe(true);
  });

  test("the svg handlers carry the message prefix", () => {
    const s = sim({ ...stateOf(todoDemo()), ready: true });
    s.send("gotPrefix", "route.vb.");
    s.send("setTab", "diagram").send("sync");
    const mount = s.effects.find(
      (e) =>
        e.plugin === "svg" && e.type === "mount" && e.target === "#vb-diagram",
    )!;
    expect(JSON.stringify(mount.tree)).toContain('"id":"route.vb.dgNode"');
  });
});

describe("preview", () => {
  test("the user directory loads through the mock server on start, then a click loads a detail", () => {
    const s = sim({ ...stateOf(directoryDemo()), ready: true }).send(
      "setTab",
      "preview",
    );
    expect(s.state.run.data.loading).toBe(true);
    expect(s.effects.some((e) => e.plugin === "http")).toBe(false); // the mock server answers
    settle(s);
    expect((s.state.run.data.users as unknown[]).length).toBe(8);
    expect(
      s.state.stage.sections[0].items.find((i) => i.kind === "table")!.rows,
    ).toHaveLength(5);
    // search bound to state
    const input = allElements(model(s)).find((e) => e.type === "input")!;
    s.send("e.onInput", input.id, { type: "input", value: "linus" });
    expect(s.state.run.data.q).toBe("linus");
    const table = s.state.stage.sections[0].items.find(
      (i) => i.kind === "table",
    )!;
    expect(table.rows.map((r) => r.cells[1].text)).toEqual(["Linus Torvalds"]);
    s.send("e.onInput", input.id, { type: "input", value: "" });
    s.send("e.onItem", [table.id, 2]);
    expect((s.state.run.data.selected as { name: string }).name).toBe(
      "Grace Hopper",
    );
    settle(s);
    expect((s.state.run.data.detail as { via: string }).via).toBe("mock");
    // sort and paging are interpreter state
    s.send("e.onSort", [table.id, "name"]).send("e.onPage", [table.id, 1]);
    const t2 = s.state.stage.sections[0].items.find((i) => i.kind === "table")!;
    expect(t2.pageNo).toBe(2);
    expect(t2.rows).toHaveLength(3);
  });

  test("with the mock server off the http plugin is asked, and its answers come back by slot", () => {
    const m = todoDemo();
    m.mockOn = false;
    const s = sim({ ...stateOf(m), ready: true }).send("setTab", "preview");
    const btn = allElements(m).find((e) => e.props.text === "Load samples")!;
    s.send("e.onClick", btn.id);
    const req = s.effects.find(
      (e) => e.plugin === "http" && e.type === "request",
    )!;
    expect(req).toMatchObject({ url: "/api/todos", method: "GET" });
    expect(req.onSuccess).toMatch(/^httpOk\d+$/);
    s.send(req.onSuccess as string, { status: 200, data: [{ title: "Real" }] });
    expect(s.state.run.data.todos).toEqual([{ title: "Real" }]);
    expect(s.state.run.data.loading).toBe(false);
    s.send("e.onClick", btn.id);
    const req2 = s.effects.filter((e) => e.plugin === "http").pop()!;
    s.send(req2.onError as string, { error: "offline" });
    expect(s.state.run.data.error).toMatchObject({ message: "offline" });
  });

  test("a form validates, then submits, then navigates", () => {
    const m = landingDemo();
    const s = sim({ ...stateOf(m), ready: true }).send("setTab", "preview");
    const form = allElements(m).find((e) => e.type === "form")!;
    s.send("e.onSubmit", form.id);
    expect(
      s.state.stage.sections[2].items.find((i) => i.id === form.id)!.fields[0]
        .error,
    ).toBe("Name is required");
    s.send("e.onField", [form.id, "name", "text"], {
      type: "input",
      value: "Ann",
    });
    s.send("e.onField", [form.id, "email", "text"], {
      type: "input",
      value: "ann@x.co",
    });
    s.send("e.onField", [form.id, "seats", "text"], {
      type: "input",
      value: "4",
    });
    s.send("e.onSubmit", form.id);
    settle(s);
    expect(s.state.run.data.lead_result).toEqual({
      id: 1042,
      status: "queued",
    });
    expect(s.state.run.location).toBe("/thanks");
    expect(s.state.stage.sections[0].items[0].text).toBe("Thank you, Ann!");
    // a link goes back
    const home = allElements(m).find(
      (e) =>
        e.type === "link" &&
        e.props.text === "Home" &&
        s.state.stage.sections[0].items.some((i) => i.id === e.id),
    )!;
    s.send("e.onLink", home.id);
    expect(s.state.run.location).toBe("/");
  });

  test("tabs, accordion, modal, buttons with set / toggle", () => {
    const s = blank()
      .send("addEl", "tabs")
      .send("addEl", "modal")
      .send("keyAdd")
      .send("keyAdd");
    const [tabs, modal] = allElements(model(s));
    s.send("f.edit", ["key:key1", "key"], { type: "input", value: "tab" });
    s.send("f.edit", ["key:key2", "key"], { type: "input", value: "open" });
    s.send("f.edit", ["key:open", "type"], {
      type: "change",
      value: "boolean",
    });
    s.send("f.edit", [`bind:${tabs.id}`, "bind"], {
      type: "input",
      value: "tab",
    });
    s.send("f.edit", [`bind:${modal.id}`, "bind"], {
      type: "input",
      value: "open",
    });
    s.send("setTab", "preview");
    s.send("e.onTab", [tabs.id, "Details"]);
    expect(s.state.run.data.tab).toBe("Details");
    expect(s.state.stage.sections[0].items[0].panel).toBe("Details text");
    expect(s.state.stage.sections[0].items[1].open).toBe(false);
  });

  test("restart resets the live state; leaving cancels pending work", () => {
    const s = sim({ ...stateOf(todoDemo()), ready: true }).send(
      "setTab",
      "preview",
    );
    const input = allElements(model(s)).find((e) => e.type === "input")!;
    s.send("e.onInput", input.id, { type: "input", value: "x" });
    expect(s.state.run.data.draft).toBe("x");
    s.send("previewRestart");
    expect(s.state.run.data.draft).toBe("");
    const fx = page.dispatch({ id: "leave" }, s.state);
    expect(fx.some((e) => e.plugin === "local" && e.type === "unkeys")).toBe(
      true,
    );
    s.send("e.onClick", "nope"); // an unknown element is ignored
  });

  test("messages outside Preview do nothing", () => {
    const s = sim({ ...stateOf(todoDemo()), ready: true });
    const btn = allElements(model(s)).find(
      (e) => e.props.text === "Load samples",
    )!;
    expect(
      page.dispatch({ id: "e.onClick", payload: btn.id }, s.state),
    ).toEqual([]);
  });
});

describe("the local plugin", () => {
  test("save, load, prefix, keys", () => {
    const mem = new Map<string, string>();
    const listeners: ((e: Event) => void)[] = [];
    const fakeDoc = {
      addEventListener: (_: string, f: (e: Event) => void) => listeners.push(f),
      removeEventListener: () => listeners.pop(),
      querySelector: () => ({}),
    } as unknown as Document;
    const plugin = createLocalPlugin({
      storage: {
        getItem: (k) => mem.get(k) ?? null,
        setItem: (k, v) => void mem.set(k, v),
      },
      document: fakeDoc,
    });
    const sent: Message[] = [];
    const ctx = {
      dispatch: (m: Message) => sent.push(m),
      getState: () => ({}),
      dispatchEffect: () => {},
    };
    plugin.init?.(ctx);
    plugin.handle(
      { plugin: "local", type: "save", key: STORAGE_KEY, text: "hello" },
      ctx,
    );
    plugin.handle(
      {
        plugin: "local",
        type: "load",
        key: STORAGE_KEY,
        onSuccess: "a.loaded",
      },
      ctx,
    );
    plugin.handle(
      { plugin: "local", type: "load", key: "none", onSuccess: "a.loaded" },
      ctx,
    );
    expect(sent).toEqual([
      { id: "a.loaded", payload: { text: "hello" } },
      { id: "a.loaded", payload: { text: null } },
    ]);
    sent.length = 0;
    plugin.handle(
      {
        plugin: "local",
        type: "prefix",
        name: "gotPrefix",
        onSuccess: "route.vb.gotPrefix",
      },
      ctx,
    );
    expect(sent[0].payload).toBe("route.vb.");
    sent.length = 0;
    plugin.handle(
      { plugin: "local", type: "keys", onMessage: "route.vb.key" },
      ctx,
    );
    const key = (init: Partial<KeyboardEvent>, tag = "DIV") =>
      listeners.at(-1)!({
        target: { tagName: tag },
        preventDefault() {},
        ...init,
      } as unknown as Event);
    key({ key: "Z", ctrlKey: true, shiftKey: false });
    key({ key: "ArrowLeft" });
    key({ key: "a" });
    key({ key: "Delete" }, "INPUT");
    expect(sent.map((m) => m.payload)).toEqual([
      { key: "z", ctrl: true, shift: false },
      { key: "ArrowLeft", ctrl: false, shift: false },
    ]);
    plugin.handle({ plugin: "local", type: "unkeys" }, ctx);
  });
});

test("the initial data of every demo matches its keys", () => {
  for (const d of DEMOS) {
    const m = d.make();
    expect(Object.keys(initialData(m.keys))).toEqual(m.keys.map((k) => k.key));
  }
});
