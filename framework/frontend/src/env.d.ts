/** Types for importing templates: `import view from "./page.pavlus"`. */
declare module "*.pavlus" {
  import type { Patch, View, VNode } from "./runtime/vnode.ts";
  export function render(state: any, sfx?: string, ns?: string): VNode[];
  export function diff(
    prev: any,
    next: any,
    sfx?: string,
    ns?: string,
  ): Patch[];
  export const meta: { embeds: string[] };
  const view: View;
  export default view;
}
