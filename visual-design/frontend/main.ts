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
import { createThemePlugin } from "../../ui-kit/frontend/theme.ts";
import { app as shell, type AppState, initialState } from "../app/app.ts";
import { createWorkspace } from "./workspace.ts";

// The application code (the shell and the two editors) is pure. Everything that
// touches the outside world is a plugin, wired here: the address bar is the
// router, the data is on the server (HTTP), and the project the editors save is
// the workspace (their `local` plugin, answered by the server).
const { local, workspace } = createWorkspace({ base: "/api" });

export const store = createStorePlugin<AppState>(initialState("dark"));

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
    local,
    workspace,
  ],
  mount: "#app",
});

if (import.meta.env?.DEV) {
  (globalThis as Record<string, unknown>).pavlus = { app, store };
}
