/**
 * The public profile (`/people/:slug`): who they are, what they do (the
 * professions with grades), the skills with their ratings. Read-only in the
 * port — editing stays in the API.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState, Profile } from "../state.ts";
import view from "./profile.pavlus";

/** The page's slice: what the outlet hands it (state.profile). */
export type ProfileSlice = AppState["profile"];

export class ProfilePage extends Component<ProfileSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ProfileSlice;
      next: ProfileSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(msg: Message): Effect[] {
    const slug = String(
      (msg.payload as { params?: Record<string, string> }).params?.slug ?? "",
    );
    return [
      store.set("slug", slug),
      store.set("data", null, { onSuccess: "paint" }),
      http.request({
        id: "profile",
        url: `/api/people/${slug}`,
        onSuccess: "profile.loaded",
        onError: "profile.failed",
      }),
    ];
  }

  "profile.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: Profile }).data;
    return [store.set("data", data, { onSuccess: "paint" })];
  }

  "profile.failed"(): Effect[] {
    return [store.set("data", null, { onSuccess: "paint" })];
  }
}
