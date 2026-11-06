/**
 * Pavlus: a framework where application code is 100% pure functions and all
 * side effects (DOM, HTTP, time, storage...) live in plugins.
 *
 * - `createApp` wires a pure `app(message, state) => effects[]` to plugins.
 * - Components compose with `compose`, `mapMessage`, `mapEffects`, `namespace`.
 * - Templates (`*.pavlus`) are compiled by the Vite plugin from
 *   `@pavlus/frontend/vite` into pure `render` / `diff` functions.
 *
 * Plugins are separate entry points, e.g.
 * `@pavlus/frontend/plugins/dom`.
 *
 * @module
 */

export type {
  Children,
  ChildSpec,
  ComponentCtx,
  ComponentFn,
  ComponentLike,
  ComponentTrace,
  Handler,
  NamespaceOptions,
  ViewOfOptions,
} from "./src/component/mod.ts";
export {
  Component,
  compose,
  mapEffects,
  mapMessage,
  namespace,
  paintOnWrite,
  setComponentTrace,
  toHandler,
  viewOf,
  withLogging,
} from "./src/component/mod.ts";
export type { App, CreateAppOptions } from "./src/core/mod.ts";
export { createApp } from "./src/core/mod.ts";
export type {
  AppFn,
  DomEventInfo,
  Effect,
  Message,
  Plugin,
  PluginContext,
  StatefulPlugin,
} from "./src/core/types.ts";
export type { Route, RouteSpec, Routing } from "./src/routing/mod.ts";
export { matchRoute, routeName } from "./src/routing/mod.ts";
export type {
  ElementVNode,
  EventMsg,
  MarkerVNode,
  Patch,
  TextVNode,
  View,
  VNode,
} from "./src/runtime/vnode.ts";
export { toHtml } from "./src/runtime/vnode.ts";
export { renderToString, reviveState, serializeState } from "./src/ssr/mod.ts";
