import {
  Component,
  type Route,
  type Routing,
} from "@service-laboratory/pavlus";
import view from "./dashboard.pavlus";
import notFoundView from "../not-found/not-found.pavlus";
import {
  initialOverview,
  overview,
  type OverviewState,
} from "./overview/overview.ts";
import {
  billing,
  initialBilling,
  type BillingState,
} from "./billing/billing.ts";
import { shop, initialShop, type ShopState } from "./shop/shop.ts";

export interface Tab {
  /** Relative to the dashboard: `/shop` is `/dashboard/shop`. */
  path: string;
  title: string;
}

export interface DashboardState {
  /** The part of the location below `/dashboard`; set by the router. */
  route: Route | null;
  tabs: Tab[];
  /** State of the `overview` sub-page (see `routing`). */
  overview: OverviewState;
  shop: ShopState;
  billing: BillingState;
}

export const initialDashboard: DashboardState = {
  route: null,
  tabs: [
    { path: "/", title: "Overview" },
    { path: "/shop", title: "Shop" },
    { path: "/billing", title: "Billing" },
  ],
  overview: initialOverview,
  shop: initialShop,
  billing: initialBilling,
};

/**
 * The `/dashboard` page: a tab bar and its own `+outlet`. It routes the part
 * of the path below its base and knows nothing about where it is mounted: a
 * tab's `navigate("/shop")` becomes `/dashboard/shop` by default.
 */
export class Dashboard extends Component<DashboardState> {
  view = view;

  routing: Routing<DashboardState> = {
    "/": { component: overview, key: "overview", name: "overview" }, // /dashboard
    "/shop": { component: shop, key: "shop" }, // /dashboard/shop
    "/billing": { component: billing, key: "billing" }, // /dashboard/billing
    "*": { view: notFoundView },
  };
}

export const dashboard = new Dashboard();
