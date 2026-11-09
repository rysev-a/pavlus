/**
 * The member page (`/users/:slug`): the member's card, the rated skills
 * grouped by profession and the friend button (the viewer's relation to the
 * member, from the `friendships` table).
 *
 * The friend button acts through the port's friends API (ask, accept,
 * decline, remove) and the page is asked again afterwards, so the button
 * shows the new relation.
 *
 * The "Report" button opens the report dialog (report/) — a child of this
 * page: the page says what is reported (the member), the dialog sends it.
 */
import {
  type Children,
  Component,
  type ComponentCtx,
  type Effect,
  type Message,
  type Route,
} from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import { ReportDialog } from "../report/report.ts";
import type { AppState, ReportSlice } from "../state.ts";
import view from "./member.pavlus";

/** The page's slice: what the outlet hands it (state.member). */
export type MemberSlice = AppState["member"] & { route?: Route | null };

/** The answer of an unknown member: the shape of the slice, empty. */
const emptyMember = (slug: string, report: ReportSlice): MemberSlice => ({
  user: null,
  skillGroups: [],
  since: "",
  friend: { slug, relation: "none" },
  report,
});

export class MemberPage extends Component<MemberSlice> {
  view = view;

  /** The report dialog of the page (its child: `report.…` is its own). */
  private readonly report = new ReportDialog();

  /** The embedded children, by instance name (`report.…` goes to the dialog). */
  children: Children<MemberSlice> = {
    report: { component: this.report, tag: "report-dialog" },
  };

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: MemberSlice;
      next: MemberSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The page was entered: it asks for the member behind the slug. */
  enter(_msg: Message, s: MemberSlice): Effect[] {
    const slug = s.route?.params.slug ?? "";
    return [this._load(slug)];
  }

  /**
   * The reply of the request above. The framework strips the route's name
   * from the message id before it reaches the page — the handler carries
   * the route's name, like the request's answer does.
   */
  "member.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: MemberSlice }).data;
    return [
      store.merge(data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  /** The slug is unknown: the page shows nothing of a member. */
  missing(msg: Message, s: MemberSlice): Effect[] {
    const data = (msg.payload as { data?: MemberSlice }).data;
    return [
      store.set(data ?? emptyMember(s.friend.slug, s.report), {
        onSuccess: "paint",
      }),
    ];
  }

  /** The "Report" button: the dialog opens on this member. */
  openReport(_msg: Message, s: MemberSlice, { send }: ComponentCtx): Effect[] {
    return send("report", "open", {
      kind: "person",
      target: s.user?.slug ?? s.friend.slug,
      title: s.user ? `Report: ${s.user.name}` : "Report",
    });
  }

  /** The friend button: ask the member to be a friend. */
  friendRequest(_msg: Message, s: MemberSlice): Effect[] {
    return [this._friend("POST", `/api/friends/${s.friend.slug}`)];
  }

  /** The friend button: the request of the member is accepted. */
  friendAccept(_msg: Message, s: MemberSlice): Effect[] {
    return [this._friend("POST", `/api/friends/${s.friend.slug}/accept`)];
  }

  /** The friend button: the request of the member is declined. */
  friendDecline(_msg: Message, s: MemberSlice): Effect[] {
    return [this._friend("POST", `/api/friends/${s.friend.slug}/decline`)];
  }

  /** The friend button: the member is removed from the friends. */
  friendRemove(_msg: Message, s: MemberSlice): Effect[] {
    return [this._friend("DELETE", `/api/friends/${s.friend.slug}`)];
  }

  /** "Send a message": the dm with the member, then the inbox. */
  writeMessage(_msg: Message, s: MemberSlice): Effect[] {
    return [
      http.request({
        id: "member-dm",
        method: "POST",
        url: `/api/chat/dm/${s.friend.slug}`,
        onSuccess: "member.message.sent",
        onError: "member.message.failed",
      }),
    ];
  }

  "message.sent"(): Effect[] {
    return [router.navigate("/app/chat", { absolute: true })];
  }

  "member.message.failed"(): Effect[] {
    return [];
  }

  /** The action of the friend button; the page is asked again after it. */
  private _friend(method: string, url: string): Effect {
    return http.request({
      id: "member-friend",
      method,
      url,
      onSuccess: "member.friend.done",
      onError: "member.friend.failed",
    });
  }

  "friend.done"(_msg: Message, s: MemberSlice): Effect[] {
    return [this._load(s.friend.slug)];
  }

  "friend.failed"(): Effect[] {
    return [];
  }

  /** The member behind a slug. */
  private _load(slug: string): Effect {
    return http.request({
      id: "member",
      url: `/api/public/member/${slug}`,
      onSuccess: "member.loaded",
      onError: "member.missing",
    });
  }
}
