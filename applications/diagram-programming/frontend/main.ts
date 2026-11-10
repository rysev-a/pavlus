import "../../../framework/ui-kit/src/styles.css";
import "../../../framework/ui-kit/src/design.css";
import "../../../framework/ui-kit/src/kit.css";

// the stylesheet of a block or a template sits in its folder: `<slug>.css`
import.meta.glob("../../../framework/ui-kit/src/blocks/*/*.css", {
  eager: true,
});

import "../../../framework/ui-kit/src/templates/flow-studio/flow-studio.css";
import "../../../framework/ui-kit/src/templates/visual-builder/visual-builder.css";
import "./styles.css";
import { createApp, paintOnWrite } from "@pavlus/client";
import {
  createHttpPlugin,
  createRouterPlugin,
  createStorePlugin,
  createSvgPlugin,
  createTimePlugin,
  DomPlugin,
} from "@pavlus/client/plugins";
import { createExportPlugin } from "../../../framework/ui-kit/src/export.ts";
import { createFilesPlugin } from "../../../framework/ui-kit/src/files.ts";
import { createRandomPlugin } from "../../../framework/ui-kit/src/random.ts";
import {
  createThemePlugin,
  initialLook,
  LOOK_KEY,
} from "../../../framework/ui-kit/src/theme.ts";
import {
  type AppState,
  initialState,
  app as shell,
  startLook,
} from "../app/app.ts";
import { createAppThemePlugin } from "./app-theme.ts";
import { createWorkspace } from "./workspace.ts";

// The application code (the shell and the two editors) is pure. Everything that
// touches the outside world is a plugin, wired here: the address bar is the
// router, the data is on the server (HTTP), and the project the editors save is
// the workspace (their `local` plugin, answered by the server).
const { local, workspace } = createWorkspace({ base: "/api" });

/** the colour theme the person chose last time, else the dark one of Flow Studio */
function savedLook() {
  try {
    return localStorage.getItem(LOOK_KEY) ? initialLook() : startLook();
  } catch {
    return startLook();
  }
}

export const store = createStorePlugin<AppState>(initialState(savedLook()));

export const app = createApp<AppState>({
  app: paintOnWrite(shell),
  plugins: [
    store,
    new DomPlugin(),
    createRouterPlugin(),
    createHttpPlugin(),
    createTimePlugin(),
    createSvgPlugin(),
    createFilesPlugin(),
    createThemePlugin(),
    createRandomPlugin(),
    createExportPlugin(),
    createAppThemePlugin(),
    local,
    workspace,
  ],
  mount: "#app",
});

if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
