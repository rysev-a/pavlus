import { describe, expect, test } from "vitest";
import type { Message, PluginContext } from "../../core/types.ts";
import {
  canvasEffector as canvas,
  createCanvasPlugin,
  validateOps,
  type CanvasOp,
} from "./mod.ts";

/** Records every call and property assignment on the 2d context. */
function fakeContext() {
  const log: unknown[][] = [];
  const props: Record<string, unknown> = {};
  const target = {} as any;
  const proxy: any = new Proxy(target, {
    get(_, k: string) {
      if (k === "__log") return log;
      if (k in props) return props[k];
      return (...args: unknown[]) => {
        log.push([k, ...args]);
        if (k === "createLinearGradient" || k === "createRadialGradient")
          return {
            addColorStop: (...a: unknown[]) => log.push(["stop", ...a]),
          };
      };
    },
    set(_, k: string, v) {
      props[k] = v;
      log.push(["set " + k, v]);
      return true;
    },
  });
  return proxy;
}

class FakeCanvas {
  width = 300;
  height = 150;
  style: Record<string, string> = {};
  ctx = fakeContext();
  listeners = new Map<string, Set<(e: any) => void>>();
  rect = { left: 10, top: 20, width: 100, height: 50 };
  dataUrl = "data:image/png;base64,AAA";
  getContext(kind: string) {
    return kind === "2d" ? this.ctx : null;
  }
  addEventListener(t: string, f: (e: any) => void) {
    (this.listeners.get(t) ?? this.listeners.set(t, new Set()).get(t)!).add(f);
  }
  removeEventListener(t: string, f: (e: any) => void) {
    this.listeners.get(t)?.delete(f);
  }
  getBoundingClientRect() {
    return this.rect;
  }
  emit(t: string, e: object) {
    for (const f of [...(this.listeners.get(t) ?? [])]) f({ type: t, ...e });
  }
  toDataURL(mime?: string, q?: number) {
    return this.dataUrl + (mime ?? "") + (q ?? "");
  }
  get log() {
    return this.ctx.__log as unknown[][];
  }
  count() {
    return [...this.listeners.values()].reduce((n, s) => n + s.size, 0);
  }
}

class FakeImage {
  static all: FakeImage[] = [];
  src = "";
  width = 0;
  height = 0;
  naturalWidth = 16;
  naturalHeight = 8;
  onload: ((e?: unknown) => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  constructor() {
    FakeImage.all.push(this);
  }
}

function setup(extra: Record<string, unknown> = {}) {
  const cv = new FakeCanvas();
  const msgs: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (m) => msgs.push(m),
    getState: () => ({}),
    dispatchEffect: () => {},
  };
  const frames: Array<(t: number) => void> = [];
  const cancelled: number[] = [];
  const plugin = createCanvasPlugin({
    document: { querySelector: (s: string) => (s === "#c" ? cv : null) } as any,
    requestAnimationFrame: (cb) => frames.push(cb),
    cancelAnimationFrame: (h) => cancelled.push(h),
    Image: FakeImage as any,
    devicePixelRatio: 1,
    ...extra,
  });
  const run = (e: any) => plugin.handle(e, ctx);
  /** Runs the newest scheduled frame. */
  const tick = (t: number) => frames.at(-1)!(t);
  return { cv, msgs, plugin, run, frames, cancelled, tick };
}

const names = (cv: FakeCanvas) => cv.log.map((l) => l[0]);

describe("canvas draw", () => {
  test("interprets ops in order inside save/restore", () => {
    const { cv, run } = setup();
    run(
      canvas.draw("#c", [
        { op: "fillStyle", value: "red" },
        { op: "fillRect", x: 1, y: 2, w: 3, h: 4 },
        { op: "beginPath" },
        { op: "arc", x: 5, y: 5, r: 2, start: 0, end: 6 },
        { op: "fill", rule: "evenodd" },
      ]),
    );
    expect(cv.log).toEqual([
      ["save"],
      ["set fillStyle", "red"],
      ["fillRect", 1, 2, 3, 4],
      ["beginPath"],
      ["arc", 5, 5, 2, 0, 6, false],
      ["fill", "evenodd"],
      ["restore"],
    ]);
  });

  test("covers every op kind", () => {
    const { cv, run, msgs } = setup();
    const ops: CanvasOp[] = [
      { op: "strokeRect", x: 0, y: 0, w: 1, h: 1 },
      { op: "clearRect", x: 0, y: 0, w: 1, h: 1 },
      { op: "moveTo", x: 0, y: 0 },
      { op: "lineTo", x: 1, y: 1 },
      { op: "rect", x: 0, y: 0, w: 1, h: 1 },
      { op: "ellipse", x: 0, y: 0, rx: 1, ry: 2, start: 0, end: 3 },
      {
        op: "bezierCurveTo",
        cp1x: 1,
        cp1y: 2,
        cp2x: 3,
        cp2y: 4,
        x: 5,
        y: 6,
      },
      { op: "quadraticCurveTo", cpx: 1, cpy: 2, x: 3, y: 4 },
      { op: "closePath" },
      { op: "stroke" },
      { op: "clip" },
      { op: "fillText", text: "hi", x: 1, y: 2 },
      { op: "fillText", text: "hi", x: 1, y: 2, maxWidth: 9 },
      { op: "strokeText", text: "yo", x: 1, y: 2 },
      { op: "save" },
      { op: "translate", x: 1, y: 2 },
      { op: "rotate", angle: 1 },
      { op: "scale", x: 2, y: 2 },
      { op: "restore" },
      { op: "strokeStyle", value: "blue" },
      { op: "lineWidth", value: 3 },
      { op: "font", value: "10px sans-serif" },
      { op: "globalAlpha", value: 0.5 },
      { op: "lineCap", value: "round" },
      { op: "lineJoin", value: "bevel" },
      { op: "textAlign", value: "center" },
      { op: "textBaseline", value: "middle" },
      { op: "shadowColor", value: "black" },
      { op: "shadowBlur", value: 2 },
      { op: "shadowOffsetX", value: 1 },
      { op: "shadowOffsetY", value: 1 },
      { op: "setLineDash", segments: [2, 3] },
    ];
    run(canvas.draw("#c", ops, { onError: "err" }));
    expect(msgs).toEqual([]);
    const n = names(cv);
    for (const x of [
      "strokeRect",
      "clearRect",
      "moveTo",
      "lineTo",
      "rect",
      "ellipse",
      "bezierCurveTo",
      "quadraticCurveTo",
      "closePath",
      "stroke",
      "clip",
      "fillText",
      "strokeText",
      "translate",
      "rotate",
      "scale",
      "set strokeStyle",
      "set lineWidth",
      "set font",
      "set globalAlpha",
      "set lineCap",
      "set lineJoin",
      "set textAlign",
      "set textBaseline",
      "set shadowColor",
      "set shadowBlur",
      "set shadowOffsetX",
      "set shadowOffsetY",
      "setLineDash",
    ])
      expect(n).toContain(x);
    expect(cv.log).toContainEqual(["fillText", "hi", 1, 2, 9]);
  });

  test("gradients are defined by name and used as styles", () => {
    const { cv, run, msgs } = setup();
    run(
      canvas.draw("#c", [
        {
          op: "linearGradient",
          name: "g",
          x0: 0,
          y0: 0,
          x1: 10,
          y1: 0,
          stops: [
            { offset: 0, color: "red" },
            { offset: 1, color: "blue" },
          ],
        },
        {
          op: "radialGradient",
          name: "r",
          x0: 0,
          y0: 0,
          r0: 1,
          x1: 0,
          y1: 0,
          r1: 5,
          stops: [{ offset: 0.5, color: "green" }],
        },
        { op: "fillStyle", value: { gradient: "g" } },
        { op: "strokeStyle", value: { gradient: "r" } },
      ]),
    );
    expect(msgs).toEqual([]);
    expect(cv.log).toContainEqual(["createLinearGradient", 0, 0, 10, 0]);
    expect(cv.log).toContainEqual(["createRadialGradient", 0, 0, 1, 0, 0, 5]);
    expect(cv.log).toContainEqual(["stop", 1, "blue"]);
    const fs = cv.log.find((l) => l[0] === "set fillStyle")![1];
    expect(fs).toHaveProperty("addColorStop");
  });

  test("clear wipes the full backing store ignoring the transform", () => {
    const { cv, run } = setup();
    run(canvas.draw("#c", [], { clear: true }));
    expect(cv.log).toEqual([
      ["save"],
      ["save"],
      ["setTransform", 1, 0, 0, 1, 0, 0],
      ["clearRect", 0, 0, 300, 150],
      ["restore"],
      ["restore"],
    ]);
  });

  test("unbalanced saves are restored; setTransform respects dpr", () => {
    const { cv, run } = setup();
    run(canvas.size("#c", 100, 50, 2));
    cv.log.length = 0;
    run(
      canvas.draw("#c", [
        { op: "save" },
        { op: "setTransform", a: 1, b: 0, c: 0, d: 1, e: 5, f: 6 },
      ]),
    );
    expect(cv.log).toEqual([
      ["save"],
      ["save"],
      ["setTransform", 2, 0, 0, 2, 0, 0],
      ["transform", 1, 0, 0, 1, 5, 6],
      ["restore"],
      ["restore"],
    ]);
  });

  test("accepts a canvas element as target", () => {
    const { cv, run } = setup();
    run(canvas.draw(cv as any, [{ op: "save" }]));
    expect(names(cv)).toContain("save");
  });

  test("draws an image by id", () => {
    const { cv, run, msgs } = setup();
    run(canvas.loadImage("hero", "a.png", "ok"));
    FakeImage.all.at(-1)!.onload!();
    msgs.length = 0;
    run(
      canvas.draw("#c", [
        { op: "drawImage", image: "hero", x: 1, y: 2 },
        { op: "drawImage", image: "hero", x: 1, y: 2, w: 3, h: 4 },
        {
          op: "drawImage",
          image: "hero",
          x: 1,
          y: 2,
          w: 3,
          h: 4,
          sx: 5,
          sy: 6,
          sw: 7,
          sh: 8,
        },
      ]),
    );
    const calls = cv.log
      .filter((l) => l[0] === "drawImage")
      .map((l) => l.slice(1));
    expect(calls[0]!.slice(1)).toEqual([1, 2]);
    expect(calls[1]!.slice(1)).toEqual([1, 2, 3, 4]);
    expect(calls[2]!.slice(1)).toEqual([5, 6, 7, 8, 1, 2, 3, 4]);
    expect(msgs).toEqual([]);
  });
});

describe("canvas draw errors", () => {
  const bad = (ops: unknown[], extra: Record<string, unknown> = {}) => {
    const t = setup();
    t.run({ ...canvas.draw("#c", ops as any, { onError: "err" }), ...extra });
    return t;
  };

  test("unknown op replies onError and draws nothing (validated up front)", () => {
    const { cv, msgs } = bad([
      { op: "fillRect", x: 0, y: 0, w: 1, h: 1 },
      { op: "eval", code: "alert(1)" },
    ]);
    expect(cv.log).toEqual([]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      id: "err",
      payload: { code: "invalid", index: 1 },
    });
    expect((msgs[0]!.payload as any).message).toContain('unknown op "eval"');
  });

  test("prototype names and non-objects are not ops", () => {
    for (const o of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
    ]) {
      const { msgs, cv } = bad([{ op: o }]);
      expect(msgs[0]!.id).toBe("err");
      expect(cv.log).toEqual([]);
    }
    expect(bad([42]).msgs).toHaveLength(1);
    expect(bad([null]).msgs).toHaveLength(1);
  });

  test("bad fields: missing, NaN, wrong type, bad enum", () => {
    expect(bad([{ op: "fillRect", x: 0, y: 0, w: 1 }]).msgs).toHaveLength(1);
    expect(bad([{ op: "moveTo", x: NaN, y: 0 }]).msgs).toHaveLength(1);
    expect(bad([{ op: "fillText", text: 1, x: 0, y: 0 }]).msgs).toHaveLength(1);
    expect(bad([{ op: "lineCap", value: "pointy" }]).msgs).toHaveLength(1);
    expect(bad([{ op: "setLineDash", segments: [-1] }]).msgs).toHaveLength(1);
    expect(bad([{ op: "fillStyle", value: 5 }]).msgs).toHaveLength(1);
  });

  test("restore without save, undefined gradient, missing image", () => {
    expect(bad([{ op: "restore" }]).msgs).toHaveLength(1);
    expect(
      bad([{ op: "fillStyle", value: { gradient: "nope" } }]).msgs,
    ).toHaveLength(1);
    expect(
      bad([{ op: "drawImage", image: "nope", x: 0, y: 0 }]).msgs,
    ).toHaveLength(1);
  });

  test("drawImage w without h is rejected", () => {
    const t = setup();
    t.run(canvas.loadImage("i", "x"));
    FakeImage.all.at(-1)!.onload!();
    t.run(
      canvas.draw("#c", [{ op: "drawImage", image: "i", x: 0, y: 0, w: 3 }], {
        onError: "err",
      }),
    );
    expect(t.msgs.at(-1)!.id).toBe("err");
  });

  test("ops that is not an array", () => {
    const t = setup();
    t.run({
      plugin: "canvas",
      type: "draw",
      target: "#c",
      ops: "x",
      onError: "e",
    });
    expect(t.msgs[0]!.id).toBe("e");
  });

  test("missing target replies notFound", () => {
    const t = setup();
    t.run(canvas.draw("#nope", [], { onError: "err" }));
    expect(t.msgs[0]).toMatchObject({
      id: "err",
      payload: { code: "notFound" },
    });
  });

  test("without onError, invalid ops throw", () => {
    const t = setup();
    expect(() => t.run(canvas.draw("#c", [{ op: "x" } as any]))).toThrow(
      /unknown op/,
    );
  });

  test("browser rejection mid-draw replies failed and still balances state", () => {
    const t = setup();
    const g = t.cv.ctx;
    const orig = g.fillRect;
    t.cv.getContext = () =>
      new Proxy(g, {
        get: (_, k: string) =>
          k === "fillRect"
            ? () => {
                throw new Error("boom");
              }
            : g[k],
        set: (_, k: string, v) => ((g[k] = v), true),
      });
    void orig;
    t.run(
      canvas.draw(
        "#c",
        [{ op: "save" }, { op: "fillRect", x: 0, y: 0, w: 1, h: 1 }],
        { onError: "err" },
      ),
    );
    expect(t.msgs[0]).toMatchObject({
      id: "err",
      payload: { code: "failed", message: "boom" },
    });
    expect(names(t.cv).filter((n) => n === "restore")).toHaveLength(2);
  });

  test("no 2d context", () => {
    const t = setup();
    t.cv.getContext = () => null as any;
    t.run(canvas.draw("#c", [], { onError: "err" }));
    expect(t.msgs[0]).toMatchObject({ payload: { code: "unsupported" } });
  });
});

describe("validateOps", () => {
  test("accepts empty and valid lists", () => {
    expect(validateOps([])).toBeNull();
    expect(validateOps([{ op: "beginPath" }])).toBeNull();
  });
  test("reports index", () => {
    expect(validateOps([{ op: "save" }, { op: "zzz" }])?.index).toBe(1);
  });
});

describe("canvas loadImage", () => {
  test("replies onSuccess with dimensions and keeps the image", () => {
    const t = setup();
    t.run(canvas.loadImage("a", "a.png", "ok", "bad"));
    const img = FakeImage.all.at(-1)!;
    expect(img.src).toBe("a.png");
    expect(t.plugin.images()).toEqual([]);
    img.onload!();
    expect(t.plugin.images()).toEqual(["a"]);
    expect(t.msgs).toEqual([
      { id: "ok", payload: { id: "a", width: 16, height: 8 } },
    ]);
  });
  test("error replies onError", () => {
    const t = setup();
    t.run(canvas.loadImage("a", "a.png", "ok", "bad"));
    FakeImage.all.at(-1)!.onerror!();
    expect(t.msgs[0]).toMatchObject({ id: "bad", payload: { code: "load" } });
    expect(t.plugin.images()).toEqual([]);
  });
  test("reloading an id replaces it and ignores the stale load", () => {
    const t = setup();
    t.run(canvas.loadImage("a", "1.png", "ok"));
    const first = FakeImage.all.at(-1)!;
    t.run(canvas.loadImage("a", "2.png", "ok"));
    expect(first.onload).toBeNull();
    FakeImage.all.at(-1)!.onload!();
    expect(t.msgs).toHaveLength(1);
  });
  test("unsupported without Image", () => {
    const t = setup({ Image: undefined });
    const real = (globalThis as any).Image;
    delete (globalThis as any).Image;
    try {
      const p = createCanvasPlugin({});
      const msgs: Message[] = [];
      p.handle(canvas.loadImage("a", "x", "ok", "bad"), {
        dispatch: (m) => msgs.push(m),
      } as any);
      expect(msgs[0]).toMatchObject({
        id: "bad",
        payload: { code: "unsupported" },
      });
      // no onError: silent no-op
      expect(() =>
        p.handle(canvas.loadImage("a", "x"), { dispatch() {} } as any),
      ).not.toThrow();
    } finally {
      if (real) (globalThis as any).Image = real;
    }
    void t;
  });
});

describe("canvas size", () => {
  test("scales the backing store and resets the logical transform", () => {
    const { cv, run } = setup();
    run(canvas.size("#c", 100, 50, 2));
    expect(cv.width).toBe(200);
    expect(cv.height).toBe(100);
    expect(cv.style).toEqual({ width: "100px", height: "50px" });
    expect(cv.log).toEqual([["setTransform", 2, 0, 0, 2, 0, 0]]);
  });
  test("dpr defaults to the injected devicePixelRatio", () => {
    const { cv, run } = setup({ devicePixelRatio: () => 1.5 });
    run(canvas.size("#c", 10, 10));
    expect(cv.width).toBe(15);
  });
  test("invalid sizes reply onError", () => {
    const { run, msgs, cv } = setup();
    run({ ...canvas.size("#c", -1, 5), onError: "e" });
    run({ ...canvas.size("#c", 5, 5, 0), onError: "e" });
    expect(msgs.map((m) => m.id)).toEqual(["e", "e"]);
    expect(cv.width).toBe(300);
  });
});

describe("canvas frames", () => {
  test("dispatches time, dt and frame, and keeps scheduling", () => {
    const t = setup();
    t.run(canvas.frames("loop", "onFrame", "#c"));
    expect(t.plugin.frameLoops()).toEqual(["loop"]);
    t.tick(100);
    t.tick(116);
    t.tick(150);
    expect(t.msgs.map((m) => m.payload)).toEqual([
      { time: 100, dt: 0, frame: 0, width: 300, height: 150 },
      { time: 116, dt: 16, frame: 1, width: 300, height: 150 },
      { time: 150, dt: 34, frame: 2, width: 300, height: 150 },
    ]);
    expect(t.msgs[0]!.id).toBe("onFrame");
  });
  test("works without a target", () => {
    const t = setup();
    t.run(canvas.frames("loop", "f"));
    t.tick(5);
    expect(t.msgs[0]!.payload).toEqual({ time: 5, dt: 0, frame: 0 });
  });
  test("stopFrames cancels the pending frame and ignores late ticks", () => {
    const t = setup();
    t.run(canvas.frames("loop", "f"));
    const pending = t.frames.length;
    const cb = t.frames[0]!;
    t.run(canvas.stopFrames("loop"));
    expect(t.plugin.frameLoops()).toEqual([]);
    expect(t.cancelled).toHaveLength(1);
    cb(1);
    expect(t.msgs).toEqual([]);
    expect(t.frames).toHaveLength(pending);
  });
  test("restarting an id replaces the loop", () => {
    const t = setup();
    t.run(canvas.frames("loop", "a"));
    const first = t.frames[0]!;
    t.run(canvas.frames("loop", "b"));
    expect(t.plugin.frameLoops()).toEqual(["loop"]);
    first(1);
    expect(t.msgs).toEqual([]);
    t.tick(2);
    expect(t.msgs[0]!.id).toBe("b");
  });
  test("a handler that stops the loop cancels the next frame", () => {
    const t = setup();
    const ctx: PluginContext = {
      dispatch: () => t.plugin.handle(canvas.stopFrames("loop"), ctx),
      getState: () => ({}),
      dispatchEffect() {},
    };
    t.plugin.handle(canvas.frames("loop", "f"), ctx);
    const n = t.frames.length;
    t.tick(1);
    expect(t.frames.length).toBe(n + 1);
    expect(t.cancelled).toHaveLength(1);
  });
  test("unsupported without requestAnimationFrame", () => {
    const real = globalThis.requestAnimationFrame;
    (globalThis as any).requestAnimationFrame = undefined;
    try {
      const p = createCanvasPlugin({});
      const msgs: Message[] = [];
      p.handle({ ...canvas.frames("l", "f"), onError: "e" }, {
        dispatch: (m: Message) => msgs.push(m),
      } as any);
      expect(msgs[0]).toMatchObject({ payload: { code: "unsupported" } });
    } finally {
      (globalThis as any).requestAnimationFrame = real;
    }
  });
});

describe("canvas pointer", () => {
  test("streams normalized and canvas coordinates", () => {
    const t = setup();
    t.run(canvas.size("#c", 200, 100, 1));
    t.run(canvas.pointer("p", "#c", "onPtr"));
    // rect: left 10 top 20, 100x50 on screen, 200x100 logical
    t.cv.emit("pointermove", {
      clientX: 60,
      clientY: 45,
      buttons: 0,
      button: 0,
    });
    t.cv.emit("pointerdown", {
      clientX: 110,
      clientY: 70,
      buttons: 1,
      button: 0,
    });
    expect(t.msgs).toEqual([
      {
        id: "onPtr",
        payload: {
          type: "pointermove",
          x: 100,
          y: 50,
          nx: 0.5,
          ny: 0.5,
          button: 0,
          buttons: 0,
          down: false,
        },
      },
      {
        id: "onPtr",
        payload: {
          type: "pointerdown",
          x: 200,
          y: 100,
          nx: 1,
          ny: 1,
          button: 0,
          buttons: 1,
          down: true,
        },
      },
    ]);
  });
  test("uses logical size under hi-dpi", () => {
    const t = setup();
    t.run(canvas.size("#c", 100, 50, 2)); // backing 200x100
    t.run(canvas.pointer("p", "#c", "m"));
    t.cv.emit("pointermove", { clientX: 110, clientY: 70, buttons: 0 });
    expect(t.msgs[0]!.payload).toMatchObject({ x: 100, y: 50 });
  });
  test("stopPointer and replacement remove listeners", () => {
    const t = setup();
    t.run(canvas.pointer("p", "#c", "m"));
    const n = t.cv.count();
    expect(n).toBeGreaterThan(0);
    t.run(canvas.pointer("p", "#c", "m2"));
    expect(t.cv.count()).toBe(n);
    t.cv.emit("pointerup", { clientX: 10, clientY: 20, buttons: 0 });
    expect(t.msgs.map((m) => m.id)).toEqual(["m2"]);
    t.run(canvas.stopPointer("p"));
    expect(t.cv.count()).toBe(0);
    expect(t.plugin.pointers()).toEqual([]);
  });
  test("missing target replies onError", () => {
    const t = setup();
    t.run({ ...canvas.pointer("p", "#nope", "m"), onError: "e" });
    expect(t.msgs[0]!.id).toBe("e");
  });
});

describe("canvas snapshot", () => {
  test("replies a data URL", () => {
    const t = setup();
    t.run(canvas.snapshot("#c", "got"));
    expect(t.msgs).toEqual([
      { id: "got", payload: "data:image/png;base64,AAA" },
    ]);
    t.run(canvas.snapshot("#c", "got", { mime: "image/jpeg", quality: 0.5 }));
    expect(t.msgs[1]!.payload).toBe("data:image/png;base64,AAAimage/jpeg0.5");
  });
  test("tainted canvas replies onError", () => {
    const t = setup();
    t.cv.toDataURL = () => {
      throw new Error("tainted");
    };
    t.run(canvas.snapshot("#c", "got", { onError: "bad" }));
    expect(t.msgs[0]).toMatchObject({
      id: "bad",
      payload: { code: "failed", message: "tainted" },
    });
  });
});

describe("canvas environment", () => {
  test("string targets without a document reply unsupported", () => {
    const real = (globalThis as any).document;
    const p = createCanvasPlugin({ document: undefined });
    const msgs: Message[] = [];
    const ctx = { dispatch: (m: Message) => msgs.push(m) } as any;
    if (real === undefined) {
      p.handle(canvas.draw("#c", [], { onError: "e" }), ctx);
      expect(msgs[0]).toMatchObject({ payload: { code: "unsupported" } });
      // silent without onError
      expect(() => p.handle(canvas.draw("#c", []), ctx)).not.toThrow();
    }
  });

  test("dispose stops loops, pointers and pending images", () => {
    const t = setup();
    t.run(canvas.frames("l", "f"));
    t.run(canvas.pointer("p", "#c", "m"));
    t.run(canvas.loadImage("i", "x", "ok"));
    const img = FakeImage.all.at(-1)!;
    t.plugin.dispose!();
    expect(t.plugin.frameLoops()).toEqual([]);
    expect(t.plugin.pointers()).toEqual([]);
    expect(t.cv.count()).toBe(0);
    expect(img.onload).toBeNull();
    expect(t.cancelled).toHaveLength(1);
  });
});

describe("canvasEffector", () => {
  test("builds plain data", () => {
    expect(canvas.draw("#c", [], { clear: true })).toEqual({
      plugin: "canvas",
      type: "draw",
      target: "#c",
      ops: [],
      clear: true,
    });
    expect(canvas.stopFrames("x")).toEqual({
      plugin: "canvas",
      type: "stopFrames",
      id: "x",
    });
    expect(canvas.frames("a", "b")).toEqual({
      plugin: "canvas",
      type: "frames",
      id: "a",
      onFrame: "b",
    });
  });
});
