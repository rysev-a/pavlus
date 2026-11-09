/**
 * The about page (`/about`): what the service is, who it is for, what it
 * gives and the questions.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./about.pavlus";

/** The page's slice: what the outlet hands it (state.about). */
export type AboutSlice = AppState["about"];

export class AboutPage extends Component<AboutSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: AboutSlice;
      next: AboutSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    return [
      http.request({
        id: "about",
        url: "/api/public/about",
        onSuccess: "about.loaded",
        onError: "about.failed",
      }),
    ];
  }

  "about.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: AboutSlice }).data;
    return [
      store.merge(data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "about.failed"(): Effect[] {
    return [];
  }
}
