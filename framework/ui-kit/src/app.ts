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
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/client/plugins";
import { DomPlugin } from "@pavlus/client/plugins/dom";
import view from "./app.pavlus";
import {
  type EngineState,
  enginePage,
  engineState,
} from "./engine/engine-page.ts";
import { type Exported, exportEffector } from "./export.ts";
import { homeProps } from "./pages/home/home.ts";
import { indexProps } from "./pages/index-page/index-page.ts";
import { themingProps } from "./pages/theming/theming.ts";
import {
  homeView,
  indexView,
  notFoundView,
  pageStates,
  routingOf,
  themingView,
} from "./pages.ts";
import { randomEffector } from "./random.ts";
import {
  allEntries,
  blocks,
  type Entry,
  entries,
  MENU,
  type MenuLink,
  menuLinksOf,
  type NavGroup,
  navFor,
  type Section,
  type SideGroup,
  sectionOf,
  sideNavOf,
  templates,
} from "./registry.ts";
import {
  filesOf,
  highlight,
  type Line,
  MAX_LINES,
  sourceEffector,
} from "./source.ts";
import { presetLook, themeEffector } from "./theme.ts";
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
  withBundle,
  withChoice,
  withTheme,
} from "./theming.ts";

export type SidebarState = "open" | "closed";

export interface AppState {
  /** Where we are; `null` until the router plugin reports it. */
  route: Route | null;
  /** The entry whose page is shown (its title and description), if any. */
  current: Entry | null;
  /** The open page's own template, on GitHub (the footer's Source link). */
  currentSourceUrl: string;
  /** The section of the top menu the route belongs to. */
  section: Section;
  /** The section is Templates: the page gets the thin bar, not a page header. */
  isTemplates: boolean;
  /** A template page is shown: the content column is wide. */
  contentWide: boolean;
  menu: typeof MENU;
  /** The menu's links, with the addresses and the open section worked out. */
  menuLinks: MenuLink[];
  /** The sidebar of the section; empty for Theming. */
  nav: NavGroup[];
  /** The entries the sidebar shows: `nav`, with the addresses and the open page worked out. */
  navItems: SideGroup[];
  hasNav: boolean;
  count: number;
  /** The base path the site is served from, without a trailing slash. */
  root: string;
  /** The site's home (`root` with its trailing slash). */
  rootUrl: string;
  /** Where the source of the pages is on GitHub (the `frontend` folder). */
  source: string;
  /** The look the visitor chose (Theming), remembered between visits. */
  look: Look;
  /** The look on screen: the visitor's, or a template's own while one is open. */
  active: Look;
  /** The look on screen is dark (the header's moon and sun). */
  modeDark: boolean;
  /** The configurator's catalogs, and the CSS of the visitor's look. */
  catalog: Catalog;
  css: string;
  /** What the theming panel reads: its catalogs with the choices worked out. */
  panel: PanelData;
  /** What the last export did, for the panel and the Theming page. */
  exportNote: string;
  /** The sections menu on a narrow screen (the burger). */
  menuOpen: boolean;
  /** The burger's `aria-expanded` (from `menuOpen`). */
  menuAria: "true" | "false";
  /** The fixed theming panel on the right. */
  panelOpen: boolean;
  /** The panel's `aria-pressed` and `aria-hidden` (from `panelOpen`). */
  panelAria: "true" | "false";
  panelHidden: "true" | null;
  /** The Templates link (the base path is not known to the template). */
  templatesUrl: string;
  /** The Preview / Source tabs of a component, block or template page. */
  tab: "preview" | "source";
  /** What the tabs' triggers and panes read of `tab` (no logic in templates). */
  tabPreviewSel: string;
  tabSourceSel: string;
  sourceShown: boolean;
  /** The files of the page's folder (its template, logic, stylesheet) and the one shown. */
  srcFiles: { name: string; active: boolean; inactive: boolean }[];
  srcName: string;
  srcLines: Line[];
  srcStatus: "idle" | "loading" | "ready" | "failed";
  /** What the Source tab's hints read of `srcStatus` (no comparisons in templates). */
  srcLoading: boolean;
  srcFailed: boolean;
  /** The file on GitHub, and a note when only the first lines are shown. */
  srcUrl: string;
  srcCut: boolean;
  sidebar: SidebarState;
  /** The `data-sidebar` value: the drawer's state, or "closed" with no sidebar. */
  sidebarAttr: string;
  /** A narrow screen: the sidebar is a drawer that closes after a click. */
  compact: boolean;
  /** The Template engine page keeps its own state under `engine`. */
  engine: EngineState;
  /** The state of each page that has some, under its key (see pages.ts). */
  [page: string]: unknown;
}

export interface Environment {
  root: string;
  look: Look;
  compact: boolean;
}

/** Everything the page knows about the outside world comes in as data. */
export function initialState(env: Environment): AppState {
  const cat = catalog();
  const s: AppState = {
    route: null,
    current: null,
    currentSourceUrl: "",
    section: "components",
    isTemplates: false,
    contentWide: false,
    menu: MENU,
    menuLinks: [],
    nav: navFor("components"),
    navItems: [],
    hasNav: true,
    count: entries.length,
    root: env.root,
    rootUrl: `${env.root}/`,
    source: "https://github.com/rysev-a/pavlus/blob/main/ui-kit/src",
    look: env.look,
    active: env.look,
    modeDark: env.look.mode === "dark",
    catalog: cat,
    css: cssOf(env.look),
    panel: panelOf(cat, env.look),
    panelOpen: false,
    panelAria: "false",
    panelHidden: "true",
    menuOpen: false,
    menuAria: "false",
    exportNote: "",
    templatesUrl: `${env.root}/templates`,
    tab: "preview",
    tabPreviewSel: "",
    tabSourceSel: "",
    sourceShown: false,
    srcFiles: [],
    srcName: "",
    srcLines: [],
    srcStatus: "idle",
    srcLoading: false,
    srcFailed: false,
    srcUrl: "",
    srcCut: false,
    sidebar: env.compact ? "closed" : "open",
    sidebarAttr: "",
    compact: env.compact,
    engine: engineState(),
    ...pageStates(),
  };
  // what the template reads of the base fields (framework/docs/philosophy.md)
  applyNav(s);
  applySection(s);
  applySidebar(s);
  applyTab(s);
  applySrcStatus(s);
  applyMenuOpen(s);
  applyPanel(s);
  return s;
}

const sameLook = (a: Look, b: Look): boolean =>
  (Object.keys(a) as (keyof Look)[]).every((k) => a[k] === b[k]);

/*
 * The fields the template reads instead of an expression: each `apply`
 * recomputes one concern, and every handler that writes its base fields calls
 * it, so the invariant lives in one place.
 */

function applyNav(s: AppState): void {
  s.navItems = sideNavOf(s.nav, s.root, s.route?.path ?? "");
}

function applySection(s: AppState): void {
  s.isTemplates = s.section === "templates";
  s.contentWide = s.isTemplates && s.current !== null;
  s.menuLinks = menuLinksOf(MENU, s.root, s.section);
}

function applySidebar(s: AppState): void {
  s.sidebarAttr = s.hasNav ? s.sidebar : "closed";
}

/** The burger's `aria-expanded` follows `menuOpen`. */
function applyMenuOpen(s: AppState): void {
  s.menuAria = s.menuOpen ? "true" : "false";
}

/** The panel button's `aria-pressed` and the panel's `aria-hidden` follow `panelOpen`. */
function applyPanel(s: AppState): void {
  s.panelAria = s.panelOpen ? "true" : "false";
  s.panelHidden = s.panelOpen ? null : "true";
}

function applyTab(s: AppState): void {
  s.tabPreviewSel = s.tab === "preview" ? "true" : "false";
  s.tabSourceSel = s.tab === "source" ? "true" : "false";
  s.sourceShown = s.tab === "source";
}

function applySrcStatus(s: AppState): void {
  s.srcLoading = s.srcStatus === "loading";
  s.srcFailed = s.srcStatus === "failed";
}

/** A page was opened: back to Preview, with the file list of its folder ready. */
function applySourceReset(s: AppState, current: Entry | null): void {
  const names = current ? filesOf(current.dir, current.slug) : [];
  s.tab = "preview";
  applyTab(s);
  s.srcFiles = names.map((name, i) => ({
    name,
    active: i === 0,
    inactive: i !== 0,
  }));
  s.srcName = names[0] ?? "";
  s.srcLines = [];
  s.srcStatus = "idle";
  applySrcStatus(s);
  s.srcCut = false;
  s.srcUrl =
    current && names[0] ? `${s.source}/${current.dir}/${names[0]}` : "";
}

/**
 * The shell: the top menu, the sidebar of the section, the page the route
 * selects (`+outlet`) and the footer. The router wiring (`mounted`,
 * `routeChanged`) is the default of `Component`; both are replaced here to
 * also set the look.
 */

export class AppShell extends Component<AppState> {
  view = view;

  /**
   * The shell paints itself from the answer of a store write (the app is
   * wrapped in `paintOnWrite`): one diff of the whole tree — the pages the
   * outlet renders included.
   */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as { prev: AppState; next: AppState };
    return [DomPlugin.update(viewOf(this)!.diff(prev, next))];
  }

  routing: Routing<AppState> = routingOf<AppState>({
    "/": {
      view: homeView,
      props: (s) => homeProps(s),
    },
    "/blocks": {
      view: indexView,
      props: (s) =>
        indexProps(
          s,
          "Blocks",
          `${blocks.length} ready-made sections: forms, players, carts and the parts the templates are built from.`,
        ),
    },
    "/templates": {
      view: indexView,
      props: (s) =>
        indexProps(
          s,
          "Templates",
          `${templates.length} whole sites and apps, each with its own look, built from the blocks.`,
        ),
    },
    "/theming": {
      view: themingView,
      props: (s) => themingProps(s),
    },
    "/engine": { component: enginePage, key: "engine" },
    "*": { view: notFoundView, props: (s) => ({ root: s.root }) },
  });

  /** The router reports the location: the route, the entry, the section, the look. */
  routeChanged(
    msg: Message,
    state: AppState,
    { setRoute }: ComponentCtx,
  ): Effect[] {
    const path = (msg.payload as { path: string }).path;
    const current = allEntries.find((e) => e.path === path) ?? null;
    const section = sectionOf(path);
    const nav = navFor(section);
    // a template shows itself in its own look; every other page in the visitor's
    const active = current?.look
      ? presetLook(current.look, state.look.mode)
      : state.look;
    return [
      ...setRoute(msg.payload),
      store.update<AppState>((s) => {
        s.menuOpen = false;
        applyMenuOpen(s);
        s.current = current;
        s.currentSourceUrl = current
          ? `${s.source}/${current.dir}/${current.slug}.pavlus`
          : "";
        s.section = section;
        s.nav = nav;
        s.hasNav = nav.length > 0;
        applyNav(s);
        applySection(s);
        applySidebar(s);
        applySourceReset(s, current);
      }),
      ...(sameLook(active, state.active)
        ? []
        : [
            store.set("active", active),
            store.set("modeDark", active.mode === "dark"),
            themeEffector.apply(active, false),
          ]),
    ];
  }

  mounted(_msg: Message, state: AppState): Effect[] {
    return [
      router.listen("routeChanged"),
      themeEffector.apply(state.look, false),
    ];
  }

  "header.toggleMenu"(_msg: Message, state: AppState): Effect[] {
    return [
      store.update<AppState>((s) => {
        s.menuOpen = !state.menuOpen;
        applyMenuOpen(s);
      }),
    ];
  }

  /** A section of the top menu: go there and fold the menu. */
  "header.navigate"(msg: Message): Effect[] {
    return [
      router.navigate(msg.payload as string),
      store.update<AppState>((s) => {
        s.menuOpen = false;
        applyMenuOpen(s);
      }),
    ];
  }

  /** "Pages of this section": the sidebar drawer, and the menu folds. */
  "header.openPages"(): Effect[] {
    return [
      store.update<AppState>((s) => {
        s.sidebar = "open";
        s.menuOpen = false;
        applyMenuOpen(s);
        applySidebar(s);
      }),
    ];
  }

  "header.toggleSidebar"(_msg: Message, state: AppState): Effect[] {
    return [
      store.update<AppState>((s) => {
        s.sidebar = state.sidebar === "open" ? "closed" : "open";
        applySidebar(s);
      }),
    ];
  }

  /** Light or dark: the visitor's look everywhere, a template's own for the template. */
  "header.toggleTheme"(_msg: Message, state: AppState): Effect[] {
    if (state.section === "templates") {
      const active = flipMode(state.active);
      return [
        store.set("active", active),
        store.set("modeDark", active.mode === "dark"),
        themeEffector.apply(active, false),
      ];
    }
    return this._choose(flipMode(state.look), state);
  }

  /** Preview or Source: Source loads the file when it is first shown. */
  setTab(msg: Message, state: AppState): Effect[] {
    const tab = msg.payload === "source" ? "source" : "preview";
    return [
      store.update<AppState>((s) => {
        s.tab = tab;
        applyTab(s);
      }),
      ...(tab === "source" && state.srcStatus === "idle" && state.srcName
        ? this._load(state, state.srcName)
        : []),
    ];
  }

  /** A file chip of the Source tab. */
  openFile(msg: Message, state: AppState): Effect[] {
    const name = String(msg.payload);
    return [
      store.set(
        "srcFiles",
        state.srcFiles.map((f) => ({
          ...f,
          active: f.name === name,
          inactive: f.name !== name,
        })),
      ),
      ...this._load(state, name),
    ];
  }

  sourceLoaded(msg: Message, state: AppState): Effect[] {
    const { path, text } = msg.payload as { path: string; text: string };
    if (!state.current || !path.endsWith(`/${state.srcName}`)) return [];
    const lines = highlight(state.srcName, text);
    return [
      store.update<AppState>((s) => {
        s.srcLines = lines.slice(0, MAX_LINES);
        s.srcCut = lines.length > MAX_LINES;
        s.srcStatus = "ready";
        applySrcStatus(s);
      }),
    ];
  }

  sourceFailed(): Effect[] {
    return [
      store.update<AppState>((s) => {
        s.srcStatus = "failed";
        applySrcStatus(s);
      }),
    ];
  }

  _load(state: AppState, name: string): Effect[] {
    const dir = state.current?.dir;
    if (!dir) return [];
    return [
      store.update<AppState>((s) => {
        s.srcName = name;
        s.srcStatus = "loading";
        applySrcStatus(s);
        s.srcUrl = `${state.source}/${dir}/${name}`;
      }),
      sourceEffector.load(`./${dir}/${name}`, "sourceLoaded", "sourceFailed"),
    ];
  }

  "header.togglePanel"(_msg: Message, state: AppState): Effect[] {
    return [
      store.update<AppState>((s) => {
        s.panelOpen = !state.panelOpen;
        applyPanel(s);
      }),
    ];
  }

  /**
   * The panel's messages are the configurator's, plus two that read a `<select>`:
   * `pick(row)` (font, style, sizes) and `family` (the colour tab).
   */
  "themepanel.close"(): Effect[] {
    return [
      store.update<AppState>((s) => {
        s.panelOpen = false;
        applyPanel(s);
      }),
    ];
  }

  "themepanel.pick"(msg: Message, state: AppState): Effect[] {
    return this._choose(
      withChoice(state.look, String(msg.payload), msg.event?.value ?? ""),
      state,
    );
  }

  "themepanel.palette"(msg: Message, state: AppState): Effect[] {
    return this["theming.palette"](msg, state);
  }

  "themepanel.bundle"(msg: Message, state: AppState): Effect[] {
    return this["theming.bundle"](msg, state);
  }

  "themepanel.random"(): Effect[] {
    return this["theming.random"]();
  }

  /** Export the look as a stylesheet: this style only, or all of them. */
  "themepanel.export"(msg: Message, state: AppState): Effect[] {
    return [
      store.set("exportNote", ""),
      exportEffector.css(
        state.css,
        state.look.style,
        msg.payload === "all" ? "all" : "current",
        "exported",
      ),
    ];
  }

  "theming.export"(msg: Message, state: AppState): Effect[] {
    return this["themepanel.export"](msg, state);
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

  "themepanel.reset"(msg: Message, state: AppState): Effect[] {
    return this["theming.reset"](msg, state);
  }

  closeSidebar(): Effect[] {
    return [
      store.update<AppState>((s) => {
        s.sidebar = "closed";
        applySidebar(s);
      }),
    ];
  }

  /** A link of the sidebar: go there, and on a narrow screen close the drawer. */
  "sidebar.navigate"(msg: Message, state: AppState): Effect[] {
    return [
      router.navigate(msg.payload as string),
      ...(state.compact
        ? [
            store.update<AppState>((s) => {
              s.sidebar = "closed";
              applySidebar(s);
            }),
          ]
        : []),
    ];
  }

  /** `choose("font", id)` from the configurator: fonts, styles and the three sizes. */
  "theming.choose"(msg: Message, state: AppState): Effect[] {
    const [row, id] = msg.payload as [string, string];
    return this._choose(withChoice(state.look, row, id), state);
  }

  /**
   * `palette(id, mode)`: a theme is a name in a mode, so it sets both; with the
   * bundle on it also sets the font, the sizes and the style the theme comes with.
   */
  "theming.palette"(msg: Message, state: AppState): Effect[] {
    const [palette, mode] = msg.payload as [string, Look["mode"]];
    return this._choose(withTheme(state.look, palette, mode), state);
  }

  /** The "themes set font, sizes and style too" switch. */
  "theming.bundle"(msg: Message, state: AppState): Effect[] {
    return this._choose(
      withBundle(state.look, Boolean(msg.event?.checked)),
      state,
    );
  }

  /** The random button: ask the random plugin which theme, apply it when it answers. */
  "theming.random"(): Effect[] {
    return [randomEffector.int(allThemes().length, "randomPicked")];
  }

  randomPicked(msg: Message, state: AppState): Effect[] {
    const pick = allThemes()[msg.payload as number];
    return pick
      ? this._choose(withTheme(state.look, pick.palette, pick.mode), state)
      : [];
  }

  "theming.reset"(_msg: Message, state: AppState): Effect[] {
    return this._choose(defaultLook(state.look.mode), state);
  }

  /** The visitor's new look: remembered, shown, and the export updated. */
  _choose(look: Look, state: AppState): Effect[] {
    return [
      store.set("look", look),
      store.set("active", look),
      store.set("modeDark", look.mode === "dark"),
      store.set("css", cssOf(look)),
      store.set("panel", panelOf(state.catalog, look)),
      themeEffector.apply(look, true),
    ];
  }
}

export const app = new AppShell();
