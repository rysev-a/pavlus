/**
 * The person page (`/app/people/:slug`): the member as the viewer sees them —
 * the relation (the friend buttons), the direct message, the block and the
 * report.
 *
 * The data comes from the backend (`/api/people/:slug`): the profile, the
 * relation, the block and the contacts (the friends and the member alone see
 * them), with the texts of the page — the translation lives on the server.
 *
 * The report dialog (report/) is a child of this page: the page says what is
 * reported (the member), the dialog sends it.
 */
import {
  type Children,
  Component,
  type ComponentCtx,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import { ReportDialog } from "../report/report.ts";
import type { AppState, Person } from "../state.ts";
import view from "./person.pavlus";

/** The page's slice: what the outlet hands it (state.person). */
export type PersonSlice = AppState["person"];

export class PersonPage extends Component<PersonSlice> {
  view = view;

  /** The report dialog of the page (its child: `report.…` is its own). */
  private readonly report = new ReportDialog();

  /** The embedded children, by instance name (`report.…` goes to the dialog). */
  children: Children<PersonSlice> = {
    report: { component: this.report },
  };

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: PersonSlice;
      next: PersonSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(_msg: Message, s: PersonSlice): Effect[] {
    const slug = s.route?.params.slug ?? "";
    return [
      store.set("person", null, { onSuccess: "paint" }),
      store.set("busy", false, { onSuccess: "paint" }),
      ...this.load(slug),
    ];
  }

  /** The member behind the slug. */
  private load(slug: string): Effect[] {
    if (!slug) return [];
    return [
      http.request({
        id: "person",
        url: `/api/people/${slug}`,
        onSuccess: "person.loaded",
        onError: "person.failed",
      }),
    ];
  }

  "person.loaded"(msg: Message): Effect[] {
    const data = msg.payload as {
      data: { person: Person | null; strings: Record<string, string> };
    };
    return [
      store.set("person", data.data.person ?? null, { onSuccess: "paint" }),
      store.set("strings", data.data.strings ?? {}, { onSuccess: "paint" }),
    ];
  }

  "person.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [
      store.set("person", null, { onSuccess: "paint" }),
      store.set("error", error, { onSuccess: "paint" }),
    ];
  }

  /** The friend buttons: ask, accept, decline, remove. */
  friend(msg: Message, s: PersonSlice): Effect[] {
    if (s.busy || !s.person) return [];
    const action = String(msg.payload ?? "");
    const slug = s.person.slug;
    const url =
      action === "accept"
        ? `/api/friends/${slug}/accept`
        : action === "decline"
          ? `/api/friends/${slug}/decline`
          : action === "remove"
            ? `/api/friends/${slug}`
            : `/api/friends/${slug}`;
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "person.friend",
        method: action === "remove" ? "DELETE" : "POST",
        url,
        onSuccess: "person.friend.done",
        onError: "person.failed",
      }),
    ];
  }

  "person.friend.done"(_msg: Message, s: PersonSlice): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      ...this.load(s.person?.slug ?? ""),
    ];
  }

  /** "Write": the direct thread with the member, then the inbox. */
  write(_msg: Message, s: PersonSlice): Effect[] {
    if (!s.person) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "person.dm",
        method: "POST",
        url: `/api/chat/dm/${s.person.slug}`,
        onSuccess: "person.dm.done",
        onError: "person.failed",
      }),
    ];
  }

  "person.dm.done"(msg: Message): Effect[] {
    const threadId = (msg.payload as { data?: { threadId?: number } })?.data
      ?.threadId;
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      threadId
        ? router.navigate(`/app/messages/${threadId}`, { absolute: true })
        : router.navigate("/app/messages", { absolute: true }),
    ];
  }

  /** The member is blocked (or unblocked). */
  block(msg: Message, s: PersonSlice): Effect[] {
    if (!s.person || s.busy) return [];
    const unblock = String(msg.payload ?? "") === "unblock";
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "person.block",
        method: unblock ? "DELETE" : "POST",
        url: `/api/blocks/${s.person.slug}`,
        onSuccess: "person.block.done",
        onError: "person.failed",
      }),
    ];
  }

  "person.block.done"(_msg: Message, s: PersonSlice): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      ...this.load(s.person?.slug ?? ""),
    ];
  }

  /** The "Report" button: the dialog opens on this member. */
  openReport(_msg: Message, s: PersonSlice, { send }: ComponentCtx): Effect[] {
    return send("report", "open", {
      kind: "person",
      target: s.person?.slug ?? "",
      title: s.person
        ? (s.strings.reportTitle ?? "Report {name}").replace(
            "{name}",
            s.person.name,
          )
        : "Report",
    });
  }
}
