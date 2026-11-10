import type { Plugin } from "../../core/types.ts";

/** Serializable error payload sent to `onError`. */
export interface MediaErrorPayload {
  name: string;
  message: string;
  code?: number;
}

/** Serializable snapshot streamed to `observe.onChange`. */
export interface VideoSnapshot {
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

interface Err {
  /** Receives a {@link MediaErrorPayload}. Falls back to the `onError` of `load`. */
  onError?: string;
}

export type VideoEffect =
  | {
      plugin: "video";
      type: "load";
      id: string;
      /** Selector or element of an existing <video>; omitted: an off-DOM one is created. */
      target?: string | VideoLike;
      src?: string;
      sources?: { src: string; type?: string }[];
      poster?: string;
      preload?: "none" | "metadata" | "auto";
      /** Payload: `{ duration, width, height }` once metadata is loaded. */
      onSuccess?: string;
      onError?: string;
    }
  | ({ plugin: "video"; type: "play"; id: string } & Err)
  | ({ plugin: "video"; type: "pause"; id: string } & Err)
  | ({ plugin: "video"; type: "toggle"; id: string } & Err)
  | { plugin: "video"; type: "seek"; id: string; time: number }
  | { plugin: "video"; type: "volume"; id: string; value: number }
  | { plugin: "video"; type: "mute"; id: string; muted: boolean }
  | { plugin: "video"; type: "rate"; id: string; value: number }
  | { plugin: "video"; type: "loop"; id: string; value: boolean }
  | ({ plugin: "video"; type: "fullscreen"; id: string; on: boolean } & Err)
  | ({
      plugin: "video";
      type: "pictureInPicture";
      id: string;
      on: boolean;
    } & Err)
  | ({
      plugin: "video";
      type: "observe";
      id: string;
      /** Payload: a {@link VideoSnapshot}. */
      onChange: string;
      /** DOM events that trigger a snapshot. */
      events?: string[];
      /** Minimum gap between snapshots caused by `timeupdate`/`progress`. */
      intervalMs?: number;
    } & Err)
  | { plugin: "video"; type: "unload"; id: string }
  | {
      plugin: "video";
      type: "captureFrame";
      id: string;
      /** Image mime type, default `image/png` (`type` is the effect discriminator). */
      imageType?: string;
      /** Payload: the data URL. */
      onSuccess: string;
      onError?: string;
    };

export interface RangesLike {
  length: number;
  start(i: number): number;
  end(i: number): number;
}

/** The subset of `HTMLVideoElement` the plugin needs. */
export interface VideoLike {
  src: string;
  poster?: string;
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
  videoWidth: number;
  videoHeight: number;
  play(): Promise<void> | void;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, fn: (ev?: unknown) => void): void;
  removeEventListener(type: string, fn: (ev?: unknown) => void): void;
  canPlayType?(type: string): string;
  requestFullscreen?(): Promise<void> | void;
  requestPictureInPicture?(): Promise<unknown>;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: "2d"): {
    drawImage(src: unknown, x: number, y: number, w: number, h: number): void;
  } | null;
  toDataURL(type?: string): string;
}

export interface DocumentLike {
  createElement(tag: string): unknown;
  querySelector(selector: string): unknown;
  fullscreenElement?: unknown;
  pictureInPictureElement?: unknown;
  exitFullscreen?(): Promise<void> | void;
  exitPictureInPicture?(): Promise<void> | void;
}

export interface VideoPluginOptions {
  /** Defaults to `globalThis.document`. `null`: unsupported environment. */
  document?: DocumentLike | null;
  now?: () => number;
}

export interface VideoPlugin extends Plugin<VideoEffect, any> {
  /** Ids of managed videos. */
  videos(): string[];
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

export function snapshot(el: VideoLike): VideoSnapshot {
  const buffered: [number, number][] = [];
  const b = el.buffered;
  if (b)
    for (let i = 0; i < b.length; i++) buffered.push([b.start(i), b.end(i)]);
  const s: VideoSnapshot = {
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

export function errorPayload(e: unknown): MediaErrorPayload {
  const x = e as { name?: string; message?: string; code?: number } | null;
  return {
    name: x?.name ?? "Error",
    message: x?.message ?? String(e),
    ...(typeof x?.code === "number" && { code: x.code }),
  };
}

interface Entry {
  el: VideoLike;
  /** We set `src`, so unload must release it. */
  hasSrc: boolean;
  onError?: string;
  offLoad?: () => void;
  offObserve?: () => void;
}

/** Controls and observes <video> elements. Everything is addressed by `id`. */
export function createVideoPlugin(opts: VideoPluginOptions = {}): VideoPlugin {
  const now = opts.now ?? Date.now;
  const doc = (): DocumentLike | null =>
    "document" in opts
      ? (opts.document ?? null)
      : ((globalThis as { document?: DocumentLike }).document ?? null);
  const entries = new Map<string, Entry>();

  const listen = (el: VideoLike, events: string[], fn: (t: string) => void) => {
    const subs = events.map((t) => {
      const h = () => fn(t);
      el.addEventListener(t, h);
      return () => el.removeEventListener(t, h);
    });
    return () => subs.forEach((off) => off());
  };

  const release = (id: string): void => {
    const e = entries.get(id);
    if (!e) return;
    entries.delete(id);
    e.offLoad?.();
    e.offObserve?.();
    if (e.hasSrc) {
      try {
        e.el.pause();
        e.el.removeAttribute("src");
        e.el.load();
      } catch {
        /* element already gone */
      }
    }
  };

  return {
    name: "video",
    handle(effect, ctx) {
      const d = doc();
      const errTo = (to: string | undefined, e: unknown) =>
        to && ctx.dispatch({ id: to, payload: errorPayload(e) });
      const unsupported = (to: string | undefined) =>
        errTo(to, { name: "UnsupportedError", message: "unsupported" });

      if (!d) {
        // SSR / no DOM: harmless no-op that reports.
        if ("onError" in effect) unsupported(effect.onError);
        return;
      }

      if (effect.type === "load") {
        release(effect.id);
        let el: VideoLike;
        if (effect.target !== undefined) {
          const t =
            typeof effect.target === "string"
              ? (d.querySelector(effect.target) as VideoLike | null)
              : effect.target;
          if (!t)
            return errTo(effect.onError, {
              name: "NotFoundError",
              message: `no element for "${String(effect.target)}"`,
            });
          el = t;
        } else {
          el = d.createElement("video") as VideoLike;
        }
        const entry: Entry = { el, hasSrc: false, onError: effect.onError };
        entries.set(effect.id, entry);
        if (effect.preload) el.preload = effect.preload;
        if (effect.poster !== undefined) el.poster = effect.poster;
        let src = effect.src;
        if (src === undefined && effect.sources?.length) {
          const pick =
            effect.sources.find(
              (s) => s.type && el.canPlayType && el.canPlayType(s.type) !== "",
            ) ?? effect.sources[0];
          src = pick.src;
        }
        const ready = () =>
          effect.onSuccess &&
          ctx.dispatch({
            id: effect.onSuccess,
            payload: {
              duration: el.duration,
              width: el.videoWidth,
              height: el.videoHeight,
            },
          });
        if (src !== undefined) {
          entry.offLoad = listen(el, ["loadedmetadata", "error"], (t) => {
            entry.offLoad?.();
            entry.offLoad = undefined;
            if (t === "error")
              errTo(effect.onError, {
                name: "MediaError",
                message: el.error?.message || "media error",
                code: el.error?.code,
              });
            else ready();
          });
          el.src = src;
          entry.hasSrc = true;
          el.load();
        } else if (el.readyState >= 1) {
          ready();
        } else {
          entry.offLoad = listen(el, ["loadedmetadata"], () => {
            entry.offLoad?.();
            entry.offLoad = undefined;
            ready();
          });
        }
        return;
      }

      const e = entries.get(effect.id);
      if (!e) {
        if (effect.type === "unload") return;
        throw new Error(`pavlus/video: no video "${effect.id}"`);
      }
      const el = e.el;
      const fail = (to: string | undefined, err: unknown) =>
        errTo(to ?? e.onError, err);
      const settle = (to: string | undefined, fn: () => unknown) => {
        try {
          const r = fn() as Promise<unknown> | undefined;
          if (r && typeof r.then === "function")
            r.then(undefined, (err) => fail(to, err));
        } catch (err) {
          fail(to, err);
        }
      };

      switch (effect.type) {
        case "play":
          return settle(effect.onError, () => el.play());
        case "pause":
          return settle(effect.onError, () => el.pause());
        case "toggle":
          return settle(effect.onError, () =>
            el.paused ? el.play() : el.pause(),
          );
        case "seek":
          el.currentTime = effect.time;
          return;
        case "volume":
          el.volume = Math.min(1, Math.max(0, effect.value));
          return;
        case "mute":
          el.muted = effect.muted;
          return;
        case "rate":
          el.playbackRate = effect.value;
          return;
        case "loop":
          el.loop = effect.value;
          return;
        case "fullscreen":
          if (effect.on) {
            if (!el.requestFullscreen)
              return unsupported(effect.onError ?? e.onError);
            return settle(effect.onError, () => el.requestFullscreen!());
          }
          if (!d.exitFullscreen)
            return unsupported(effect.onError ?? e.onError);
          if (d.fullscreenElement)
            settle(effect.onError, () => d.exitFullscreen!());
          return;
        case "pictureInPicture":
          if (effect.on) {
            if (!el.requestPictureInPicture)
              return unsupported(effect.onError ?? e.onError);
            return settle(effect.onError, () => el.requestPictureInPicture!());
          }
          if (!d.exitPictureInPicture)
            return unsupported(effect.onError ?? e.onError);
          if (d.pictureInPictureElement)
            settle(effect.onError, () => d.exitPictureInPicture!());
          return;
        case "observe": {
          e.offObserve?.();
          const gap = effect.intervalMs ?? 0;
          let last = -Infinity;
          e.offObserve = listen(el, effect.events ?? DEFAULT_EVENTS, (t) => {
            if (gap > 0 && THROTTLED.has(t)) {
              const n = now();
              if (n - last < gap) return;
              last = n;
            }
            ctx.dispatch({ id: effect.onChange, payload: snapshot(el) });
          });
          return;
        }
        case "unload":
          return release(effect.id);
        case "captureFrame": {
          try {
            const w = el.videoWidth;
            const h = el.videoHeight;
            if (!w || !h)
              throw Object.assign(new Error("no frame available"), {
                name: "InvalidStateError",
              });
            const canvas = d.createElement("canvas") as CanvasLike;
            canvas.width = w;
            canvas.height = h;
            const g = canvas.getContext("2d");
            if (!g) throw new Error("2d context unavailable");
            g.drawImage(el, 0, 0, w, h);
            ctx.dispatch({
              id: effect.onSuccess,
              payload: canvas.toDataURL(effect.imageType),
            });
          } catch (err) {
            fail(effect.onError, err);
          }
        }
      }
    },
    videos: () => [...entries.keys()],
    dispose() {
      for (const id of [...entries.keys()]) release(id);
    },
  };
}

export { videoEffector } from "./helpers.ts";
export type { VideoEffector } from "./helpers.ts";
