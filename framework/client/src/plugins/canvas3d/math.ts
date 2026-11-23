import type { CanvasOp } from "../canvas/mod.ts";

export type Vec3 = readonly [number, number, number];

/**
 * A flat polygon in world space. World is right-handed: x right, y up, z
 * towards the viewer (at yaw 0, pitch 0). List the points counter-clockwise
 * as seen from outside, or give the outward `normal` explicitly.
 */
export interface Poly3 {
  points: readonly Vec3[];
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  /** Outward normal (any length). Derived from the first three points when absent. */
  normal?: Vec3;
  /** Draw this polygon even when it faces away. */
  twoSided?: boolean;
  /** Carried through to `pick` results; the renderer ignores it. */
  tag?: string;
}

export interface Camera3 {
  /** Turn around the vertical axis, radians. */
  yaw: number;
  /** Tilt up (positive) / down, radians; clamped to just under ±π/2 by `orbit`. */
  pitch: number;
  /** Distance from the camera to the origin. */
  distance: number;
  /** Focal length in pixels: bigger = more zoom, flatter perspective at a larger distance. */
  focal: number;
}

export interface Scene3 {
  camera: Camera3;
  polys: readonly Poly3[];
  /** Fill the canvas with this colour first. */
  background?: string;
  /** Skip polygons that face away (default true). */
  cull?: boolean;
}

export interface Size {
  width: number;
  height: number;
}

/** A polygon after projection: screen points, its depth, and what it came from. */
export interface Projected {
  index: number;
  poly: Poly3;
  /** Screen points (CSS px), same order as `poly.points`. */
  screen: [number, number][];
  /** Mean view-space depth: bigger is farther. */
  depth: number;
}

export const defaultCamera: Camera3 = {
  yaw: -0.6,
  pitch: 0.5,
  distance: 14,
  focal: 700,
};

const LIMIT = Math.PI / 2 - 0.01;

/** Turns the camera by a drag of (`dx`, `dy`) pixels. Pure; pitch stays in range. */
export function orbit(
  camera: Camera3,
  dx: number,
  dy: number,
  speed = 0.01,
): Camera3 {
  return {
    ...camera,
    yaw: camera.yaw - dx * speed,
    pitch: Math.max(-LIMIT, Math.min(LIMIT, camera.pitch + dy * speed)),
  };
}

/** World -> view: yaw around y, then pitch around x. The camera sits at (0, 0, distance). */
export function toView(camera: Camera3, p: Vec3): Vec3 {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Projects every polygon, drops the ones behind the camera (and back-facing ones when `cull`), and sorts far to near. */
export function project(scene: Scene3, size: Size): Projected[] {
  const { camera } = scene;
  const cull = scene.cull !== false;
  const cx = size.width / 2;
  const cy = size.height / 2;
  const out: Projected[] = [];
  scene.polys.forEach((poly, index) => {
    const pts = poly.points;
    if (pts.length < 3) return;
    const view = pts.map((p) => toView(camera, p));
    if (cull && !poly.twoSided) {
      const n = poly.normal
        ? sub(toView(camera, poly.normal), toView(camera, [0, 0, 0]))
        : cross(sub(view[1], view[0]), sub(view[2], view[0]));
      const toEye = sub([0, 0, camera.distance], view[0]);
      if (dot(n, toEye) <= 0) return;
    }
    let depthSum = 0;
    const screen: [number, number][] = [];
    for (const v of view) {
      const depth = camera.distance - v[2];
      if (depth <= 0.05) return; // behind (or on) the camera
      depthSum += depth;
      screen.push([
        cx + (camera.focal * v[0]) / depth,
        cy - (camera.focal * v[1]) / depth,
      ]);
    }
    out.push({ index, poly, screen, depth: depthSum / view.length });
  });
  return out.sort((a, b) => b.depth - a.depth || a.index - b.index);
}

/** The ops that draw the scene (painter's algorithm: far polygons first). */
export function sceneOps(scene: Scene3, size: Size): CanvasOp[] {
  const ops: CanvasOp[] = [];
  if (scene.background) {
    ops.push(
      { op: "fillStyle", value: scene.background },
      { op: "fillRect", x: 0, y: 0, w: size.width, h: size.height },
    );
  }
  ops.push({ op: "lineJoin", value: "round" });
  for (const { poly, screen } of project(scene, size)) {
    ops.push({ op: "beginPath" });
    screen.forEach(([x, y], i) =>
      ops.push(i === 0 ? { op: "moveTo", x, y } : { op: "lineTo", x, y }),
    );
    ops.push({ op: "closePath" });
    if (poly.fill) {
      ops.push({ op: "fillStyle", value: poly.fill }, { op: "fill" });
    }
    if (poly.stroke) {
      ops.push(
        { op: "strokeStyle", value: poly.stroke },
        { op: "lineWidth", value: poly.lineWidth ?? 1 },
        { op: "stroke" },
      );
    }
  }
  return ops;
}

/** The nearest polygon under the screen point (`x`, `y`), by its `tag` — or null. */
export function pick(
  scene: Scene3,
  size: Size,
  x: number,
  y: number,
): { index: number; tag?: string } | null {
  const list = project(scene, size);
  for (let i = list.length - 1; i >= 0; i--) {
    if (inside(list[i].screen, x, y)) {
      return { index: list[i].index, tag: list[i].poly.tag };
    }
  }
  return null;
}

function inside(poly: [number, number][], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
}
