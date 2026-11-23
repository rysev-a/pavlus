import { describe, expect, it } from "vitest";
import { sceneOps, project } from "@pavlus/client/plugins/canvas3d";
import { validateOps } from "@pavlus/client/plugins/canvas";
import {
  apply,
  applyAll,
  faceNow,
  FACES,
  inverse,
  isSolved,
  scramble,
  solved,
} from "../app/cube.ts";
import {
  circlesOf,
  dotsOf,
  netCell,
  netOps,
  polysOf,
  ringsOps,
  sceneOf,
  slotOf,
} from "../app/scene.ts";

const key = (s: { p: readonly number[]; n: readonly number[] }) =>
  `${s.p}|${s.n}`;

describe("cube", () => {
  it("starts solved with 54 stickers, 9 on each face", () => {
    const c = solved();
    expect(c).toHaveLength(54);
    expect(isSolved(c)).toBe(true);
    for (const f of FACES)
      expect(c.filter((s) => faceNow(s) === f)).toHaveLength(9);
  });

  it("a move turns 8 stickers' places, four of them in a face cycle, and a move then its inverse is the identity", () => {
    for (const f of FACES) {
      const once = apply(solved(), f);
      expect(isSolved(once)).toBe(false);
      expect(once.filter((s, i) => key(s) !== key(solved()[i]))).toHaveLength(
        20,
      );
      expect(applyAll(once, [inverse(f)]).map(key)).toEqual(solved().map(key));
    }
  });

  it("four quarter turns come back; the sexy move has order 6", () => {
    expect(isSolved(applyAll(solved(), ["R", "R", "R", "R"]))).toBe(true);
    const sexy = ["R", "U", "R'", "U'"];
    expect(isSolved(applyAll(solved(), Array(6).fill(sexy).flat()))).toBe(true);
    expect(isSolved(applyAll(solved(), Array(5).fill(sexy).flat()))).toBe(
      false,
    );
  });

  it("R puts the front's right column on top, like a real cube", () => {
    const c = apply(solved(), "R");
    const onTopRight = c
      .filter((s) => s.p[0] === 1 && faceNow(s) === "U")
      .map((s) => s.c);
    expect(new Set(onTopRight)).toEqual(new Set(["F"]));
  });

  it("scrambles are deterministic and undoable", () => {
    const [a, next] = scramble(1);
    expect(scramble(1)[0]).toEqual(a);
    expect(next).not.toBe(1);
    const mixed = applyAll(solved(), a);
    expect(isSolved(mixed)).toBe(false);
    expect(isSolved(applyAll(mixed, [...a].reverse().map(inverse)))).toBe(true);
  });
});

describe("drawings", () => {
  it("the net gives every sticker its own cell in the 12 × 9 cross", () => {
    for (const c of [solved(), applyAll(solved(), scramble(7)[0])]) {
      const cells = new Set(c.map((s) => `${netCell(s).x},${netCell(s).y}`));
      expect(cells.size).toBe(54);
    }
    const ops = netOps(applyAll(solved(), ["R"]), { width: 360, height: 270 });
    expect(validateOps(ops)).toBeNull();
  });

  it("a solved net shows one colour per 3 × 3 block", () => {
    const by = new Map<string, Set<string>>();
    for (const s of solved()) {
      const { x, y } = netCell(s);
      const k = `${Math.floor(x / 3)},${Math.floor(y / 3)}`;
      by.set(k, (by.get(k) ?? new Set()).add(s.c));
    }
    expect(by.size).toBe(6);
    for (const v of by.values()) expect(v.size).toBe(1);
  });

  it("the 3D scene shows three faces of the cube: 27 stickers", () => {
    const camera = { yaw: -0.6, pitch: 0.5, distance: 14, focal: 700 };
    const polys = polysOf(solved(), null);
    const seen = project({ camera, polys }, { width: 480, height: 400 }).filter(
      (p) => p.poly.tag,
    );
    expect(seen).toHaveLength(27);
    expect(
      validateOps(
        sceneOps(sceneOf(solved(), null, camera), { width: 480, height: 400 }),
      ),
    ).toBeNull();
  });

  it("mid-turn the moving layer is drawn rotated", () => {
    const camera = { yaw: -0.6, pitch: 0.5, distance: 14, focal: 700 };
    const still = polysOf(solved(), null);
    const turning = polysOf(solved(), { move: { face: "U", dir: 1 }, t: 0.5 });
    expect(turning).toHaveLength(still.length);
    expect(turning).not.toEqual(still);
    expect(
      sceneOf(solved(), { move: { face: "U", dir: 1 }, t: 0.5 }, camera).polys,
    ).toHaveLength(still.length);
  });
});

describe("the diagram of circles", () => {
  const size = { width: 440, height: 420 };
  const circles = circlesOf(size);

  it("gives all 54 stickers their own place, at the crossing of two circles", () => {
    const all = solved();
    const places = all.map((s) => slotOf(circles, s.p, s.n));
    expect(
      new Set(places.map((q) => `${Math.round(q.x)},${Math.round(q.y)}`)).size,
    ).toBe(54);
    for (const [q, s] of places.map((q, i) => [q, all[i]] as const)) {
      const on = circles.flatMap((f, a) =>
        f.filter(
          (c, l) =>
            Math.abs(Math.hypot(q.x - c.x, q.y - c.y) - c.r) < 1e-6 &&
            s.p[a] === l - 1,
        ),
      );
      expect(on).toHaveLength(2);
    }
  });

  it("the geometry is fixed: a turn only moves the colours between places", () => {
    const after = applyAll(solved(), ["R", "U'"]);
    const places = (st: typeof after) =>
      new Set(st.map((s) => JSON.stringify(slotOf(circles, s.p, s.n))));
    expect(places(after)).toEqual(places(solved()));
  });

  it("dots slide along a ring mid-turn and land on the next state", () => {
    const move = { face: "U" as const, dir: 1 as const };
    const still = dotsOf(solved(), null, circles);
    const mid = dotsOf(solved(), { move, t: 0.5 }, circles);
    expect(mid).not.toEqual(still);
    const end = dotsOf(solved(), { move, t: 1 }, circles);
    const next = dotsOf(applyAll(solved(), ["U"]), null, circles);
    const key = (d: { x: number; y: number; c: string }) =>
      `${Math.round(d.x)},${Math.round(d.y)},${d.c}`;
    expect(new Set(end.map(key))).toEqual(new Set(next.map(key)));
    expect(validateOps(ringsOps(solved(), { move, t: 0.5 }, size))).toBeNull();
  });
});
