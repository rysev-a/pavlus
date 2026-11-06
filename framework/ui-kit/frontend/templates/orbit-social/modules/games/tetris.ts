// TETRIS, a pure engine: `initial(seed)`, `step(state)` (gravity: one tick) and the
// inputs `move`, `rotate`, `softDrop`, `hardDrop`. The pieces come from a 7-bag
// shuffled with the seeded PRNG kept in the state (no Math.random, no Date).
import { randInt } from "./rng.ts";

export const COLS = 10;
export const ROWS = 20;

/** The 7 pieces, numbered 1..7 in this order (the board stores the number). */
export const PIECES = ["I", "O", "T", "S", "Z", "J", "L"] as const;

const SHAPES: Record<(typeof PIECES)[number], string[]> = {
  I: ["....", "XXXX", "....", "...."],
  O: ["XX", "XX"],
  T: [".X.", "XXX", "..."],
  S: [".XX", "XX.", "..."],
  Z: ["XX.", ".XX", "..."],
  J: ["X..", "XXX", "..."],
  L: ["..X", "XXX", "..."],
};

export type Cell = [number, number];

/** The cells ([dx, dy]) of piece `kind` (1..7) in rotation `rot` (0..3). */
export const ROTATIONS: Cell[][][] = PIECES.map((name) => {
  const rows = SHAPES[name];
  const n = rows.length;
  let cells: Cell[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => c === "X" && cells.push([x, y])),
  );
  const out: Cell[][] = [];
  for (let r = 0; r < 4; r++) {
    out.push(cells);
    cells = cells.map(([x, y]): Cell => [n - 1 - y, x]); // a quarter turn clockwise
  }
  return out;
});

export const cellsOf = (kind: number, rot: number): Cell[] =>
  ROTATIONS[kind - 1][((rot % 4) + 4) % 4];
const sizeOf = (kind: number): number => SHAPES[PIECES[kind - 1]].length;

export interface Piece {
  kind: number;
  rot: number;
  x: number;
  y: number;
}

export interface TetrisState {
  /** COLS * ROWS cells: 0 empty, 1..7 a locked block of that piece */
  board: number[];
  piece: Piece;
  /** the kind of the next piece */
  next: number;
  /** the kinds left in the current bag */
  bag: number[];
  score: number;
  lines: number;
  level: number;
  over: boolean;
  seed: number;
}

/** Points for 0..4 lines at once, times the level. */
export const LINE_POINTS = [0, 100, 300, 500, 800];
export const levelOf = (lines: number): number => 1 + Math.floor(lines / 10);
/** Milliseconds per gravity tick: faster with the level. */
export const tickMs = (level: number): number =>
  Math.max(100, 800 - (level - 1) * 70);

function draw(
  bag: number[],
  seed: number,
): { kind: number; bag: number[]; seed: number } {
  let rest = bag;
  let sd = seed;
  if (rest.length === 0) {
    // a fresh bag, shuffled (Fisher-Yates)
    const items = [1, 2, 3, 4, 5, 6, 7];
    for (let i = items.length - 1; i > 0; i--) {
      const r = randInt(sd, i + 1);
      sd = r.seed;
      [items[i], items[r.value]] = [items[r.value], items[i]];
    }
    rest = items;
  }
  return { kind: rest[0], bag: rest.slice(1), seed: sd };
}

export const spawn = (kind: number): Piece => ({
  kind,
  rot: 0,
  x: Math.floor((COLS - sizeOf(kind)) / 2),
  y: kind === 1 ? -1 : 0,
});

/** Does the piece fit on the board (cells above the top are free)? */
export function fits(board: number[], p: Piece): boolean {
  for (const [dx, dy] of cellsOf(p.kind, p.rot)) {
    const x = p.x + dx;
    const y = p.y + dy;
    if (x < 0 || x >= COLS || y >= ROWS) return false;
    if (y >= 0 && board[y * COLS + x] !== 0) return false;
  }
  return true;
}

export function initial(seed: number): TetrisState {
  const a = draw([], seed);
  const b = draw(a.bag, a.seed);
  return {
    board: new Array<number>(COLS * ROWS).fill(0),
    piece: spawn(a.kind),
    next: b.kind,
    bag: b.bag,
    score: 0,
    lines: 0,
    level: 1,
    over: false,
    seed: b.seed,
  };
}

/** Puts the piece on the board, clears full rows, scores, and brings the next piece. */
function lock(s: TetrisState, extra = 0): TetrisState {
  const board = s.board.slice();
  for (const [dx, dy] of cellsOf(s.piece.kind, s.piece.rot)) {
    const y = s.piece.y + dy;
    if (y >= 0) board[y * COLS + s.piece.x + dx] = s.piece.kind;
  }
  const kept: number[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const row = board.slice(y * COLS, (y + 1) * COLS);
    if (row.some((c) => c === 0)) kept.push(row);
  }
  const cleared = ROWS - kept.length;
  const rows = [
    ...Array.from({ length: cleared }, () => new Array<number>(COLS).fill(0)),
    ...kept,
  ];
  const lines = s.lines + cleared;
  const nb = draw(s.bag, s.seed);
  const piece = spawn(s.next);
  const flat = rows.flat();
  return {
    ...s,
    board: flat,
    piece,
    next: nb.kind,
    bag: nb.bag,
    seed: nb.seed,
    lines,
    level: levelOf(lines),
    score: s.score + extra + LINE_POINTS[cleared] * s.level,
    over: !fits(flat, piece),
  };
}

/** One gravity tick: the piece falls a row, or locks. */
export function step(s: TetrisState): TetrisState {
  if (s.over) return s;
  const down = { ...s.piece, y: s.piece.y + 1 };
  return fits(s.board, down) ? { ...s, piece: down } : lock(s);
}

export function move(s: TetrisState, dx: number): TetrisState {
  if (s.over) return s;
  const p = { ...s.piece, x: s.piece.x + dx };
  return fits(s.board, p) ? { ...s, piece: p } : s;
}

/** Rotates (dir 1 clockwise, -1 counterclockwise), nudging sideways off a wall if needed. */
export function rotate(s: TetrisState, dir: 1 | -1 = 1): TetrisState {
  if (s.over || s.piece.kind === 2) return s;
  const rot = (s.piece.rot + dir + 4) % 4;
  for (const kick of [0, -1, 1, -2, 2]) {
    const p = { ...s.piece, rot, x: s.piece.x + kick };
    if (fits(s.board, p)) return { ...s, piece: p };
  }
  return s;
}

/** One row down by hand, a point per row. At the bottom nothing happens (gravity locks it). */
export function softDrop(s: TetrisState): TetrisState {
  if (s.over) return s;
  const down = { ...s.piece, y: s.piece.y + 1 };
  return fits(s.board, down) ? { ...s, piece: down, score: s.score + 1 } : s;
}

/** How many rows the piece can fall. */
export function dropDistance(s: TetrisState): number {
  let d = 0;
  while (fits(s.board, { ...s.piece, y: s.piece.y + d + 1 })) d++;
  return d;
}

/** The piece falls to the bottom and locks at once: two points per row. */
export function hardDrop(s: TetrisState): TetrisState {
  if (s.over) return s;
  const d = dropDistance(s);
  return lock({ ...s, piece: { ...s.piece, y: s.piece.y + d } }, 2 * d);
}

/** The board as flat cell kinds: e, t1..t7 (blocks and the falling piece), gh (where it would land). */
export function cellKinds(s: TetrisState): string[] {
  const out = s.board.map((c) => (c === 0 ? "e" : `t${c}`));
  if (s.over) return out;
  const d = dropDistance(s);
  for (const [dx, dy] of cellsOf(s.piece.kind, s.piece.rot)) {
    const y = s.piece.y + d + dy;
    if (y >= 0) out[y * COLS + s.piece.x + dx] = "gh";
  }
  for (const [dx, dy] of cellsOf(s.piece.kind, s.piece.rot)) {
    const y = s.piece.y + dy;
    if (y >= 0) out[y * COLS + s.piece.x + dx] = `t${s.piece.kind}`;
  }
  return out;
}

/** The next piece in a 4x4 preview. */
export function previewKinds(s: TetrisState): string[] {
  const out = new Array<string>(16).fill("e");
  const n = sizeOf(s.next);
  const off = Math.floor((4 - n) / 2);
  for (const [dx, dy] of cellsOf(s.next, 0)) {
    const x = off + dx;
    const y = s.next === 1 ? dy : off + dy;
    if (x >= 0 && x < 4 && y >= 0 && y < 4) out[y * 4 + x] = `t${s.next}`;
  }
  return out;
}
