// The shell of Mobile Dev: one screen with the editor the address selects and a
// tab bar at the bottom, where the thumb is.
//
//   /             Flow Studio: the board of the diagram
//   /interface    the Visual Builder
//
// The two editors are the ui-kit's own components, unchanged. There is no server:
// they keep their project in the phone's storage (the ui-kit's `local` plugin).
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
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import {
  type FsState,
  page as flowStudio,
  stateOf,
} from "../../../framework/ui-kit/frontend/templates/flow-studio/flow-studio.ts";
import { meta as flowMeta } from "../../../framework/ui-kit/frontend/templates/flow-studio/meta.ts";
import { emptyModel } from "../../../framework/ui-kit/frontend/templates/flow-studio/model.ts";
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
  flipMode,
  type Look,
} from "../../../framework/ui-kit/frontend/theming.ts";
import view from "./app.pavlus";
import notFound from "./not-found.pavlus";

export type Tab = "board" | "interface";

export interface AppState {
  route: Route | null;
  /** where the site is served from: "" or "/pavlus/mobile" (for the real links of the tabs) */
  root: string;
  /** the colour theme, remembered by the theme plugin */
  look: Look;
  tab: Tab;
  flowStudio: FsState;
  visualBuilder: VbState;
}

/** the look a first visit starts with: Flow Studio's own, dark */
export const startLook = (): Look => presetLook(flowMeta.look, "dark");

export function initialState(root = "", look: Look = startLook()): AppState {
  return {
    route: null,
    root,
    look,
    tab: "board",
    flowStudio: stateOf({ ...emptyModel(), name: "My board" }),
    visualBuilder: initialUi,
  };
}

/** the editor an address names */
export const tabOf = (path: string): Tab =>
  path.replace(/\/+$/, "") === "/interface" ? "interface" : "board";

export class App extends Component<AppState> {
  view = view;

  /** a store write answers "paint": one diff of the whole tree, the editors included */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as { prev: AppState; next: AppState };
    return [DomPlugin.update(viewOf(this)!.diff(prev, next))];
  }

  routing: Routing<AppState> = {
    "/": { component: flowStudio, key: "flowStudio" },
    "/interface": { component: visualBuilder, key: "visualBuilder" },
    "*": { view: notFound },
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
    const { path } = msg.payload as { path: string };
    return [store.set("tab", tabOf(path)), ...setRoute(msg.payload)];
  }

  /** a tab of the bar: the address changes, the router answers */
  open(msg: Message): Effect[] {
    return [router.navigate(String(msg.payload), { absolute: true })];
  }

  toggleMode(_msg: Message, state: AppState): Effect[] {
    const look = flipMode(state.look);
    return [store.set("look", look), themeEffector.apply(look, true)];
  }
}

export const app = new App();
