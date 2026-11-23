// The pure app: messages in, effects and state out. No DOM, no canvas.
import type { Message } from "@pavlus/client";
import { describe, expect, it } from "vitest";
import { isSolved } from "../app/cube.ts";
import { drawings, initialState, rubik, step } from "../app/app.ts";

const msg = (id: string, payload?: unknown): Message => ({ id, payload });
const handler = (name: string) =>
  (rubik as unknown as Record<string, (m: Message, s: unknown) => any[]>)[name];
/** the state changes of the store effects (merge and root-level set) as one object */
const merged = (effects: any[]) =>
  Object.assign(
    {},
    ...effects
      .filter((e) => e.plugin === "store")
      .map((e) => (e.type === "merge" ? e.value : { [e.path]: e.value })),
  );

describe("rubik app", () => {
  it("draws the cube twice: 3D through canvas3d and the net through canvas", () => {
    const [d3, flat] = drawings(initialState());
    expect(d3).toMatchObject({
      plugin: "canvas3d",
      type: "render",
      target: "#cube",
    });
    expect(flat).toMatchObject({
      plugin: "canvas",
      type: "draw",
      target: "#net",
    });
  });

  it("a move button queues the move; the clock plays it", () => {
    let s = initialState();
    s = { ...s, ...merged(handler("turn")(msg("turn", "R"), s)) };
    expect(s.queue).toEqual(["R"]);
    expect(s.isBusy).toBe(true);
    const mid = step(s, 100)!;
    expect(mid.turn?.name).toBe("R");
    expect(mid.log).toEqual([]);
    const done = step(mid, 1000)!;
    expect(done.turn).toBeNull();
    expect(done.log).toEqual(["R"]);
    expect(done.count).toBe(1);
    expect(done.isSolved).toBe(false);
    expect(step(done, 16)).toBeNull();
  });

  it("an unknown move is ignored", () => {
    expect(handler("turn")(msg("turn", "X"), initialState())).toEqual([]);
  });

  it("scramble then undo/replay ends unsolved, and the scramble can be played to the end", () => {
    let s = initialState();
    s = { ...s, ...merged(handler("scramble")(msg("scramble"), s)) };
    expect(s.queue).toHaveLength(20);
    for (let i = 0; i < 5000 && step(s, 16); i++) s = step(s, 16)!;
    expect(s.queue).toHaveLength(0);
    expect(s.log).toHaveLength(20);
    expect(s.isSolved).toBe(false);
    expect(isSolved(s.stickers)).toBe(false);
  });

  it("undo plays the inverse of the last move and drops it from the log", () => {
    let s = {
      ...initialState(),
      ...merged(handler("turn")(msg("turn", "U"), initialState())),
    };
    for (let i = 0; i < 100 && step(s, 50); i++) s = step(s, 50)!;
    expect(s.isSolved).toBe(false);
    s = { ...s, ...merged(handler("undo")(msg("undo"), s)) };
    expect(s.queue).toEqual(["U'"]);
    for (let i = 0; i < 100 && step(s, 50); i++) s = step(s, 50)!;
    expect(s.isSolved).toBe(true);
  });

  it("dragging the canvas orbits the camera and redraws", () => {
    let s = initialState();
    s = {
      ...s,
      ...merged(
        handler("mouse")(
          {
            id: "mouse",
            payload: { type: "pointerdown", x: 10, y: 10, down: true },
          },
          s,
        ),
      ),
    };
    expect(s.drag).toEqual({ x: 10, y: 10 });
    const fx = handler("mouse")(
      {
        id: "mouse",
        payload: { type: "pointermove", x: 60, y: 10, down: true },
      },
      s,
    );
    expect(merged(fx).camera.yaw).not.toBe(s.camera.yaw);
    expect(fx.some((e: any) => e.plugin === "canvas3d")).toBe(true);
    const up = handler("mouse")(
      {
        id: "mouse",
        payload: { type: "pointerup", x: 60, y: 10, down: false },
      },
      s,
    );
    expect(up).toEqual([
      expect.objectContaining({ type: "set", path: "drag", value: null }),
    ]);
  });
});
