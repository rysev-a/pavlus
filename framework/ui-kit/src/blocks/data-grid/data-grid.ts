import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import { loadTone, patch } from "../admin-shell/shell.ts";
import view from "./data-grid.pavlus";
import {
  action,
  type Column,
  type ColumnDef,
  columnsOf,
  meter,
  mono,
  pill,
  type Row,
  rowOf,
  type Sort,
  sortBy,
  strong,
  toggleSort,
} from "./grid.ts";

interface Service {
  id: string;
  name: string;
  region: string;
  status: "running" | "stopped";
  load: number;
}

export interface DataGridState {
  services: Service[];
  sort: Sort | null;
  columns: Column[];
  rows: Row[];
  nothing: Row[];
  /** The empty row's `colspan`: every column, plus the actions. */
  colspan: number;
  footer: string;
  message: string;
}

const DEFS: ColumnDef[] = [
  { key: "name", label: "Service", sortable: true },
  { key: "region", label: "Region", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "load", label: "Load", sortable: true },
];

const SERVICES: Service[] = [
  {
    id: "api",
    name: "api-gateway",
    region: "eu-west",
    status: "running",
    load: 62,
  },
  {
    id: "web",
    name: "web-frontend",
    region: "eu-west",
    status: "running",
    load: 41,
  },
  {
    id: "jobs",
    name: "job-runner",
    region: "us-east",
    status: "stopped",
    load: 0,
  },
  {
    id: "db",
    name: "postgres-main",
    region: "us-east",
    status: "running",
    load: 91,
  },
];

const value = (s: Service, key: string): string | number => {
  if (key === "load") return s.load;
  if (key === "status") return s.status;
  return key === "region" ? s.region : s.name;
};

/** Pure: the rows of the demo for a sorting. */
export function build(services: Service[], sort: Sort | null): Row[] {
  return sortBy(services, sort, value).map((s) =>
    rowOf(
      DEFS,
      s.id,
      {
        name: strong(s.name, "v2.4"),
        region: mono(s.region),
        status: pill(s.status, s.status === "running" ? "success" : "muted"),
        load: meter(s.load, loadTone(s.load), `${s.load}%`),
      },
      [
        s.status === "running"
          ? action("stop", "Stop", { icon: "k-ai-stop" })
          : action("start", "Start", { icon: "k-ai-play" }),
        action("restart", "Restart", {
          icon: "k-ai-refresh",
          disabled: s.status !== "running",
        }),
      ],
    ),
  );
}

export const initial: DataGridState = {
  services: SERVICES,
  sort: null,
  columns: columnsOf(DEFS, null),
  rows: build(SERVICES, null),
  nothing: [],
  colspan: DEFS.length + 1,
  footer: "4 services",
  message: "",
};

export class DataGridPage extends Component<DataGridState> {
  view = view;

  "grid.sort"(msg: Message, state: DataGridState): Effect[] {
    const sort = toggleSort(state.sort, msg.payload as string);
    return patch({
      sort,
      columns: columnsOf(DEFS, sort),
      rows: build(state.services, sort),
    });
  }

  "grid.act"(msg: Message, state: DataGridState): Effect[] {
    const [id, what] = msg.payload as [string, string];
    const services = state.services.map((s) =>
      s.id !== id
        ? s
        : what === "stop"
          ? { ...s, status: "stopped" as const, load: 0 }
          : what === "start"
            ? { ...s, status: "running" as const, load: 12 }
            : s,
    );
    return [
      ...patch({ services, rows: build(services, state.sort) }),
      store.set("message", `${what} ${id}`),
    ];
  }
}

export const page = new DataGridPage();
