// SNAKE, a pure engine: `initial(seed)`, `step(state)` (one tick) and `turn(state, dir)`.
// No Math.random and no Date: the food is placed with the seeded PRNG kept in the state.
import { randInt } from "./rng.ts";

export type Dir = "up" | "down" | "left" | "right";
export interface Point {
  x: number;
  y: number;
}

export const SNAKE_W = 20;
export const SNAKE_H = 20;

export interface SnakeState {
  w: number;
  h: number;
  /** the head first */
  body: Point[];
  dir: Dir;
  /** turns waiting for the next ticks (at most 2) */
  queue: Dir[];
  food: Point | null;
  score: number;
  /** how much food was eaten */
  eaten: number;
  level: number;
  over: boolean;
  /** the board is full: the best end */
  won: boolean;
  seed: number;
}

const VEC: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

export const levelOf = (eaten: number): number => 1 + Math.floor(eaten / 5);
/** Milliseconds per tick: faster with the level. */
export const tickMs = (level: number): number => Math.max(60, 150 - (level - 1) * 10);

/** A free cell for the food (never on the snake), or null when the board is full. */
export function placeFood(body: Point[], w: number, h: number, seed: number): { food: Point | null; seed: number } {
  const taken = new Set(body.map((p) => p.y * w + p.x));
  const free: Point[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!taken.has(y * w + x)) free.push({ x, y });
  if (free.length === 0) return { food: null, seed };
  const r = randInt(seed, free.length);
  return { food: free[r.value], seed: r.seed };
}

export function initial(seed: number, w = SNAKE_W, h = SNAKE_H): SnakeState {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const body = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ];
  const f = placeFood(body, w, h, seed);
  return { w, h, body, dir: "right", queue: [], food: f.food, score: 0, eaten: 0, level: 1, over: false, won: false, seed: f.seed };
}

/** Queues a turn. A reverse (or the same direction) is ignored. */
export function turn(s: SnakeState, dir: Dir): SnakeState {
  if (s.over) return s;
  const last = s.queue.length > 0 ? s.queue[s.queue.length - 1] : s.dir;
  if (dir === last || dir === OPPOSITE[last] || s.queue.length >= 2) return s;
  return { ...s, queue: [...s.queue, dir] };
}

/** One tick: the snake moves one cell. */
export function step(s: SnakeState): SnakeState {
  if (s.over) return s;
  const dir = s.queue.length > 0 ? s.queue[0] : s.dir;
  const queue = s.queue.slice(1);
  const v = VEC[dir];
  const head = { x: s.body[0].x + v.x, y: s.body[0].y + v.y };
  if (head.x < 0 || head.y < 0 || head.x >= s.w || head.y >= s.h) return { ...s, dir, queue, over: true };
  const eats = s.food !== null && s.food.x === head.x && s.food.y === head.y;
  // the tail moves away in the same tick, so its cell is free unless the snake grows
  const kept = eats ? s.body : s.body.slice(0, -1);
  if (kept.some((p) => p.x === head.x && p.y === head.y)) return { ...s, dir, queue, over: true };
  const body = [head, ...kept];
  if (!eats) return { ...s, body, dir, queue };
  const eaten = s.eaten + 1;
  const f = placeFood(body, s.w, s.h, s.seed);
  return {
    ...s,
    body,
    dir,
    queue,
    eaten,
    level: levelOf(eaten),
    score: s.score + 10 * s.level,
    food: f.food,
    seed: f.seed,
    over: f.food === null,
    won: f.food === null,
  };
}

/** The board as a flat list of cell kinds: e (empty), s (body), h (head), f (food). */
export function cellKinds(s: SnakeState): string[] {
  const out = new Array<string>(s.w * s.h).fill("e");
  s.body.forEach((p, i) => {
    out[p.y * s.w + p.x] = i === 0 ? "h" : "s";
  });
  if (s.food) out[s.food.y * s.w + s.food.x] = "f";
  return out;
}
