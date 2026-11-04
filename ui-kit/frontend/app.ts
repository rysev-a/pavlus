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
import { homeView, notFoundView, pageStates, routingOf } from "./pages.ts";
import { type Entry, entries, type NavGroup, navOf } from "./registry.ts";
import { type Theme, themeEffector } from "./theme.ts";

export type SidebarState = "open" | "closed";

export interface AppState {
  /** Where we are; `null` until the router plugin reports it. */
  route: Route | null;
  /** The component whose page is shown (its title and description), if any. */
  current: Entry | null;
  /** The sidebar: every component, by group. */
  nav: NavGroup[];
  count: number;
  /** The base path the site is served from, without a trailing slash. */
  root: string;
  /** Where the source of the pages is on GitHub (the `pages` folder). */
  source: string;
  theme: Theme;
  sidebar: SidebarState;
  /** A narrow screen: the sidebar is a drawer that closes after a click. */
  compact: boolean;
  /** The state of each demo that has some, under its slug (see pages.ts). */
  [page: string]: unknown;
}

export interface Environment {
  root: string;
  theme: Theme;
  compact: boolean;
}

/** Everything the page knows about the outside world comes in as data. */
export function initialState(env: Environment): AppState {
  return {
    route: null,
    current: null,
    nav: navOf(entries),
    count: entries.length,
    root: env.root,
    source: "https://github.com/rysev-a/pavlus/blob/main/ui-kit/frontend/pages",
    theme: env.theme,
    sidebar: env.compact ? "closed" : "open",
    compact: env.compact,
    ...pageStates(),
  };
}

/**
 * The shell: the sidebar, the top bar, the page the route selects
 * (`+outlet`) and the footer. The router wiring (`mounted`, `routeChanged`)
 * is the default of `Component`; `mounted` here also sets the theme.
 */
export class AppShell extends Component<AppState> {
  view = view;
  // The shell repaints on every state change — the opt-in keeps the previous
  // behavior now that the dom plugin no longer follows the state by default.
  updateDomOnStateChange = true;

  routing: Routing<AppState> = routingOf<AppState>(
    {
      view: homeView,
      props: (s) => ({ nav: s.nav, root: s.root, count: s.count }),
    },
    { view: notFoundView, props: (s) => ({ root: s.root }) },
  );

  /** The router reports the location: store the route, and which component it is. */
  routeChanged(
    msg: Message,
    _state: AppState,
    { setRoute }: ComponentCtx,
  ): Effect[] {
    const path = (msg.payload as { path: string }).path;
    const current = entries.find((e) => `/${e.slug}` === path) ?? null;
    return [...setRoute(msg.payload), store.set("current", current)];
  }

  mounted(_msg: Message, state: AppState): Effect[] {
    return [router.listen("routeChanged"), themeEffector.set(state.theme)];
  }

  "header.toggleSidebar"(_msg: Message, state: AppState): Effect[] {
    return [store.set("sidebar", state.sidebar === "open" ? "closed" : "open")];
  }

  "header.toggleTheme"(_msg: Message, state: AppState): Effect[] {
    const theme: Theme = state.theme === "dark" ? "light" : "dark";
    return [store.set("theme", theme), themeEffector.set(theme)];
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
}

export const app = new AppShell();
