import {
  Component,
  type ComponentCtx,
  type Effect,
  type Message,
  type Route,
  type Routing,
} from "@pavlus/frontend";
import {
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { meta } from "../../../framework/ui-kit/frontend/templates/orbit-social/meta.ts";
import {
  presetLook,
  themeEffector,
} from "../../../framework/ui-kit/frontend/theme.ts";
import type { Look } from "../../../framework/ui-kit/frontend/theming.ts";
import view from "./app.pavlus";
import { initialOrbit, type OrbitAppState, orbit } from "./orbit-app.ts";
import { parsePath } from "./routes.ts";

export interface AppState {
  route: Route | null;
  /** the path is none of the screens: the shell shows its own page */
  notFound: boolean;
  look: Look;
  /** Orbit, the template: its own state */
  orbit: OrbitAppState;
}

export function initialState(mode: Look["mode"] = "light"): AppState {
  return {
    route: null,
    notFound: false,
    look: presetLook(meta.look, mode),
    orbit: initialOrbit(),
  };
}

/**
 * The root: Orbit under one route (`*`), so moving between its screens never
 * remounts it; the router plugin reports the location, the paths are told
 * apart by Orbit itself (app/routes.ts).
 */
export class App extends Component<AppState> {
  view = view;
  updateDomOnStateChange = true;

  routing: Routing<AppState> = {
    "*": { component: orbit, key: "orbit", name: "orbit" },
  };

  mounted(_msg: Message, state: AppState): Effect[] {
    return [
      router.listen("routeChanged"),
      themeEffector.apply(state.look, false),
    ];
  }

  routeChanged(
    msg: Message,
    _state: AppState,
    { setRoute }: ComponentCtx,
  ): Effect[] {
    const path = (msg.payload as { path: string }).path;
    return [
      store.set("notFound", parsePath(path).kind === "unknown"),
      ...setRoute(msg.payload),
    ];
  }

  /** The "Try again" of a failed load. */
  retry(_msg: Message, _state: AppState, { send }: ComponentCtx): Effect[] {
    return send("orbit", "reload");
  }
}

export const app = new App();
