/**
 * The welcome page of the app (`/app`): it greets the member and, while the
 * profile is blank, asks to fill it in (the original's `AppIndex`).
 *
 * The greeting and the texts come from the backend — the port translates on
 * the server, so the page renders what it is given.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./welcome.pavlus";

/** The page's slice: what the outlet hands it (state.welcome). */
export type WelcomeSlice = AppState["welcome"];

export class WelcomePage extends Component<WelcomeSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: WelcomeSlice;
      next: WelcomeSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    return [
      http.request({
        id: "welcome",
        url: "/api/welcome",
        onSuccess: "welcome.loaded",
        onError: "welcome.failed",
      }),
    ];
  }

  "welcome.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: WelcomeSlice }).data;
    return [
      store.merge(data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "welcome.failed"(): Effect[] {
    return [];
  }
}
