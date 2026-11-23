import type { CanvasTarget } from "../canvas/mod.ts";
import type { Canvas3dEffect } from "./mod.ts";
import type { Scene3 } from "./math.ts";

/** Builders for canvas3d effects. */
export interface Canvas3dEffector {
  /** Projects `scene` and draws it on the canvas (sized `width` × `height` CSS px). */
  render(
    target: CanvasTarget,
    scene: Scene3,
    size: { width: number; height: number },
    onError?: string,
  ): Canvas3dEffect;
}

/**
 * ```ts
 * import { canvas3dEffector as canvas3d } from "@pavlus/client/plugins/canvas3d";
 *
 * return [canvas3d.render("#view", { camera, polys }, { width: 480, height: 400 })];
 * ```
 */
export const canvas3dEffector: Canvas3dEffector = {
  render: (target, scene, size, onError) => ({
    plugin: "canvas3d",
    type: "render",
    target,
    scene,
    width: size.width,
    height: size.height,
    ...(onError ? { onError } : {}),
  }),
};
