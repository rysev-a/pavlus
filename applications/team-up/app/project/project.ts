/**
 * The project page (`/projects/:slug`): the project with its slots, and the
 * apply button on the open ones. The owner of the project sees "yours" on
 * the slots instead of the apply button.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState, Project } from "../state.ts";
import view from "./project.pavlus";

/** The page's slice: what the outlet hands it (state.project). */
export type ProjectSlice = AppState["project"];

export class ProjectPage extends Component<ProjectSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ProjectSlice;
      next: ProjectSlice;
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
      store.set("applied", false, { onSuccess: "paint" }),
      store.set("status", "loading", { onSuccess: "paint" }),
      http.request({
        id: "project",
        url: `/api/projects/${slug}`,
        onSuccess: "project.loaded",
        onError: "project.failed",
      }),
    ];
  }

  "project.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: Project }).data;
    return [
      store.set("data", data, { onSuccess: "paint" }),
      store.set("status", "idle", { onSuccess: "paint" }),
    ];
  }

  "project.failed"(): Effect[] {
    return [store.set("status", "failed", { onSuccess: "paint" })];
  }

  /** The apply button's click (the template passes the slot's id). */
  apply(msg: Message): Effect[] {
    const slotId = Number((msg.payload as { slotId?: number }).slotId);
    return [
      http.request({
        id: `apply-${slotId}`,
        method: "POST",
        url: `/api/slots/${slotId}/apply`,
        body: { message: "" },
        onSuccess: "applied",
        onError: "applyFailed",
      }),
    ];
  }

  applied(): Effect[] {
    return [store.set("applied", true, { onSuccess: "paint" })];
  }

  applyFailed(msg: Message): Effect[] {
    void msg;
    return [];
  }
}
