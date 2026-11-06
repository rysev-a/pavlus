/**
 * Server-side rendering: the same pure `render` gives HTML on the server,
 * and the DOM plugin hydrates it in the browser (listeners and ids go onto
 * the markup that is already there). The application runs on the server as
 * it does in the browser: `createApp` without `mount`, the store, and an
 * http plugin whose `fetch` answers in-process; `http.settled()` says when
 * the data is in. See `docs/ssr.md`.
 *
 * @module
 */
import { Component } from "../component/mod.ts";
import {
  RENDER_END,
  RENDER_START,
  toHtml,
  type View,
} from "../runtime/vnode.ts";

/** The HTML of `view` for `state`, as the DOM plugin expects it for hydration. */
export function renderToString<S>(view: View<S>, state: S): string {
  const html = toHtml(view.render(state), { markers: true });
  return `<!--${RENDER_START}-->${html}<!--${RENDER_END}-->`;
}

/** A component value in the state, serialized: the name it has in `components`. */
interface ComponentRef {
  $component: string;
}

/**
 * The state as JSON. A component that is a value in the state (`+{expr}` in
 * a template) is not data: it is replaced by its name in `components`, and
 * `reviveState` puts the instance back. An instance not in `components` is
 * an error that names the fix.
 */
export function serializeState(
  state: unknown,
  components: Record<string, Component> = {},
): string {
  const names = new Map<Component, string>();
  for (const [name, c] of Object.entries(components)) names.set(c, name);
  return JSON.stringify(state, (_key, value) => {
    if (value instanceof Component) {
      const name = names.get(value);
      if (name === undefined) {
        throw new Error(
          `pavlus/ssr: a ${value.constructor.name} instance is in the state; list it in \`components\` to serialize it`,
        );
      }
      return { $component: name } satisfies ComponentRef;
    }
    return value;
  });
}

/** The state back from `serializeState`, with the component instances in place. */
export function reviveState<S>(
  json: string,
  components: Record<string, Component> = {},
): S {
  return JSON.parse(json, (_key, value) => {
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as ComponentRef).$component === "string"
    ) {
      const name = (value as ComponentRef).$component;
      const c = components[name];
      if (!c) throw new Error(`pavlus/ssr: no component named "${name}"`);
      return c;
    }
    return value;
  }) as S;
}
