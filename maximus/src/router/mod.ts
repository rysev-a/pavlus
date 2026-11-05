export { createRouter, route, redirect, Redirect } from "./router.ts";
export {
  createMemoryHistory,
  createBrowserHistory,
  createHashHistory,
  parseUrl,
} from "./history.ts";
export type { History, HistoryLocation, PopListener } from "./history.ts";
export { buildPath, parseQuery, buildSearch } from "./match.ts";
export type { ParamsOf, Params, Query } from "./match.ts";
export { shouldHandleClick, isExternal } from "./link.ts";
export type {
  Router,
  RouterOptions,
  RouteDef,
  AnyRoute,
  RouteProps,
  RouteMatch,
  RouteLocation,
  LoadContext,
  GuardContext,
  GuardResult,
  TitleContext,
  LinkOptions,
  LinkSpread,
  NavigateOptions,
  Scroller,
} from "./types.ts";
