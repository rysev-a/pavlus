import "../../admin-app/frontend/styles.css";
import "./kit.css";
// the stylesheet of a block or a template sits in its folder: `<slug>.css`
import.meta.glob("./{blocks,templates}/*/*.css", { eager: true });
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createRouterPlugin,
  createStorePlugin,
  createTimePlugin,
} from "@service-laboratory/pavlus/plugins";
import { app as shell, type AppState, initialState } from "./app.ts";
import { rootOf, windowAt } from "./base-window.ts";
import { createThemePlugin, initialLook } from "./theme.ts";

// The application code (`shell` and its pages) is pure. Everything that
// touches the outside world is a plugin, wired here, and what the page knows
// about its surroundings (base path, preferred theme, screen width) goes in
// as data.
const root = rootOf(import.meta.env.BASE_URL);

export const store = createStorePlugin<AppState>(
  initialState({
    root,
    look: initialLook(),
    compact: window.matchMedia("(max-width: 800px)").matches,
  }),
);

export const app = createApp<AppState>({
  app: shell,
  plugins: [
    store,
    createDomPlugin(),
    // the site is served under a base path; the app routes without it
    createRouterPlugin({ window: windowAt(root) }),
    createTimePlugin(),
    createThemePlugin(),
  ],
  mount: "#app",
});

if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
