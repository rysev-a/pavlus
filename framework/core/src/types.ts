/** Serializable summary of a DOM event, attached to messages by the DOM plugin. */
export interface DomEventInfo {
  type: string;
  value?: string;
  checked?: boolean;
  key?: string;
}

/** Input of the application: plain data. */
export interface Message {
  id: string;
  payload?: unknown;
  /**
   * Context that rides with the message (a server request id, the connection
   * it belongs to...). The core copies it onto every effect the message
   * produces, and a plugin copies it onto its reply, so a flow keeps its
   * context from the first message to the last.
   */
  ctx?: Record<string, unknown>;
  event?: DomEventInfo;
}

/** Output of the application: a request for a plugin to do something. */
export interface Effect {
  /** Name of the plugin that handles this effect. */
  plugin: string;
  type: string;
  /** Stamped by the core from the message being handled (see Message.ctx). */
  ctx?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PluginContext<S = unknown> {
  /** Feed a message back into the application. Safe to call from anywhere. */
  dispatch(message: Message): void;
  /** Current application state (from the store plugin). */
  getState(): S;
  /**
   * Applies an effect directly, without going through the application
   * (devtools, tests): the plugin runs, and plugins are notified if the
   * state changed.
   */
  dispatchEffect(effect: Effect): void;
}

/**
 * A plugin does the dirty work for one family of effects. Plugins own all
 * their mutable state (listeners, requests, timers, sockets...).
 */
/** What every effect has; plugin-specific effects add their own fields. */
export interface EffectLike {
  plugin: string;
  type: string;
}

export interface Plugin<E extends EffectLike = Effect, S = unknown> {
  readonly name: string;
  init?(ctx: PluginContext<S>): void;
  handle(effect: E, ctx: PluginContext<S>): void;
  /** Called after the application state changed. */
  onState?(state: S, ctx: PluginContext<S>): void;
  dispose?(): void;
}

/** A plugin that owns application state. */
export interface StatefulPlugin<S = unknown, E extends EffectLike = Effect>
  extends Plugin<E, S> {
  getState(): S;
}

/** The whole application: pure, deterministic, no side effects. */
export type AppFn<S = any> = (message: Message, state: S) => Effect[];
