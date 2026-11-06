import "../../ui-kit/frontend/styles.css";
import "../../ui-kit/frontend/design.css";
import "../../ui-kit/frontend/kit.css";
// the stylesheet of a block or a template sits in its folder: `<slug>.css`
import.meta.glob("../../ui-kit/frontend/blocks/*/*.css", { eager: true });
import "../../ui-kit/frontend/templates/flow-studio/flow-studio.css";
import "../../ui-kit/frontend/templates/visual-builder/visual-builder.css";
import "./styles.css";
import { createApp, paintOnWrite } from "@service-laboratory/pavlus";
import {
  DomPlugin,
  createHttpPlugin,
  createRouterPlugin,
  createStorePlugin,
  createSvgPlugin,
  createTimePlugin,
} from "@service-laboratory/pavlus/plugins";
import { createFilesPlugin } from "../../ui-kit/frontend/files.ts";
import { createExportPlugin } from "../../ui-kit/frontend/export.ts";
import { createRandomPlugin } from "../../ui-kit/frontend/random.ts";
import {
  createThemePlugin,
  initialLook,
  LOOK_KEY,
} from "../../ui-kit/frontend/theme.ts";
import {
  app as shell,
  type AppState,
  initialState,
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
