/**
 * The home (`/`): the hero, the "is it hard to build a team" block, the four
 * steps of the service, the two inner blocks, the blog block and the reviews.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./home.pavlus";

/** The page's slice: what the outlet hands it (state.home). */
export type HomeSlice = AppState["home"];

export class HomePage extends Component<HomeSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: HomeSlice;
      next: HomeSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    return [
      http.request({
        id: "home",
        url: "/api/public/home",
        onSuccess: "home.loaded",
        onError: "home.failed",
      }),
    ];
  }

  "home.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: HomeSlice }).data;
    return [
      store.merge(data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "home.failed"(): Effect[] {
    return [];
  }
}
