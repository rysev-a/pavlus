// The address of every screen of the CRM, and the way back: pure.
import { ENTITIES } from "../../../framework/ui-kit/frontend/templates/phone-retail-crm/entities.ts";

/** screen id (the template's navigation) -> path */
export const SCREEN_PATHS: Record<string, string> = {
  users: "/users",
  roles: "/roles",
  permissions: "/permissions",
  sessions: "/sessions",
  manufacturers: "/manufacturers",
  models: "/models",
  products: "/products",
  shops: "/shops",
  shopsMap: "/shops/map",
  shopCategories: "/shop-categories",
  orders: "/orders",
  sales: "/sales",
  budget: "/budget",
  budgetEntries: "/budget/entries",
  settings: "/settings",
};

export const DEFAULT_PATH = "/orders";

export const pathOfScreen = (screen: string): string =>
  SCREEN_PATHS[screen] ?? DEFAULT_PATH;

/** Screens that have a list and a create / update form. */
export const isEntityScreen = (screen: string): boolean =>
  ENTITIES.some((e) => e.screen === screen);

export type Place =
  | { screen: string; mode: "list" }
  | { screen: string; mode: "form"; id: number };

/** `/orders/12` is the form of order 12, `/orders/new` a new order, `/shops/map` the map. */
export function parsePath(path: string): Place | null {
  const clean = path.replace(/\/+$/, "") || "/";
  for (const [screen, base] of Object.entries(SCREEN_PATHS)) {
    if (clean === base) return { screen, mode: "list" };
  }
  const cut = clean.lastIndexOf("/");
  const base = clean.slice(0, cut);
  const last = clean.slice(cut + 1);
  const screen = Object.keys(SCREEN_PATHS).find(
    (s) => SCREEN_PATHS[s] === base && isEntityScreen(s),
  );
  if (!screen) return null;
  if (last === "new") return { screen, mode: "form", id: 0 };
  if (/^[1-9]\d*$/.test(last))
    return { screen, mode: "form", id: Number(last) };
  return null;
}

/** The title of the browser tab for a path. */
export const TITLES: Record<string, string> = {
  users: "Users",
  roles: "Roles",
  permissions: "Permissions",
  sessions: "Sessions",
  manufacturers: "Manufacturers",
  models: "Models",
  products: "Products",
  shops: "Shops",
  shopsMap: "Shops map",
  shopCategories: "Shop categories",
  orders: "Orders",
  sales: "Sales statistics",
  budget: "Budget dashboard",
  budgetEntries: "Budget entries",
  settings: "Settings",
};

export function titleOf(path: string): string {
  const place = parsePath(path);
  if (!place) return "Page not found - PhoneHub CRM";
  const name = TITLES[place.screen] ?? "";
  const singular =
    ENTITIES.find((e) => e.screen === place.screen)?.singular ?? name;
  const cap = singular.charAt(0).toUpperCase() + singular.slice(1);
  const what =
    place.mode === "form"
      ? place.id
        ? `${cap} #${place.id}`
        : `New ${singular.toLowerCase()}`
      : name;
  return `${what} - PhoneHub CRM`;
}
