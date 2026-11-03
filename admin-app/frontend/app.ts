import {
  Component,
  type Route,
  type Routing,
} from "@service-laboratory/pavlus";
import view from "./app.pavlus";
import indexView from "./pages/index/index.pavlus";
import notFoundView from "./pages/not-found/not-found.pavlus";
import aboutView from "./pages/about/about.pavlus";
import { admin, type AdminState, initialAdmin } from "./pages/admin/admin.ts";
import { list, table } from "./modules/users/users.ts";
import {
  dashboard,
  type DashboardState,
  initialDashboard,
} from "./pages/dashboard/dashboard.ts";

export interface MenuItem {
  path: string;
  title: string;
}

export interface AppState {
  /** Where we are; `null` until the router plugin reports it. */
  route: Route | null;
  menu: MenuItem[];
  dashboard: DashboardState;
  admin: AdminState;
}

export const initialState: AppState = {
  route: null,
  menu: [
    { path: "/", title: "Home" },
    { path: "/dashboard", title: "Dashboard" },
    { path: "/about", title: "About" },
    { path: "/admin", title: "Admin" },
  ],
  dashboard: initialDashboard,
  admin: initialAdmin,
};

/**
 * The shell: the header, the page the route selects (`+outlet`) and the
 * footer. It does not know what the pages contain or how they load: a page
 * that needs data handles `enter` when the router activates it. Mounting is
 * done by `createApp` (main.ts); the router wiring (`mounted`, `routeChanged`)
 * and the links (`header.navigate`, `about.navigate`...) are the defaults of
 * `Component`.
 */
export class AppShell extends Component<AppState> {
  view = view;

  routing: Routing<AppState> = {
    "/": {
      view: indexView,
      props: (s) => ({ pages: s.menu.filter((p) => p.path !== "/") }),
    },
    "/dashboard": { component: dashboard, key: "dashboard" },
    "/about": { view: aboutView, props: (s) => ({ pages: s.menu }) },
    "/admin": { component: admin, key: "admin" },
    "*": { view: notFoundView },
  };
}

export const app = new AppShell();

/**
 * The components that are values in the state (`+{usersComponent}`). The
 * server needs their names to serialize the state of a rendered page, and
 * the browser to put the instances back (see main.ts, backend/ssr.ts).
 */
export const components = { list, table };
