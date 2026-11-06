// A tiny seeded PRNG (mulberry32) for the game engines: the seed is part of the
// game state, so a game is a pure function of its seed and its inputs.

export interface Rolled {
  /** the advanced seed: keep it in the state */
  seed: number;
  /** a float in [0, 1) */
  value: number;
}

export function nextRand(seed: number): Rolled {
  const s = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { seed: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/** An integer in [0, n) (0 when n <= 1). */
export function randInt(seed: number, n: number): Rolled {
  const r = nextRand(seed);
  return { seed: r.seed, value: n <= 1 ? 0 : Math.floor(r.value * n) };
}
