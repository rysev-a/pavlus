/**
 * The behavior half of one row: a keyed child of the page, joined to the
 * `+Row#row(key=id)` embed of its template by the instance name. The keyed
 * boundary (`each: "byId"` on the page) slices the page's state to exactly
 * this row — `state.byId[id]`, never the other rows — and roots this row's
 * writes back in the same element (`byId.<id>.…`), so the row knows nothing
 * of the data around it: its world is one user.
 *
 * What it owns is the star: the click arrives as `row.<id>.star` (the embed
 * put the key in the prefix), the write answers "paint", and the reply comes
 * back as `row.<id>.paint` — to this row, not the page. The row's paint
 * diffs its own template (the answer arrives already sliced to the row's
 * element) and hands the patches over without a target: the boundary scopes
 * them to this row's place in the table — the ids get the loop key and the
 * embed, the events the `row.<id>.` prefix — and the star flips in place
 * without the page being any the wiser.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { RowState } from "../../state.ts";
import view from "./user-list-row.pavlus";

export class UserListRow extends Component<RowState> {
  view = view;

  /** The star button: flip this row's own flag. */
  star(_m: Message, s: RowState): Effect[] {
    return [store.set("starred", !s.starred, { onSuccess: "paint" })];
  }

  /**
   * This row's write answered: diff this row's cells (the answer's `{ prev,
   * next }` arrived already sliced to this row's element) and hand the patches
   * over target-less — the keyed boundary scopes them into the page's table.
   */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as { prev: RowState; next: RowState };
    return [DomPlugin.update(view.diff(prev, next))];
  }
}
