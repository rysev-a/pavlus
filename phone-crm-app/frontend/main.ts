import "../../ui-kit/frontend/styles.css";
import "../../ui-kit/frontend/design.css";
import "../../ui-kit/frontend/kit.css";
// the stylesheets of the blocks the CRM is made of, and of the CRM itself
import.meta.glob("../../ui-kit/frontend/blocks/*/*.css", { eager: true });
import "../../ui-kit/frontend/templates/phone-retail-crm/phone-retail-crm.css";
import "../../ui-kit/frontend/templates/phone-retail-crm/dashboards.css";
import "./styles.css";
import { createApp } from "@service-laboratory/pavlus";
import {
  DomPlugin,
  createRouterPlugin,
  createStorePlugin,
  createTimePlugin,
} from "@service-laboratory/pavlus/plugins";
import { app as shell } from "../app/app.ts";
import { type AppState, initialState } from "../app/state.ts";
import { createFilesPlugin } from "../../ui-kit/frontend/files.ts";
import { createThemePlugin } from "../../ui-kit/frontend/theme.ts";
import { createHttpBackendPlugin } from "./http-backend.ts";
import { createTitlePlugin } from "./title.ts";

// The application code (app/) is pure. Everything that touches the outside
// world is a plugin, wired here: the database is the server's (`idb` effects
// over HTTP), the address bar is the router's, the look is the theme's.
export const store = createStorePlugin<AppState>(
  initialState(window.matchMedia?.("(prefers-color-scheme: dark)").matches),
);

export const app = createApp<AppState>({
  app: shell,
  plugins: [
    store,
    new DomPlugin(),
    createRouterPlugin(),
    createTimePlugin(),
    createHttpBackendPlugin(),
    createFilesPlugin(),
    createThemePlugin(),
    createTitlePlugin(),
  ],
  mount: "#app",
});

if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
