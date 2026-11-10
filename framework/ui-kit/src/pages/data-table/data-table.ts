import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./data-table.pavlus";

export interface Payment {
  id: number;
  name: string;
  email: string;
  status: "paid" | "pending" | "failed";
  amount: number;
}

type SortKey = "name" | "status" | "amount";

const PAGE_SIZE = 5;

const PAYMENTS: Payment[] = [
  {
    id: 1,
    name: "Ann Lee",
    email: "ann@example.com",
    status: "paid",
    amount: 316,
  },
  {
    id: 2,
    name: "Bob Stone",
    email: "bob@example.com",
    status: "pending",
    amount: 242,
  },
  {
    id: 3,
    name: "Carla Gomez",
    email: "carla@example.com",
    status: "paid",
    amount: 837,
  },
  {
    id: 4,
    name: "Dmitri Volkov",
    email: "dmitri@example.com",
    status: "failed",
    amount: 874,
  },
  {
    id: 5,
    name: "Eve Adams",
    email: "eve@example.com",
    status: "paid",
    amount: 721,
  },
  {
    id: 6,
    name: "Farid Khan",
    email: "farid@example.com",
    status: "pending",
    amount: 129,
  },
  {
    id: 7,
    name: "Grace Hall",
    email: "grace@example.com",
    status: "paid",
    amount: 450,
  },
  {
    id: 8,
    name: "Hiro Tanaka",
    email: "hiro@example.com",
    status: "failed",
    amount: 98,
  },
  {
    id: 9,
    name: "Ines Rossi",
    email: "ines@example.com",
    status: "paid",
    amount: 612,
  },
  {
    id: 10,
    name: "Jon Park",
    email: "jon@example.com",
    status: "pending",
    amount: 305,
  },
  {
    id: 11,
    name: "Kira Novak",
    email: "kira@example.com",
    status: "paid",
    amount: 77,
  },
  {
    id: 12,
    name: "Liam Byrne",
    email: "liam@example.com",
    status: "paid",
    amount: 560,
  },
];

export interface Row extends Payment {
  initials: string;
  hue: number;
  amountLabel: string;
  checked: boolean;
  /** `data-selected` of the row. */
  selectedAttr: string | null;
  /** The status pill's class toggles. */
  isPaid: boolean;
  isPending: boolean;
  isFailed: boolean;
}

/** What the user changed; everything else on screen is derived from it. */
export interface DataTableInput {
  query: string;
  sortKey: SortKey | "";
  sortDir: "asc" | "desc";
  page: number;
  selected: number[];
}

export interface DataTableState extends DataTableInput {
  visible: Row[];
  total: number;
  pages: number;
  selectedCount: number;
  allSelected: boolean;
  empty: boolean;
  /** The sort icons: idle while another key is sorted by. */
  nameIdle: boolean;
  statusIdle: boolean;
  amountIdle: boolean;
  prevDisabled: boolean;
  nextDisabled: boolean;
}

const money = (n: number): string => `$${n.toLocaleString("en-US")}.00`;

/** Pure: the rows of the current page and the numbers of the footer. */
export function derive(
  input: DataTableInput,
): Omit<DataTableState, keyof DataTableInput> & { page: number } {
  const q = input.query.trim().toLowerCase();
  const matching = PAYMENTS.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q),
  );
  if (input.sortKey) {
    const key = input.sortKey;
    const sign = input.sortDir === "asc" ? 1 : -1;
    matching.sort((a, b) =>
      a[key] < b[key] ? -sign : a[key] > b[key] ? sign : 0,
    );
  }
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(Math.max(input.page, 1), pages);
  const visible = matching
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    .map((p) => {
      const checked = input.selected.includes(p.id);
      return {
        ...p,
        initials: p.name
          .split(" ")
          .map((w) => w[0])
          .join(""),
        hue: (p.id * 47) % 360,
        amountLabel: money(p.amount),
        checked,
        selectedAttr: checked ? "true" : null,
        isPaid: p.status === "paid",
        isPending: p.status === "pending",
        isFailed: p.status === "failed",
      };
    });
  return {
    page,
    visible,
    total: matching.length,
    pages,
    selectedCount: input.selected.length,
    allSelected: visible.length > 0 && visible.every((r) => r.checked),
    empty: visible.length === 0,
    nameIdle: input.sortKey !== "name",
    statusIdle: input.sortKey !== "status",
    amountIdle: input.sortKey !== "amount",
    prevDisabled: page <= 1,
    nextDisabled: page >= pages,
  };
}

const start: DataTableInput = {
  query: "",
  sortKey: "",
  sortDir: "asc",
  page: 1,
  selected: [2],
};

export const initial: DataTableState = { ...start, ...derive(start) };

export class DataTable extends Component<DataTableState> {
  view = view;

  search(msg: Message, state: DataTableState): Effect[] {
    return this._apply(state, { query: msg.event?.value ?? "", page: 1 });
  }

  sort(msg: Message, state: DataTableState): Effect[] {
    const sortKey = msg.payload as SortKey;
    const sortDir =
      state.sortKey === sortKey && state.sortDir === "asc" ? "desc" : "asc";
    return this._apply(state, { sortKey, sortDir, page: 1 });
  }

  toggleRow(msg: Message, state: DataTableState): Effect[] {
    const id = msg.payload as number;
    const selected = state.selected.includes(id)
      ? state.selected.filter((s) => s !== id)
      : [...state.selected, id];
    return this._apply(state, { selected });
  }

  /** Selects the rows of this page, or clears them when they are all selected. */
  toggleAll(_msg: Message, state: DataTableState): Effect[] {
    const ids = state.visible.map((r) => r.id);
    const selected = state.allSelected
      ? state.selected.filter((s) => !ids.includes(s))
      : [...new Set([...state.selected, ...ids])];
    return this._apply(state, { selected });
  }

  prev(_msg: Message, state: DataTableState): Effect[] {
    return this._apply(state, { page: state.page - 1 });
  }

  next(_msg: Message, state: DataTableState): Effect[] {
    return this._apply(state, { page: state.page + 1 });
  }

  /** The change, then everything derived from the new input. */
  _apply(state: DataTableState, change: Partial<DataTableInput>): Effect[] {
    const input: DataTableInput = {
      query: state.query,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      page: state.page,
      selected: state.selected,
      ...change,
    };
    return Object.entries({ ...input, ...derive(input) }).map(([k, v]) =>
      store.set(k, v),
    );
  }
}

export const page = new DataTable();
