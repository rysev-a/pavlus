import "./styles.css";
import "./design.css";
import "./kit.css";
import "./docs/docs.css";
// the stylesheet of a block or a template sits in its folder: `<slug>.css`
import.meta.glob("./{blocks,templates}/*/*.css", { eager: true });
import { createApp, paintOnWrite } from "@service-laboratory/pavlus";
import {
  DomPlugin,
  createRouterPlugin,
  createStorePlugin,
  createHttpPlugin,
  createTimePlugin,
} from "@service-laboratory/pavlus/plugins";
import { app as shell, type AppState, initialState } from "./app.ts";
import { rootOf, windowAt } from "./base-window.ts";
import { createDocsPlugin } from "./docs/plugin.ts";
import { initialLang } from "./docs/pages.ts";
import { createExportPlugin } from "./export.ts";
import { createFilesPlugin } from "./files.ts";
import { createIdbPlugin } from "./idb.ts";
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
    lang: initialLang(),
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
    createFilesPlugin(),
    createDocsPlugin(),
    createThemePlugin(),
  ],
  mount: "#app",
});

if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
