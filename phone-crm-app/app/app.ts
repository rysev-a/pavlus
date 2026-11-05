/**
 * The shell of the standalone CRM: the router reports the address, the routed
 * entry shows the CRM (or the not-found page), and the page look is applied.
 * Everything that touches the outside world is a plugin (frontend/main.ts).
 */
import {
  Component,
  type ComponentCtx,
  type Effect,
  type Message,
  type Routing,
} from "@service-laboratory/pavlus";
import { routerEffector as router } from "@service-laboratory/pavlus/plugins";
import { themeEffector } from "../../ui-kit/frontend/theme.ts";
import view from "./app.pavlus";
import notFoundView from "./not-found.pavlus";
import { crm } from "./crm.ts";
import { parsePath, titleOf } from "./routes.ts";
import { titleEffector } from "../frontend/title.ts";
import type { AppState } from "./state.ts";

class NotFound extends Component {
  view = notFoundView;

  enter(): Effect[] {
    return [titleEffector.set(titleOf("/404"))];
  }
}
const notFound = new NotFound();

export class App extends Component<AppState> {
  view = view;
  updateDomOnStateChange = true;

  routing: Routing<AppState> = {
    "*": {
      // "/" is not a screen but redirects to one: the CRM takes it over
      select: (s) =>
        !s.route || s.route.path === "/" || parsePath(s.route.path)
          ? crm
          : notFound,
      key: "crm",
      name: "crm",
    },
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
    return setRoute(msg.payload);
  }

  retry(_msg: Message, _state: AppState, { send }: ComponentCtx): Effect[] {
    return send("crm", "retry");
  }
}

export const app = new App();
