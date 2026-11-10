import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./pagination.pavlus";

export interface PageItem {
  key: string;
  n: number;
  gap: boolean;
  /** The page is the current one. */
  current: boolean;
  /** What `aria-current` reads: "page", or null when not current. */
  currentAttr: string | null;
}

export interface PaginationState {
  page: number;
  pages: number;
  /** Derived: the first, the last, the neighbours of the current page and the gaps. */
  items: PageItem[];
  /** Derived: the ends of the list, dim at the edges (no comparisons in templates). */
  prevDisabled: boolean;
  nextDisabled: boolean;
}

/** Pure: 1 … 4 5 6 … 10 for page 5 of 10. */
export function itemsOf(page: number, pages: number): PageItem[] {
  const shown = new Set(
    [1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages),
  );
  const items: PageItem[] = [];
  let last = 0;
  for (const n of [...shown].sort((a, b) => a - b)) {
    if (n - last > 1)
      items.push({
        key: `gap-${n}`,
        n: 0,
        gap: true,
        current: false,
        currentAttr: null,
      });
    const current = n === page;
    items.push({
      key: `page-${n}`,
      n,
      gap: false,
      current,
      currentAttr: current ? "page" : null,
    });
    last = n;
  }
  return items;
}

export const initial: PaginationState = {
  page: 5,
  pages: 10,
  items: itemsOf(5, 10),
  prevDisabled: false,
  nextDisabled: false,
};

export class Pagination extends Component<PaginationState> {
  view = view;

  prev(_msg: Message, state: PaginationState): Effect[] {
    return this._go(state, state.page - 1);
  }

  next(_msg: Message, state: PaginationState): Effect[] {
    return this._go(state, state.page + 1);
  }

  go(msg: Message, state: PaginationState): Effect[] {
    return this._go(state, msg.payload as number);
  }

  _go(state: PaginationState, to: number): Effect[] {
    const page = Math.min(Math.max(to, 1), state.pages);
    return [
      store.set("page", page),
      store.set("items", itemsOf(page, state.pages)),
      store.set("prevDisabled", page <= 1),
      store.set("nextDisabled", page >= state.pages),
    ];
  }
}

export const page = new Pagination();
