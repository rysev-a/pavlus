import type { Plugin } from "../../core/types.ts";

export interface MediaErrorPayload {
  name: string;
  message: string;
  code?: number;
}

/** Serializable snapshot streamed to `observe.onChange`. */
export interface AudioSnapshot {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  buffered: [number, number][];
  readyState: number;
  error?: { code?: number; message?: string };
}

export type MediaSessionAction =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "seek";

export type AudioEffect =
  | {
      plugin: "audio";
      type: "load";
      id: string;
      src: string;
      preload?: "none" | "metadata" | "auto";
      /** Payload: `{ duration }` once metadata is loaded. */
      onSuccess?: string;
      /** Payload: {@link MediaErrorPayload}. */
      onError?: string;
    }
  | {
      plugin: "audio";
      type: "play";
      id: string;
      /** Start position in seconds. */
      from?: number;
      /** Sent when playback reaches the end. */
      onEnded?: string;
      /** Autoplay-policy and other rejections; falls back to the `onError` of `load`. */
      onError?: string;
    }
  | { plugin: "audio"; type: "pause"; id: string }
  | { plugin: "audio"; type: "stop"; id: string }
  | { plugin: "audio"; type: "seek"; id: string; time: number }
  | { plugin: "audio"; type: "volume"; id: string; value: number }
  | { plugin: "audio"; type: "mute"; id: string; muted: boolean }
  | { plugin: "audio"; type: "loop"; id: string; value: boolean }
  | { plugin: "audio"; type: "rate"; id: string; value: number }
  | {
      plugin: "audio";
      type: "fade";
      id: string;
      to: number;
      ms: number;
      /** Sent when the fade has finished (not when it is interrupted). */
      onSuccess?: string;
    }
  | {
      plugin: "audio";
      type: "observe";
      id: string;
      /** Payload: an {@link AudioSnapshot}. */
      onChange: string;
      events?: string[];
      /** Minimum gap between snapshots caused by `timeupdate`/`progress`. */
      intervalMs?: number;
    }
  | { plugin: "audio"; type: "unload"; id: string }
  | { plugin: "audio"; type: "unloadAll" }
  | {
      plugin: "audio";
      type: "tone";
      frequency: number;
      ms: number;
      /** Oscillator waveform, default `sine`. */
      wave?: "sine" | "square" | "sawtooth" | "triangle";
      /** Gain 0..1, default 0.2. */
      volume?: number;
      onEnded?: string;
      onError?: string;
    }
  | {
      plugin: "audio";
      type: "analyse";
      id: string;
      /** Payload: `{ level, bands }`, all values 0..1. */
      onChange: string;
      fftSize?: number;
      /** Number of frequency bands, default 8. */
      bands?: number;
      /** Polling period, default 100. */
      intervalMs?: number;
      onError?: string;
    }
  | { plugin: "audio"; type: "stopAnalyse"; id: string }
  | {
      plugin: "audio";
      type: "mediaSession";
      title?: string;
      artist?: string;
      album?: string;
      artwork?: { src: string; sizes?: string; type?: string }[];
      /**
       * Message ids by action. `seek` receives `{ seekTime }`, others the
       * browser's action details. An action left out has its handler removed.
       */
      actions?: Partial<Record<MediaSessionAction, string>>;
      onError?: string;
    };

export interface RangesLike {
  length: number;
  start(i: number): number;
  end(i: number): number;
}

/** The subset of `HTMLAudioElement` the plugin needs. */
export interface AudioLike {
  src: string;
  preload?: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  loop: boolean;
  readyState: number;
  error: { code?: number; message?: string } | null;
  buffered?: RangesLike;
  play(): Promise<void> | void;
  pause(): void;
  load?(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, fn: (ev?: unknown) => void): void;
  removeEventListener(type: string, fn: (ev?: unknown) => void): void;
}

export interface AnalyserNodeLike {
  fftSize: number;
  frequencyBinCount: number;
  getByteFrequencyData(data: Uint8Array): void;
  connect(dest: unknown): unknown;
  disconnect(): void;
}
export interface AudioContextLike {
  state?: string;
  currentTime: number;
  destination: unknown;
  resume?(): Promise<void> | void;
  createOscillator(): {
    type: string;
    frequency: { value: number };
    onended: (() => void) | null;
    connect(dest: unknown): unknown;
    disconnect(): void;
    start(when?: number): void;
    stop(when?: number): void;
  };
  createGain(): {
    gain: { value: number };
    connect(dest: unknown): unknown;
    disconnect(): void;
  };
  createAnalyser(): AnalyserNodeLike;
  createMediaElementSource(el: unknown): {
    connect(dest: unknown): unknown;
    disconnect(): void;
  };
}

export interface MediaSessionLike {
  metadata: unknown;
  setActionHandler(
    action: string,
    handler: ((details: unknown) => void) | null,
  ): void;
}

export interface AudioPluginOptions {
  /** Audio element factory. Default: `new Audio()`; absent: unsupported. */
  Audio?: (new () => AudioLike) | null;
  /** Default: `globalThis.AudioContext`. */
  AudioContext?: (new () => AudioContextLike) | null;
  /** Default: `navigator.mediaSession`. */
  mediaSession?: MediaSessionLike | null;
  /** Default: `globalThis.MediaMetadata`. */
  MediaMetadata?: (new (init: unknown) => unknown) | null;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface AudioPlugin extends Plugin<AudioEffect, any> {
  /** Ids of loaded sounds. */
  sounds(): string[];
}

const DEFAULT_EVENTS = [
  "timeupdate",
  "play",
  "pause",
  "ended",
  "volumechange",
  "waiting",
  "canplay",
  "error",
];
const THROTTLED = new Set(["timeupdate", "progress"]);
const FADE_STEP_MS = 50;

function snapshot(el: AudioLike): AudioSnapshot {
  const buffered: [number, number][] = [];
  const b = el.buffered;
  if (b)
    for (let i = 0; i < b.length; i++) buffered.push([b.start(i), b.end(i)]);
  const s: AudioSnapshot = {
    currentTime: el.currentTime,
    duration: el.duration,
    paused: el.paused,
    ended: el.ended,
    volume: el.volume,
    muted: el.muted,
    rate: el.playbackRate,
    buffered,
    readyState: el.readyState,
  };
  if (el.error) s.error = { code: el.error.code, message: el.error.message };
  return s;
}

function errorPayload(e: unknown): MediaErrorPayload {
  const x = e as { name?: string; message?: string; code?: number } | null;
  return {
    name: x?.name ?? "Error",
    message: x?.message ?? String(e),
    ...(typeof x?.code === "number" && { code: x.code }),
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface Entry {
  el: AudioLike;
  onError?: string;
  onEnded?: string;
  listeners: (() => void)[];
  offObserve?: () => void;
  offFade?: () => void;
  offAnalyse?: () => void;
  source?: { connect(d: unknown): unknown; disconnect(): void };
  analyser?: AnalyserNodeLike;
}

/** Sound without a DOM: <audio> elements by id, plus WebAudio tones and analysis. */
export function createAudioPlugin(opts: AudioPluginOptions = {}): AudioPlugin {
  const g = globalThis as Record<string, any>;
  const pick = <K extends keyof AudioPluginOptions>(k: K, fallback: unknown) =>
    (k in opts ? opts[k] : fallback) as any;
  const AudioCtor: (new () => AudioLike) | null =
    pick("Audio", g.Audio) ?? null;
  const AudioContextCtor: (new () => AudioContextLike) | null =
    pick("AudioContext", g.AudioContext ?? g.webkitAudioContext) ?? null;
  const session = (): MediaSessionLike | null =>
    pick("mediaSession", g.navigator?.mediaSession) ?? null;
  const MediaMetadataCtor: (new (init: unknown) => unknown) | null =
    pick("MediaMetadata", g.MediaMetadata) ?? null;
  const now = opts.now ?? Date.now;
  const si = opts.setInterval ?? ((f, ms) => globalThis.setInterval(f, ms));
  const ci =
    opts.clearInterval ?? ((h) => globalThis.clearInterval(h as number));

  const sounds = new Map<string, Entry>();
  const tones = new Set<{ stop(): void }>();
  let audioCtx: AudioContextLike | undefined;
  let handlers: string[] = [];

  const getCtx = (): AudioContextLike | undefined => {
    if (!audioCtx && AudioContextCtor) audioCtx = new AudioContextCtor();
    return audioCtx;
  };
  const resumeCtx = (): void => {
    if (audioCtx?.state === "suspended") {
      try {
        const r = audioCtx.resume?.();
        if (r && typeof r.then === "function") r.then(undefined, () => {});
      } catch {
        /* resume is best effort */
      }
    }
  };

  const stopAnalyse = (e: Entry): void => {
    e.offAnalyse?.();
    e.offAnalyse = undefined;
  };
  const release = (id: string): void => {
    const e = sounds.get(id);
    if (!e) return;
    sounds.delete(id);
    e.listeners.forEach((off) => off());
    e.offObserve?.();
    e.offFade?.();
    stopAnalyse(e);
    try {
      e.analyser?.disconnect();
      e.source?.disconnect();
      e.el.pause();
      e.el.removeAttribute("src");
      e.el.load?.();
    } catch {
      /* already gone */
    }
  };

  return {
    name: "audio",
    handle(effect, ctx) {
      const errTo = (to: string | undefined, e: unknown) =>
        to && ctx.dispatch({ id: to, payload: errorPayload(e) });
      const unsupported = (to: string | undefined) =>
        errTo(to, { name: "UnsupportedError", message: "unsupported" });

      switch (effect.type) {
        case "tone": {
          const c = getCtx();
          if (!c) return unsupported(effect.onError);
          try {
            resumeCtx();
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = effect.wave ?? "sine";
            osc.frequency.value = effect.frequency;
            gain.gain.value = clamp01(effect.volume ?? 0.2);
            osc.connect(gain);
            gain.connect(c.destination);
            const handle = {
              stop() {
                tones.delete(handle);
                osc.onended = null;
                try {
                  osc.stop();
                } catch {
                  /* not started */
                }
                osc.disconnect();
                gain.disconnect();
              },
            };
            tones.add(handle);
            osc.onended = () => {
              tones.delete(handle);
              osc.disconnect();
              gain.disconnect();
              if (effect.onEnded) ctx.dispatch({ id: effect.onEnded });
            };
            osc.start();
            osc.stop(c.currentTime + effect.ms / 1000);
          } catch (err) {
            errTo(effect.onError, err);
          }
          return;
        }
        case "mediaSession": {
          const s = session();
          if (!s) return unsupported(effect.onError);
          try {
            if (
              effect.title !== undefined ||
              effect.artist !== undefined ||
              effect.album !== undefined ||
              effect.artwork
            ) {
              if (!MediaMetadataCtor) return unsupported(effect.onError);
              const { title, artist, album, artwork } = effect;
              s.metadata = new MediaMetadataCtor({
                title,
                artist,
                album,
                artwork,
              });
            }
            const names: Record<MediaSessionAction, string> = {
              play: "play",
              pause: "pause",
              next: "nexttrack",
              previous: "previoustrack",
              seek: "seekto",
            };
            for (const n of handlers) s.setActionHandler(n, null);
            handlers = [];
            for (const [a, msg] of Object.entries(effect.actions ?? {})) {
              if (!msg) continue;
              const name = names[a as MediaSessionAction];
              s.setActionHandler(name, (d) => {
                const det = (d ?? {}) as { seekTime?: number };
                ctx.dispatch({
                  id: msg,
                  payload:
                    a === "seek" ? { seekTime: det.seekTime } : (d ?? {}),
                });
              });
              handlers.push(name);
            }
          } catch (err) {
            errTo(effect.onError, err);
          }
          return;
        }
        case "unloadAll":
          for (const id of [...sounds.keys()]) release(id);
          return;
        case "unload":
          return release(effect.id);
        case "load": {
          release(effect.id);
          if (!AudioCtor) return unsupported(effect.onError);
          let el: AudioLike;
          try {
            el = new AudioCtor();
          } catch (err) {
            return errTo(effect.onError, err);
          }
          const entry: Entry = { el, onError: effect.onError, listeners: [] };
          sounds.set(effect.id, entry);
          const on = (t: string, fn: () => void) => {
            el.addEventListener(t, fn);
            entry.listeners.push(() => el.removeEventListener(t, fn));
          };
          const once = (t: string, fn: () => void) => {
            const h = () => {
              el.removeEventListener(t, h);
              fn();
            };
            el.addEventListener(t, h);
            entry.listeners.push(() => el.removeEventListener(t, h));
          };
          once("loadedmetadata", () => {
            if (effect.onSuccess)
              ctx.dispatch({
                id: effect.onSuccess,
                payload: { duration: el.duration },
              });
          });
          once("error", () =>
            errTo(effect.onError, {
              name: "MediaError",
              message: el.error?.message || "media error",
              code: el.error?.code,
            }),
          );
          on("ended", () => {
            if (entry.onEnded) ctx.dispatch({ id: entry.onEnded });
          });
          if (effect.preload) el.preload = effect.preload;
          el.src = effect.src;
          el.load?.();
          return;
        }
      }

      const e = sounds.get(effect.id);
      if (!e) {
        if (!AudioCtor && !g.Audio) return; // unsupported environment: no-op
        throw new Error(`pavlus/audio: no sound "${effect.id}"`);
      }
      const el = e.el;
      const fail = (to: string | undefined, err: unknown) =>
        errTo(to ?? e.onError, err);

      switch (effect.type) {
        case "play": {
          if (effect.from !== undefined) el.currentTime = effect.from;
          e.onEnded = effect.onEnded;
          resumeCtx();
          try {
            const r = el.play() as Promise<void> | undefined;
            if (r && typeof r.then === "function")
              r.then(undefined, (err) => fail(effect.onError, err));
          } catch (err) {
            fail(effect.onError, err);
          }
          return;
        }
        case "pause":
          return el.pause();
        case "stop":
          el.pause();
          el.currentTime = 0;
          return;
        case "seek":
          el.currentTime = effect.time;
          return;
        case "volume":
          e.offFade?.();
          el.volume = clamp01(effect.value);
          return;
        case "mute":
          el.muted = effect.muted;
          return;
        case "loop":
          el.loop = effect.value;
          return;
        case "rate":
          el.playbackRate = effect.value;
          return;
        case "fade": {
          e.offFade?.();
          const to = clamp01(effect.to);
          const done = () => {
            e.offFade = undefined;
            if (effect.onSuccess) ctx.dispatch({ id: effect.onSuccess });
          };
          if (effect.ms <= 0) {
            el.volume = to;
            return done();
          }
          const from = el.volume;
          const start = now();
          const h = si(() => {
            const t = Math.min(1, (now() - start) / effect.ms);
            el.volume = clamp01(from + (to - from) * t);
            if (t >= 1) {
              ci(h);
              done();
            }
          }, FADE_STEP_MS);
          e.offFade = () => {
            ci(h);
            e.offFade = undefined;
          };
          return;
        }
        case "observe": {
          e.offObserve?.();
          const gap = effect.intervalMs ?? 0;
          let last = -Infinity;
          const subs = (effect.events ?? DEFAULT_EVENTS).map((t) => {
            const h = () => {
              if (gap > 0 && THROTTLED.has(t)) {
                const n = now();
                if (n - last < gap) return;
                last = n;
              }
              ctx.dispatch({ id: effect.onChange, payload: snapshot(el) });
            };
            el.addEventListener(t, h);
            return () => el.removeEventListener(t, h);
          });
          e.offObserve = () => {
            subs.forEach((off) => off());
            e.offObserve = undefined;
          };
          return;
        }
        case "stopAnalyse":
          return stopAnalyse(e);
        case "analyse": {
          const c = getCtx();
          if (!c) return unsupported(effect.onError ?? e.onError);
          try {
            stopAnalyse(e);
            resumeCtx();
            if (!e.source) {
              // An element can be wrapped only once; keep the graph for reuse.
              e.source = c.createMediaElementSource(el);
              e.analyser = c.createAnalyser();
              e.source.connect(e.analyser);
              e.analyser.connect(c.destination);
            }
            const an = e.analyser!;
            an.fftSize = effect.fftSize ?? 256;
            const data = new Uint8Array(an.frequencyBinCount);
            const bands = Math.max(1, effect.bands ?? 8);
            const h = si(() => {
              an.getByteFrequencyData(data);
              const n = data.length;
              let sum = 0;
              for (let i = 0; i < n; i++) sum += data[i];
              const out: number[] = [];
              for (let b = 0; b < bands; b++) {
                const lo = Math.floor((b * n) / bands);
                const hi = Math.max(lo + 1, Math.floor(((b + 1) * n) / bands));
                let s = 0;
                for (let i = lo; i < hi && i < n; i++) s += data[i];
                out.push(s / (Math.max(1, Math.min(hi, n) - lo) * 255));
              }
              ctx.dispatch({
                id: effect.onChange,
                payload: { level: n ? sum / (n * 255) : 0, bands: out },
              });
            }, effect.intervalMs ?? 100);
            e.offAnalyse = () => ci(h);
          } catch (err) {
            fail(effect.onError, err);
          }
        }
      }
    },
    sounds: () => [...sounds.keys()],
    dispose() {
      for (const id of [...sounds.keys()]) release(id);
      for (const t of [...tones]) t.stop();
      const s = session();
      if (s) for (const n of handlers) s.setActionHandler(n, null);
      handlers = [];
      try {
        void (audioCtx as { close?: () => unknown } | undefined)?.close?.();
      } catch {
        /* ignore */
      }
      audioCtx = undefined;
    },
  };
}

export { audioEffector, playlist, next, prev, shuffle } from "./helpers.ts";
export type { AudioEffector } from "./helpers.ts";
