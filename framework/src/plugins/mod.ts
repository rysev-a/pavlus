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
