// @vitest-environment jsdom
// The board: as wide as its box, Shift + wheel zooms, full screen, a height that is kept,
// a minimap with a rectangle that moves the view, and frames on a plot that has no end:
// rectangles that are added, moved, resized and removed, and components that are free on
// the plot and attach to a frame when they are dropped on it.

import type { Effect, Message } from "@pavlus/frontend";
import { describe, expect, test } from "vitest";
import { createLocalPlugin, localEffector as local } from "../local.ts";
import { loginDemo } from "../templates/flow-studio/demos.ts";
import {
  BOARD_KEY,
  coreFrom,
  type FsState,
  initial,
  page,
  trees,
} from "../templates/flow-studio/flow-studio.ts";
import {
  fitView,
  GUTTER,
  layoutOf,
  miniBox,
  toFrames,
  viewBoxOf,
  zoomAt,
  zoomBy,
} from "../templates/flow-studio/layout.ts";
import {
  addFrame,
  addNode,
  attachNode,
  emptyModel,
  FRAME_MIN_H,
  FRAME_MIN_W,
  findFrame,
  findNode,
  frameAt,
  framesOf,
  laneOf,
  moveFrame,
  parseProject,
  projectText,
  removeFrame,
  renameFrame,
  setFrameRect,
  setFrameRole,
} from "../templates/flow-studio/model.ts";

/** a design with frames and three nodes on the plot: two free, one in a frame */
const plot = () => {
  let m: ReturnType<typeof emptyModel> = {
    ...emptyModel(),
    name: "plot",
    frames: [],
  };
  const f = addFrame(m, { x: 100, y: 100, w: 400, h: 300 }, "Orders");
  m = f.model;
  m = addNode(m, "handler", "orders.list", { id: "a", x: 120, y: 140 }).model;
  m = addNode(m, "effect", "pg.query", { id: "b", x: 700, y: 140 }).model;
  m = addNode(m, "reply", "orders.listed", { id: "c", x: 700, y: 300 }).model;
  return { m: attachNode(m, "a", f.id), frame: f.id };
};

describe("frames: rectangles on the plot", () => {
  test("a design with none has no frames; one that starts as an older design gets the four lanes as frames, drawn the same", () => {
    expect(emptyModel().frames).toBeUndefined();
    const m = toFrames(emptyModel());
    expect(framesOf(m).map((f) => f.role)).toEqual([
      "browser",
      "app",
      "plugins",
      "externals",
    ]);
    // and an edited design is left as it is
    expect(toFrames(m)).toBe(m);
  });

  test("an older design's nodes go to absolute places on the plot, attached to the frame of their lane", () => {
    const older = loginDemo();
    const before = layoutOf(older).nodes;
    const m = toFrames(older);
    expect(m.lanes).toBeUndefined();
    expect(m.nodes.every((n) => n.band === undefined)).toBe(true);
    for (const p of layoutOf(m).nodes) {
      const was = before.find((x) => x.id === p.id)!;
      expect([p.x, p.y]).toEqual([was.x, was.y]);
      expect(findFrame(m, p.frame)?.role).toBe(laneOf(p.node));
    }
    // nodes keep what they run as
    expect(m.nodes.map((n) => laneOf(n))).toEqual(
      older.nodes.map((n) => laneOf(n)),
    );
  });

  test("lanes an older design saved (their heights, the width) are the frames it gets", () => {
    const older = JSON.parse(projectText(loginDemo()));
    older.lanes = [
      { id: "browser", name: "Front", role: "browser", h: 300 },
      { id: "app", name: "Back", role: "app" },
    ];
    older.laneW = 5000;
    const m = parseProject(JSON.stringify(older));
    if (typeof m === "string") throw new Error(m);
    const framed = toFrames(m);
    expect(framesOf(framed).map((f) => f.name)).toEqual(["Front", "Back"]);
    expect(framesOf(framed)[0].h).toBe(300);
    expect(framesOf(framed).every((f) => f.w === 5000)).toBe(true);
    expect(framed.laneW).toBeUndefined();
  });

  test("a frame is added on top, with a name, and the least size", () => {
    const { m } = plot();
    const made = addFrame(m, { x: 0, y: 0, w: 10, h: 10 });
    const f = findFrame(made.model, made.id)!;
    expect([f.w, f.h]).toEqual([FRAME_MIN_W, FRAME_MIN_H]);
    expect(f.name).toBe("Frame");
    expect(framesOf(made.model).at(-1)!.id).toBe(made.id);
    expect(
      findFrame(renameFrame(made.model, made.id, "Queue"), made.id)!.name,
    ).toBe("Queue");
  });

  test("a frame moved takes what is attached to it, and not the rest", () => {
    const { m, frame } = plot();
    const moved = moveFrame(m, frame, 50, -20);
    expect(findFrame(moved, frame)).toMatchObject({ x: 150, y: 80 });
    expect(findNode(moved, "a")).toMatchObject({ x: 170, y: 120 });
    expect(findNode(moved, "b")).toMatchObject({ x: 700, y: 140 });
    expect(moveFrame(m, frame, 0, 0)).toBe(m);
  });

  test("a frame resized is never smaller than the least, and moves nothing attached", () => {
    const { m, frame } = plot();
    const r = setFrameRect(m, frame, { x: 90, y: 90, w: 5, h: 5 });
    expect(findFrame(r, frame)).toMatchObject({
      x: 90,
      y: 90,
      w: FRAME_MIN_W,
      h: FRAME_MIN_H,
    });
    expect(findNode(r, "a")).toMatchObject({ x: 120, y: 140 });
  });

  test("a component dropped on a frame is attached to it; let go, it is free", () => {
    const { m, frame } = plot();
    expect(findNode(m, "a")!.frame).toBe(frame);
    expect(findNode(attachNode(m, "a", null), "a")!.frame).toBeUndefined();
    const on = attachNode(m, "b", frame);
    expect(findNode(on, "b")!.frame).toBe(frame);
    expect(attachNode(m, "nope", frame)).toBe(m);
  });

  test("the topmost frame under a point is the one", () => {
    const { m, frame } = plot();
    const over = addFrame(m, { x: 200, y: 200, w: 100, h: 100 }, "Over").model;
    expect(frameAt(over, 250, 250)?.name).toBe("Over");
    expect(frameAt(over, 150, 150)?.id).toBe(frame);
    expect(frameAt(over, 10, 10)).toBeUndefined();
  });

  test("a frame that runs as a role gives it to what is attached; a node keeps its own kind otherwise", () => {
    const { m, frame } = plot();
    expect(laneOf(findNode(m, "a")!)).toBe("app");
    const browser = setFrameRole(m, frame, "browser");
    expect(laneOf(findNode(browser, "a")!)).toBe("browser");
    // what is not attached is not changed
    expect(laneOf(findNode(browser, "b")!)).toBe("plugins");
    // attached later, it takes the role; set free, it is what its kind says again
    const later = attachNode(browser, "b", frame);
    expect(laneOf(findNode(later, "b")!)).toBe("browser");
    expect(laneOf(findNode(attachNode(later, "b", null), "b")!)).toBe(
      "plugins",
    );
    expect(laneOf(findNode(setFrameRole(browser, frame, ""), "a")!)).toBe(
      "app",
    );
  });

  test("a frame taken away leaves its components on the plot, free and as their kind says", () => {
    const { m, frame } = plot();
    const gone = removeFrame(setFrameRole(m, frame, "browser"), frame);
    expect(findFrame(gone, frame)).toBeUndefined();
    const a = findNode(gone, "a")!;
    expect(a.frame).toBeUndefined();
    expect([a.x, a.y]).toEqual([120, 140]);
    expect(laneOf(a)).toBe("app");
    expect(removeFrame(m, "nope")).toBe(m);
  });

  test("frames are saved with the design, even none, and come back", () => {
    const { m } = plot();
    const back = parseProject(projectText(m));
    if (typeof back === "string") throw new Error(back);
    expect(framesOf(back)).toEqual(framesOf(m));
    expect(findNode(back, "a")!.frame).toBe(findNode(m, "a")!.frame);
    // none at all is a design with frames (and no lanes)
    const none = parseProject(projectText({ ...emptyModel(), frames: [] }));
    if (typeof none === "string") throw new Error(none);
    expect(none.frames).toEqual([]);
    expect(toFrames(none)).toBe(none);
  });

  test("a frame that is not valid is dropped, a size that is too small is the least", () => {
    const m = parseProject(
      JSON.stringify({
        ...JSON.parse(projectText(emptyModel())),
        frames: [
          { id: "a", name: "A", x: 1, y: 2, w: 1, h: 1, role: "nonsense" },
          { id: "a", name: "again" },
          { name: "no id" },
        ],
      }),
    );
    if (typeof m === "string") throw new Error(m);
    expect(framesOf(m)).toEqual([
      {
        id: "a",
        name: "A",
        x: 1,
        y: 2,
        w: FRAME_MIN_W,
        h: FRAME_MIN_H,
        role: "",
      },
    ]);
  });

  test("the plot has no origin: frames far from it, and left of it, are in the bounds", () => {
    let { m } = plot();
    m = addFrame(m, { x: -900, y: -400, w: 200, h: 100 }).model;
    const p = layoutOf(m);
    expect(p.minX).toBe(-900);
    expect(p.minY).toBe(-400);
    expect(p.width).toBeGreaterThanOrEqual(700 + 140);
    // a design with nothing on it has a plot of a size, and a start
    const empty = layoutOf(toFrames({ ...emptyModel(), frames: [] }));
    expect([empty.minX, empty.minY]).toEqual([0, 0]);
    expect(empty.width).toBeGreaterThan(0);
  });

  test("a new component goes into the frame that runs as its kind, to the right of what is there", () => {
    const m0 = toFrames(emptyModel());
    const a = addNode(m0, "handler", "x.y");
    const node = findNode(a.model, a.id)!;
    expect(findFrame(a.model, node.frame!)?.role).toBe("app");
    const b = addNode(a.model, "handler", "x.z");
    expect(findNode(b.model, b.id)!.x).toBeGreaterThan(node.x);
    // a design with frames that run as nothing: free on the plot
    const free = toFrames({ ...emptyModel(), frames: [] });
    const c = addNode(free, "handler", "free");
    expect(findNode(c.model, c.id)!.frame).toBeUndefined();
  });

  test("the frame grows for a component that is added past its edge", () => {
    const m0 = toFrames(emptyModel());
    let m = m0;
    const app = framesOf(m).find((f) => f.role === "app")!;
    for (let i = 0; i < 12; i++) m = addNode(m, "handler", `h${i}`).model;
    const grown = findFrame(m, app.id)!;
    for (const n of m.nodes.filter((x) => x.frame === app.id))
      expect(n.x + 140).toBeLessThanOrEqual(grown.x + grown.w);
  });
});

describe("the viewport of a board that has a size", () => {
  test("the view is as big as the box: one unit is one pixel at 100%", () => {
    expect(viewBoxOf({ x: 0, y: 0, z: 1, w: 1400, h: 600 })).toBe(
      "0 0 1400 600",
    );
    expect(viewBoxOf({ x: 10, y: 20, z: 2, w: 1400, h: 600 })).toBe(
      "10 20 700 300",
    );
    // without a size it is the one of the start
    expect(viewBoxOf({ x: 0, y: 0, z: 1 })).toBe("0 0 800 460");
  });

  test("a zoom keeps the size, and Fit uses it", () => {
    const v = zoomBy({ x: 0, y: 0, z: 1, w: 1000, h: 500 }, 2);
    expect([v.w, v.h]).toEqual([1000, 500]);
    const f = fitView({ width: 500, height: 250 }, { w: 1000, h: 500 });
    expect([f.w, f.h]).toEqual([1000, 500]);
    expect(f.z).toBeGreaterThan(1.5);
  });

  test("the wheel zooms toward the pointer: the point under it stays under it", () => {
    const v = { x: 100, y: 50, z: 1, w: 1000, h: 500 };
    const px = 300;
    const py = 120;
    const at = zoomAt(v, 1.5, px, py);
    expect(at.z).toBeCloseTo(1.5);
    expect(at.x + px / at.z).toBeCloseTo(v.x + px / v.z);
    expect(at.y + py / at.z).toBeCloseTo(v.y + py / v.z);
  });

  test("a zoom stays between the least and the most", () => {
    const v = { x: 0, y: 0, z: 1, w: 1000, h: 500 };
    expect(zoomAt(v, 1000, 0, 0).z).toBeLessThan(5);
    expect(zoomAt(v, 0.0001, 0, 0).z).toBeGreaterThan(0.1);
  });
});

// ---- the component ----

interface Sim {
  state: FsState;
  last: Effect[];
  send(
    id: string,
    payload?: unknown,
    event?: { value?: string; key?: string },
  ): Sim;
}
function sim(state: FsState): Sim {
  const self: Sim = {
    state,
    last: [],
    send(id, payload, event) {
      const msg: Message = { id, payload };
      if (event)
        msg.event = { type: event.key ? "keydown" : "input", ...event };
      const fx = page.dispatch(msg, self.state);
      self.last = fx;
      let s = self.state;
      for (const e of fx)
        if (e.plugin === "store" && e.type === "merge")
          s = { ...s, ...(e.value as object) };
      self.state = s;
      return self;
    },
  };
  return self;
}
const ready = () => sim({ ...initial, ready: true });
const model = (s: Sim) => s.state.hist.present;

describe("the board in the studio", () => {
  test("its box is measured: the drawing fills it, and the first time it shows the design readably", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    expect([s.state.vp.w, s.state.vp.h]).toEqual([1500, 520]);
    expect(s.state.vp.z).toBeGreaterThanOrEqual(0.7);
    const z = s.state.vp.z;
    // a bigger box keeps where the person was looking
    s.send("boardSize", { w: 1800, h: 520 });
    expect([s.state.vp.w, s.state.vp.z]).toEqual([1800, z]);
  });

  test("a size that did not change is no work", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    expect(s.send("boardSize", { w: 1500, h: 520 }).last).toEqual([]);
  });

  test("the size is kept when the view is put back (100%, Fit, Auto layout)", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("home");
    expect([s.state.vp.w, s.state.vp.h]).toEqual([1500, 520]);
    s.send("fit");
    expect([s.state.vp.w, s.state.vp.h]).toEqual([1500, 520]);
  });

  test("Shift + wheel zooms toward the pointer, and the wheel up zooms in", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    const before = s.state.vp;
    s.send("boardWheel", { dy: -120, x: 400, y: 100 });
    expect(s.state.vp.z).toBeGreaterThan(before.z);
    const z = s.state.vp.z;
    s.send("boardWheel", { dy: 240, x: 400, y: 100 });
    expect(s.state.vp.z).toBeLessThan(z);
  });

  test("the wheel and the box are asked for when the board is drawn", () => {
    const s = ready();
    s.send("sync");
    expect(s.last).toContainEqual(local.watch("#fs-flow", "boardSize"));
    expect(s.last).toContainEqual(local.wheel("#fs-flow", "boardWheel"));
  });

  test("the full screen is asked of the studio, and the answer is shown", () => {
    const s = ready();
    expect(s.send("toggleFull").last).toEqual([
      local.fullscreen(".fs", "fullChanged"),
    ]);
    s.send("fullChanged", { on: true });
    expect(s.state.full).toBe(true);
    s.send("fullChanged", { on: false });
    expect(s.state.full).toBe(false);
  });

  test("the height: the handle starts a drag that follows the pointer anywhere", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    expect(s.send("heightDown").last).toContainEqual(local.drag("dragMove"));
    s.send("dragMove", { x: 0, y: 300, done: false });
    s.send("dragMove", { x: 0, y: 400, done: false });
    expect(s.state.boardH).toBe(620);
    expect(s.state.boardStyle).toBe("height: 620px");
    // the drawing is as high as the box at once
    expect(s.state.vp.h).toBe(620);
    s.send("dragMove", { x: 0, y: 400, done: true });
    expect(s.state.drag).toBeNull();
    expect(s.state.boardH).toBe(620);
  });

  test("the height stays between the least and the most", () => {
    const s = ready();
    s.send("heightDown");
    s.send("dragMove", { x: 0, y: 0, done: false });
    s.send("dragMove", { x: 0, y: -5000, done: false });
    expect(s.state.boardH).toBe(240);
    s.send("dragMove", { x: 0, y: 99999, done: false });
    expect(s.state.boardH).toBe(2400);
  });

  test("the arrows on the handle change the height too", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("heightKey", undefined, { key: "ArrowDown" });
    expect(s.state.boardH).toBe(560);
    s.send("heightKey", undefined, { key: "ArrowUp" });
    s.send("heightKey", undefined, { key: "ArrowUp" });
    expect(s.state.boardH).toBe(480);
    expect(s.send("heightKey", undefined, { key: "a" }).last).toEqual([]);
  });

  test("the background is dragged with the pointer wherever it goes, off the board too, and to any side", () => {
    const s = ready().send("boardSize", { w: 1400, h: 520 });
    s.send("home");
    expect(s.send("cvDown", { x: 10, y: 10 }).last).toContainEqual(
      local.drag("dragMove"),
    );
    // pointer of the window: it does not matter where the board is on the page
    s.send("dragMove", { x: 700, y: 400, done: false });
    // the design goes far to the right: the view is left of its start
    s.send("dragMove", { x: 1300, y: 400, done: false });
    expect(s.state.vp.x).toBeLessThan(0);
    expect(s.state.vp.x).toBeGreaterThan(-1400);
    // and far to the left: the view is past the design's end, but within reach
    s.send("dragMove", { x: -3000, y: 400, done: false });
    expect(s.state.vp.x).toBeGreaterThan(0);
    s.send("dragMove", { x: -3000, y: 400, done: true });
    expect(s.state.drag).toBeNull();
  });

  test("leaving the board does not end a pan", () => {
    const s = ready().send("boardSize", { w: 1400, h: 520 });
    s.send("cvDown", { x: 10, y: 10 });
    s.send("cvLeave");
    expect(s.state.drag).toMatchObject({ kind: "pan" });
  });

  test("the height is remembered, and comes back with the page, not with the project", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("heightDown");
    s.send("dragMove", { x: 0, y: 100, done: false });
    s.send("dragMove", { x: 0, y: 260, done: false });
    expect(s.last.some((e) => e.type === "save")).toBe(false);
    s.send("dragMove", { x: 0, y: 260, done: true });
    expect(s.last).toContainEqual(local.save(BOARD_KEY, "680"));
    s.send("heightKey", undefined, { key: "ArrowDown" });
    expect(s.last).toContainEqual(local.save(BOARD_KEY, "720"));
    // a fresh page asks for it, and takes it
    const fresh = ready().send("boardSize", { w: 1500, h: 520 });
    expect(
      page.dispatch({ id: "enter" } as Message, fresh.state),
    ).toContainEqual(local.load(BOARD_KEY, "boardLoaded"));
    fresh.send("boardLoaded", { text: "680" });
    expect(fresh.state.boardH).toBe(680);
    expect(fresh.state.vp.h).toBe(680);
    expect(fresh.state.boardStyle).toBe("height: 680px");
    // nothing, or nonsense, is the height it was
    fresh.send("boardLoaded", { text: null });
    fresh.send("boardLoaded", { text: "tall" });
    expect(fresh.state.boardH).toBe(680);
    fresh.send("boardLoaded", { text: "99999" });
    expect(fresh.state.boardH).toBe(2400);
  });

  test("opening the saved project does not put the height back", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("heightKey", undefined, { key: "ArrowDown" });
    s.send("heightKey", undefined, { key: "ArrowDown" });
    const text = projectText({ ...emptyModel(), name: "Saved" });
    const fresh = sim({ ...s.state, ready: false });
    fresh.send("loaded", { text, keepEmpty: true });
    expect(fresh.state.boardH).toBe(600);
    expect(fresh.state.vp.w).toBe(1500);
  });

  test("the minimap shows the design, and the view too when it sticks out", () => {
    const placed = { width: 2000, height: 700 };
    expect(miniBox(placed, { x: 100, y: 50, z: 1, w: 800, h: 400 })).toEqual({
      x: 0,
      y: 0,
      w: 2000,
      h: 700,
    });
    // zoomed out so far that the view is bigger than the design
    const out = miniBox(placed, { x: -300, y: -100, z: 0.25, w: 1000, h: 500 });
    expect(out).toEqual({ x: -300, y: -100, w: 4000, h: 2000 });
    // dragged off to the right
    expect(
      miniBox(placed, { x: 1800, y: 0, z: 1, w: 800, h: 400 }),
    ).toMatchObject({
      x: 0,
      w: 2600,
    });
  });

  test("the minimap draws its box, and the rectangle of the view is in it", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("boardWheel", { dy: 1600, x: 0, y: 0 });
    const mini = trees(coreFrom(s.state)).find(
      (t) => t.target === "#fs-minimap",
    )!.tree;
    const text = JSON.stringify(mini);
    const box = miniBox(layoutOf(model(s)), s.state.vp);
    expect(text).toContain(`${Math.round(box.x * 10) / 10} `);
    expect(text).toContain("fs-mm__view");
    expect(text).toContain('"id":"mmDown"');
  });

  test("a press on the minimap outside the rectangle takes the view there, and the rectangle follows the pointer", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("miniSize", { w: 210, h: 90 });
    s.send("home");
    const box = miniBox(layoutOf(model(s)), s.state.vp);
    const x = box.x + box.w * 0.9;
    const y = box.y + box.h * 0.2;
    expect(s.send("mmDown", { x, y }).last).toContainEqual(
      local.drag("dragMove"),
    );
    // the view is centered on the point
    expect(s.state.vp.x + 1500 / s.state.vp.z / 2).toBeCloseTo(x, 0);
    const k = (s.state.drag as { k: number }).k;
    expect(k).toBeCloseTo(1 / Math.min(210 / box.w, 90 / box.h));
    const x0 = s.state.vp.x;
    s.send("dragMove", { x: 500, y: 300, done: false });
    s.send("dragMove", { x: 480, y: 300, done: false });
    // 20 px of the minimap to the left are 20 * k of the world
    expect(s.state.vp.x).toBeCloseTo(x0 - 20 * k, 0);
    s.send("dragMove", { x: 480, y: 300, done: true });
    expect(s.state.drag).toBeNull();
  });

  test("a press on the rectangle takes it where it is", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("miniSize", { w: 210, h: 90 });
    s.send("home");
    const vp = s.state.vp;
    s.send("mmDown", { x: vp.x + 100, y: vp.y + 100 });
    expect(s.state.vp.x).toBe(vp.x);
    expect(s.state.vp.y).toBe(vp.y);
  });

  test("the minimap is measured when the board is drawn, next to the board", () => {
    const s = ready();
    s.send("sync");
    expect(s.last).toContainEqual(local.watch("#fs-flow", "boardSize"));
    expect(s.last).toContainEqual(local.watch("#fs-minimap", "miniSize"));
  });

  test("a frame is added in the middle of what the board shows, and it is one step of the history", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("home");
    const before = s.state.hist.past.length;
    s.send("frameAdd");
    expect(s.state.hist.past.length).toBe(before + 1);
    // the board is what the person is looking at: the list of frames stays shut
    expect(s.state.framesOpen).toBe(false);
    const frames = framesOf(model(s));
    const f = frames.at(-1)!;
    // an older design got its lanes as frames by being edited, and the new one is on top
    expect(frames).toHaveLength(5);
    const vp = s.state.vp;
    const cx = f.x + f.w / 2;
    expect(cx).toBeGreaterThan(vp.x);
    expect(cx).toBeLessThan(vp.x + 1500 / vp.z);
    expect(s.state.framePanel.at(-1)!.name).toBe(f.name);
    s.send("undo");
    expect(model(s).frames).toBeUndefined();
  });

  test("editing an older design changes nothing on the board: the frames are the lanes it had", () => {
    const s = ready();
    const before = layoutOf(model(s)).nodes.map((n) => [n.id, n.x, n.y]);
    s.send("frameAdd");
    const after = layoutOf(model(s)).nodes.map((n) => [n.id, n.x, n.y]);
    expect(after).toEqual(before);
  });

  test("typing the name of a frame is one step of the history, not one per letter", () => {
    const s = ready().send("frameAdd");
    const id = framesOf(model(s)).at(-1)!.id;
    const before = s.state.hist.past.length;
    for (const v of ["Q", "Qu", "Que", "Queue"])
      s.send("frameName", id, { value: v });
    expect(s.state.hist.past.length).toBe(before + 1);
    expect(findFrame(model(s), id)!.name).toBe("Queue");
  });

  test("what a frame runs as is chosen, or nothing", () => {
    const s = ready().send("frameAdd");
    const id = framesOf(model(s)).at(-1)!.id;
    s.send("frameRole", id, { value: "plugins" });
    expect(findFrame(model(s), id)!.role).toBe("plugins");
    s.send("frameRole", id, { value: "nonsense" });
    expect(findFrame(model(s), id)!.role).toBe("plugins");
    s.send("frameRole", id, { value: "" });
    expect(findFrame(model(s), id)!.role).toBe("");
    expect(s.state.framePanel.at(-1)!.roles[0]).toMatchObject({
      v: "",
      selected: true,
    });
  });

  test("a frame is taken away by its cross, or from the panel, and what is on it stays", () => {
    const s = ready().send("frameAdd");
    const count = model(s).nodes.length;
    s.send("frameDel", { id: "app" });
    expect(findFrame(model(s), "app")).toBeUndefined();
    expect(model(s).nodes).toHaveLength(count);
    expect(model(s).nodes.filter((n) => n.frame === "app")).toHaveLength(0);
    s.send("frameDel", "browser");
    expect(framesOf(model(s)).map((f) => f.id)).not.toContain("browser");
    s.send("undo");
    expect(framesOf(model(s)).map((f) => f.id)).toContain("browser");
  });

  test("a frame is dragged by its header, wherever the pointer goes, and takes its components with it", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("home");
    s.send("frameAdd");
    const m0 = model(s);
    const f0 = findFrame(m0, "app")!;
    const inside = m0.nodes.filter((n) => n.frame === "app");
    expect(inside.length).toBeGreaterThan(0);
    const z = s.state.vp.z;
    expect(s.send("frameDown", { id: "app" }).last).toContainEqual(
      local.drag("dragMove"),
    );
    s.send("dragMove", { x: 300, y: 200, done: false });
    s.send("dragMove", { x: 300 + 120 * z, y: 200 + 60 * z, done: false });
    // while it is dragged the design is not changed
    expect(findFrame(model(s), "app")).toMatchObject({ x: f0.x, y: f0.y });
    expect(s.state.drag).toMatchObject({ kind: "frame", dx: 120, dy: 60 });
    s.send("dragMove", { x: 300 + 120 * z, y: 200 + 60 * z, done: true });
    expect(findFrame(model(s), "app")).toMatchObject({
      x: f0.x + 120,
      y: f0.y + 60,
    });
    for (const n of inside)
      expect(findNode(model(s), n.id)).toMatchObject({
        x: n.x + 120,
        y: n.y + 60,
      });
    // the others stay
    const other = m0.nodes.find((n) => n.frame !== "app")!;
    expect(findNode(model(s), other.id)).toMatchObject({
      x: other.x,
      y: other.y,
    });
    s.send("undo");
    expect(findFrame(model(s), "app")).toMatchObject({ x: f0.x, y: f0.y });
  });

  test("a release over the board does not end a drag that the window follows (it comes before the window's)", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("home");
    s.send("frameAdd");
    const f0 = findFrame(model(s), "app")!;
    s.send("frameDown", { id: "app" });
    s.send("dragMove", { x: 100, y: 100, done: false });
    s.send("dragMove", { x: 200, y: 100, done: false });
    // the board sees the pointer go up first
    s.send("cvUp");
    expect(s.state.drag).toMatchObject({ kind: "frame" });
    s.send("dragMove", { x: 200, y: 100, done: true });
    expect(findFrame(model(s), "app")!.x).toBeGreaterThan(f0.x);
    // the same for the border of a frame, the background and the minimap
    s.send("frameSize", { id: "app", edge: "se" });
    s.send("cvUp");
    expect(s.state.drag).toMatchObject({ kind: "frameSize" });
    s.send("dragMove", { x: 0, y: 0, done: true });
    s.send("cvDown", { x: 0, y: 0 });
    s.send("cvUp");
    expect(s.state.drag).toMatchObject({ kind: "pan" });
    s.send("dragMove", { x: 0, y: 0, done: true });
    s.send("heightDown");
    s.send("cvUp");
    expect(s.state.drag).toMatchObject({ kind: "height" });
    s.send("dragMove", { x: 0, y: 0, done: true });
    expect(s.state.drag).toBeNull();
  });

  test("a click on a header, without a move, is nothing", () => {
    const s = ready();
    s.send("frameAdd");
    const steps = s.state.hist.past.length;
    s.send("frameDown", { id: "app" });
    s.send("dragMove", { x: 10, y: 10, done: false });
    s.send("dragMove", { x: 10, y: 10, done: true });
    expect(s.state.hist.past.length).toBe(steps);
    expect(s.state.drag).toBeNull();
  });

  test("a frame is resized by its corners: the corner that is held moves, the opposite one stays", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("home");
    s.send("frameAdd");
    const id = framesOf(model(s)).at(-1)!.id;
    const f = findFrame(model(s), id)!;
    const z = s.state.vp.z;
    const drag = (edge: string, dx: number, dy: number) => {
      s.send("frameSize", { id, edge });
      s.send("dragMove", { x: 500, y: 300, done: false });
      s.send("dragMove", { x: 500 + dx * z, y: 300 + dy * z, done: true });
      return findFrame(model(s), id)!;
    };
    // the bottom right corner: wider and taller, the top left stays
    const se = drag("se", 100, 60);
    expect([se.x, se.y, se.w, se.h]).toEqual([f.x, f.y, f.w + 100, f.h + 60]);
    // the top left corner: the bottom right stays
    const nw = drag("nw", -50, -40);
    expect([nw.x + nw.w, nw.y + nw.h]).toEqual([se.x + se.w, se.y + se.h]);
    expect([nw.x, nw.y]).toEqual([se.x - 50, se.y - 40]);
    // the top right corner: the bottom left stays
    const ne = drag("ne", 30, -20);
    expect([ne.x, ne.y + ne.h]).toEqual([nw.x, nw.y + nw.h]);
    expect(ne.w).toBe(nw.w + 30);
    // the bottom left corner: the top right stays
    const sw = drag("sw", -10, 25);
    expect([sw.x + sw.w, sw.y]).toEqual([ne.x + ne.w, ne.y]);
  });

  test("the corners are the only handles a frame has", () => {
    const s = ready().send("frameAdd");
    const text = JSON.stringify(trees(coreFrom(s.state))[0].tree);
    const modes = [...text.matchAll(/"edge":"(\w+)"/g)].map((m) => m[1]);
    // four to a frame
    const id = framesOf(model(s)).at(-1)!.id;
    const mine = [
      ...text.matchAll(new RegExp(`"id":"${id}","edge":"(\\w+)"`, "g")),
    ].map((m) => m[1]);
    expect(mine.sort()).toEqual(["ne", "nw", "se", "sw"]);
    expect(modes.every((m) => ["ne", "nw", "se", "sw"].includes(m))).toBe(true);
  });

  test("a frame is never made smaller than the least, and the side that is not held does not move for it", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("home");
    s.send("frameAdd");
    const id = framesOf(model(s)).at(-1)!.id;
    const f = findFrame(model(s), id)!;
    const z = s.state.vp.z;
    s.send("frameSize", { id, edge: "nw" });
    s.send("dragMove", { x: 0, y: 0, done: false });
    s.send("dragMove", { x: 5000 * z, y: 0, done: true });
    const g = findFrame(model(s), id)!;
    expect(g.w).toBe(FRAME_MIN_W);
    expect(g.x + g.w).toBe(f.x + f.w);
  });

  test("a resize that ends where it began is no step of the history", () => {
    const s = ready().send("frameAdd");
    const id = framesOf(model(s)).at(-1)!.id;
    const steps = s.state.hist.past.length;
    s.send("frameSize", { id, edge: "se" });
    s.send("dragMove", { x: 5, y: 5, done: false });
    s.send("dragMove", { x: 5, y: 5, done: true });
    expect(s.state.hist.past.length).toBe(steps);
  });

  test("a component is free on the plot: dragged anywhere, outside any frame, it is attached to none", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("home");
    const placed = layoutOf(model(s));
    const h = placed.nodes.find((n) => n.node.kind === "handler")!;
    s.send("nodeDown", { id: h.id, x: h.x + 5, y: h.y + 5 });
    // far from every frame, above them
    s.send("cvMove", { x: h.x + 50, y: h.y + 30 });
    s.send("cvMove", { x: h.x + 80, y: -400 });
    expect(s.state.drag).toMatchObject({ kind: "node", frame: "" });
    s.send("cvUp");
    const after = layoutOf(model(s)).nodes.find((n) => n.id === h.id)!;
    expect(after.y).toBeLessThan(0);
    expect(findNode(model(s), h.id)!.frame).toBeUndefined();
    // and it runs as its kind
    expect(laneOf(findNode(model(s), h.id)!)).toBe("app");
  });

  test("a component dropped on a frame is attached to it, lit while it is over it, and the frame's role is its", () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("home");
    s.send("frameAdd");
    const id = framesOf(model(s)).at(-1)!.id;
    s.send("frameRole", id, { value: "browser" });
    const f = findFrame(model(s), id)!;
    const h = layoutOf(model(s)).nodes.find((n) => n.node.kind === "handler")!;
    s.send("nodeDown", { id: h.id, x: h.x + 5, y: h.y + 5 });
    s.send("cvMove", { x: h.x + 40, y: h.y + 40 });
    s.send("cvMove", { x: f.x + f.w / 2 + 5, y: f.y + f.h / 2 + 5 });
    expect(s.state.drag).toMatchObject({ frame: id });
    // the frame is lit while the component is over it
    const lit = JSON.stringify(trees(coreFrom(s.state))[0].tree);
    expect(lit).toContain("is-target");
    s.send("cvUp");
    const n = findNode(model(s), h.id)!;
    expect(n.frame).toBe(id);
    expect(laneOf(n)).toBe("browser");
    // dragged out again, it is let go
    const p = layoutOf(model(s)).nodes.find((x) => x.id === h.id)!;
    s.send("nodeDown", { id: h.id, x: p.x + 5, y: p.y + 5 });
    s.send("cvMove", { x: p.x + 40, y: p.y + 40 });
    s.send("cvMove", { x: f.x + f.w + 600, y: f.y - 500 });
    s.send("cvUp");
    expect(findNode(model(s), h.id)!.frame).toBeUndefined();
    expect(laneOf(findNode(model(s), h.id)!)).toBe("app");
  });

  test("the frames are on the board with their names, and nothing is lit when nothing is dragged", () => {
    const s = ready().send("frameAdd");
    const id = framesOf(model(s)).at(-1)!.id;
    s.send("frameName", id, { value: "Queue" });
    const text = JSON.stringify(trees(coreFrom(s.state))[0].tree);
    expect(text).toContain("Queue");
    expect(text).not.toContain("is-target");
    expect(text).toContain('"id":"frameDown"');
    expect(text).toContain('"id":"frameSize"');
  });

  test("auto layout puts the components in their frames and lets a frame grow to hold them", () => {
    const s = ready();
    s.send("frameAdd");
    s.send("autoLayoutAll");
    const m = model(s);
    for (const n of m.nodes.filter((x) => x.frame)) {
      const f = findFrame(m, n.frame!)!;
      expect(n.x).toBeGreaterThanOrEqual(f.x);
      expect(n.y).toBeGreaterThanOrEqual(f.y);
      expect(n.x + 140).toBeLessThanOrEqual(f.x + f.w + 1);
    }
  });

  test("a module's body has frames of its own", () => {
    expect(GUTTER).toBeGreaterThan(0);
  });

  test("the panels are hidden until asked for", () => {
    const s = ready();
    expect(s.state.sideOpen).toBe(false);
    s.send("toggleSide");
    expect(s.state.sideOpen).toBe(true);
  });

  test("leaving the page ends the full screen", () => {
    const s = ready();
    const fx = page.dispatch({ id: "leave" } as Message, s.state);
    expect(fx).toContainEqual(
      expect.objectContaining({ type: "set", path: "full", value: false }),
    );
  });
});

describe("the helpers of the page (the local plugin)", () => {
  const frame = (): {
    doc: Document;
    ctx: { sent: Message[] };
    run: (e: Effect) => void;
  } => {
    document.body.innerHTML = `<div class="fs"><div id="fs-flow" style="width:300px;height:200px"></div></div>`;
    const el = document.querySelector("#fs-flow") as HTMLElement;
    el.getBoundingClientRect = () =>
      ({
        width: 300,
        height: 200,
        left: 10,
        top: 20,
        right: 310,
        bottom: 220,
        x: 10,
        y: 20,
      }) as DOMRect;
    const plugin = createLocalPlugin({ document });
    const sent: Message[] = [];
    const ctx = {
      dispatch: (m: Message) => void sent.push(m),
      getState: () => ({}),
      dispatchEffect: () => {},
    };
    return {
      doc: document,
      ctx: { sent },
      run: (e) => (plugin.handle as (e: Effect, c: typeof ctx) => void)(e, ctx),
    };
  };

  test("watch tells the size of the element now", () => {
    const f = frame();
    f.run(local.watch("#fs-flow", "size"));
    expect(f.ctx.sent).toEqual([{ id: "size", payload: { w: 300, h: 200 } }]);
  });

  test("two elements can be watched at once", () => {
    const f = frame();
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="fs-minimap"></div>',
    );
    (
      document.querySelector("#fs-minimap") as HTMLElement
    ).getBoundingClientRect = () =>
      ({ width: 210, height: 90, left: 0, top: 0 }) as DOMRect;
    f.run(local.watch("#fs-flow", "size"));
    f.run(local.watch("#fs-minimap", "mini"));
    expect(f.ctx.sent.map((m) => m.id)).toEqual(["size", "mini"]);
    // asking again for one replaces that one, and not the other
    window.dispatchEvent(new Event("resize"));
    expect(f.ctx.sent.map((m) => m.id)).toEqual(["size", "mini"]);
  });

  test("wheel with Shift is zoom: the page does not scroll, and the pointer is from the corner of the element", () => {
    const f = frame();
    f.run(local.wheel("#fs-flow", "wheel"));
    const el = document.querySelector("#fs-flow")!;
    const shift = new WheelEvent("wheel", {
      deltaY: -100,
      shiftKey: true,
      clientX: 110,
      clientY: 70,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(shift);
    expect(shift.defaultPrevented).toBe(true);
    expect(f.ctx.sent).toEqual([
      { id: "wheel", payload: { dy: -100, x: 100, y: 50, w: 300, h: 200 } },
    ]);
    // a plain wheel is the page's
    const plain = new WheelEvent("wheel", {
      deltaY: -100,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect(f.ctx.sent).toHaveLength(1);
    // and a wheel over something else is none of this
    document.body.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: 5,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(f.ctx.sent).toHaveLength(1);
  });

  test("two fingers on the element are a pinch: a wheel that zooms by the ratio of the distances", () => {
    const f = frame();
    f.run(local.wheel("#fs-flow", "wheel"));
    const el = document.querySelector("#fs-flow")!;
    const touch = (type: string, pts: [number, number][]) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(e, "touches", {
        value: pts.map(([clientX, clientY]) => ({
          clientX,
          clientY,
          target: el,
        })),
      });
      el.dispatchEvent(e);
      return e;
    };
    touch("touchstart", [
      [110, 70],
      [210, 70],
    ]);
    // the fingers spread to twice the distance: the zoom doubles
    const e = touch("touchmove", [
      [60, 70],
      [260, 70],
    ]);
    expect(e.defaultPrevented).toBe(true);
    const m = f.ctx.sent.at(-1)!.payload as {
      dy: number;
      x: number;
      y: number;
    };
    expect(Math.exp(-m.dy * 0.0018)).toBeCloseTo(2);
    // the middle of the fingers is the point that stays
    expect([m.x, m.y]).toEqual([150, 50]);
    // one finger is a pan, not a pinch
    const n = f.ctx.sent.length;
    touch("touchend", [[60, 70]]);
    touch("touchmove", [[70, 70]]);
    expect(f.ctx.sent).toHaveLength(n);
  });

  test("a pinch zooms about where the fingers were and carries the board with them", () => {
    const f = frame();
    f.run(local.wheel("#fs-flow", "wheel"));
    const el = document.querySelector("#fs-flow")!;
    const touch = (type: string, pts: [number, number][]) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(e, "touches", {
        value: pts.map(([clientX, clientY]) => ({
          clientX,
          clientY,
          target: el,
        })),
      });
      el.dispatchEvent(e);
    };
    touch("touchstart", [
      [110, 70],
      [210, 70],
    ]);
    // spread by 2 and the middle goes 30 right, 10 down
    touch("touchmove", [
      [90, 80],
      [290, 80],
    ]);
    const m = f.ctx.sent.at(-1)!.payload as Record<string, number>;
    expect([m.x, m.y]).toEqual([150, 50]);
    expect([m.mx, m.my]).toEqual([30, 10]);
    // the next step is about where the fingers are now
    touch("touchmove", [
      [80, 80],
      [300, 80],
    ]);
    const n = f.ctx.sent.at(-1)!.payload as Record<string, number>;
    expect([n.x, n.y, n.mx, n.my]).toEqual([180, 60, 0, 0]);
  });

  test("a second finger ends the drag of the first one, where it was, as cancelled", () => {
    const f = frame();
    f.run(local.wheel("#fs-flow", "wheel"));
    f.run(local.drag("moved"));
    const el = document.querySelector("#fs-flow")!;
    const move = new Event("pointermove");
    Object.assign(move, { clientX: 10, clientY: 20, isPrimary: true });
    window.dispatchEvent(move);
    const down = new Event("touchstart", { bubbles: true });
    Object.defineProperty(down, "touches", {
      value: [
        { clientX: 10, clientY: 20, target: el },
        { clientX: 90, clientY: 20, target: el },
      ],
    });
    el.dispatchEvent(down);
    expect(f.ctx.sent.at(-1)!.payload).toMatchObject({
      x: 10,
      y: 20,
      done: true,
      cancel: true,
    });
    // and the first finger is not followed any more
    const n = f.ctx.sent.length;
    window.dispatchEvent(move);
    expect(f.ctx.sent).toHaveLength(n);
  });

  test("a drag asked for after a second finger went down does not start", () => {
    document.body.innerHTML = "<div></div>";
    const plugin = createLocalPlugin({ document });
    const sent: Message[] = [];
    const ctx = {
      dispatch: (m: Message) => void sent.push(m),
      getState: () => ({}),
      dispatchEffect: () => {},
    };
    plugin.init?.(ctx);
    const run = (e: Effect) =>
      (plugin.handle as (e: Effect, c: typeof ctx) => void)(e, ctx);
    const down = (isPrimary: boolean) => {
      const e = new Event("pointerdown", { bubbles: true });
      Object.assign(e, { clientX: 5, clientY: 6, isPrimary });
      document.body.dispatchEvent(e);
    };
    const move = () =>
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 9, clientY: 9 }),
      );
    down(false);
    run(local.drag("moved"));
    move();
    expect(sent).toHaveLength(0);
    // the next press of a first finger is followed again
    down(true);
    run(local.drag("moved"));
    move();
    expect(sent.length).toBeGreaterThan(0);
    plugin.dispose?.();
  });

  test("a second finger is not the pointer a drag follows", () => {
    const f = frame();
    f.run(local.drag("moved"));
    const move = (isPrimary: boolean, x: number) => {
      const e = new Event("pointermove");
      Object.assign(e, { clientX: x, clientY: 0, isPrimary });
      window.dispatchEvent(e);
    };
    move(true, 10);
    move(false, 500);
    const xs = f.ctx.sent.map((m) => (m.payload as { x: number }).x);
    expect(xs).toEqual([10]);
  });

  test("drag follows the pointer off the element and ends with done", () => {
    const f = frame();
    f.run(local.drag("moved"));
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 5, clientY: 6 }),
    );
    window.dispatchEvent(
      new MouseEvent("pointerup", { clientX: 7, clientY: 8 }),
    );
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 9, clientY: 9 }),
    );
    expect(f.ctx.sent.map((m) => m.payload)).toEqual([
      { x: 5, y: 6, done: false, over: null },
      { x: 7, y: 8, done: true, over: null },
    ]);
  });

  test("a drag starts where the pointer went down, even when the first move is at the far end", () => {
    const f = frame();
    // the page's plugin listens for the press
    const plugin = createLocalPlugin({ document });
    const sent: Message[] = [];
    const ctx = {
      dispatch: (m: Message) => void sent.push(m),
      getState: () => ({}),
      dispatchEffect: () => {},
    };
    plugin.init?.(ctx);
    document.body.dispatchEvent(
      new MouseEvent("pointerdown", {
        clientX: 100,
        clientY: 200,
        bubbles: true,
      }),
    );
    (plugin.handle as (e: Effect, c: typeof ctx) => void)(
      local.drag("moved"),
      ctx,
    );
    // a quick drag: one move, at the end, then the release
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 400, clientY: 260 }),
    );
    window.dispatchEvent(
      new MouseEvent("pointerup", { clientX: 400, clientY: 260 }),
    );
    expect(sent.map((m) => m.payload)).toEqual([
      { x: 100, y: 200, done: false, over: null },
      { x: 400, y: 260, done: false, over: null },
      { x: 400, y: 260, done: true, over: null },
    ]);
    plugin.dispose?.();
    void f;
  });

  test("a drag says what it is over: the data-drop of the element under the pointer, or of its ancestor", () => {
    const f = frame();
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div data-drop="s1|3|2"><span id="inner"></span></div>',
    );
    const inner = document.querySelector("#inner");
    (
      document as unknown as { elementFromPoint: () => Element | null }
    ).elementFromPoint = () => inner;
    f.run(local.drag("moved"));
    window.dispatchEvent(
      new MouseEvent("pointermove", { clientX: 1, clientY: 2 }),
    );
    (
      document as unknown as { elementFromPoint: () => Element | null }
    ).elementFromPoint = () => document.body;
    window.dispatchEvent(
      new MouseEvent("pointerup", { clientX: 3, clientY: 4 }),
    );
    expect(
      f.ctx.sent.map((m) => (m.payload as { over: string | null }).over),
    ).toEqual(["s1|3|2", null]);
    delete (document as unknown as { elementFromPoint?: unknown })
      .elementFromPoint;
  });

  test("fullscreen: the browser's, or the page's own when it has none", () => {
    const f = frame();
    const el = document.querySelector(".fs") as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
    };
    el.requestFullscreen = () => Promise.reject(new Error("no"));
    f.run(local.fullscreen(".fs", "full"));
    return Promise.resolve().then(() => {
      expect(f.ctx.sent.at(-1)).toEqual({ id: "full", payload: { on: true } });
      f.run(local.fullscreen(".fs", "full"));
      expect(f.ctx.sent.at(-1)).toEqual({ id: "full", payload: { on: false } });
    });
  });
});

describe("the dock: drag a component from the top of the board onto the plot", () => {
  const board = () => {
    const s = ready().send("boardSize", { w: 1500, h: 520 });
    s.send("home");
    return s;
  };
  /** press at (100,20), move far enough, let go at (rx, ry) of the board */
  const drag = (
    s: Sim,
    what: unknown[],
    to: { rx: number; ry: number; inside: boolean },
  ) => {
    s.send("dockDown", what);
    s.send("dragMove", { x: 100, y: 20, done: false });
    s.send("dragMove", { x: 400, y: 300, done: false, ...to });
    return s;
  };

  test("pressing an icon follows the pointer on the board, and is not yet a component", () => {
    const s = board();
    const n = model(s).nodes.length;
    expect(s.send("dockDown", ["handler", "orders.list"]).last).toContainEqual(
      local.drag("dragMove", "#fs-flow"),
    );
    expect(s.state.drag).toMatchObject({ kind: "add", live: false });
    expect(model(s).nodes.length).toBe(n);
  });

  test("from the list, up and down is the list scrolling: nothing is taken, the list stays", () => {
    const s = board();
    s.send("toggleDockMore");
    const n = model(s).nodes.length;
    s.send("dockDown", ["handler", "orders.list", true]);
    s.send("dragMove", { x: 60, y: 200, done: false });
    s.send("dragMove", {
      x: 62,
      y: 260,
      done: false,
      rx: 62,
      ry: 260,
      inside: true,
    });
    expect(s.state.drag).toBeNull();
    expect(s.state.dockMore).toBe(true);
    s.send("dragMove", {
      x: 70,
      y: 300,
      done: true,
      rx: 70,
      ry: 300,
      inside: true,
    });
    expect(model(s).nodes.length).toBe(n);
  });

  test("from the list, sideways takes the row, and a cancelled gesture drops nothing", () => {
    const s = board();
    s.send("toggleDockMore");
    const n = model(s).nodes.length;
    s.send("dockDown", ["handler", "orders.list", true]);
    s.send("dragMove", { x: 60, y: 200, done: false });
    s.send("dragMove", {
      x: 200,
      y: 210,
      done: false,
      rx: 200,
      ry: 210,
      inside: true,
    });
    expect(s.state.drag).toMatchObject({ kind: "add", live: true });
    s.send("dragMove", {
      x: 220,
      y: 210,
      done: true,
      cancel: true,
      rx: 220,
      ry: 210,
      inside: true,
    });
    expect(s.state.drag).toBeNull();
    expect(model(s).nodes.length).toBe(n);
  });

  test("dragged over the board it shows where it would be, and the drop puts it there, centered", () => {
    const s = board();
    const n = model(s).nodes.length;
    drag(s, ["handler", "orders.list"], { rx: 600, ry: 250, inside: true });
    expect(s.state.drag).toMatchObject({
      kind: "add",
      live: true,
      inside: true,
    });
    // the ghost is on the board while it is dragged
    const ghost = JSON.stringify(trees(coreFrom(s.state))[0].tree);
    expect(ghost).toContain("fs-ghost");
    s.send("dragMove", {
      x: 400,
      y: 300,
      done: true,
      rx: 600,
      ry: 250,
      inside: true,
    });
    expect(model(s).nodes.length).toBe(n + 1);
    const made = model(s).nodes.find((x) => x.title === "orders.list")!;
    expect(made.kind).toBe("handler");
    const z = s.state.vp.z;
    expect(made.x).toBeCloseTo(s.state.vp.x + 600 / z - 70, -1);
    expect(s.state.drag).toBeNull();
    // one step of the history
    s.send("undo");
    expect(model(s).nodes.length).toBe(n);
  });

  test("let go outside the board, or without moving, adds nothing: it is not a click that adds", () => {
    const s = board();
    const n = model(s).nodes.length;
    s.send("dockDown", ["handler", "x"]);
    s.send("dragMove", { x: 100, y: 20, done: false });
    s.send("dragMove", {
      x: 100,
      y: 20,
      done: true,
      rx: 5,
      ry: 5,
      inside: true,
    });
    expect(model(s).nodes.length).toBe(n);
    drag(s, ["handler", "x"], { rx: 0, ry: 0, inside: false });
    s.send("dragMove", {
      x: 400,
      y: 300,
      done: true,
      rx: 0,
      ry: 0,
      inside: false,
    });
    expect(model(s).nodes.length).toBe(n);
    expect(s.state.drag).toBeNull();
  });

  test("dropped on a frame it belongs to that frame", () => {
    const s = board();
    s.send("frameAdd");
    const f = framesOf(model(s)).at(-1)!;
    const z = s.state.vp.z;
    const rx = (f.x + f.w / 2 - s.state.vp.x) * z;
    const ry = (f.y + f.h / 2 - s.state.vp.y) * z;
    drag(s, ["route", "GET /x"], { rx, ry, inside: true });
    s.send("dragMove", { x: 400, y: 300, done: true, rx, ry, inside: true });
    const made = model(s).nodes.find((x) => x.title === "GET /x");
    expect(made?.frame).toBe(f.id);
  });

  test("the keyboard puts it in the middle of the board: Enter, not a click", () => {
    const s = board();
    const n = model(s).nodes.length;
    expect(
      s.send("dockKey", ["effect", "pg.query"], { key: "a" }).last,
    ).toEqual([]);
    s.send("dockKey", ["effect", "pg.query"], { key: "Enter" });
    expect(model(s).nodes.length).toBe(n + 1);
  });

  test("the more button opens the whole list", () => {
    const s = board();
    expect(s.state.dockMore).toBe(false);
    expect(s.send("toggleDockMore").state.dockMore).toBe(true);
    expect(s.send("toggleDockMore").state.dockMore).toBe(false);
  });

  test("a component dragged out of the list closes it, and the list is out of the way while it is on its way", () => {
    const s = board();
    s.send("toggleDockMore");
    s.send("dockDown", ["effect", "pg.query"]);
    s.send("dragMove", { x: 100, y: 20, done: false });
    expect(s.state.drag).toMatchObject({ live: false });
    s.send("dragMove", {
      x: 300,
      y: 20,
      done: false,
      rx: 200,
      ry: 200,
      inside: true,
    });
    expect(s.state.drag).toMatchObject({ kind: "add", live: true });
    expect(s.state.dockMore).toBe(true);
    s.send("dragMove", {
      x: 300,
      y: 20,
      done: true,
      rx: 200,
      ry: 200,
      inside: true,
    });
    expect(s.state.drag).toBeNull();
    expect(s.state.dockMore).toBe(false);
  });

  test("the dock lists the kinds that are put on a board", () => {
    expect(board().state.dock.map((k) => k.kind)).toEqual(
      expect.arrayContaining(["ui-event", "handler", "route", "effect"]),
    );
    expect(board().state.dock.map((k) => k.kind)).not.toContain("module");
  });
});
