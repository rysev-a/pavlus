// The queue logic of the simulated player: pure, deterministic (no Math.random).

/** The next seed of the little LCG that drives shuffle. */
export const nextSeed = (seed: number): number =>
  (Math.imul(seed >>> 0 || 1, 1664525) + 1013904223) >>> 0;

/** A deterministic shuffle of `ids` that keeps `ids[start]` first. */
export function shuffledFrom(
  ids: number[],
  start: number,
  seed: number,
): number[] {
  if (ids.length === 0) return [];
  const s = Math.min(Math.max(0, start), ids.length - 1);
  const first = ids[s];
  const rest = ids.filter((_, i) => i !== s);
  let x = seed >>> 0 || 1;
  for (let i = rest.length - 1; i > 0; i--) {
    x = nextSeed(x);
    const j = x % (i + 1);
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [first, ...rest];
}

/** A deterministic shuffle of the whole list. */
export function shuffledAll(ids: number[], seed: number): number[] {
  const out = [...ids];
  let x = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x = nextSeed(x);
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type Repeat = "off" | "all" | "one";

export const nextRepeat = (r: Repeat): Repeat =>
  r === "off" ? "all" : r === "all" ? "one" : "off";

export const repeatLabel = (r: Repeat): string =>
  r === "off"
    ? "Repeat: off"
    : r === "all"
      ? "Repeat: all"
      : "Repeat: one song";

/**
 * Where the queue goes after `pos`. `natural` is a song that ended by itself,
 * otherwise the person pressed Next. `end` = nothing follows (stop or ignore).
 */
export function following(
  pos: number,
  length: number,
  repeat: Repeat,
  natural: boolean,
): { pos: number; end: boolean; wrap: boolean } {
  if (natural && repeat === "one") return { pos, end: false, wrap: false };
  if (pos + 1 < length) return { pos: pos + 1, end: false, wrap: false };
  if (repeat === "all" && length > 0) return { pos: 0, end: false, wrap: true };
  return { pos, end: true, wrap: false };
}
