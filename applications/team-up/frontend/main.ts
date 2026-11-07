import { createApp, paintOnWrite } from "@pavlus/frontend";
import {
  createHttpPlugin,
  createRouterPlugin,
  createStorePlugin,
  createWsPlugin,
  DomPlugin,
} from "@pavlus/frontend/plugins";
import { reviveState } from "@pavlus/frontend/ssr";
import { app as shell } from "../app/app.ts";
import { type AppState, initialState } from "../app/state.ts";

// A page rendered on the server (@pavlus/backend/ssr) comes with its state
// in a script: the app starts from it and the mount in `#app` hydrates that
// markup instead of rendering it again. Without it, this is a plain start.
const serialized = (globalThis as { __PAVLUS_STATE__?: string })
  .__PAVLUS_STATE__;

// The application (app/) is pure: everything that touches the outside world
// is a plugin, wired here. Nothing repaints on its own — the components paint
// themselves from the answers of their writes.
export const store = createStorePlugin<AppState>(
  serialized ? reviveState<AppState>(serialized) : initialState,
);
export const dom = new DomPlugin();
export const http = createHttpPlugin();
export const router = createRouterPlugin();
export const ws = createWsPlugin();

const plugins = [store, dom, http, router, ws];

export const app = createApp<AppState>({
  // `paintOnWrite`: a shell-level write (the route, me) answers "paint" —
  // the shell's paint swaps the outlet's page on a route change.
  app: paintOnWrite(shell),
  plugins,
  mount: "#app",
});

if (import.meta.env?.DEV) {
  // Poke at it from the browser console: pavlus.app.dispatch({ id: "..." }),
  // pavlus.store.getState() ...
  (globalThis as Record<string, unknown>).pavlus = {
    app,
    store,
    dom,
    http,
    router,
    ws,
  };
}
