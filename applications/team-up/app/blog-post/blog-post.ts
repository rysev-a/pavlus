/**
 * The blog post (`/blog/:pid`): the post on its own page — the date, the
 * title, the tags and the text (one paragraph per block).
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
import view from "./blog-post.pavlus";

/** The page's slice: what the outlet hands it (state.blogPost). */
export type BlogPostSlice = AppState["blogPost"] & { route?: Route | null };

export class BlogPostPage extends Component<BlogPostSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: BlogPostSlice;
      next: BlogPostSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The page was entered: it asks for the post of the address. */
  enter(_msg: Message, s: BlogPostSlice): Effect[] {
    const pid = s.route?.params.pid ?? "";
    return [
      http.request({
        id: "blogPost",
        url: `/api/public/blog/${encodeURIComponent(pid)}`,
        onSuccess: "blogPost.loaded",
        onError: "blogPost.failed",
      }),
    ];
  }

  "blogPost.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: BlogPostSlice }).data;
    return [
      store.merge(data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "blogPost.failed"(): Effect[] {
    return [];
  }
}
