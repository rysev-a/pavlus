import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./pagination.pavlus";

export interface PageItem {
  key: string;
  n: number;
  gap: boolean;
}

export interface PaginationState {
  page: number;
  pages: number;
  /** Derived: the first, the last, the neighbours of the current page and the gaps. */
  items: PageItem[];
}

/** Pure: 1 … 4 5 6 … 10 for page 5 of 10. */
export function itemsOf(page: number, pages: number): PageItem[] {
  const shown = new Set(
    [1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages),
  );
  const items: PageItem[] = [];
  let last = 0;
  for (const n of [...shown].sort((a, b) => a - b)) {
    if (n - last > 1) items.push({ key: `gap-${n}`, n: 0, gap: true });
    items.push({ key: `page-${n}`, n, gap: false });
    last = n;
  }
  return items;
}

export const initial: PaginationState = {
  page: 5,
  pages: 10,
  items: itemsOf(5, 10),
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
    ];
  }
}

export const page = new Pagination();
