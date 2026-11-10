import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import { type Month, shiftMonth, WEEKDAYS } from "../../lib/calendar.ts";
import {
  daysIn,
  describe,
  type MonthView,
  monthView,
  pick,
  presetsOf,
  type Range,
  sameRange,
} from "../../lib/range.ts";
import view from "./view.pavlus";

/** The "today" of the demo: there is no clock in application code. */
export const TODAY = "2026-11-03";

export interface Preset {
  id: string;
  label: string;
  /** The preset is the range on screen. */
  active: boolean;
  /** The preset is not the range on screen (no negation in templates). */
  idle: boolean;
}

export interface RangeState {
  /** The month of the left panel; the right one is the next. */
  month: Month;
  range: Range;
  /** The day under the pointer while the end is still to be picked. */
  hover: string;
  /** For the popover variant. */
  open: boolean;
  /** What `aria-expanded` reads: "true" or "false". */
  expanded: string;
  /** Derived from the above. */
  left: MonthView;
  right: MonthView;
  summary: string;
  /** What the popover's button reads: the range, or its placeholder. */
  triggerLabel: string;
  days: number;
  /** Clear is dim while there is nothing to clear. */
  clearDisabled: boolean;
  presets: Preset[];
  weekdays: string[];
}

type Core = Pick<RangeState, "month" | "range" | "hover">;

/** What `aria-expanded` reads of `open`. */
export const expandedOf = (open: boolean): string => (open ? "true" : "false");

/** Pure: everything on screen that follows from the month, the range and the hover. */
export function derive({ month, range, hover }: Core) {
  const summary = describe(range);
  const days = daysIn(range);
  return {
    left: monthView(month, range, hover, TODAY),
    right: monthView(shiftMonth(month, 1), range, hover, TODAY),
    summary,
    triggerLabel: range.end ? summary : "Pick a date range",
    days,
    clearDisabled: days === 0 && summary === "Pick a start date",
    presets: presetsOf(TODAY).map((p) => {
      const active = sameRange(p.range, range);
      return { id: p.id, label: p.label, active, idle: !active };
    }),
    weekdays: WEEKDAYS,
  };
}

export function stateOf(core: Core, open = false): RangeState {
  return { ...core, open, expanded: expandedOf(open), ...derive(core) };
}

/** A range calendar with two months, a hover preview and quick ranges. */
export class RangeCalendar extends Component<RangeState> {
  view = view;

  prev(_msg: Message, state: RangeState): Effect[] {
    return this._commit(state, { month: shiftMonth(state.month, -1) });
  }

  next(_msg: Message, state: RangeState): Effect[] {
    return this._commit(state, { month: shiftMonth(state.month, 1) });
  }

  pick(msg: Message, state: RangeState): Effect[] {
    const range = pick(state.range, String(msg.payload));
    // the popover closes when the range is complete
    return this._commit(
      state,
      { range, hover: "" },
      range.end ? { open: false, expanded: "false" } : {},
    );
  }

  hover(msg: Message, state: RangeState): Effect[] {
    // only while the end is to be picked: otherwise the hover changes nothing
    if (!state.range.start || state.range.end) return [];
    return this._commit(state, { hover: String(msg.payload) });
  }

  leave(_msg: Message, state: RangeState): Effect[] {
    return state.hover ? this._commit(state, { hover: "" }) : [];
  }

  preset(msg: Message, state: RangeState): Effect[] {
    const p = presetsOf(TODAY).find((x) => x.id === msg.payload);
    if (!p) return [];
    const [y, m] = p.range.start.split("-").map(Number);
    return this._commit(state, {
      range: p.range,
      hover: "",
      month: { year: y, month: m - 1 },
    });
  }

  clear(_msg: Message, state: RangeState): Effect[] {
    return this._commit(state, { range: { start: "", end: "" }, hover: "" });
  }

  toggle(_msg: Message, state: RangeState): Effect[] {
    const open = !state.open;
    return [store.set("open", open), store.set("expanded", expandedOf(open))];
  }

  close(): Effect[] {
    return [store.set("open", false), store.set("expanded", "false")];
  }

  /** The change, then everything derived from the new core. */
  _commit(
    state: RangeState,
    change: Partial<Core>,
    extra: Partial<Pick<RangeState, "open" | "expanded">> = {},
  ): Effect[] {
    const core: Core = {
      month: state.month,
      range: state.range,
      hover: state.hover,
      ...change,
    };
    return Object.entries({ ...core, ...derive(core), ...extra }).map(
      ([k, v]) => store.set(k, v),
    );
  }
}
