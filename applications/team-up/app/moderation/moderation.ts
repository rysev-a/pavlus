/**
 * The moderation queue (`/app/moderation`): the reports the members sent and
 * the suspended members. A moderator answers a report with one of: dismiss,
 * cancel the project, remove the message, suspend the member.
 *
 * The texts and the labels of the reports come from the backend — the port
 * translates on the server.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./moderation.pavlus";

/** The page's slice: what the outlet hands it (state.moderation). */
export type ModerationSlice = AppState["moderation"];

export class ModerationPage extends Component<ModerationSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ModerationSlice;
      next: ModerationSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    return [
      store.set("notice", "", { onSuccess: "paint" }),
      ...this.reload("open"),
    ];
  }

  /** The queue of the filter and the suspended members. */
  private reload(status: string): Effect[] {
    return [
      http.request({
        id: "reports",
        url: `/api/admin/reports?status=${status}`,
        onSuccess: "reports.loaded",
        onError: "reports.failed",
      }),
      http.request({
        id: "suspensions",
        url: "/api/admin/suspensions",
        onSuccess: "suspensions.loaded",
        onError: "suspensions.failed",
      }),
    ];
  }

  /** The filter of the queue. */
  setStatus(msg: Message): Effect[] {
    const status = String(msg.event?.value ?? "open");
    return [
      store.set("status", status, { onSuccess: "paint" }),
      ...this.reload(status),
    ];
  }

  "reports.loaded"(msg: Message): Effect[] {
    const data = msg.payload as {
      data: {
        reports: ModerationSlice["reports"];
        statuses: { value: string; label: string }[];
        strings: Record<string, string>;
      };
    };
    return [
      store.merge(data.data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "reports.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [store.set("notice", error, { onSuccess: "paint" })];
  }

  "suspensions.loaded"(msg: Message): Effect[] {
    const data = msg.payload as {
      data: {
        suspended: ModerationSlice["suspended"];
        strings: Record<string, string>;
      };
    };
    return [
      store.merge(data.data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "suspensions.failed"(): Effect[] {
    return [];
  }

  /** The note the moderator writes before answering. */
  setNote(msg: Message): Effect[] {
    return [store.set("note", msg.event?.value ?? "", { onSuccess: "paint" })];
  }

  /** The report is answered. */
  resolve(msg: Message, s: ModerationSlice): Effect[] {
    if (s.busy) return [];
    const [id, action] = (msg.payload as [number, string]) ?? [0, ""];
    if (!Number.isInteger(id) || !action) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "resolve",
        method: "POST",
        url: `/api/admin/reports/${id}/resolve`,
        body: { action, note: s.note.trim() },
        onSuccess: "resolve.done",
        onError: "resolve.failed",
      }),
    ];
  }

  "resolve.done"(): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("note", "", { onSuccess: "paint" }),
      ...this.reload("open"),
    ];
  }

  "resolve.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("notice", error, { onSuccess: "paint" }),
    ];
  }

  /** The suspended member is let back. */
  lift(msg: Message): Effect[] {
    const slug = String(msg.payload ?? "");
    if (!slug) return [];
    return [
      http.request({
        id: "lift",
        method: "DELETE",
        url: `/api/admin/suspensions/${slug}`,
        onSuccess: "lift.done",
        onError: "lift.failed",
      }),
    ];
  }

  "lift.done"(): Effect[] {
    return [
      http.request({
        id: "suspensions",
        url: "/api/admin/suspensions",
        onSuccess: "suspensions.loaded",
        onError: "suspensions.failed",
      }),
    ];
  }

  "lift.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [store.set("notice", error, { onSuccess: "paint" })];
  }
}
