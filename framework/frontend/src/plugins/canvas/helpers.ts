import type { CanvasEffect, CanvasOp, CanvasTarget } from "./mod.ts";

type Of<T extends CanvasEffect["type"]> = Extract<CanvasEffect, { type: T }>;

/** Builders for canvas effects. */
export interface CanvasEffector {
  /** Interprets `ops` on the canvas. Unknown or malformed ops reply `onError` and draw nothing. */
  draw(
    target: CanvasTarget,
    ops: CanvasOp[],
    options?: { clear?: boolean; onError?: string },
  ): Of<"draw">;
  /** Loads an image under `id` so `drawImage` ops can use it. */
  loadImage(
    id: string,
    src: string,
    onSuccess?: string,
    onError?: string,
  ): Of<"loadImage">;
  /** Sizes the canvas in CSS pixels and scales its backing store by `dpr`. */
  size(
    target: CanvasTarget,
    width: number,
    height: number,
    dpr?: number,
  ): Of<"size">;
  /** Starts a requestAnimationFrame loop dispatching `{ time, dt, frame }` to `onFrame`. */
  frames(id: string, onFrame: string, target?: CanvasTarget): Of<"frames">;
  stopFrames(id: string): Of<"stopFrames">;
  /** Streams pointer events in canvas coordinates to `onChange`. */
  pointer(id: string, target: CanvasTarget, onChange: string): Of<"pointer">;
  stopPointer(id: string): Of<"stopPointer">;
  /** Replies the canvas contents as a data URL. */
  snapshot(
    target: CanvasTarget,
    onSuccess: string,
    options?: { mime?: string; quality?: number; onError?: string },
  ): Of<"snapshot">;
}

/**
 * ```ts
 * import { canvasEffector as canvas } from "@pavlus/frontend/plugins/canvas";
 *
 * return [
 *   canvas.draw("#game", [
 *     { op: "fillStyle", value: "tomato" },
 *     { op: "fillRect", x: state.x, y: 10, w: 20, h: 20 },
 *   ], { clear: true }),
 * ];
 * ```
 */
export const canvasEffector: CanvasEffector = {
  draw: (target, ops, options) => ({
    plugin: "canvas",
    type: "draw",
    target,
    ops,
    ...(options?.clear !== undefined && { clear: options.clear }),
    ...(options?.onError !== undefined && { onError: options.onError }),
  }),
  loadImage: (id, src, onSuccess, onError) => ({
    plugin: "canvas",
    type: "loadImage",
    id,
    src,
    ...(onSuccess !== undefined && { onSuccess }),
    ...(onError !== undefined && { onError }),
  }),
  size: (target, width, height, dpr) => ({
    plugin: "canvas",
    type: "size",
    target,
    width,
    height,
    ...(dpr !== undefined && { dpr }),
  }),
  frames: (id, onFrame, target) => ({
    plugin: "canvas",
    type: "frames",
    id,
    onFrame,
    ...(target !== undefined && { target }),
  }),
  stopFrames: (id) => ({ plugin: "canvas", type: "stopFrames", id }),
  pointer: (id, target, onChange) => ({
    plugin: "canvas",
    type: "pointer",
    id,
    target,
    onChange,
  }),
  stopPointer: (id) => ({ plugin: "canvas", type: "stopPointer", id }),
  snapshot: (target, onSuccess, options) => ({
    plugin: "canvas",
    type: "snapshot",
    target,
    onSuccess,
    ...(options?.mime !== undefined && { mime: options.mime }),
    ...(options?.quality !== undefined && { quality: options.quality }),
    ...(options?.onError !== undefined && { onError: options.onError }),
  }),
};
