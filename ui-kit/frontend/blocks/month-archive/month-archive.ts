import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { shiftMonth, type Month } from "../../lib/calendar.ts";
import { patch } from "../admin-shell/shell.ts";
import { archiveView, countByDay, type ArchiveView } from "./archive.ts";
import view from "./month-archive.pavlus";

export interface ArchiveDemoState {
  month: Month;
  selected: string;
  counts: Record<string, number>;
  archive: ArchiveView;
  picked: string;
}

const TODAY = "2026-11-03";
const counts = countByDay([
  "2026-11-01",
  "2026-11-02",
  "2026-11-02",
  "2026-11-03",
  "2026-10-30",
  "2026-10-27",
  "2026-10-27",
  "2026-10-27",
  "2026-10-12",
]);

export const initial: ArchiveDemoState = {
  month: { year: 2026, month: 10 },
  selected: "",
  counts,
  archive: archiveView({ year: 2026, month: 10 }, counts, "", TODAY),
  picked: "nothing yet",
};

export class ArchivePage extends Component<ArchiveDemoState> {
  view = view;

  _show(state: ArchiveDemoState, month: Month, selected: string): Effect[] {
    return patch({
      month,
      selected,
      archive: archiveView(month, state.counts, selected, TODAY),
    });
  }

  "cal.prev"(_msg: Message, state: ArchiveDemoState): Effect[] {
    return this._show(state, shiftMonth(state.month, -1), state.selected);
  }
  "cal.next"(_msg: Message, state: ArchiveDemoState): Effect[] {
    return this._show(state, shiftMonth(state.month, 1), state.selected);
  }
  "cal.pick"(msg: Message, state: ArchiveDemoState): Effect[] {
    const iso = msg.payload as string;
    const selected = iso === state.selected ? "" : iso;
    return [
      ...this._show(state, state.month, selected),
      ...patch({ picked: selected || "nothing yet" }),
    ];
  }
}

export const page = new ArchivePage();
