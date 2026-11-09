/**
 * The 404 page: the text of the original, with the links to the home page,
 * the blog and the projects.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./not-found.pavlus";

/** The page's slice: what the outlet hands it (state.notFound). */
export type NotFoundSlice = AppState["notFound"];

export class NotFoundPage extends Component<NotFoundSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: NotFoundSlice;
      next: NotFoundSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    return [
      http.request({
        id: "notFound",
        url: "/api/public/not-found",
        onSuccess: "notFound.loaded",
        onError: "notFound.failed",
      }),
    ];
  }

  "notFound.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: NotFoundSlice }).data;
    return [
      store.merge(data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "notFound.failed"(): Effect[] {
    return [];
  }
}
