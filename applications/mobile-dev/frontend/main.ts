import "../../../framework/ui-kit/frontend/styles.css";
import "../../../framework/ui-kit/frontend/design.css";
import "../../../framework/ui-kit/frontend/kit.css";

// the stylesheet of a block or a template sits in its folder: `<slug>.css`
import.meta.glob("../../../framework/ui-kit/frontend/blocks/*/*.css", {
  eager: true,
});

import "../../../framework/ui-kit/frontend/templates/flow-studio/flow-studio.css";
import "../../../framework/ui-kit/frontend/templates/visual-builder/visual-builder.css";
import "./styles.css";
import { createApp, paintOnWrite } from "@pavlus/frontend";
import {
  createRouterPlugin,
  createStorePlugin,
  createSvgPlugin,
  createTimePlugin,
  DomPlugin,
} from "@pavlus/frontend/plugins";
import {
  rootOf,
  windowAt,
} from "../../../framework/ui-kit/frontend/base-window.ts";
import { createExportPlugin } from "../../../framework/ui-kit/frontend/export.ts";
import { createFilesPlugin } from "../../../framework/ui-kit/frontend/files.ts";
import { createHttpPlugin } from "@pavlus/frontend/plugins";
import { createLocalPlugin } from "../../../framework/ui-kit/frontend/local.ts";
import { createRandomPlugin } from "../../../framework/ui-kit/frontend/random.ts";
import {
  createThemePlugin,
  initialLook,
  LOOK_KEY,
} from "../../../framework/ui-kit/frontend/theme.ts";
import {
  type AppState,
  initialState,
  app as shell,
  startLook,
} from "../app/app.ts";

// The application code (the shell and the two editors) is pure. Everything that
// touches the outside world is a plugin, wired here: the address bar is the
// router (served under a base path on GitHub Pages), and the project is kept in
// the phone's storage by the `local` plugin.
const root = rootOf(import.meta.env.BASE_URL);

/** the colour theme the person chose last time, else the dark one of Flow Studio */
function savedLook() {
  try {
    return localStorage.getItem(LOOK_KEY) ? initialLook() : startLook();
  } catch {
    return startLook();
  }
}

export const store = createStorePlugin<AppState>(
  initialState(root, savedLook()),
);

export const app = createApp<AppState>({
  app: paintOnWrite(shell),
  plugins: [
    store,
    new DomPlugin(),
    createRouterPlugin({ window: windowAt(root) }),
    createHttpPlugin(),
    createTimePlugin(),
    createSvgPlugin(),
    createFilesPlugin(),
    createThemePlugin(),
    createRandomPlugin(),
    createExportPlugin(),
    createLocalPlugin(),
  ],
  mount: "#app",
});

if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
