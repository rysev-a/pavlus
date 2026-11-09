/**
 * The blog (`/blog`): the list of the posts with the tag filter and the
 * order. The page does not filter by itself — it asks the backend for the
 * list the query stands for and renders the answer.
 */
import {
  Component,
  type Effect,
  type Message,
  type Route,
} from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./blog.pavlus";

/** The page's slice: what the outlet hands it (state.blog). */
export type BlogSlice = AppState["blog"] & { route?: Route | null };

export class BlogPage extends Component<BlogSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: BlogSlice;
      next: BlogSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The page was entered: it asks for the list the query stands for. */
  enter(_msg: Message, s: BlogSlice): Effect[] {
    const search = s.route?.search ?? "";
    return [
      http.request({
        id: "blog",
        url: `/api/public/blog${search}`,
        onSuccess: "blog.loaded",
        onError: "blog.failed",
      }),
    ];
  }

  "blog.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: BlogSlice }).data;
    return [
      store.merge(data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "blog.failed"(): Effect[] {
    return [];
  }
}
