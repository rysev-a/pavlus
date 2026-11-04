import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import view from "./music-player.pavlus";

export type Repeat = "off" | "all" | "one";

export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  /** Seconds. */
  duration: number;
  hue: number;
}

export const TRACKS: Track[] = [
  {
    id: 0,
    title: "Glass Harbour",
    artist: "Nova Lindqvist",
    album: "Low Tide Letters",
    duration: 214,
    hue: 205,
  },
  {
    id: 1,
    title: "Paper Lanterns",
    artist: "The Quiet Orchard",
    album: "Small Hours",
    duration: 187,
    hue: 28,
  },
  {
    id: 2,
    title: "Midnight Tram to Oslo",
    artist: "Halden",
    album: "Night Lines",
    duration: 243,
    hue: 265,
  },
  {
    id: 3,
    title: "Copper Sun",
    artist: "Ines Marquez",
    album: "Salt & Honey",
    duration: 198,
    hue: 12,
  },
  {
    id: 4,
    title: "Static Bloom",
    artist: "Kite Season",
    album: "Wild Signal",
    duration: 261,
    hue: 150,
  },
  {
    id: 5,
    title: "Slow River Home",
    artist: "Odette Brun",
    album: "Evergreen",
    duration: 176,
    hue: 330,
  },
];

export interface Row {
  id: number;
  n: number;
  title: string;
  artist: string;
  hue: number;
  length: string;
  active: boolean;
  playingNow: boolean;
}

/** The part of the state that is the player itself; the rest is derived from it. */
export interface Core {
  index: number;
  playing: boolean;
  elapsed: number;
  shuffle: boolean;
  repeat: Repeat;
  volume: number;
  /** A fixed permutation of the track indices: the order of shuffle mode. */
  order: number[];
}

export interface Shown {
  title: string;
  artist: string;
  album: string;
  hue: number;
  duration: number;
  elapsedLabel: string;
  durationLabel: string;
  remainingLabel: string;
  percent: number;
  rows: Row[];
  position: string;
  repeatLabel: string;
  volumeLabel: string;
}

export interface MusicPlayerState extends Core, Shown {}

/** Pure: seconds as m:ss (a negative number or NaN is 0:00). */
export function formatTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Pure: a deterministic permutation of 0..count-1 (Fisher-Yates on a small LCG). */
export function shuffleOrder(count: number, seed: number): number[] {
  const list = Array.from({ length: count }, (_, i) => i);
  let x = seed >>> 0 || 1;
  for (let i = count - 1; i > 0; i--) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const j = x % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Pure: the order the tracks are played in. */
export const sequenceOf = (count: number, shuffle: boolean, order: number[]) =>
  shuffle ? order : Array.from({ length: count }, (_, i) => i);

/**
 * Pure: the track after `index`, or -1 when it was the last one of the sequence
 * (the caller decides whether to wrap).
 */
export function followingIndex(
  index: number,
  count: number,
  shuffle: boolean,
  order: number[],
): number {
  const seq = sequenceOf(count, shuffle, order);
  const at = seq.indexOf(index);
  return at < 0 || at + 1 >= seq.length ? -1 : seq[at + 1];
}

/** Pure: the next track, wrapping around at the end. */
export function nextIndex(
  index: number,
  count: number,
  shuffle: boolean,
  order: number[],
): number {
  const seq = sequenceOf(count, shuffle, order);
  const at = Math.max(0, seq.indexOf(index));
  return seq[(at + 1) % seq.length];
}

/** Pure: the previous track, wrapping around at the start. */
export function prevIndex(
  index: number,
  count: number,
  shuffle: boolean,
  order: number[],
): number {
  const seq = sequenceOf(count, shuffle, order);
  const at = Math.max(0, seq.indexOf(index));
  return seq[(at - 1 + seq.length) % seq.length];
}

/** Pure: what happens when a track plays to its end. */
export function afterEnd(
  c: Pick<Core, "index" | "repeat" | "shuffle" | "order">,
  count: number,
): { index: number; playing: boolean } {
  if (c.repeat === "one") return { index: c.index, playing: true };
  const following = followingIndex(c.index, count, c.shuffle, c.order);
  if (following >= 0) return { index: following, playing: true };
  const first = sequenceOf(count, c.shuffle, c.order)[0];
  // The end of the sequence: start over with "all", otherwise stop.
  return { index: first, playing: c.repeat === "all" };
}

/** Pure: a second of playback; may end the track. */
export function tickOf(
  c: Core,
  tracks: Track[] = TRACKS,
): Pick<Core, "index" | "elapsed" | "playing"> {
  if (!c.playing) return { index: c.index, elapsed: c.elapsed, playing: false };
  const elapsed = c.elapsed + 1;
  if (elapsed < tracks[c.index].duration)
    return { index: c.index, elapsed, playing: true };
  return { ...afterEnd(c, tracks.length), elapsed: 0 };
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

const REPEAT_LABEL: Record<Repeat, string> = {
  off: "Repeat off",
  all: "Repeat all",
  one: "Repeat one",
};

/** Pure: everything the view shows, from the player state. */
export function derive(c: Core, tracks: Track[] = TRACKS): Shown {
  const t = tracks[c.index];
  const seq = sequenceOf(tracks.length, c.shuffle, c.order);
  return {
    title: t.title,
    artist: t.artist,
    album: t.album,
    hue: t.hue,
    duration: t.duration,
    elapsedLabel: formatTime(c.elapsed),
    durationLabel: formatTime(t.duration),
    remainingLabel: "-" + formatTime(t.duration - c.elapsed),
    percent: Math.round((c.elapsed / t.duration) * 1000) / 10,
    rows: tracks.map((x, i) => ({
      id: x.id,
      n: i + 1,
      title: x.title,
      artist: x.artist,
      hue: x.hue,
      length: formatTime(x.duration),
      active: x.id === c.index,
      playingNow: x.id === c.index && c.playing,
    })),
    position: `Track ${seq.indexOf(c.index) + 1} of ${tracks.length}`,
    repeatLabel: REPEAT_LABEL[c.repeat],
    volumeLabel: c.volume === 0 ? "Muted" : `${c.volume}%`,
  };
}

const START: Core = {
  index: 0,
  playing: false,
  elapsed: 0,
  shuffle: false,
  repeat: "off",
  volume: 70,
  order: shuffleOrder(TRACKS.length, 2026),
};

export const initial: MusicPlayerState = { ...START, ...derive(START) };

const TIMER = "player";

const pick = (c: Core): Core => ({
  index: c.index,
  playing: c.playing,
  elapsed: c.elapsed,
  shuffle: c.shuffle,
  repeat: c.repeat,
  volume: c.volume,
  order: c.order,
});

/** The effects that put `next` in the state, and start or stop the timer. */
function apply(prev: Core, next: Core): Effect[] {
  const effects: Effect[] = [
    ...Object.entries(next).map(([k, v]) => store.set(k, v)),
    ...Object.entries(derive(next)).map(([k, v]) => store.set(k, v)),
  ];
  if (next.playing && !prev.playing)
    effects.push(time.setInterval(TIMER, 1000, "tick"));
  if (!next.playing && prev.playing) effects.push(time.cancel(TIMER));
  return effects;
}

export class MusicPlayer extends Component<MusicPlayerState> {
  view = view;

  toggle(_msg: Message, state: MusicPlayerState): Effect[] {
    const c = pick(state);
    return apply(c, { ...c, playing: !c.playing });
  }

  tick(_msg: Message, state: MusicPlayerState): Effect[] {
    const c = pick(state);
    if (!c.playing) return [time.cancel(TIMER)];
    return apply(c, { ...c, ...tickOf(c) });
  }

  next(_msg: Message, state: MusicPlayerState): Effect[] {
    const c = pick(state);
    const index = nextIndex(c.index, TRACKS.length, c.shuffle, c.order);
    return apply(c, { ...c, index, elapsed: 0 });
  }

  /** Past the first seconds, Previous restarts the track, like a real player. */
  prev(_msg: Message, state: MusicPlayerState): Effect[] {
    const c = pick(state);
    if (c.elapsed > 3) return apply(c, { ...c, elapsed: 0 });
    const index = prevIndex(c.index, TRACKS.length, c.shuffle, c.order);
    return apply(c, { ...c, index, elapsed: 0 });
  }

  choose(msg: Message, state: MusicPlayerState): Effect[] {
    const c = pick(state);
    const index = clamp(Number(msg.payload), 0, TRACKS.length - 1);
    // Choosing the track that is playing pauses or resumes it.
    if (index === c.index) return apply(c, { ...c, playing: !c.playing });
    return apply(c, { ...c, index, elapsed: 0, playing: true });
  }

  shuffle(_msg: Message, state: MusicPlayerState): Effect[] {
    const c = pick(state);
    return apply(c, { ...c, shuffle: !c.shuffle });
  }

  repeat(_msg: Message, state: MusicPlayerState): Effect[] {
    const c = pick(state);
    const repeat: Repeat =
      c.repeat === "off" ? "all" : c.repeat === "all" ? "one" : "off";
    return apply(c, { ...c, repeat });
  }

  seek(msg: Message, state: MusicPlayerState): Effect[] {
    const c = pick(state);
    const max = TRACKS[c.index].duration - 1;
    const elapsed = clamp(Math.round(Number(msg.event?.value ?? 0)), 0, max);
    return apply(c, { ...c, elapsed });
  }

  volume(msg: Message, state: MusicPlayerState): Effect[] {
    const c = pick(state);
    const volume = clamp(Math.round(Number(msg.event?.value ?? 0)), 0, 100);
    return apply(c, { ...c, volume });
  }

  /** The route changes: the timer must not outlive the page. */
  leave(_msg: Message, state: MusicPlayerState): Effect[] {
    const c = pick(state);
    return [
      time.cancel(TIMER),
      ...apply({ ...c, playing: false }, { ...c, playing: false }),
    ];
  }
}

export const page = new MusicPlayer();
