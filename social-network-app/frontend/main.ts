import "../../ui-kit/frontend/styles.css";
import "../../ui-kit/frontend/design.css";
import "../../ui-kit/frontend/kit.css";
// the stylesheet of a block or a template sits in its folder: `<slug>.css`
import.meta.glob("../../ui-kit/frontend/{blocks,templates}/*/*.css", {
  eager: true,
});
import "./styles.css";
import { createApp } from "@service-laboratory/pavlus";
import {
  DomPlugin,
  createHttpPlugin,
  createRouterPlugin,
  createStorePlugin,
  createTimePlugin,
} from "@service-laboratory/pavlus/plugins";
import { createFilesPlugin } from "../../ui-kit/frontend/files.ts";
import { createThemePlugin, initialLook } from "../../ui-kit/frontend/theme.ts";
import { app as shell, type AppState, initialState } from "../app/app.ts";
import { createHttpIdbPlugin } from "./http-backend.ts";
import { createTitlePlugin } from "./title.ts";

// The application code (`shell` and Orbit) is pure. Everything that touches the
// outside world is a plugin, wired here: the data is on the server (HTTP), the
// address bar is the router, the page title and the look are plugins too.
export const store = createStorePlugin<AppState>(
  initialState(initialLook().mode),
);

export const app = createApp<AppState>({
  app: shell,
  plugins: [
    store,
    new DomPlugin(),
    createRouterPlugin(),
    createHttpPlugin(),
    createTimePlugin(),
    createFilesPlugin(),
    createHttpIdbPlugin(),
    createThemePlugin(),
    createTitlePlugin(),
  ],
  mount: "#app",
});

if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
