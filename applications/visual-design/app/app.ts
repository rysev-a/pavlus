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
} from "@pavlus/frontend";
import {
  DomPlugin,
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import {
  type Exported,
  exportEffector,
} from "../../../framework/ui-kit/frontend/export.ts";
import { randomEffector } from "../../../framework/ui-kit/frontend/random.ts";
import {
  type FsState,
  page as flowStudio,
  initial as initialFlow,
} from "../../../framework/ui-kit/frontend/templates/flow-studio/flow-studio.ts";
import { meta as flowMeta } from "../../../framework/ui-kit/frontend/templates/flow-studio/meta.ts";
import {
  initial as initialUi,
  type VbState,
  page as visualBuilder,
} from "../../../framework/ui-kit/frontend/templates/visual-builder/visual-builder.ts";
import {
  presetLook,
  themeEffector,
} from "../../../framework/ui-kit/frontend/theme.ts";
import {
  allThemes,
  type Catalog,
  catalog,
  cssOf,
  defaultLook,
  flipMode,
  type Look,
  parseLook,
  type ThemeFamily,
  withBundle,
  withChoice,
  withTheme,
} from "../../../framework/ui-kit/frontend/theming.ts";
import { appThemeEffector as appTheme } from "../frontend/app-theme.ts";
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
  /** the colour theme (and font, style, sizes): the visitor's choice, remembered */
  look: Look;
  /** the theme of the app being designed (its frame in the editors); null: the editor's */
  appLook: Look | null;
  /** which of the two themes the panel changes */
  target: "editor" | "app";
  catalog: Catalog;
  /** the look in the panel, as CSS */
  css: string;
  /** the theme panel, its colour tab and what the last export did */
  panelOpen: boolean;
  family: string;
  shown: ThemeFamily;
  exportNote: string;
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

/** the look a first visit starts with: Flow Studio's own, dark */
export const startLook = (): Look => presetLook(flowMeta.look, "dark");

export function initialState(look: Look = startLook()): AppState {
  const cat = catalog();
  return {
    route: null,
    look,
    appLook: null,
    target: "editor",
    catalog: cat,
    css: cssOf(look),
    panelOpen: false,
    family: cat.families[0].id,
    shown: cat.families[0],
    exportNote: "",
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

const KEEPS_OWN =
  "The app being designed has its own theme, so it did not change. Turn on “Follow editor” to give it this one too.";

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
        // the app starts in the editor's theme until the project says otherwise
        store.set("appLook", null),
        appTheme.apply(null),
        http.request({
          id: "project",
          url: `/api/projects/${id}`,
          onSuccess: "projectLoaded",
          onError: "projectFailed",
        }),
        http.request({
          id: "theme",
          url: `/api/projects/${id}/docs/theme`,
          onSuccess: "themeLoaded",
          onError: "themeFailed",
        }),
      );
      openId = id;
      flowRev = 0;
      linkedRev = 0;
    } else if (tab === "interface" && flowRev !== linkedRev) {
      fresh.push(store.set("visualBuilder", initialUi));
      linkedRev = flowRev;
    }
    // leaving the projects for the list: the panel is the editor's again
    const leaving: Effect[] =
      id === 0 && state.target === "app"
        ? [store.set("target", "editor"), store.set("css", cssOf(state.look))]
        : [];
    return [
      ...fresh,
      ...leaving,
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

  // ---- the themes: the ui-kit's panel changes the editor's or the app's ----

  /** the look the panel starts from: the editor's, or the app's (that is the editor's until it has its own) */
  _base(state: AppState): Look {
    return state.target === "app" ? (state.appLook ?? state.look) : state.look;
  }

  /** the bar's two buttons: the panel for that theme, or closed when it is already open for it */
  openPanel(msg: Message, state: AppState): Effect[] {
    const target = msg.payload === "app" ? "app" : "editor";
    if (state.panelOpen && state.target === target) {
      return [store.set("panelOpen", false)];
    }
    const base = target === "app" ? (state.appLook ?? state.look) : state.look;
    return [
      store.set("target", target),
      store.set("css", cssOf(base)),
      store.set("panelOpen", true),
    ];
  }

  toggleMode(_msg: Message, state: AppState): Effect[] {
    return this._chooseEditor(state, flipMode(state.look));
  }

  "themepanel.close"(): Effect[] {
    return [store.set("panelOpen", false)];
  }

  /** a font, a style, a corner radius or a size, from a `<select>` */
  "themepanel.pick"(msg: Message, state: AppState): Effect[] {
    return this._choose(
      state,
      withChoice(
        this._base(state),
        String(msg.payload),
        msg.event?.value ?? "",
      ),
    );
  }

  /** the tab of the colour picker */
  "themepanel.family"(msg: Message, state: AppState): Effect[] {
    const shown =
      state.catalog.families.find((f) => f.id === msg.event?.value) ??
      state.catalog.families[0];
    return [store.set("family", shown.id), store.set("shown", shown)];
  }

  /** a theme is a name in a mode */
  "themepanel.palette"(msg: Message, state: AppState): Effect[] {
    const [palette, mode] = msg.payload as [string, Look["mode"]];
    return this._choose(state, withTheme(this._base(state), palette, mode));
  }

  /** "a theme sets font, sizes and style too" */
  "themepanel.bundle"(msg: Message, state: AppState): Effect[] {
    return this._choose(
      state,
      withBundle(this._base(state), Boolean(msg.event?.checked)),
    );
  }

  "themepanel.random"(): Effect[] {
    return [randomEffector.int(allThemes().length, "randomPicked")];
  }

  randomPicked(msg: Message, state: AppState): Effect[] {
    const pick = allThemes()[msg.payload as number];
    return pick
      ? this._choose(
          state,
          withTheme(this._base(state), pick.palette, pick.mode),
        )
      : [];
  }

  /** the editor goes back to the default look; the app goes back to wearing the editor's */
  "themepanel.reset"(_msg: Message, state: AppState): Effect[] {
    return state.target === "app"
      ? this._chooseApp(state, null)
      : this._chooseEditor(state, defaultLook(state.look.mode));
  }

  /** the look in the panel as a stylesheet: this style only, or all of them */
  "themepanel.export"(msg: Message, state: AppState): Effect[] {
    return [
      store.set("exportNote", ""),
      exportEffector.css(
        state.css,
        this._base(state).style,
        msg.payload === "all" ? "all" : "current",
        "exported",
      ),
    ];
  }

  exported(msg: Message): Effect[] {
    const r = msg.payload as Exported;
    const kb = Math.max(1, Math.round(r.bytes / 1024));
    return [
      store.set(
        "exportNote",
        `Saved ${r.file} (${kb} kB)${r.copied ? " and copied to the clipboard" : ""}.`,
      ),
    ];
  }

  _choose(state: AppState, look: Look): Effect[] {
    return state.target === "app"
      ? this._chooseApp(state, look)
      : this._chooseEditor(state, look);
  }

  /**
   * the editor's new look: remembered, shown, and the export updated. An app that has
   * its own theme does not change with it: the bar says so, or "nothing changes".
   */
  _chooseEditor(state: AppState, look: Look): Effect[] {
    return [
      store.set("look", look),
      store.set("css", cssOf(look)),
      themeEffector.apply(look, true),
      ...(state.appLook && state.tab === "interface"
        ? [store.set("notice", KEEPS_OWN)]
        : []),
    ];
  }

  /**
   * "Follow editor": the app wears the editor's theme (and changes with it), or gets a
   * theme of its own, to start with the editor's.
   */
  toggleFollow(_msg: Message, state: AppState): Effect[] {
    return [
      store.set("notice", ""),
      ...this._chooseApp(state, state.appLook ? null : state.look),
    ];
  }

  /** the app's new look (null: the editor's): shown in its frame and kept with the project */
  _chooseApp(state: AppState, look: Look | null): Effect[] {
    return [
      store.set("appLook", look),
      store.set("css", cssOf(look ?? state.look)),
      appTheme.apply(look),
      ...(state.projectId
        ? [
            http.request({
              id: "theme-save",
              url: `/api/projects/${state.projectId}/docs/theme`,
              method: "PUT",
              body: { text: JSON.stringify(look) },
              onSuccess: "themeSaved",
              onError: "themeSaveFailed",
            }),
          ]
        : []),
    ];
  }

  /** the theme of the app, as the project has it */
  themeLoaded(msg: Message, state: AppState): Effect[] {
    const text = (msg.payload as { data?: { text?: string | null } }).data
      ?.text;
    let look: Look | null = null;
    try {
      const raw: unknown = text ? JSON.parse(text) : null;
      look = raw ? parseLook(raw, state.look) : null;
    } catch {
      look = null;
    }
    return [store.set("appLook", look), appTheme.apply(look)];
  }

  themeFailed(): Effect[] {
    return [];
  }

  themeSaved(): Effect[] {
    return [];
  }

  themeSaveFailed(): Effect[] {
    return [store.set("notice", "The theme of the app could not be saved.")];
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
