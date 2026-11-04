import "./styles.css";
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createHttpPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { reviveState } from "@service-laboratory/pavlus/ssr";
import { createPavlusDebug } from "../../debug-panel/agent/pavlus-debug-agent.ts";
import { app as shell } from "../app/app.ts";
import { initialState, type AppState } from "../app/state.ts";

// A page rendered on the server (backend/ssr.ts) comes with its state in a
// script: the app starts from it and the mount in `#app` hydrates that
// markup instead of rendering it again. Without it, this is a plain start.
const serialized = (globalThis as { __PAVLUS_STATE__?: string })
  .__PAVLUS_STATE__;

// The application (app/) is pure: everything that touches the outside world
// is a plugin, wired here. Nothing follows the state: every store write
// answers with `{ prev, next }`, and the app paints from that answer (the
// "paint" handler in app/app.ts).
export const store = createStorePlugin<AppState>(
  serialized ? reviveState<AppState>(serialized) : initialState,
);
export const dom = createDomPlugin();
export const http = createHttpPlugin();

// Devtools panel (debug-panel/extension): records messages, effects and the
// store timeline. No-op for the page itself.
const debug = createPavlusDebug({
  name: "admin-app",
  app: shell,
  flushMs: 0,
});

const plugins = [store, dom, http, debug.plugin];
debug.watch(plugins);

export const app = createApp<AppState>({
  app: shell,
  plugins,
  onStep: debug.onStep,
  mount: "#app",
});

if (import.meta.env?.DEV) {
  // Poke at it from the browser console: pavlus.app.dispatch({ id: "newUser" }),
  // pavlus.store.getState(), pavlus.store.history ...
  (globalThis as Record<string, unknown>).pavlus = { app, store, dom, http };
}
