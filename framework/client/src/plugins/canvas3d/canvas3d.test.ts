import { describe, expect, test } from "vitest";
import type { Effect } from "../../core/types.ts";
import { validateOps } from "../canvas/mod.ts";
import {
  canvas3dEffector as canvas3d,
  createCanvas3dPlugin,
  defaultCamera,
  orbit,
  pick,
  project,
  type Poly3,
  type Scene3,
  sceneOps,
} from "./mod.ts";

const size = { width: 400, height: 300 };
const camera = { yaw: 0, pitch: 0, distance: 10, focal: 400 };

/** a unit cube face at z = +1 and one at z = -1, both with outward normals */
const front: Poly3 = {
  points: [
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ],
  fill: "red",
  tag: "front",
};
const back: Poly3 = {
  points: [
    [1, -1, -1],
    [-1, -1, -1],
    [-1, 1, -1],
    [1, 1, -1],
  ],
  fill: "blue",
  tag: "back",
};

describe("project", () => {
  test("culls the face turned away and keeps the near one", () => {
    const list = project({ camera, polys: [front, back] }, size);
    expect(list.map((p) => p.poly.tag)).toEqual(["front"]);
  });

  test("the winding gives the same answer as an explicit normal", () => {
    const withNormals = [
      { ...front, normal: [0, 0, 1] as const },
      { ...back, normal: [0, 0, -1] as const },
    ];
    expect(
      project({ camera, polys: withNormals }, size).map((p) => p.poly.tag),
    ).toEqual(["front"]);
  });

  test("twoSided and cull:false keep back faces; far ones are drawn first", () => {
    const all = project({ camera, polys: [front, back], cull: false }, size);
    expect(all.map((p) => p.poly.tag)).toEqual(["back", "front"]);
    const two = project(
      { camera, polys: [front, { ...back, twoSided: true }] },
      size,
    );
    expect(two).toHaveLength(2);
  });

  test("the centre of the scene lands at the centre of the canvas, perspective shrinks far points", () => {
    const [near] = project({ camera, polys: [front] }, size);
    const xs = near.screen.map((p) => p[0]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(200);
    const [far] = project(
      { camera, polys: [{ ...back, twoSided: true }] },
      size,
    );
    const w = (p: typeof near) =>
      Math.max(...p.screen.map((s) => s[0])) -
      Math.min(...p.screen.map((s) => s[0]));
    expect(w(far)).toBeLessThan(w(near));
  });

  test("yaw turns the cube: after a half turn the back face is the visible one", () => {
    const turned = { ...camera, yaw: Math.PI };
    expect(
      project({ camera: turned, polys: [front, back] }, size).map(
        (p) => p.poly.tag,
      ),
    ).toEqual(["back"]);
  });

  test("polygons behind the camera are dropped", () => {
    const behind: Poly3 = {
      points: [
        [0, 0, 20],
        [1, 0, 20],
        [0, 1, 20],
      ],
      twoSided: true,
    };
    expect(project({ camera, polys: [behind] }, size)).toEqual([]);
  });
});

describe("sceneOps", () => {
  test("is a valid canvas op list, background first", () => {
    const scene: Scene3 = {
      camera,
      polys: [{ ...front, stroke: "black" }],
      background: "#111",
    };
    const ops = sceneOps(scene, size);
    expect(validateOps(ops)).toBeNull();
    expect(ops[0]).toEqual({ op: "fillStyle", value: "#111" });
    expect(ops.filter((o) => o.op === "fill")).toHaveLength(1);
    expect(ops.filter((o) => o.op === "stroke")).toHaveLength(1);
  });

  test("is deterministic", () => {
    const scene: Scene3 = { camera: defaultCamera, polys: [front, back] };
    expect(sceneOps(scene, size)).toEqual(sceneOps(scene, size));
  });
});

describe("orbit / pick", () => {
  test("a drag turns yaw and pitch, and pitch is clamped", () => {
    const c = orbit(camera, 100, 50);
    expect(c.yaw).toBeCloseTo(-1);
    expect(c.pitch).toBeCloseTo(0.5);
    expect(orbit(camera, 0, 1e6).pitch).toBeLessThan(Math.PI / 2);
    expect(orbit(camera, 0, -1e6).pitch).toBeGreaterThan(-Math.PI / 2);
  });

  test("pick returns the nearest polygon under the point", () => {
    const scene: Scene3 = { camera, polys: [front, back], cull: false };
    expect(pick(scene, size, 200, 150)?.tag).toBe("front");
    expect(pick(scene, size, 5, 5)).toBeNull();
  });
});

describe("plugin", () => {
  test("render becomes a canvas draw of the projected ops", () => {
    const plugin = createCanvas3dPlugin();
    const seen: Effect[] = [];
    const ctx = {
      dispatch() {},
      getState: () => ({}),
      dispatchEffect: (e: Effect) => void seen.push(e),
    };
    const scene: Scene3 = { camera, polys: [front] };
    plugin.handle(canvas3d.render("#c", scene, size, "bad"), ctx);
    expect(plugin.renders()).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      plugin: "canvas",
      type: "draw",
      target: "#c",
      clear: true,
      onError: "bad",
    });
    expect(seen[0].ops).toEqual(sceneOps(scene, size));
  });
});
