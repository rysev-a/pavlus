/**
 * Every built-in plugin and its effector from one import:
 *
 * ```ts
 * import { createDomPlugin, createHttpPlugin, storeEffector as store } from "@service-laboratory/pavlus/plugins";
 * ```
 *
 * Importing this does not run any code; a bundler only keeps what you use.
 * The plugins are also available one by one (`.../plugins/store`, ...).
 *
 * @module
 */

export * from "./dom/mod.ts";
export * from "./http/mod.ts";
export * from "./logger/mod.ts";
export * from "./router/mod.ts";
export * from "./store/mod.ts";
export * from "./time/mod.ts";
export * from "./ws/mod.ts";
export * from "./canvas/mod.ts";
export * from "./svg/mod.ts";
export * from "./video/mod.ts";
export * from "./audio/mod.ts";
export * from "./geolocation/mod.ts";
export * from "./serviceworker/mod.ts";

// video and audio each define these helper types; the index names video's and
// gives audio's an alias (import `.../plugins/audio` for the original names).
export type { MediaErrorPayload, RangesLike } from "./video/mod.ts";
export type {
  MediaErrorPayload as AudioErrorPayload,
  RangesLike as AudioRangesLike,
} from "./audio/mod.ts";
