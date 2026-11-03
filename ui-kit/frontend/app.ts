import {
  Component,
  type ComponentCtx,
  type Effect,
  type Message,
  type Route,
  type Routing,
} from "@service-laboratory/pavlus";
import {
  routerEffector as router,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./app.pavlus";
import {
  homeView,
  indexView,
  notFoundView,
  pageStates,
  routingOf,
  themingView,
} from "./pages.ts";
import {
  allEntries,
  blocks,
  type Entry,
  entries,
  MENU,
  type NavGroup,
  navFor,
  type Section,
  sectionOf,
  templates,
} from "./registry.ts";
import { randomEffector } from "./random.ts";
import { presetLook, themeEffector } from "./theme.ts";
import {
  allThemes,
  catalog,
  type Catalog,
  cssOf,
  defaultLook,
  flipMode,
  type Look,
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
  /** The section of the top menu the route belongs to. */
  section: Section;
  menu: typeof MENU;
  /** The sidebar of the section; empty for Theming. */
  nav: NavGroup[];
  hasNav: boolean;
  count: number;
  /** The base path the site is served from, without a trailing slash. */
  root: string;
  /** Where the source of the pages is on GitHub (the `frontend` folder). */
  source: string;
  /** The look the visitor chose (Theming), remembered between visits. */
  look: Look;
  /** The look on screen: the visitor's, or a template's own while one is open. */
  active: Look;
  /** The configurator's catalogs, and the CSS of the visitor's look. */
  catalog: Catalog;
  css: string;
  sidebar: SidebarState;
  /** A narrow screen: the sidebar is a drawer that closes after a click. */
  compact: boolean;
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
  return {
    route: null,
    current: null,
    section: "components",
    menu: MENU,
    nav: navFor("components"),
    hasNav: true,
    count: entries.length,
    root: env.root,
    source: "https://github.com/rysev-a/pavlus/blob/main/ui-kit/frontend",
    look: env.look,
    active: env.look,
    catalog: catalog(),
    css: cssOf(env.look),
    sidebar: env.compact ? "closed" : "open",
    compact: env.compact,
    ...pageStates(),
  };
}

const sameLook = (a: Look, b: Look): boolean =>
  (Object.keys(a) as (keyof Look)[]).every((k) => a[k] === b[k]);

/**
 * The shell: the top menu, the sidebar of the section, the page the route
 * selects (`+outlet`) and the footer. The router wiring (`mounted`,
 * `routeChanged`) is the default of `Component`; both are replaced here to
 * also set the look.
 */
export class AppShell extends Component<AppState> {
  view = view;

  routing: Routing<AppState> = routingOf<AppState>({
    "/": {
      view: homeView,
      props: (s) => ({ nav: s.nav, root: s.root, count: s.count }),
    },
    "/blocks": {
      view: indexView,
      props: (s) => ({
        heading: "Blocks",
        intro: `${blocks.length} ready-made sections: forms, players, carts and the parts the templates are built from.`,
        nav: s.nav,
        root: s.root,
      }),
    },
    "/templates": {
      view: indexView,
      props: (s) => ({
        heading: "Templates",
        intro: `${templates.length} whole sites and apps, each with its own look, built from the blocks.`,
        nav: s.nav,
        root: s.root,
      }),
    },
    "/theming": {
      view: themingView,
      props: (s) => ({ look: s.look, catalog: s.catalog, css: s.css }),
    },
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
      store.set("current", current),
      store.set("section", section),
      store.set("nav", nav),
      store.set("hasNav", nav.length > 0),
      ...(sameLook(active, state.active)
        ? []
        : [store.set("active", active), themeEffector.apply(active, false)]),
    ];
  }

  mounted(_msg: Message, state: AppState): Effect[] {
    return [
      router.listen("routeChanged"),
      themeEffector.apply(state.look, false),
    ];
  }

  "header.toggleSidebar"(_msg: Message, state: AppState): Effect[] {
    return [store.set("sidebar", state.sidebar === "open" ? "closed" : "open")];
  }

  /** Light or dark: the visitor's look everywhere, a template's own for the template. */
  "header.toggleTheme"(_msg: Message, state: AppState): Effect[] {
    if (state.section === "templates") {
      const active = flipMode(state.active);
      return [store.set("active", active), themeEffector.apply(active, false)];
    }
    return this._choose(flipMode(state.look));
  }

  closeSidebar(): Effect[] {
    return [store.set("sidebar", "closed")];
  }

  /** A link of the sidebar: go there, and on a narrow screen close the drawer. */
  "sidebar.navigate"(msg: Message, state: AppState): Effect[] {
    return [
      router.navigate(msg.payload as string),
      ...(state.compact ? [store.set("sidebar", "closed")] : []),
    ];
  }

  /** `choose("font", id)` from the configurator: fonts, styles and the three sizes. */
  "theming.choose"(msg: Message, state: AppState): Effect[] {
    const [row, id] = msg.payload as [string, string];
    return this._choose(withChoice(state.look, row, id));
  }

  /**
   * `palette(id, mode)`: a theme is a name in a mode, so it sets both; with the
   * bundle on it also sets the font, the sizes and the style the theme comes with.
   */
  "theming.palette"(msg: Message, state: AppState): Effect[] {
    const [palette, mode] = msg.payload as [string, Look["mode"]];
    return this._choose(withTheme(state.look, palette, mode));
  }

  /** The "themes set font, sizes and style too" switch. */
  "theming.bundle"(msg: Message, state: AppState): Effect[] {
    return this._choose(withBundle(state.look, Boolean(msg.event?.checked)));
  }

  /** The random button: ask the random plugin which theme, apply it when it answers. */
  "theming.random"(): Effect[] {
    return [randomEffector.int(allThemes().length, "randomPicked")];
  }

  randomPicked(msg: Message, state: AppState): Effect[] {
    const pick = allThemes()[msg.payload as number];
    return pick
      ? this._choose(withTheme(state.look, pick.palette, pick.mode))
      : [];
  }

  "theming.reset"(_msg: Message, state: AppState): Effect[] {
    return this._choose(defaultLook(state.look.mode));
  }

  /** The visitor's new look: remembered, shown, and the export updated. */
  _choose(look: Look): Effect[] {
    return [
      store.set("look", look),
      store.set("active", look),
      store.set("css", cssOf(look)),
      themeEffector.apply(look, true),
    ];
  }
}

export const app = new AppShell();
