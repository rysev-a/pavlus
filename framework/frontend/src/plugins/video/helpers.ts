import type { VideoEffect } from "./mod.ts";

type Of<T extends VideoEffect["type"]> = Extract<VideoEffect, { type: T }>;
type Opts<T extends VideoEffect["type"]> = Omit<Of<T>, "plugin" | "type">;

/** Builders for <video> effects. */
export interface VideoEffector {
  /** Attaches to `target` or creates an off-DOM video, and loads the source. */
  load(options: Opts<"load">): Of<"load">;
  play(id: string, onError?: string): Of<"play">;
  pause(id: string): Of<"pause">;
  toggle(id: string, onError?: string): Of<"toggle">;
  seek(id: string, time: number): Of<"seek">;
  volume(id: string, value: number): Of<"volume">;
  mute(id: string, muted?: boolean): Of<"mute">;
  rate(id: string, value: number): Of<"rate">;
  loop(id: string, value?: boolean): Of<"loop">;
  fullscreen(id: string, on?: boolean, onError?: string): Of<"fullscreen">;
  pictureInPicture(
    id: string,
    on?: boolean,
    onError?: string,
  ): Of<"pictureInPicture">;
  /** Streams snapshots to `onChange`; one observer per id. */
  observe(options: Opts<"observe">): Of<"observe">;
  /** Releases the source and removes listeners. */
  unload(id: string): Of<"unload">;
  captureFrame(options: Opts<"captureFrame">): Of<"captureFrame">;
}

const withErr = <T extends object>(o: T, onError?: string): T =>
  onError === undefined ? o : { ...o, onError };

/**
 * ```ts
 * import { videoEffector as video } from "@pavlus/frontend/plugins/video";
 *
 * return [video.load({ id: "hero", target: "#hero", src: "/a.mp4" }), video.play("hero", "hero.blocked")];
 * ```
 */
export const videoEffector: VideoEffector = {
  load: (options) => ({ plugin: "video", type: "load", ...options }),
  play: (id, onError) =>
    withErr({ plugin: "video", type: "play", id }, onError),
  pause: (id) => ({ plugin: "video", type: "pause", id }),
  toggle: (id, onError) =>
    withErr({ plugin: "video", type: "toggle", id }, onError),
  seek: (id, time) => ({ plugin: "video", type: "seek", id, time }),
  volume: (id, value) => ({ plugin: "video", type: "volume", id, value }),
  mute: (id, muted = true) => ({ plugin: "video", type: "mute", id, muted }),
  rate: (id, value) => ({ plugin: "video", type: "rate", id, value }),
  loop: (id, value = true) => ({ plugin: "video", type: "loop", id, value }),
  fullscreen: (id, on = true, onError) =>
    withErr({ plugin: "video", type: "fullscreen", id, on }, onError),
  pictureInPicture: (id, on = true, onError) =>
    withErr({ plugin: "video", type: "pictureInPicture", id, on }, onError),
  observe: (options) => ({ plugin: "video", type: "observe", ...options }),
  unload: (id) => ({ plugin: "video", type: "unload", id }),
  captureFrame: (options) => ({
    plugin: "video",
    type: "captureFrame",
    ...options,
  }),
};
