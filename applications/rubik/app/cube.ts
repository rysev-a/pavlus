// The cube as data: 54 stickers, each with the position of its cubie and the
// face it looks at. A move rotates the stickers of one layer by a quarter turn,
// so there is no permutation table to get wrong. Everything here is pure.

export type Vec = readonly [number, number, number];
export type Face = "U" | "D" | "F" | "B" | "R" | "L";

export interface Sticker {
  /** cubie coordinates, each -1, 0 or 1 */
  p: Vec;
  /** the unit normal of the face the sticker is on */
  n: Vec;
  /** the colour it started with: the face it belongs on in a solved cube */
  c: Face;
}

export const FACES: Face[] = ["U", "L", "F", "R", "B", "D"];

export const NORMAL: Record<Face, Vec> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

export const COLOR: Record<Face, string> = {
  U: "#f5f5f5",
  D: "#ffd500",
  F: "#00a651",
  B: "#0046ad",
  R: "#b71234",
  L: "#ff5800",
};

const faceOf = (n: Vec): Face =>
  FACES.find((f) => NORMAL[f].every((v, i) => v === n[i])) as Face;

export function solved(): Sticker[] {
  const out: Sticker[] = [];
  for (const f of FACES) {
    const n = NORMAL[f];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const p: Vec = [x, y, z];
          if (n[0] * x + n[1] * y + n[2] * z === 1) out.push({ p, n, c: f });
        }
  }
  return out;
}

const clean = (v: number): number => (Object.is(v, -0) ? 0 : Math.round(v));

/** Rotates `v` about the unit `axis` by `angle` radians (right-handed). */
export function rotate(
  v: Vec,
  axis: Vec,
  angle: number,
): [number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
  const cr = [
    axis[1] * v[2] - axis[2] * v[1],
    axis[2] * v[0] - axis[0] * v[2],
    axis[0] * v[1] - axis[1] * v[0],
  ];
  return [0, 1, 2].map((i) => v[i] * c + cr[i] * s + axis[i] * d * (1 - c)) as [
    number,
    number,
    number,
  ];
}

export interface Move {
  face: Face;
  /** 1 = clockwise as seen from outside the face, -1 = counter-clockwise */
  dir: 1 | -1;
}

/** "R" or "R'" */
export function parseMove(name: string): Move | null {
  const m = /^([UDFBRL])('?)$/.exec(name);
  return m ? { face: m[1] as Face, dir: m[2] ? -1 : 1 } : null;
}

export const moveName = (m: Move): string => m.face + (m.dir === -1 ? "'" : "");
export const inverse = (name: string): string =>
  name.endsWith("'") ? name.slice(0, -1) : `${name}'`;

/** Is the sticker in the layer the move turns? */
export function inLayer(s: Sticker, face: Face): boolean {
  const a = NORMAL[face];
  return a[0] * s.p[0] + a[1] * s.p[1] + a[2] * s.p[2] === 1;
}

/** The angle (radians, right-handed about the face's outward axis) of a move turned by `t` of its way. */
export const angleOf = (m: Move, t: number): number =>
  -m.dir * (Math.PI / 2) * t;

/** The stickers after a whole move. */
export function apply(stickers: Sticker[], name: string): Sticker[] {
  const m = parseMove(name);
  if (!m) return stickers;
  const axis = NORMAL[m.face];
  const a = angleOf(m, 1);
  return stickers.map((s) =>
    inLayer(s, m.face)
      ? {
          ...s,
          p: rotate(s.p, axis, a).map(clean) as unknown as Vec,
          n: rotate(s.n, axis, a).map(clean) as unknown as Vec,
        }
      : s,
  );
}

export const applyAll = (stickers: Sticker[], moves: string[]): Sticker[] =>
  moves.reduce(apply, stickers);

export const isSolved = (stickers: Sticker[]): boolean =>
  FACES.every((f) => {
    const own = stickers.filter((s) => faceOf(s.n) === f);
    return own.every((s) => s.c === own[0].c);
  });

/** The face a sticker is looking at now. */
export const faceNow = (s: Sticker): Face => faceOf(s.n);

const MOVES = FACES.flatMap((f) => [f, `${f}'`]);

/** A scramble of `length` moves from a seed: [moves, next seed]. Never turns the same face twice in a row. */
export function scramble(seed: number, length = 20): [string[], number] {
  const moves: string[] = [];
  let s = seed >>> 0;
  while (moves.length < length) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const move = MOVES[(s >>> 16) % MOVES.length];
    if (moves.length && moves[moves.length - 1][0] === move[0]) continue;
    moves.push(move);
  }
  return [moves, s];
}
