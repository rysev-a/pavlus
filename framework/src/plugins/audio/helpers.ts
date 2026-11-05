import type { AudioEffect } from "./mod.ts";

type Of<T extends AudioEffect["type"]> = Extract<AudioEffect, { type: T }>;
type Opts<T extends AudioEffect["type"]> = Omit<Of<T>, "plugin" | "type">;

/** Builders for audio effects. */
export interface AudioEffector {
  load(options: Opts<"load">): Of<"load">;
  play(id: string, options?: Omit<Opts<"play">, "id">): Of<"play">;
  pause(id: string): Of<"pause">;
  stop(id: string): Of<"stop">;
  seek(id: string, time: number): Of<"seek">;
  volume(id: string, value: number): Of<"volume">;
  mute(id: string, muted?: boolean): Of<"mute">;
  loop(id: string, value?: boolean): Of<"loop">;
  rate(id: string, value: number): Of<"rate">;
  /** Linear volume ramp to `to` (0..1) over `ms`. */
  fade(id: string, to: number, ms: number, onSuccess?: string): Of<"fade">;
  observe(options: Opts<"observe">): Of<"observe">;
  unload(id: string): Of<"unload">;
  unloadAll(): Of<"unloadAll">;
  /** A synthesized beep (WebAudio oscillator). */
  tone(options: Opts<"tone">): Of<"tone">;
  analyse(options: Opts<"analyse">): Of<"analyse">;
  stopAnalyse(id: string): Of<"stopAnalyse">;
  mediaSession(options: Opts<"mediaSession">): Of<"mediaSession">;
}

/**
 * ```ts
 * import { audioEffector as audio } from "@service-laboratory/pavlus/plugins/audio";
 *
 * return [audio.load({ id: "click", src: "/click.mp3" }), audio.play("click")];
 * ```
 */
export const audioEffector: AudioEffector = {
  load: (options) => ({ plugin: "audio", type: "load", ...options }),
  play: (id, options = {}) => ({
    plugin: "audio",
    type: "play",
    id,
    ...options,
  }),
  pause: (id) => ({ plugin: "audio", type: "pause", id }),
  stop: (id) => ({ plugin: "audio", type: "stop", id }),
  seek: (id, time) => ({ plugin: "audio", type: "seek", id, time }),
  volume: (id, value) => ({ plugin: "audio", type: "volume", id, value }),
  mute: (id, muted = true) => ({ plugin: "audio", type: "mute", id, muted }),
  loop: (id, value = true) => ({ plugin: "audio", type: "loop", id, value }),
  rate: (id, value) => ({ plugin: "audio", type: "rate", id, value }),
  fade: (id, to, ms, onSuccess) => ({
    plugin: "audio",
    type: "fade",
    id,
    to,
    ms,
    ...(onSuccess !== undefined && { onSuccess }),
  }),
  observe: (options) => ({ plugin: "audio", type: "observe", ...options }),
  unload: (id) => ({ plugin: "audio", type: "unload", id }),
  unloadAll: () => ({ plugin: "audio", type: "unloadAll" }),
  tone: (options) => ({ plugin: "audio", type: "tone", ...options }),
  analyse: (options) => ({ plugin: "audio", type: "analyse", ...options }),
  stopAnalyse: (id) => ({ plugin: "audio", type: "stopAnalyse", id }),
  mediaSession: (options) => ({
    plugin: "audio",
    type: "mediaSession",
    ...options,
  }),
};

/** Result of `next`/`prev` at the end of a list without looping. */
export const NO_TRACK = -1;

/**
 * Index of the track after `index`. Past the end: wraps to 0 if `loop`,
 * otherwise {@link NO_TRACK}. An empty list always gives {@link NO_TRACK}.
 */
export function next(length: number, index: number, loop = false): number {
  if (length <= 0) return NO_TRACK;
  if (index + 1 < length) return index + 1;
  return loop ? 0 : NO_TRACK;
}

/** Index of the track before `index`; the mirror of {@link next}. */
export function prev(length: number, index: number, loop = false): number {
  if (length <= 0) return NO_TRACK;
  if (index - 1 >= 0) return index - 1;
  return loop ? length - 1 : NO_TRACK;
}

/** A shuffled copy (Fisher-Yates). Pass a seeded `random` for determinism. */
export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pure playlist helpers. The app keeps the list and the current index in its
 * own state and turns the result into `load`/`play` effects.
 */
export const playlist = { next, prev, shuffle, NO_TRACK };
