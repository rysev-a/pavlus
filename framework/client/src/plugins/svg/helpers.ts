import type { SvgEffect, SvgTarget } from "./mod.ts";
import type { SvgNode } from "./tree.ts";

type Of<T extends SvgEffect["type"]> = Extract<SvgEffect, { type: T }>;

/** Builders for svg effects. Trees are plain data; see `h.ts` for building them. */
export interface SvgEffector {
  mount(
    target: SvgTarget,
    tree: SvgNode,
    onMounted?: string,
    onError?: string,
  ): Of<"mount">;
  update(target: SvgTarget, tree: SvgNode, onError?: string): Of<"update">;
  unmount(target: SvgTarget): Of<"unmount">;
  /** Replies `{ x, y, width, height }` of the root, or of the first element matching `selector`. */
  measure(
    target: SvgTarget,
    onSuccess: string,
    selector?: string,
    onError?: string,
  ): Of<"measure">;
  /** Replies the SVG markup for `tree`. */
  toString(tree: SvgNode, onSuccess: string, onError?: string): Of<"toString">;
}

/**
 * ```ts
 * import { svgEffector as svg } from "@pavlus/client/plugins/svg";
 * import { root, circle } from "@pavlus/client/plugins/svg/h";
 *
 * return [svg.update("#chart", root({ viewBox: "0 0 100 100" }, circle({ r: state.r })))];
 * ```
 */
export const svgEffector: SvgEffector = {
  mount: (target, tree, onMounted, onError) => ({
    plugin: "svg",
    type: "mount",
    target,
    tree,
    ...(onMounted !== undefined && { onMounted }),
    ...(onError !== undefined && { onError }),
  }),
  update: (target, tree, onError) => ({
    plugin: "svg",
    type: "update",
    target,
    tree,
    ...(onError !== undefined && { onError }),
  }),
  unmount: (target) => ({ plugin: "svg", type: "unmount", target }),
  measure: (target, onSuccess, selector, onError) => ({
    plugin: "svg",
    type: "measure",
    target,
    onSuccess,
    ...(selector !== undefined && { selector }),
    ...(onError !== undefined && { onError }),
  }),
  toString: (tree, onSuccess, onError) => ({
    plugin: "svg",
    type: "toString",
    tree,
    onSuccess,
    ...(onError !== undefined && { onError }),
  }),
};
