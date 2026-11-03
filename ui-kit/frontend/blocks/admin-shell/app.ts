import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import { type NavGroup, patch, titleOf } from "./shell.ts";

/** The part of the state every app made with the admin shell has. */
export interface AppState {
  /** The id of the open view. */
  screen: string;
  title: string;
  /** The drawer of the sidebar on a narrow screen. */
  navOpen: boolean;
  notice: string;
  groups: NavGroup[];
}

/**
 * The messages of the shell, ready to extend: the sidebar (`nav.go`), the top
 * bar (`top.toggle`, `top.dismiss`), the notice that clears itself, and the
 * router's `leave` that stops the timers. An app overrides `_entering` and
 * `_leaving` to start or stop what a view needs (a log timer, say).
 */
export class AdminApp<S extends AppState> extends Component<S> {
  /** Extra effects when a view opens. */
  _entering(_screen: string, _state: S): Effect[] {
    return [];
  }

  /** Extra effects when a view closes. */
  _leaving(_screen: string, _state: S): Effect[] {
    return [];
  }

  "nav.go"(msg: Message, state: S): Effect[] {
    const screen = msg.payload as string;
    return [
      ...(screen === state.screen ? [] : this._leaving(state.screen, state)),
      ...patch({
        screen,
        title: titleOf(state.groups, screen),
        navOpen: false,
      }),
      ...(screen === state.screen ? [] : this._entering(screen, state)),
    ];
  }

  "top.toggle"(_msg: Message, state: S): Effect[] {
    return [store.set("navOpen", !state.navOpen)];
  }

  "top.dismiss"(): Effect[] {
    return [store.set("notice", ""), time.cancel("notice")];
  }

  closeNav(): Effect[] {
    return [store.set("navOpen", false)];
  }

  clearNotice(): Effect[] {
    return [store.set("notice", "")];
  }

  /** The page was left: nothing keeps running. */
  leave(_msg: Message, state: S): Effect[] {
    return [time.cancel("notice"), ...this._leaving(state.screen, state)];
  }

  /** The page was opened again: the open view starts what it needs. */
  enter(_msg: Message, state: S): Effect[] {
    return this._entering(state.screen, state);
  }
}
