import "./styles.css";
import "./design.css";
import "./kit.css";
import "./engine/engine.css";

// the stylesheet of a block or a template sits in its folder: `<slug>.css`
import.meta.glob("./{blocks,templates}/*/*.css", { eager: true });

import { createApp, paintOnWrite } from "@pavlus/client";
import {
  createHttpPlugin,
  createRouterPlugin,
  createStorePlugin,
  createSvgPlugin,
  createTimePlugin,
  DomPlugin,
} from "@pavlus/client/plugins";
import { type AppState, initialState, app as shell } from "./app.ts";
import { rootOf, windowAt } from "./base-window.ts";
import { createEnginePlugin } from "./engine/engine-plugin.ts";
import { createExportPlugin } from "./export.ts";
import { createFilesPlugin } from "./files.ts";
import { createIdbPlugin } from "./idb.ts";
import { createLocalPlugin } from "./local.ts";
import { createRandomPlugin } from "./random.ts";
import { createSourcePlugin } from "./source.ts";
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
  // every store write answers "paint" — the shell's paint handler diffs the
  // whole tree from the answer
  app: paintOnWrite(shell),
  plugins: [
    store,
    new DomPlugin(),
    // the site is served under a base path; the app routes without it
    createRouterPlugin({ window: windowAt(root) }),
    createHttpPlugin(),
    createTimePlugin(),
    createRandomPlugin(),
    createSourcePlugin(),
    createExportPlugin(),
    createIdbPlugin(),
    createLocalPlugin(),
    createSvgPlugin(),
    createFilesPlugin(),
    createEnginePlugin(),
    createThemePlugin(),
  ],
  mount: "#app",
});

if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
