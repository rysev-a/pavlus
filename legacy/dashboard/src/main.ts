import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createHttpPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { app as shell, type AppState, initialState } from "./app.ts";

// The application code (`shell`) is pure. Everything that touches the
// outside world is a plugin, wired here. The http plugin uses the page's
// `fetch` with relative urls (`/api/users`): in development the vite
// server proxies `/api` to the admin-app backend, in the tests the page's
// `fetch` is the real API on a port of its own.
export const store = createStorePlugin<AppState>(initialState);
export const dom = createDomPlugin();
export const http = createHttpPlugin();

// `mount` renders `shell.view` into #app and dispatches `mounted`, which
// loads the users. What keeps the view in sync is the component's
// `updateDomOnStateChange = true`: without it, nothing repaints until the
// app sends `dom.update(...)` itself.
export const app = createApp<AppState>({
  app: shell,
  plugins: [store, dom, http],
  mount: "#app",
});

// Poke at it from the browser console: pavlus.store.getState(),
// pavlus.app.dispatch({ id: "newUser" }) ...
(globalThis as Record<string, unknown>).pavlus = { app, store, dom, http };
