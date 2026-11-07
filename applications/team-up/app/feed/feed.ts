/**
 * The feed page (`/`): my match, newest first. Every open slot of every
 * active project, with the profession as the hard filter and the coverage as
 * the number — clicking one opens the project.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState, FeedItem } from "../state.ts";
import view from "./feed.pavlus";

/** The page's slice: what the outlet hands it (state.feed). */
export type FeedSlice = AppState["feed"];

export class FeedPage extends Component<FeedSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: FeedSlice;
      next: FeedSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    return [
      store.set("status", "loading", { onSuccess: "paint" }),
      http.request({
        id: "feed",
        url: "/api/match/feed",
        onSuccess: "feed.loaded",
        onError: "feed.failed",
      }),
    ];
  }

  "feed.loaded"(msg: Message): Effect[] {
    const items = (msg.payload as { data: FeedItem[] }).data;
    return [
      store.set("items", items, { onSuccess: "paint" }),
      store.set("status", "idle", { onSuccess: "paint" }),
    ];
  }

  "feed.failed"(): Effect[] {
    return [store.set("status", "failed", { onSuccess: "paint" })];
  }

  open(msg: Message): Effect[] {
    const slug = String((msg.payload as { slug?: string }).slug ?? "");
    return [router.navigate(`/projects/${slug}`)];
  }
}
