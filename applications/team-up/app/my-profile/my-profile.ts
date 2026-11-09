/**
 * The profile editor (`/app/profile`): the card with the member's own page,
 * the photo and the basics form (the name, the city, the bio, the status).
 *
 * The professions and the skills live on their own page (`/app/professions`),
 * as in the original — the editor links to it.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState, MyProfile } from "../state.ts";
import view from "./my-profile.pavlus";

/** The page's slice: what the outlet hands it (state.myProfile). */
export type MyProfileSlice = AppState["myProfile"];

export class MyProfilePage extends Component<MyProfileSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: MyProfileSlice;
      next: MyProfileSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    return [
      store.set("error", "", { onSuccess: "paint" }),
      store.set("notice", "", { onSuccess: "paint" }),
      http.request({
        id: "profile",
        url: "/api/profile/editor",
        onSuccess: "profile.loaded",
        onError: "profile.failed",
      }),
    ];
  }

  /** The form is filled with the profile of the member. */
  "profile.loaded"(msg: Message): Effect[] {
    const data = msg.payload as {
      data: MyProfile & {
        avatarUrl: string;
        statuses: { value: string; label: string }[];
        strings: Record<string, string>;
      };
    };
    const profile = data.data;
    return [
      store.merge(profile as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
      store.set("name", profile.name ?? "", { onSuccess: "paint" }),
      store.set("city", profile.city ?? "", { onSuccess: "paint" }),
      store.set("bio", profile.bio ?? "", { onSuccess: "paint" }),
      store.set("status", profile.status ?? "", { onSuccess: "paint" }),
    ];
  }

  "profile.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [store.set("error", error, { onSuccess: "paint" })];
  }

  setName(msg: Message): Effect[] {
    return [store.set("name", msg.event?.value ?? "", { onSuccess: "paint" })];
  }

  setCity(msg: Message): Effect[] {
    return [store.set("city", msg.event?.value ?? "", { onSuccess: "paint" })];
  }

  setBio(msg: Message): Effect[] {
    return [store.set("bio", msg.event?.value ?? "", { onSuccess: "paint" })];
  }

  setStatus(msg: Message): Effect[] {
    return [
      store.set("status", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  /** The form is sent. */
  submit(_msg: Message, s: MyProfileSlice): Effect[] {
    if (s.busy) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      http.request({
        id: "save",
        method: "PUT",
        url: "/api/profile",
        body: { city: s.city, bio: s.bio, status: s.status },
        onSuccess: "profile.saved",
        onError: "profile.saveFailed",
      }),
    ];
  }

  "profile.saved"(msg: Message): Effect[] {
    const notice =
      (msg.payload as { data?: { notice?: string } })?.data?.notice ?? "";
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("notice", notice, { onSuccess: "paint" }),
    ];
  }

  "profile.saveFailed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("error", error, { onSuccess: "paint" }),
    ];
  }
}
