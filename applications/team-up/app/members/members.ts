/**
 * The members directory (`/users`): the filter chips (level, labels, city,
 * status), the sort row, the cards of the members and the pager.
 *
 * The chips are plain links with a server-computed address: a click on a
 * selected chip removes its value, the other filters stay (the original's
 * `toggle_href`). The page therefore does not filter by itself — it asks the
 * backend for the list the query stands for and renders the answer.
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
import view from "./members.pavlus";

/** The page's slice: what the outlet hands it (state.members). */
export type MembersSlice = AppState["members"] & { route?: Route | null };

export class MembersPage extends Component<MembersSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: MembersSlice;
      next: MembersSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The page was entered: it asks for the list the query stands for. */
  enter(_msg: Message, s: MembersSlice): Effect[] {
    const search = s.route?.search ?? "";
    return [
      http.request({
        id: "members",
        url: `/api/public/members${search}`,
        // the reply is addressed to the page: the router's name ("members")
        // in front, the page's own handler behind it
        onSuccess: "members.loaded",
        onError: "members.failed",
      }),
    ];
  }

  /** The reply of the request above (the route's name is part of the id). */
  "members.loaded"(msg: Message): Effect[] {
    const data = (msg.payload as { data: MembersSlice }).data;
    return [
      store.merge(data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
    ];
  }

  "members.failed"(): Effect[] {
    return [];
  }
}
