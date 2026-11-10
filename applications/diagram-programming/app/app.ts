// The shell of Diagram Programming: the bar and the page the route selects.
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
} from "@pavlus/client";
import {
  DomPlugin,
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/client/plugins";
import {
  type Exported,
  exportEffector,
} from "../../../framework/ui-kit/src/export.ts";
import { randomEffector } from "../../../framework/ui-kit/src/random.ts";
import {
  type FsState,
  page as flowStudio,
  initial as initialFlow,
} from "../../../framework/ui-kit/src/templates/flow-studio/flow-studio.ts";
import { meta as flowMeta } from "../../../framework/ui-kit/src/templates/flow-studio/meta.ts";
import {
  initial as initialUi,
  type VbState,
  page as visualBuilder,
} from "../../../framework/ui-kit/src/templates/visual-builder/visual-builder.ts";
import {
  presetLook,
  themeEffector,
} from "../../../framework/ui-kit/src/theme.ts";
import {
  allThemes,
  type Catalog,
  catalog,
  cssOf,
  defaultLook,
  flipMode,
  type Look,
  type PanelData,
  panelOf,
  parseLook,
  withBundle,
  withChoice,
  withTheme,
} from "../../../framework/ui-kit/src/theming.ts";
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

/**
 * What the bar and the theme panel read, worked out from the fields they depend
 * on: a template reads paths, it does not compare or concatenate them
 * (framework/docs/philosophy.md). `barOf` is the one place that computes them;
 * `_write` keeps them in step with every change of their inputs.
 */
export interface Bar {
  /** the addresses of the two editors of the open project */
  flowHref: string;
  interfaceHref: string;
  /** which editor is shown, and the `aria-current` of each tab */
  onFlow: boolean;
  onInterface: boolean;
  flowCurrent: string;
  interfaceCurrent: string;
  /** the state of the saves */
  saveBusy: boolean;
  saveError: boolean;
  /** the app wears the editor's theme (it has no look of its own) */
  follows: boolean;
  followPressed: string;
  /** the panel is open for the app's theme, or for the editor's */
  appPanelOn: boolean;
  appPanelPressed: string;
  editorPanelOn: boolean;
  editorPanelPressed: string;
  isDark: boolean;
  /** the look the panel edits (the app's when it is open for the app), and its options */
  panelLook: Look;
  panel: PanelData;
  /** the panel's `aria-hidden`: null while it is open */
  panelHidden: string | null;
}

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
  /** the theme panel and what the last export did */
  panelOpen: boolean;
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
  /** what the bar reads (see `Bar`) */
  bar: Bar;
  projects: ProjectsState;
  flowStudio: FsState;
  visualBuilder: VbState;
}

/** the fields the bar is worked out from */
type BarInputs = Pick<
  AppState,
  | "projectId"
  | "tab"
  | "save"
  | "appLook"
  | "panelOpen"
  | "target"
  | "look"
  | "catalog"
>;

const flag = (on: boolean): string => (on ? "true" : "false");

/** Pure: everything the bar reads, from the fields it depends on. */
export function barOf(s: BarInputs): Bar {
  const onFlow = s.tab === "flow";
  const onInterface = s.tab === "interface";
  const appPanelOn = s.panelOpen && s.target === "app";
  const editorPanelOn = s.panelOpen && s.target === "editor";
  const panelLook = s.target === "app" && s.appLook ? s.appLook : s.look;
  return {
    flowHref: `/projects/${s.projectId}/flow`,
    interfaceHref: `/projects/${s.projectId}/interface`,
    onFlow,
    onInterface,
    flowCurrent: onFlow ? "page" : "false",
    interfaceCurrent: onInterface ? "page" : "false",
    saveBusy: s.save === "saving",
    saveError: s.save === "error",
    follows: s.appLook === null,
    followPressed: flag(s.appLook === null),
    appPanelOn,
    appPanelPressed: flag(appPanelOn),
    editorPanelOn,
    editorPanelPressed: flag(editorPanelOn),
    isDark: s.look.mode === "dark",
    panelLook,
    panel: panelOf(s.catalog, panelLook),
    panelHidden: s.panelOpen ? null : "true",
  };
}

/** the look a first visit starts with: Flow Studio's own, dark */
export const startLook = (): Look => presetLook(flowMeta.look, "dark");

export function initialState(look: Look = startLook()): AppState {
  const cat = catalog();
  const base = {
    look,
    appLook: null,
    target: "editor" as const,
    catalog: cat,
    panelOpen: false,
    projectId: 0,
    tab: "" as const,
    save: "idle" as const,
  };
  return {
    route: null,
    ...base,
    css: cssOf(look),
    exportNote: "",
    openId: 0,
    projectName: "",
    flowRev: 0,
    linkedRev: 0,
    saveText: "",
    notice: "",
    bar: barOf(base),
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

  /**
   * The store writes for `changes`, and the bar worked out again from the state
   * they make. Every handler that changes one of the bar's inputs writes through
   * here, so the fields the template reads never lag behind.
   */
  _write(state: AppState, changes: Partial<AppState>): Effect[] {
    const next: AppState = { ...state, ...changes };
    return [
      ...Object.entries(changes).map(([path, value]) => store.set(path, value)),
      store.set("bar", barOf(next)),
    ];
  }

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
    const changes: Partial<AppState> = {};
    const asks: Effect[] = [];
    let { openId, linkedRev, flowRev } = state;
    if (id !== 0 && id !== openId) {
      // the editors are reset before the route puts one of them on the page
      Object.assign(changes, {
        flowStudio: initialFlow,
        visualBuilder: initialUi,
        projectName: "",
        save: "idle",
        saveText: "",
        notice: "",
        // the app starts in the editor's theme until the project says otherwise
        appLook: null,
      });
      asks.push(
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
      changes.visualBuilder = initialUi;
      linkedRev = flowRev;
    }
    // leaving the projects for the list: the panel is the editor's again
    if (id === 0 && state.target === "app") {
      changes.target = "editor";
      changes.css = cssOf(state.look);
    }
    Object.assign(changes, { openId, flowRev, linkedRev, projectId: id, tab });
    return [...this._write(state, changes), ...asks, ...setRoute(msg.payload)];
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
      return this._write(state, { panelOpen: false });
    }
    const base = target === "app" ? (state.appLook ?? state.look) : state.look;
    return this._write(state, {
      target,
      css: cssOf(base),
      panelOpen: true,
    });
  }

  toggleMode(_msg: Message, state: AppState): Effect[] {
    return this._chooseEditor(state, flipMode(state.look));
  }

  "themepanel.close"(_msg: Message, state: AppState): Effect[] {
    return this._write(state, { panelOpen: false });
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
      ...this._write(state, { look, css: cssOf(look) }),
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
      ...this._write(state, { appLook: look, css: cssOf(look ?? state.look) }),
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
    return [...this._write(state, { appLook: look }), appTheme.apply(look)];
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
        return this._write(state, {
          save: "saving",
          saveText: "Saving...",
          ...(e.key === "flow" ? { flowRev: state.flowRev + 1 } : {}),
        });
      case "saved":
        return this._write(state, { save: "saved", saveText: "Saved" });
      case "error":
        return this._write(state, {
          save: "error",
          saveText: "Not saved: trying again",
        });
      case "loadFailed":
        return this._write(state, {
          save: "error",
          saveText: "Not saved",
          notice:
            "The server did not give the project: what you do here is not saved until the page is opened again.",
        });
    }
    return [];
  }
}

export const app = new App();
