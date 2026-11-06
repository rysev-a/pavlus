// createApp itself lives in @pavlus/core; the frontend adds `mount` on top of
// it (mounting is a dom-plugin effect, so it does not belong in the core).
import {
  type App,
  type CreateAppOptions as CoreCreateAppOptions,
  createApp as createCoreApp,
} from "@pavlus/core";
import { viewOf } from "../component/mod.ts";
import { DomPlugin } from "../plugins/dom/mod.ts";

export * from "@pavlus/core";

export interface CreateAppOptions<S> extends CoreCreateAppOptions<S> {
  /**
   * Where to render the application: a CSS selector or an element. Needs the
   * dom plugin and an `app` that is a component with a `view`. Once in the
   * DOM, the message `mounted` is dispatched (a component with `routing`
   * starts listening to the router on it). What is painted after that is up
   * to the application: a component paints itself in a handler (usually
   * `paint`, the answer of a store write) by diffing its own view and
   * returning `DomPlugin.update(patches)`.
   */
  mount?: string | Element;
}

/**
 * Wires the pure application to its plugins, then mounts its view.
 *
 * Messages are processed strictly one at a time. For each message the core
 * calls `app(message, state)` and hands the resulting effects to the plugins
 * in order; when the state changed, the plugins hear about it through
 * `onState`. The core never touches the DOM: painting is an effect like any
 * other, computed by the components.
 */
export function createApp<S = unknown>(opts: CreateAppOptions<S>): App {
  // the core initialises the plugins; `init` waits until the view is mounted
  // (the original order: init plugins, mount, then dispatch `init`)
  const { mount, init, ...rest } = opts;
  const app = createCoreApp<S>(rest);
  if (mount !== undefined) {
    const view = viewOf(opts.app as Parameters<typeof viewOf>[0]);
    if (!view) {
      throw new Error(
        "pavlus: `mount` needs an `app` that is a component with a `view`",
      );
    }
    if (!rest.plugins.some((p) => p.name === "dom")) {
      throw new Error("pavlus: `mount` needs the dom plugin (new DomPlugin())");
    }
    // A direct view (built by `create`, no `diff`) cannot compute paint
    // effects, so its component opts into the plugin repainting on state
    // changes instead.
    const followState =
      (
        opts.app as Parameters<typeof viewOf>[0] & {
          updateDomOnStateChange?: boolean;
        }
      ).updateDomOnStateChange === true;
    app.perform(
      DomPlugin.mount(mount, view, {
        onMounted: "mounted",
        ...(followState && { followState: true }),
      }),
    );
  }
  if (init) app.dispatch(init);
  return app;
}
