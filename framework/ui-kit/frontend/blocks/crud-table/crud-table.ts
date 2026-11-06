import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./crud-table.pavlus";
import {
  type ColumnDef,
  type FilterDef,
  initialTable,
  reduceTable,
  type TableProps,
  type TableState,
  tableView,
} from "./table.ts";

interface Person {
  id: number;
  name: string;
  email: string;
  role: string;
  score: number;
}

const FIRST = [
  "Ann",
  "Ben",
  "Cleo",
  "Dan",
  "Eva",
  "Finn",
  "Gia",
  "Hugo",
  "Iris",
  "Jon",
  "Kai",
  "Lea",
];
const LAST = [
  "Stone",
  "Reyes",
  "Okafor",
  "Novak",
  "Lind",
  "Park",
  "Rossi",
  "Haas",
];
const ROLES = ["Admin", "Editor", "Viewer"];

const PEOPLE: Person[] = Array.from({ length: 47 }, (_, i) => ({
  id: i + 1,
  name: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`,
  email: `user${i + 1}@example.com`,
  role: ROLES[(i * 7) % ROLES.length],
  score: 20 + ((i * 37) % 80),
}));

const COLUMNS: ColumnDef<Person>[] = [
  {
    key: "name",
    label: "Person",
    value: (p) => p.name,
    cell: (p) => ({ kind: "strong", text: p.name, sub: p.email }),
  },
  {
    key: "role",
    label: "Role",
    value: (p) => p.role,
    cell: (p) => ({
      kind: "pill",
      text: p.role,
      tone:
        p.role === "Admin"
          ? "destructive"
          : p.role === "Editor"
            ? "info"
            : "muted",
    }),
  },
  {
    key: "score",
    label: "Score",
    align: "right",
    value: (p) => p.score,
    cell: (p) => ({ kind: "number", text: String(p.score) }),
  },
];

const FILTERS: FilterDef<Person>[] = [
  {
    key: "role",
    label: "Role",
    options: [
      { value: "", label: "All roles" },
      ...ROLES.map((r) => ({ value: r, label: r })),
    ],
    value: (p) => p.role,
  },
];

interface DemoState {
  people: Person[];
  table: TableState;
  grid: TableProps & {
    title: string;
    addLabel: string;
    placeholder: string;
    empty: string;
  };
}

const grid = (people: Person[], table: TableState): DemoState["grid"] => ({
  ...tableView(people, COLUMNS, FILTERS, table),
  title: "People",
  addLabel: "Add person",
  placeholder: "Search people...",
  empty: "No people match.",
});

export const initial: DemoState = {
  people: PEOPLE,
  table: initialTable("name"),
  grid: grid(PEOPLE, initialTable("name")),
};

export class CrudTableDemo extends Component<DemoState> {
  view = view;

  _commit(people: Person[], table: TableState): Effect[] {
    // a page that no longer exists falls back to the last one
    const g = grid(people, table);
    return [
      store.set("people", people),
      store.set("table", { ...table, page: g.page }),
      store.set("grid", g),
    ];
  }

  _table(name: string, msg: Message, state: DemoState): Effect[] {
    const visible = (st: TableState) =>
      tableView(state.people, COLUMNS, FILTERS, st).rows.map((r) => r.id);
    return this._commit(
      state.people,
      reduceTable(state.table, name, msg.payload, visible),
    );
  }

  "table.search"(msg: Message, state: DemoState): Effect[] {
    return this._table(
      "search",
      { ...msg, payload: msg.event?.value ?? "" },
      state,
    );
  }
  "table.sort"(msg: Message, state: DemoState): Effect[] {
    return this._table("sort", msg, state);
  }
  "table.filter"(msg: Message, state: DemoState): Effect[] {
    return this._table(
      "filter",
      { ...msg, payload: [msg.payload, msg.event?.value ?? ""] },
      state,
    );
  }
  "table.toggleAll"(msg: Message, state: DemoState): Effect[] {
    return this._table("toggleAll", msg, state);
  }
  "table.toggleRow"(msg: Message, state: DemoState): Effect[] {
    return this._table("toggleRow", msg, state);
  }
  "table.prev"(msg: Message, state: DemoState): Effect[] {
    return this._table("prev", msg, state);
  }
  "table.next"(msg: Message, state: DemoState): Effect[] {
    return this._table("next", msg, state);
  }
  "table.goto"(msg: Message, state: DemoState): Effect[] {
    return this._table("goto", msg, state);
  }
  "table.pageSize"(msg: Message, state: DemoState): Effect[] {
    return this._table(
      "pageSize",
      { ...msg, payload: msg.event?.value },
      state,
    );
  }

  "table.add"(_msg: Message, state: DemoState): Effect[] {
    const id = state.people.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    const person: Person = {
      id,
      name: `New person ${id}`,
      email: `user${id}@example.com`,
      role: "Viewer",
      score: 50,
    };
    return this._commit([...state.people, person], state.table);
  }
  "table.edit"(msg: Message, state: DemoState): Effect[] {
    const id = Number(msg.payload);
    return this._commit(
      state.people.map((p) =>
        p.id === id
          ? {
              ...p,
              name: p.name.endsWith(" *") ? p.name.slice(0, -2) : `${p.name} *`,
            }
          : p,
      ),
      state.table,
    );
  }
  "table.remove"(msg: Message, state: DemoState): Effect[] {
    const id = Number(msg.payload);
    return this._commit(
      state.people.filter((p) => p.id !== id),
      {
        ...state.table,
        selected: state.table.selected.filter((x) => x !== id),
      },
    );
  }
  "table.removeSelected"(_msg: Message, state: DemoState): Effect[] {
    const gone = new Set(state.table.selected);
    return this._commit(
      state.people.filter((p) => !gone.has(p.id)),
      { ...state.table, selected: [] },
    );
  }
}

export const page = new CrudTableDemo();
