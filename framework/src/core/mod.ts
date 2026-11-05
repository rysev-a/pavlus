import { type ComponentLike, toHandler, viewOf } from "../component/mod.ts";
import { domEffector } from "../plugins/dom/helpers.ts";
import type {
  Effect,
  Message,
  Plugin,
  PluginContext,
  StatefulPlugin,
} from "./types.ts";

export type * from "./types.ts";

export interface CreateAppOptions<S> {
  /** The application: a function, an object with message handlers, or a class instance. */
  app: ComponentLike<S>;
  plugins: Plugin<any, any>[];
  /** Defaults to the first plugin that has a `getState()` (the store). */
  getState?: () => S;
  /**
   * Where to render the application: a CSS selector or an element. Needs the
   * dom plugin and an `app` that is a component with a `view`. Once in the
   * DOM, the message `mounted` is dispatched (a component with `routing`
   * starts listening to the router on it). The root follows application
   * state changes only when the component sets `updateDomOnStateChange`;
   * otherwise the application repaints with `dom.update(prev, next)` when
   * it decides to — usually from a store write's answer.
   */
  mount?: string | Element;
  /** Message dispatched once all plugins are initialised (after `mount`). */
  init?: Message;
  /** Safety valve against message loops. */
  maxMessagesPerTick?: number;
  /** Called for every processed message and its effects (logging, tests). */
  onStep?: (message: Message, effects: Effect[]) => void;
}

export interface App {
  dispatch(message: Message): void;
  dispose(): void;
}

/**
 * Wires the pure application to its plugins.
 *
 * Messages are processed strictly one at a time. For each message the core
 * calls `app(message, state)`, hands the resulting effects to the plugins in
 * order, and, if the state changed, notifies the plugins with `onState`.
 */
export function createApp<S = unknown>(opts: CreateAppOptions<S>): App {
  const app = toHandler(opts.app);
  const byName = new Map<string, Plugin<any, any>>();
  for (const p of opts.plugins) {
    if (byName.has(p.name))
      throw new Error(`pavlus: duplicate plugin "${p.name}"`);
    byName.set(p.name, p);
  }
  const stateful = opts.plugins.find(
    (p): p is StatefulPlugin<S> =>
      typeof (p as StatefulPlugin<S>).getState === "function",
  );
  const getState =
    opts.getState ??
    (stateful ? () => stateful.getState() : () => undefined as S);
  const limit = opts.maxMessagesPerTick ?? 10_000;

  const queue: Message[] = [];
  let running = false;
  let disposed = false;

  const ctx: PluginContext<S> = {
    dispatch,
    getState,
    dispatchEffect(effect: Effect): void {
      if (disposed) return;
      const before = getState();
      perform(effect);
      const next = getState();
      if (next !== before) for (const p of opts.plugins) p.onState?.(next, ctx);
    },
  };

  function perform(effect: Effect): void {
    const plugin = byName.get(effect.plugin);
    if (!plugin) {
      throw new Error(
        `pavlus: no plugin "${effect.plugin}" for effect "${effect.type}"`,
      );
    }
    plugin.handle(effect, ctx);
  }

  function dispatch(message: Message): void {
    if (disposed) return;
    queue.push(message);
    if (running) return;
    running = true;
    try {
      let n = 0;
      let state = getState();
      while (queue.length) {
        if (++n > limit) {
          queue.length = 0;
          throw new Error(
            `pavlus: more than ${limit} messages in one tick (message loop?)`,
          );
        }
        const msg = queue.shift()!;
        const produced = app(msg, state);
        // the context of a message rides on its effects (no-op without one)
        const effects = msg.ctx
          ? produced.map((e) => (e.ctx ? e : { ...e, ctx: msg.ctx }))
          : produced;
        opts.onStep?.(msg, effects);
        for (const effect of effects) perform(effect);
        const next = getState();
        if (next !== state) {
          state = next;
          for (const p of opts.plugins) p.onState?.(next, ctx);
        }
      }
    } finally {
      running = false;
    }
  }

  for (const p of opts.plugins) p.init?.(ctx);
  if (opts.mount !== undefined) {
    const view = typeof opts.app === "function" ? undefined : viewOf(opts.app);
    if (!view) {
      throw new Error(
        "pavlus: `mount` needs an `app` that is a component with a `view`",
      );
    }
    if (!byName.has("dom")) {
      throw new Error("pavlus: `mount` needs the dom plugin (createDomPlugin)");
    }
    const followState =
      (opts.app as { updateDomOnStateChange?: boolean })
        .updateDomOnStateChange === true;
    perform(
      domEffector.mount(opts.mount, view, {
        onMounted: "mounted",
        ...(followState && { followState: true }),
      }),
    );
  }
  if (opts.init) dispatch(opts.init);

  return {
    dispatch,
    dispose() {
      disposed = true;
      for (const p of [...opts.plugins].reverse()) p.dispose?.();
    },
  };
}
