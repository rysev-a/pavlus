// PAC-MAN, a pure engine: `initial(seed)`, `step(state)` (one tick) and `turn(state, dir)`.
// The maze is a list of strings. Four ghosts chase, scatter and run away (frightened)
// by simple deterministic rules; the frightened ones wander with the seeded PRNG kept
// in the state. No Math.random, no Date.
import { randInt } from "./rng.ts";

export type Dir = "up" | "down" | "left" | "right";

/** # wall, . pellet, o power pellet, = ghost door, G ghost start, P Pac-Man start, space an empty path. */
export const MAZE: string[] = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.###.#.###.####",
  "####.#.......#.####",
  "####.#.##=##.#.####",
  ".......#GGG#.......",
  "####.#.#####.#.####",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#o.#.....P.....#.o#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "#.######.#.######.#",
  "#.##.###.#.###.##.#",
  "#.................#",
  "###################",
];

export const W = MAZE[0].length;
export const H = MAZE.length;

const VEC: Record<Dir, { x: number; y: number }> = { up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, right: { x: 1, y: 0 } };
/** The order ghosts break ties in. */
const DIRS: Dir[] = ["up", "left", "down", "right"];
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

const DOOR = { x: 9, y: 8 };
const EXIT = { x: 9, y: 7 };
const HOME = { x: 9, y: 9 };
const PAC_START = { x: 9, y: 13 };
const START_LIVES = 3;

export interface Ghost {
  /** 0 blinky (chases), 1 pinky (ambushes), 2 inky, 3 clyde (shy) */
  id: number;
  x: number;
  y: number;
  dir: Dir;
  /** house: waits inside until `release`; eyes: eaten, runs home */
  mode: "house" | "normal" | "eyes";
  frightened: boolean;
  release: number;
}

export interface PacState {
  /** W * H: 0 nothing, 1 pellet, 2 power pellet */
  food: number[];
  left: number;
  x: number;
  y: number;
  dir: Dir;
  /** the direction asked for, taken as soon as the way is free */
  want: Dir;
  ghosts: Ghost[];
  score: number;
  lives: number;
  level: number;
  /** ticks of frightened time left */
  fright: number;
  /** ghosts eaten with the current power pellet */
  combo: number;
  tick: number;
  /** ticks of waiting before the action starts */
  ready: number;
  over: boolean;
  seed: number;
}

export const tickMs = (level: number): number => Math.max(90, 150 - (level - 1) * 8);
const frightTicks = (level: number): number => Math.max(14, 44 - (level - 1) * 6);
const ghostPeriod = (level: number): number => (level < 3 ? 4 : level < 5 ? 6 : 9);

const tileAt = (x: number, y: number): string => MAZE[y]?.[x] ?? "#";

function freshFood(): number[] {
  const out: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.push(tileAt(x, y) === "." ? 1 : tileAt(x, y) === "o" ? 2 : 0);
  return out;
}

function startGhosts(tick: number): Ghost[] {
  return [
    { id: 0, x: EXIT.x, y: EXIT.y, dir: "left", mode: "normal", frightened: false, release: 0 },
    { id: 1, x: 9, y: 9, dir: "up", mode: "house", frightened: false, release: tick + 8 },
    { id: 2, x: 8, y: 9, dir: "up", mode: "house", frightened: false, release: tick + 24 },
    { id: 3, x: 10, y: 9, dir: "up", mode: "house", frightened: false, release: tick + 40 },
  ];
}

export function initial(seed: number): PacState {
  const food = freshFood();
  return {
    food,
    left: food.filter((f) => f > 0).length,
    ...PAC_START,
    dir: "left",
    want: "left",
    ghosts: startGhosts(0),
    score: 0,
    lives: START_LIVES,
    level: 1,
    fright: 0,
    combo: 0,
    tick: 0,
    ready: 6,
    over: false,
    seed,
  };
}

/** Asks Pac-Man to go that way (it is taken as soon as there is no wall). */
export function turn(s: PacState, dir: Dir): PacState {
  return s.over || s.want === dir ? s : { ...s, want: dir };
}

/** The cell one step from (x, y), wrapping through the tunnel; null off the maze. */
function stepFrom(x: number, y: number, dir: Dir): { x: number; y: number } | null {
  const v = VEC[dir];
  const ny = y + v.y;
  if (ny < 0 || ny >= H) return null;
  return { x: (x + v.x + W) % W, y: ny };
}

const inHouse = (g: { x: number; y: number }): boolean => g.y === HOME.y && g.x >= 8 && g.x <= 10;

function pacCanGo(x: number, y: number, dir: Dir): { x: number; y: number } | null {
  const n = stepFrom(x, y, dir);
  if (!n) return null;
  const t = tileAt(n.x, n.y);
  return t === "#" || t === "=" ? null : n;
}

function ghostCanGo(g: Ghost, dir: Dir): { x: number; y: number } | null {
  const n = stepFrom(g.x, g.y, dir);
  if (!n) return null;
  const t = tileAt(n.x, n.y);
  if (t === "#") return null;
  // the door opens for a ghost that is in the house (or on the door) and for eyes going home
  if (t === "=" && !(g.mode === "eyes" || g.y >= DOOR.y)) return null;
  return n;
}

const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const CORNERS = [
  { x: W - 1, y: 0 },
  { x: 0, y: 0 },
  { x: W - 1, y: H - 1 },
  { x: 0, y: H - 1 },
];
const scattering = (tick: number): boolean => tick % 100 < 25;

function targetOf(s: PacState, g: Ghost): { x: number; y: number } {
  if (g.mode === "eyes") return HOME;
  if (inHouse(g)) return EXIT;
  if (scattering(s.tick)) return CORNERS[g.id];
  const pac = { x: s.x, y: s.y };
  const v = VEC[s.dir];
  if (g.id === 0) return pac;
  if (g.id === 1) return { x: pac.x + 4 * v.x, y: pac.y + 4 * v.y };
  if (g.id === 2) {
    const b = s.ghosts[0];
    const p2 = { x: pac.x + 2 * v.x, y: pac.y + 2 * v.y };
    return { x: 2 * p2.x - b.x, y: 2 * p2.y - b.y };
  }
  return dist2(g, pac) > 64 ? pac : CORNERS[3];
}

/** Moves one ghost a cell: the way that gets closest to the target (a random way when frightened). */
function moveGhost(s: PacState, g: Ghost): { ghost: Ghost; seed: number } {
  let options = DIRS.filter((d) => d !== OPPOSITE[g.dir] && ghostCanGo(g, d) !== null);
  if (options.length === 0) options = DIRS.filter((d) => ghostCanGo(g, d) !== null);
  if (options.length === 0) return { ghost: g, seed: s.seed };
  let dir = options[0];
  let seed = s.seed;
  if (g.frightened && g.mode === "normal" && !inHouse(g)) {
    const r = randInt(seed, options.length);
    seed = r.seed;
    dir = options[r.value];
  } else {
    const target = targetOf(s, g);
    let best = Infinity;
    for (const d of options) {
      const n = ghostCanGo(g, d)!;
      const dd = dist2(n, target);
      if (dd < best) {
        best = dd;
        dir = d;
      }
    }
  }
  const n = ghostCanGo(g, dir)!;
  let ghost: Ghost = { ...g, x: n.x, y: n.y, dir };
  if (ghost.mode === "eyes" && ghost.x === HOME.x && ghost.y === HOME.y) ghost = { ...ghost, mode: "normal", frightened: false };
  return { ghost, seed };
}

function resetPositions(s: PacState): PacState {
  return { ...s, ...PAC_START, dir: "left", want: "left", ghosts: startGhosts(s.tick), fright: 0, combo: 0, ready: 8 };
}

/** Pac-Man meets the ghosts that share its cell: eats a frightened one, or loses a life. */
function collide(s: PacState): PacState {
  let cur = s;
  const ghosts = cur.ghosts.slice();
  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    if (g.x !== cur.x || g.y !== cur.y || g.mode !== "normal") continue;
    if (g.frightened) {
      ghosts[i] = { ...g, mode: "eyes", frightened: false };
      cur = { ...cur, score: cur.score + 200 * 2 ** cur.combo, combo: cur.combo + 1, ghosts };
    } else {
      const lives = cur.lives - 1;
      return lives <= 0 ? { ...cur, lives: 0, over: true } : resetPositions({ ...cur, lives });
    }
  }
  return cur;
}

/** One tick. */
export function step(s0: PacState): PacState {
  if (s0.over) return s0;
  if (s0.ready > 0) return { ...s0, ready: s0.ready - 1 };
  let s: PacState = { ...s0, tick: s0.tick + 1 };

  // Pac-Man: take the wanted way if it is open, else keep going, else stay
  let dir = s.dir;
  if (pacCanGo(s.x, s.y, s.want)) dir = s.want;
  const to = pacCanGo(s.x, s.y, dir);
  if (to) {
    s = { ...s, x: to.x, y: to.y, dir };
    const i = s.y * W + s.x;
    const f = s.food[i];
    if (f > 0) {
      const food = s.food.slice();
      food[i] = 0;
      s = { ...s, food, left: s.left - 1, score: s.score + (f === 2 ? 50 : 10) };
      if (f === 2) {
        s = {
          ...s,
          fright: frightTicks(s.level),
          combo: 0,
          ghosts: s.ghosts.map((g) =>
            g.mode === "normal" ? { ...g, frightened: true, dir: inHouse(g) ? g.dir : OPPOSITE[g.dir] } : g,
          ),
        };
      }
    }
  } else if (dir !== s.dir) {
    s = { ...s, dir };
  }

  // a level is cleared when the last pellet is eaten
  if (s.left === 0) {
    const level = s.level + 1;
    const food = freshFood();
    return resetPositions({ ...s, level, food, left: food.filter((x) => x > 0).length, score: s.score + 500, ghosts: startGhosts(s.tick) });
  }

  s = collide(s);
  if (s.over || s.ready > 0) return s;

  // the ghosts
  if (s.fright > 0) {
    const fright = s.fright - 1;
    s = { ...s, fright, ghosts: fright === 0 ? s.ghosts.map((g) => ({ ...g, frightened: false })) : s.ghosts };
  }
  const period = ghostPeriod(s.level);
  const flip = s.tick % 100 === 0 || s.tick % 100 === 25;
  let seed = s.seed;
  const ghosts: Ghost[] = [];
  for (let g of s.ghosts) {
    if (g.mode === "house") {
      if (s.tick >= g.release) g = { ...g, mode: "normal" };
      else {
        ghosts.push(g);
        continue;
      }
    }
    if (flip && g.mode === "normal" && !g.frightened && !inHouse(g)) g = { ...g, dir: OPPOSITE[g.dir] };
    const moves = g.mode === "eyes" ? true : g.frightened ? s.tick % 2 === 0 : s.tick % period !== period - 1;
    if (!moves) {
      ghosts.push(g);
      continue;
    }
    const r = moveGhost({ ...s, seed }, g);
    seed = r.seed;
    ghosts.push(r.ghost);
  }
  return collide({ ...s, ghosts, seed });
}

/** The maze as flat cell kinds: w wall, d door, e empty, p pellet, o power pellet, P Pac-Man, g0..g3 ghosts, gf / gw frightened (gw: about to end), ge eyes. */
export function cellKinds(s: PacState): string[] {
  const out: string[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tileAt(x, y);
      const f = s.food[y * W + x];
      out.push(t === "#" ? "w" : t === "=" ? "d" : f === 1 ? "p" : f === 2 ? "o" : "e");
    }
  }
  for (const g of s.ghosts) {
    out[g.y * W + g.x] = g.mode === "eyes" ? "ge" : g.frightened ? (s.fright <= 8 && s.fright % 2 === 0 ? "gw" : "gf") : `g${g.id}`;
  }
  out[s.y * W + s.x] = "P";
  return out;
}
