/**
 * The behavior half of the users table's row: the page's `row` child, joined
 * to the `+Row#row` embed of its template by the instance name. The events
 * the row's template renders arrive here prefixed `row.` (the embed added it)
 * after the outlet prefixed `list.`. The child has no state key and no view
 * of its own — a row is not state, it is one user's view inside the page's
 * slice — so it reads the page's slice as-is and its store paths land beside
 * the page's own (no prefix to add). What it owns is the star: the write
 * answers "paint", and the reply climbs out as `list.row.paint`, which the
 * page answers — the row's DOM is part of the page's view (the embed renders
 * it there), so the page's diff produces the row's patches, their ids walking
 * the whole chain: the outlet, the loop's key, the embed, the row's nodes.
 */
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import type { ListState } from "../../state.ts";

export class UserListRow extends Component<ListState> {
  /** The star button: mark or unmark this row's user. */
  star(msg: Message, s: ListState): Effect[] {
    const id = msg.payload as number;
    const starred = s.starred.includes(id)
      ? s.starred.filter((x) => x !== id)
      : [...s.starred, id];
    return [store.set("starred", starred, { onSuccess: "paint" })];
  }
}
