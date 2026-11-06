/**
 * The behavior half of the page header: the `+Header#header` embed of
 * user-list.pavlus, joined to it by the instance name. A keyless child — no
 * `key`, no `each` — so it sees the page's whole state (a header owns no data
 * of its own) and its messages arrive as `header.…`, handled here alone. The
 * "new user" button is its one concern: the create page.
 */
import { Component, type Effect } from "@pavlus/frontend";
import { routerEffector as router } from "@pavlus/frontend/plugins";
import type { ListState } from "../../state.ts";
import view from "./user-list-header.pavlus";

export class UserListHeader extends Component<ListState> {
  view = view;

  /** The header's button: the create page. */
  newUser(): Effect[] {
    return [router.navigate("/new")];
  }
}
