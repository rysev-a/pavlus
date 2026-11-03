import { expect, test } from "vitest";
import {
  TRACKS,
  afterEnd,
  derive,
  followingIndex,
  formatTime,
  initial,
  nextIndex,
  prevIndex,
  shuffleOrder,
  tickOf,
  type Core,
} from "../blocks/music-player/music-player.ts";

const N = TRACKS.length;
const core = (over: Partial<Core> = {}): Core => ({
  index: 0,
  playing: true,
  elapsed: 0,
  shuffle: false,
  repeat: "off",
  volume: 50,
  order: [3, 0, 5, 1, 4, 2],
  ...over,
});

test("time is m:ss", () => {
  expect(formatTime(0)).toBe("0:00");
  expect(formatTime(5)).toBe("0:05");
  expect(formatTime(214)).toBe("3:34");
  expect(formatTime(3600)).toBe("60:00");
  expect(formatTime(-4)).toBe("0:00");
  expect(formatTime(Number.NaN)).toBe("0:00");
  expect(formatTime(59.9)).toBe("0:59");
});

test("the shuffle order is a deterministic permutation", () => {
  const a = shuffleOrder(N, 2026);
  expect(a).toEqual(shuffleOrder(N, 2026));
  expect([...a].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  expect(shuffleOrder(N, 1)).not.toEqual(shuffleOrder(N, 2));
});

test("next and previous wrap around, in order or shuffled", () => {
  const order = [3, 0, 5, 1, 4, 2];
  expect(nextIndex(0, N, false, order)).toBe(1);
  expect(nextIndex(5, N, false, order)).toBe(0);
  expect(prevIndex(0, N, false, order)).toBe(5);
  expect(nextIndex(3, N, true, order)).toBe(0);
  expect(nextIndex(2, N, true, order)).toBe(3);
  expect(prevIndex(3, N, true, order)).toBe(2);
  expect(prevIndex(5, N, true, order)).toBe(0);
  expect(followingIndex(2, N, true, order)).toBe(-1);
  expect(followingIndex(5, N, false, order)).toBe(-1);
});

test("the end of a track", () => {
  expect(afterEnd(core({ repeat: "one", index: 2 }), N)).toEqual({
    index: 2,
    playing: true,
  });
  expect(afterEnd(core({ index: 2 }), N)).toEqual({ index: 3, playing: true });
  // the last track: stop, or start over with repeat all
  expect(afterEnd(core({ index: 5 }), N)).toEqual({ index: 0, playing: false });
  expect(afterEnd(core({ index: 5, repeat: "all" }), N)).toEqual({
    index: 0,
    playing: true,
  });
  // shuffled, the last of the order is 2 and the first is 3
  expect(afterEnd(core({ index: 2, shuffle: true }), N)).toEqual({
    index: 3,
    playing: false,
  });
});

test("a tick adds a second, and the end moves on", () => {
  expect(tickOf(core({ elapsed: 10 }))).toEqual({
    index: 0,
    elapsed: 11,
    playing: true,
  });
  expect(tickOf(core({ elapsed: TRACKS[0].duration - 1 }))).toEqual({
    index: 1,
    elapsed: 0,
    playing: true,
  });
  expect(tickOf(core({ playing: false, elapsed: 7 }))).toEqual({
    index: 0,
    elapsed: 7,
    playing: false,
  });
  const last = core({ index: 5, elapsed: TRACKS[5].duration - 1 });
  expect(tickOf(last)).toEqual({ index: 0, elapsed: 0, playing: false });
});

test("the view state is derived from the player", () => {
  const d = derive(core({ index: 1, elapsed: 47, repeat: "all" }));
  expect(d.title).toBe(TRACKS[1].title);
  expect(d.elapsedLabel).toBe("0:47");
  expect(d.durationLabel).toBe("3:07");
  expect(d.remainingLabel).toBe("-2:20");
  expect(d.position).toBe("Track 2 of 6");
  expect(d.repeatLabel).toBe("Repeat all");
  expect(d.rows.filter((r) => r.active)).toHaveLength(1);
  expect(d.rows[1].playingNow).toBe(true);
  expect(initial.rows).toHaveLength(N);
  expect(initial.playing).toBe(false);
});
