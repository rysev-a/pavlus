import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./question-navigator.pavlus";

export interface NavItem {
  index: number;
  /** 1-based number printed on the button. */
  n: number;
  current: boolean;
  answered: boolean;
  flagged: boolean;
}

export interface NavSummary {
  answered: number;
  flagged: number;
  left: number;
}

/** Pure: the buttons of a navigator for `total` questions. */
export function navItems(
  total: number,
  current: number,
  answered: number[],
  flagged: number[],
): NavItem[] {
  return Array.from({ length: total }, (_, index) => ({
    index,
    n: index + 1,
    current: index === current,
    answered: answered.includes(index),
    flagged: flagged.includes(index),
  }));
}

/** Pure: how many are answered, flagged and still open. */
export function summaryOf(items: NavItem[]): NavSummary {
  const answered = items.filter((i) => i.answered).length;
  return {
    answered,
    flagged: items.filter((i) => i.flagged).length,
    left: items.length - answered,
  };
}

/** Pure: the next question index, wrapping, that is not answered (or -1). */
export function nextOpen(items: NavItem[], from: number): number {
  for (let step = 1; step <= items.length; step++) {
    const i = (from + step) % items.length;
    if (!items[i].answered) return i;
  }
  return -1;
}

export interface NavigatorPageState {
  current: number;
  answered: number[];
  flagged: number[];
  items: NavItem[];
  summary: NavSummary;
}

const make = (
  current: number,
  answered: number[],
  flagged: number[],
): NavigatorPageState => {
  const items = navItems(12, current, answered, flagged);
  return { current, answered, flagged, items, summary: summaryOf(items) };
};

export const initial: NavigatorPageState = make(3, [0, 1, 2, 4, 7], [1, 7]);

export class QuestionNavigatorPage extends Component<NavigatorPageState> {
  view = view;

  "nav.go"(msg: Message, state: NavigatorPageState): Effect[] {
    const current = msg.payload as number;
    const answered = state.answered.includes(current)
      ? state.answered
      : [...state.answered, current];
    const next = make(current, answered, state.flagged);
    return (Object.keys(next) as (keyof NavigatorPageState)[]).map((k) =>
      store.set(k, next[k]),
    );
  }
}

export const page = new QuestionNavigatorPage();
