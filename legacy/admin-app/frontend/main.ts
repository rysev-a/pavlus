import "./styles.css";
import {
  type Component,
  createApp,
  type Plugin,
} from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createHttpPlugin,
  createLoggerPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";

import { reviveState } from "@service-laboratory/pavlus/ssr";
import { createPavlusDebug } from "../../../debug-panel/agent/pavlus-debug-agent.ts";
import {
  app as shell,
  type AppState,
  components,
  initialState,
} from "./app.ts";

// A page rendered on the server (backend/ssr.ts) comes with its state in a
// script: the app starts from it, and the DOM plugin hydrates the markup in
// `#app` instead of rendering it again. Without it, this is a plain start.
const serialized = (globalThis as { __PAVLUS_STATE__?: string })
  .__PAVLUS_STATE__;

// The application code (`shell` and its pages) is pure. Everything that
// touches the outside world is a plugin, wired here.
export const store = createStorePlugin<AppState>(
  serialized ? reviveState<AppState>(serialized, components) : initialState,
);

// Devtools panel (debug-panel/extension): records messages, effects and the
// store timeline, and applies the panel's undo/redo/restoreTo through the
// real core. No-op for the page itself. `app: shell` lets the panel's Apps
// tab draw the component tree (children / routing). `flushMs: 0` streams
// every event as it happens — the store timeline updates in realtime on
// route changes instead of landing in 60 ms batches.
const debug = createPavlusDebug({
  name: "Application",
  app: shell,
  flushMs: 0,
});

// The theme (`/system/settings`): the application sends a `theme` effect and
// stays pure; this plugin puts the class on `<html>` (the CSS tokens react).
const theme: Plugin = {
  name: "theme",
  handle(effect) {
    const t = effect.theme;
    if (t === "light" || t === "dark") {
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(t);
    }
  },
};

const dom = createDomPlugin();
const http = createHttpPlugin();
const logger = createLoggerPlugin();
const router = createRouterPlugin();
const plugins = [store, dom, http, logger, router, theme, debug.plugin];
debug.watch(plugins);

export const app = createApp<AppState>({
  app: shell,
  plugins,
  onStep: debug.onStep,
  mount: "#app",
});

if (import.meta.env?.DEV) {
  // Poke at it from the browser console: pavlus.store.getState(),
  // pavlus.store.history, pavlus.app.dispatch({ id: "header.navigate", payload: "/admin" }) ...
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
