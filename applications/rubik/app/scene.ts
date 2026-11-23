// The cube as drawings: a 3D scene for the canvas3d plugin and the flat net
// (the unfolded cross) as plain canvas ops. Pure functions of the stickers.
import type { CanvasOp } from "@pavlus/client/plugins/canvas";
import type {
  Camera3,
  Poly3,
  Scene3,
  Vec3,
} from "@pavlus/client/plugins/canvas3d";
import {
  angleOf,
  COLOR,
  type Face,
  FACES,
  faceNow,
  inLayer,
  type Move,
  NORMAL,
  rotate,
  type Sticker,
  type Vec,
} from "./cube.ts";

const BODY = "#0c0c0f";
const INSET = 0.43; // half the side of a sticker, in cubie units (a cubie is 1 wide)

const add = (a: Vec, b: Vec): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** two unit vectors that span the plane of a face */
function tangents(n: Vec): [Vec, Vec] {
  if (n[1] !== 0)
    return [
      [1, 0, 0],
      [0, 0, n[1]],
    ];
  if (n[0] !== 0)
    return [
      [0, 1, 0],
      [0, 0, n[0] * -1],
    ];
  return [
    [1, 0, 0],
    [0, n[2], 0],
  ];
}

/** a square on the face `n` of the cubie at `p`, `half` wide, counter-clockwise from outside */
function square(p: Vec, n: Vec, half: number, lift: number): Vec3[] {
  const [u, v] = tangents(n);
  const c = add(p, mul(n, 0.5 + lift));
  const corner = (a: number, b: number) =>
    add(c, add(mul(u, a * half), mul(v, b * half)));
  const q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  // `tangents` is not always right-handed with n: flip when its normal points inwards
  const [a, b, d] = [q[0], q[1], q[2]];
  const cr = [
    (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]),
    (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]),
    (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]),
  ];
  return cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0 ? q : q.reverse();
}

const POSITIONS: Vec[] = [];
for (let x = -1; x <= 1; x++)
  for (let y = -1; y <= 1; y++)
    for (let z = -1; z <= 1; z++) if (x || y || z) POSITIONS.push([x, y, z]);

/** `turn` is the move in flight and how far it has got (0..1). */
export function polysOf(
  stickers: Sticker[],
  turn: { move: Move; t: number } | null,
): Poly3[] {
  const polys: Poly3[] = [];
  const spin = (v: Vec, face: Face, m: Move, t: number): Vec3 =>
    rotate(v, NORMAL[face], angleOf(m, t));
  const place = (pts: Vec3[], layer: boolean): Vec3[] =>
    turn && layer
      ? pts.map((q) => spin(q, turn.move.face, turn.move, turn.t))
      : pts;
  const inTurn = (p: Vec) =>
    turn ? inLayer({ p, n: p, c: "U" }, turn.move.face) : false;

  // the dark body of every cubie: six faces, so a turning layer shows no holes
  for (const p of POSITIONS) {
    const layer = inTurn(p);
    for (const f of FACES) {
      const n = NORMAL[f];
      polys.push({
        points: place(square(p, n, 0.5, 0), layer),
        normal: place([n as Vec3], layer)[0],
        fill: BODY,
        stroke: BODY,
        lineWidth: 1,
      });
    }
  }
  for (const s of stickers) {
    const layer = inTurn(s.p);
    polys.push({
      points: place(square(s.p, s.n, INSET, 0.004), layer),
      normal: place([s.n as Vec3], layer)[0],
      fill: COLOR[s.c],
      tag: `${s.p.join(",")}|${faceNow(s)}`,
    });
  }
  return polys;
}

export const sceneOf = (
  stickers: Sticker[],
  turn: { move: Move; t: number } | null,
  camera: Camera3,
): Scene3 => ({
  camera,
  polys: polysOf(stickers, turn),
  background: "#16161d",
});

// ---------------------------------------------------------------- flat net

/** how each face is read when it is unfolded: the direction of its columns and rows */
const READ: Record<Face, { right: Vec; down: Vec; at: [number, number] }> = {
  U: { right: [1, 0, 0], down: [0, 0, 1], at: [1, 0] },
  L: { right: [0, 0, 1], down: [0, -1, 0], at: [0, 1] },
  F: { right: [1, 0, 0], down: [0, -1, 0], at: [1, 1] },
  R: { right: [0, 0, -1], down: [0, -1, 0], at: [2, 1] },
  B: { right: [-1, 0, 0], down: [0, -1, 0], at: [3, 1] },
  D: { right: [1, 0, 0], down: [0, 0, -1], at: [1, 2] },
};

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** where the sticker sits in the net, in cells (a face is 3 × 3 cells, the net 12 × 9) */
export function netCell(s: Sticker): { x: number; y: number } {
  const f = faceNow(s);
  const r = READ[f];
  return {
    x: r.at[0] * 3 + dot(s.p, r.right) + 1,
    y: r.at[1] * 3 + dot(s.p, r.down) + 1,
  };
}

export const NET_COLS = 12;
export const NET_ROWS = 9;

/** The flat diagram: every face unfolded in the cross, the centre letters on top. */
export function netOps(
  stickers: Sticker[],
  size: { width: number; height: number },
): CanvasOp[] {
  const cell = Math.floor(
    Math.min(size.width / NET_COLS, size.height / NET_ROWS),
  );
  const ox = Math.round((size.width - cell * NET_COLS) / 2);
  const oy = Math.round((size.height - cell * NET_ROWS) / 2);
  const ops: CanvasOp[] = [
    { op: "fillStyle", value: "#16161d" },
    { op: "fillRect", x: 0, y: 0, w: size.width, h: size.height },
    { op: "lineWidth", value: 1.5 },
    { op: "strokeStyle", value: BODY },
  ];
  const pad = Math.max(1, Math.round(cell * 0.06));
  for (const s of stickers) {
    const { x, y } = netCell(s);
    ops.push(
      { op: "fillStyle", value: COLOR[s.c] },
      {
        op: "fillRect",
        x: ox + x * cell + pad,
        y: oy + y * cell + pad,
        w: cell - 2 * pad,
        h: cell - 2 * pad,
      },
    );
  }
  ops.push(
    { op: "fillStyle", value: "#16161d" },
    {
      op: "font",
      value: `600 ${Math.round(cell * 0.5)}px system-ui, sans-serif`,
    },
    { op: "textAlign", value: "center" },
    { op: "textBaseline", value: "middle" },
  );
  for (const f of FACES) {
    const [fx, fy] = READ[f].at;
    ops.push({
      op: "fillText",
      text: f,
      x: ox + (fx * 3 + 1.5) * cell,
      y: oy + (fy * 3 + 1.5) * cell,
    });
  }
  return ops;
}

// ------------------------------------------------------------ the rings diagram
//
// The flat diagram of many circles. Three families of three nested circles, one
// family per axis of the cube, one circle per layer: a circle is the ring of 12
// stickers that a turn of that layer carries around. Every sticker lies on
// exactly two rings (the two axes of its face), so its dot sits where two
// circles of different families cross: 3 pairs of families × 9 pairs of circles
// × 2 crossings = 54 places. The geometry never changes; the cube's state is
// mapped onto the places, and a turn slides the dots along the circles.

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** the nine circles: `[axis][layer + 1]` */
export function circlesOf(size: { width: number; height: number }): Circle[][] {
  const s = Math.min(size.width * 0.31, size.height * 0.33);
  const R = s / Math.sqrt(3);
  const cx = size.width / 2;
  const cy = size.height / 2 + s * 0.04;
  const radii = [0.6, 0.77, 0.94].map((k) => k * s);
  // x on top, y at the bottom left, z at the bottom right
  return [90, 210, 330].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const x = cx + R * Math.cos(a);
    const y = cy - R * Math.sin(a);
    return radii.map((r) => ({ x, y, r }));
  });
}

type Pt = { x: number; y: number };

function cross2(a: Circle, b: Circle): [Pt, Pt] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const l = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a.r * a.r - l * l));
  const mx = a.x + (l * dx) / d;
  const my = a.y + (l * dy) / d;
  return [
    { x: mx + (h * dy) / d, y: my - (h * dx) / d },
    { x: mx - (h * dy) / d, y: my + (h * dx) / d },
  ];
}

const axisOf = (v: Vec): number => (v[0] !== 0 ? 0 : v[1] !== 0 ? 1 : 2);

/** where the sticker at cubie `p` facing `n` has its dot */
export function slotOf(circles: Circle[][], p: Vec, n: Vec): Pt {
  const c = axisOf(n);
  const [a, b] = [0, 1, 2].filter((i) => i !== c);
  const [u, v] = cross2(circles[a][p[a] + 1], circles[b][p[b] + 1]);
  // the two crossings are the two faces on axis c: the one farther from c's centre is +
  const centre = circles[c][1];
  const far = (q: Pt) => Math.hypot(q.x - centre.x, q.y - centre.y);
  const [outer, inner] = far(u) >= far(v) ? [u, v] : [v, u];
  return n[c] > 0 ? outer : inner;
}

const wrap = (a: number): number =>
  a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a;

/** every dot where the state and the turn in flight put it */
export function dotsOf(
  stickers: Sticker[],
  turn: { move: Move; t: number } | null,
  circles: Circle[][],
): { x: number; y: number; c: Face }[] {
  return stickers.map((s) => {
    const here = slotOf(circles, s.p, s.n);
    if (!turn || !inLayer(s, turn.move.face)) return { ...here, c: s.c };
    const axis = NORMAL[turn.move.face];
    const a = axisOf(axis);
    const at = (t: number): Pt => {
      const p = rotate(s.p, axis, angleOf(turn.move, t)).map(
        Math.round,
      ) as unknown as Vec;
      const n = rotate(s.n, axis, angleOf(turn.move, t)).map(
        Math.round,
      ) as unknown as Vec;
      return slotOf(circles, p, n);
    };
    const there = at(1);
    if (s.n[a] === 0) {
      // on the ring of this layer: slide along its circle
      const ring = circles[a][s.p[a] + 1];
      const t0 = Math.atan2(here.y - ring.y, here.x - ring.x);
      const d = wrap(Math.atan2(there.y - ring.y, there.x - ring.x) - t0);
      const t1 = t0 + d * turn.t;
      return {
        x: ring.x + ring.r * Math.cos(t1),
        y: ring.y + ring.r * Math.sin(t1),
        c: s.c,
      };
    }
    // the turning face's own stickers: they cross over to their new place
    return {
      x: here.x + (there.x - here.x) * turn.t,
      y: here.y + (there.y - here.y) * turn.t,
      c: s.c,
    };
  });
}

/** The diagram of circles: the nine rings (the turning one lit) and the 54 dots. */
export function ringsOps(
  stickers: Sticker[],
  turn: { move: Move; t: number } | null,
  size: { width: number; height: number },
): CanvasOp[] {
  const circles = circlesOf(size);
  const ops: CanvasOp[] = [
    { op: "fillStyle", value: "#16161d" },
    { op: "fillRect", x: 0, y: 0, w: size.width, h: size.height },
  ];
  const lit = turn ? axisOf(NORMAL[turn.move.face]) : -1;
  const litLayer = turn ? NORMAL[turn.move.face][lit] + 1 : -1;
  circles.forEach((family, a) =>
    family.forEach((ring, l) => {
      const on = a === lit && l === litLayer;
      ops.push(
        { op: "strokeStyle", value: on ? "#7c9cff" : "#4b4b5c" },
        { op: "lineWidth", value: on ? 2.5 : 1.2 },
        { op: "beginPath" },
        {
          op: "arc",
          x: ring.x,
          y: ring.y,
          r: ring.r,
          start: 0,
          end: Math.PI * 2,
        },
        { op: "stroke" },
      );
    }),
  );
  ops.push(
    { op: "lineWidth", value: 1 },
    { op: "strokeStyle", value: "#0c0c0f" },
  );
  for (const d of dotsOf(stickers, turn, circles)) {
    ops.push(
      { op: "fillStyle", value: COLOR[d.c] },
      { op: "beginPath" },
      { op: "arc", x: d.x, y: d.y, r: 7, start: 0, end: Math.PI * 2 },
      { op: "fill" },
      { op: "stroke" },
    );
  }
  return ops;
}
