/**
 * The friends page (`/app/friends`): the incoming requests, my friends and
 * the requests I sent — the original's three sections.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./friends.pavlus";

/** The page's slice: what the outlet hands it (state.friends). */
export type FriendsSlice = AppState["friends"];

export class FriendsPage extends Component<FriendsSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: FriendsSlice;
      next: FriendsSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    return [this.reload()];
  }

  /** The three lists again. */
  private reload(): Effect {
    return http.request({
      id: "friends",
      url: "/api/friends",
      onSuccess: "friends.loaded",
      onError: "friends.failed",
    });
  }

  "friends.loaded"(msg: Message): Effect[] {
    const data = msg.payload as {
      data: {
        incoming: FriendsSlice["incoming"];
        friends: FriendsSlice["friends"];
        outgoing: FriendsSlice["outgoing"];
        strings: Record<string, string>;
      };
    };
    return [
      store.merge(data.data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "friends.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [store.set("error", error, { onSuccess: "paint" })];
  }

  /** Accept, decline, remove — the original's three answers. */
  act(msg: Message, s: FriendsSlice): Effect[] {
    if (s.busy) return [];
    const [slug, act] = (msg.payload as [string, string]) ?? ["", ""];
    if (!slug || !act) return [];
    const path =
      act === "accept"
        ? `/api/friends/${slug}/accept`
        : act === "decline"
          ? `/api/friends/${slug}/decline`
          : `/api/friends/${slug}`;
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "act",
        method: act === "remove" ? "DELETE" : "POST",
        url: path,
        onSuccess: "act.done",
        onError: "act.failed",
      }),
    ];
  }

  "act.done"(): Effect[] {
    return [store.set("busy", false, { onSuccess: "paint" }), this.reload()];
  }

  "act.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("error", error, { onSuccess: "paint" }),
    ];
  }
}
