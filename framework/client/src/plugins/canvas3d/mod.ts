import type { Plugin } from "../../core/types.ts";
import type { CanvasOp, CanvasTarget } from "../canvas/mod.ts";
import { type Scene3, sceneOps } from "./math.ts";

export * from "./math.ts";

/**
 * Renders a 3D scene — plain data: polygons and a camera — onto a canvas.
 * The projection is pure (`sceneOps`); the plugin only hands the resulting
 * ops to the canvas plugin, which must be mounted next to it.
 */
export type Canvas3dEffect = {
  plugin: "canvas3d";
  type: "render";
  target: CanvasTarget;
  scene: Scene3;
  /** Logical size of the canvas, in CSS px (the one given to `canvas.size`). */
  width: number;
  height: number;
  /** Message to answer if the canvas rejects the ops. */
  onError?: string;
};

export interface Canvas3dPlugin extends Plugin<Canvas3dEffect, any> {
  /** Number of `render` effects handled so far. */
  renders(): number;
}

export function createCanvas3dPlugin(): Canvas3dPlugin {
  let renders = 0;
  return {
    name: "canvas3d",
    handle(effect, ctx) {
      if (effect.type !== "render") return;
      renders++;
      const ops: CanvasOp[] = sceneOps(effect.scene, effect);
      ctx.dispatchEffect({
        plugin: "canvas",
        type: "draw",
        target: effect.target,
        ops,
        clear: true,
        ...(effect.onError ? { onError: effect.onError } : {}),
      });
    },
    renders: () => renders,
  };
}

export { canvas3dEffector } from "./helpers.ts";
