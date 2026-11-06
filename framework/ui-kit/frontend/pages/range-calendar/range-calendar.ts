import { type Children, Component } from "@pavlus/frontend";
import { RangeCalendar, type RangeState, stateOf } from "./range.ts";
import view from "./range-calendar.pavlus";

export interface RangePageState {
  main: RangeState;
  picker: RangeState;
}

export const initial: RangePageState = {
  main: stateOf({
    month: { year: 2026, month: 10 },
    range: { start: "2026-11-10", end: "2026-11-17" },
    hover: "",
  }),
  picker: stateOf({
    month: { year: 2026, month: 10 },
    range: { start: "", end: "" },
    hover: "",
  }),
};

const calendar = new RangeCalendar();

/** The page: two instances of the same range calendar, one of them in a popover. */
export class RangePage extends Component<RangePageState> {
  view = view;

  children: Children<RangePageState> = {
    main: { component: calendar, key: "main" },
    picker: { component: calendar, key: "picker" },
  };
}

export const page = new RangePage();
