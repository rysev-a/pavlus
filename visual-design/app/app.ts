// The shell of Visual Design: the bar and the page the route selects.
//
//   /                              the projects
//   /projects/:id/flow             Flow Studio on the diagram of the project
//   /projects/:id/interface        the Visual Builder on its interface
//
// The two editors are the ui-kit's own components (templates/flow-studio and
// templates/visual-builder), unchanged: what is new here is where their project
// lives (frontend/workspace.ts: the server) and the project around them.
import {
  Component,
  type ComponentCtx,
  type Effect,
  type Message,
  type Route,
  type Routing,
  viewOf,
} from "@service-laboratory/pavlus";
import {
  DomPlugin,
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import { presetLook, themeEffector } from "../../ui-kit/frontend/theme.ts";
import type { Look } from "../../ui-kit/frontend/theming.ts";
import { meta as flowMeta } from "../../ui-kit/frontend/templates/flow-studio/meta.ts";
import {
  type FsState,
  initial as initialFlow,
  page as flowStudio,
} from "../../ui-kit/frontend/templates/flow-studio/flow-studio.ts";
import {
  type VbState,
  initial as initialUi,
  page as visualBuilder,
} from "../../ui-kit/frontend/templates/visual-builder/visual-builder.ts";
import type { SaveEvent } from "../frontend/workspace.ts";
import { workspaceEffector as workspace } from "../frontend/workspace.ts";
import view from "./app.pavlus";
import notFound from "./not-found.pavlus";
import {
  initialProjects,
  type ProjectsState,
  projectsPage,
} from "./projects.ts";

export interface AppState {
  route: Route | null;
  look: Look;
  /** the project the address names (0 on the other pages) and the editor shown */
  projectId: number;
  tab: "" | "flow" | "interface";
  /** the project whose documents the editors have read */
  openId: number;
  projectName: string;
  /** edits of the diagram, and the edit of it the interface was last wired to */
  flowRev: number;
  linkedRev: number;
  save: "idle" | "saving" | "saved" | "error";
  saveText: string;
  notice: string;
  projects: ProjectsState;
  flowStudio: FsState;
  visualBuilder: VbState;
}

export function initialState(mode: Look["mode"] = "dark"): AppState {
  return {
    route: null,
    look: presetLook(flowMeta.look, mode),
    projectId: 0,
    tab: "",
    openId: 0,
    projectName: "",
    flowRev: 0,
    linkedRev: 0,
    save: "idle",
    saveText: "",
    notice: "",
    projects: initialProjects(),
    flowStudio: initialFlow,
    visualBuilder: initialUi,
  };
}

const PROJECT_PATH = /^\/projects\/([1-9]\d*)\/(flow|interface)$/;

/** the project and the editor an address names */
export function parsePath(path: string): {
  id: number;
  tab: AppState["tab"];
} {
  const m = PROJECT_PATH.exec(path);
  return m
    ? { id: Number(m[1]), tab: m[2] as "flow" | "interface" }
    : { id: 0, tab: "" };
}

export class App extends Component<AppState> {
  view = view;

  /** a store write answers "paint": one diff of the whole tree, the editors included */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as { prev: AppState; next: AppState };
    return [DomPlugin.update(viewOf(this)!.diff(prev, next))];
  }

  routing: Routing<AppState> = {
    "/": { component: projectsPage, key: "projects" },
    "/projects/:id/flow": { component: flowStudio, key: "flowStudio" },
    "/projects/:id/interface": {
      component: visualBuilder,
      key: "visualBuilder",
    },
    "*": { view: notFound },
  };

  mounted(_msg: Message, state: AppState): Effect[] {
    return [
      router.listen("routeChanged"),
      workspace.listen("saved"),
      themeEffector.apply(state.look, false),
    ];
  }

  /**
   * The router reports the address. Another project: both editors start from
   * its documents. The interface after edits of the diagram: it starts again,
   * so it reads the diagram as it is now.
   */
  routeChanged(
    msg: Message,
    state: AppState,
    { setRoute }: ComponentCtx,
  ): Effect[] {
    const { id, tab } = parsePath((msg.payload as { path: string }).path);
    // the editors are reset before the route puts one of them on the page
    const fresh: Effect[] = [];
    let { openId, linkedRev, flowRev } = state;
    if (id !== 0 && id !== openId) {
      fresh.push(
        store.set("flowStudio", initialFlow),
        store.set("visualBuilder", initialUi),
        store.set("projectName", ""),
        store.set("save", "idle"),
        store.set("saveText", ""),
        store.set("notice", ""),
        http.request({
          id: "project",
          url: `/api/projects/${id}`,
          onSuccess: "projectLoaded",
          onError: "projectFailed",
        }),
      );
      openId = id;
      flowRev = 0;
      linkedRev = 0;
    } else if (tab === "interface" && flowRev !== linkedRev) {
      fresh.push(store.set("visualBuilder", initialUi));
      linkedRev = flowRev;
    }
    return [
      ...fresh,
      store.set("openId", openId),
      store.set("flowRev", flowRev),
      store.set("linkedRev", linkedRev),
      store.set("projectId", id),
      store.set("tab", tab),
      ...setRoute(msg.payload),
    ];
  }

  projectLoaded(msg: Message): Effect[] {
    const p = (msg.payload as { data: { project: { name: string } } }).data
      .project;
    return [store.set("projectName", p.name)];
  }

  projectFailed(): Effect[] {
    return [
      store.set("notice", "This project could not be opened."),
      router.navigate("/", { absolute: true }),
    ];
  }

  /** the name in the bar: the project is renamed on the server */
  renameProject(msg: Message, state: AppState): Effect[] {
    const name = (msg.event?.value ?? "").trim();
    if (!name || name === state.projectName) {
      return [store.set("projectName", state.projectName)];
    }
    return [
      store.set("projectName", name),
      http.request({
        id: "rename",
        url: `/api/projects/${state.projectId}`,
        method: "PATCH",
        body: { name },
        onSuccess: "renamed",
        onError: "renameFailed",
      }),
    ];
  }

  renamed(): Effect[] {
    return [];
  }

  renameFailed(): Effect[] {
    return [store.set("notice", "The new name could not be saved.")];
  }

  /** what happens to the documents of the project (frontend/workspace.ts) */
  saved(msg: Message, state: AppState): Effect[] {
    const e = msg.payload as SaveEvent;
    switch (e.event) {
      case "changed":
        return [
          store.set("save", "saving"),
          store.set("saveText", "Saving..."),
          ...(e.key === "flow"
            ? [store.set("flowRev", state.flowRev + 1)]
            : []),
        ];
      case "saved":
        return [store.set("save", "saved"), store.set("saveText", "Saved")];
      case "error":
        return [
          store.set("save", "error"),
          store.set("saveText", "Not saved: trying again"),
        ];
      case "loadFailed":
        return [
          store.set("save", "error"),
          store.set("saveText", "Not saved"),
          store.set(
            "notice",
            "The server did not give the project: what you do here is not saved until the page is opened again.",
          ),
        ];
    }
    return [];
  }
}

export const app = new App();
