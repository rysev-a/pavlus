import type { Effect, Message } from "@service-laboratory/pavlus";
import { timeEffector as time } from "@service-laboratory/pavlus/plugins";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  titleOf,
} from "../../blocks/admin-shell/shell.ts";
import type { Column as BarColumn } from "../../blocks/bar-chart/chart.ts";
import {
  type Column,
  type Row,
  type Sort,
  toggleSort,
} from "../../blocks/data-grid/grid.ts";
import {
  type Filter,
  filtersOf,
  type ToolbarAction,
} from "../../blocks/list-filter/filters.ts";
import {
  clearLines,
  deriveLogs,
  initialLogs,
  type Level,
  type LogsState,
  type LogsView,
  setQuery,
  tick,
  toggleFollow,
  toggleLevel,
  togglePause,
} from "../../blocks/log-viewer/logs.ts";
import type { Item } from "../../blocks/progress-list/items.ts";
import type { Card } from "../../blocks/stat-cards/cards.ts";
import type { StatusRow } from "../../blocks/status-list/rows.ts";
import {
  act,
  CONTAINER_FILTERS,
  CONTAINERS,
  type Container,
  type ContainerAction,
  containerColumns,
  containerRows,
  clusterCards,
  cpuColumns,
  dbCards,
  passes,
  poolItems,
  reboot,
  type Replica,
  REPLICAS,
  replicaRows,
  resync,
  type Server,
  SERVERS,
  serverRows,
  SLOW,
  slowColumns,
  slowRows,
  type SlowQuery,
} from "./infra.ts";
import view from "./server-infra-dashboard.pavlus";

export const LOG_TIMER = "logs";
export const LOG_MS = 1200;

export interface InfraData {
  servers: Server[];
  containers: Container[];
  replicas: Replica[];
  slow: SlowQuery[];
  cFilter: string;
  cQuery: string;
  cSort: Sort | null;
  slowSort: Sort | null;
}

export interface InfraViews {
  clusterStats: Card[];
  cpuBars: BarColumn[];
  serverList: StatusRow[];
  cFilters: Filter[];
  cColumns: Column[];
  cRows: Row[];
  cFooter: string;
  dbStats: Card[];
  dbItems: Item[];
  replicaList: StatusRow[];
  slowCols: Column[];
  slowList: Row[];
}

export interface InfraState extends AppState, InfraData, InfraViews {
  user: ShellUser;
  actions: ShellAction[];
  none: ToolbarAction[];
  logs: LogsState;
  logv: LogsView;
}

const GROUPS: NavGroup[] = [
  {
    title: "Infrastructure",
    items: [
      { id: "servers", label: "Servers", icon: "k-ai-server" },
      { id: "containers", label: "Containers", icon: "k-ai-box" },
      { id: "logs", label: "Live logs", icon: "k-ai-terminal" },
      { id: "database", label: "Database", icon: "k-ai-database" },
    ],
  },
];

/** Pure: every view worked out from the data. */
export function derive(s: InfraData): InfraViews {
  const shown = s.containers.filter(
    (x) => s.cFilter === "all" || passes(x, s.cFilter),
  );
  return {
    clusterStats: clusterCards(s.servers, s.containers),
    cpuBars: cpuColumns(),
    serverList: serverRows(s.servers),
    cFilters: filtersOf(CONTAINER_FILTERS, s.cFilter, s.containers, passes),
    cColumns: containerColumns(s.cSort),
    cRows: containerRows(s.containers, s.cFilter, s.cQuery, s.cSort),
    cFooter: `${shown.length} of ${s.containers.length} containers`,
    dbStats: dbCards(s.replicas, s.slow),
    dbItems: poolItems(),
    replicaList: replicaRows(s.replicas),
    slowCols: slowColumns(s.slowSort),
    slowList: slowRows(s.slow, s.slowSort),
  };
}

const data: InfraData = {
  servers: SERVERS,
  containers: CONTAINERS,
  replicas: REPLICAS,
  slow: SLOW,
  cFilter: "all",
  cQuery: "",
  cSort: null,
  slowSort: null,
};

const startLogs = initialLogs(80);

export const initial: InfraState = {
  screen: "servers",
  title: "Servers",
  navOpen: false,
  notice: "",
  groups: GROUPS,
  user: { name: "Dana Ops", role: "Site reliability", initials: "DO" },
  actions: [
    {
      id: "refresh",
      label: "Refresh",
      icon: "k-ai-refresh",
      variant: "outline",
    },
  ],
  none: [],
  ...data,
  ...derive(data),
  logs: startLogs,
  logv: deriveLogs(startLogs),
};

export class InfraDashboard extends AdminApp<InfraState> {
  view = view;

  _entering(screen: string, state: InfraState): Effect[] {
    return screen === "logs" && !state.logs.paused
      ? [time.setInterval(LOG_TIMER, LOG_MS, "tick")]
      : [];
  }

  _leaving(screen: string): Effect[] {
    return screen === "logs" ? [time.cancel(LOG_TIMER)] : [];
  }

  /** The page was left: every timer stops (logs, restarts, the notice). */
  override leave(): Effect[] {
    return [time.cancelAll()];
  }

  _commit(state: InfraState, changes: Partial<InfraData>): Effect[] {
    return patch({ ...changes, ...derive({ ...state, ...changes }) });
  }

  /** Go to a view from inside another one (a button, not the sidebar). */
  _goto(state: InfraState, screen: string): Effect[] {
    return [
      ...this._leaving(state.screen),
      ...patch({
        screen,
        title: titleOf(state.groups, screen),
        navOpen: false,
      }),
      ...this._entering(screen, state),
    ];
  }

  "top.action"(_msg: Message, state: InfraState): Effect[] {
    const up = state.servers.filter((s) => s.status !== "offline").length;
    return notice(`Refreshed ${up} servers`);
  }

  // ---- servers
  "servers.act"(msg: Message, state: InfraState): Effect[] {
    const [id] = msg.payload as [string, string];
    const before = state.servers.find((s) => s.id === id);
    return [
      ...this._commit(state, { servers: reboot(state.servers, id) }),
      ...notice(
        before?.status === "offline"
          ? `${id} is powering on`
          : `${id} rebooted`,
      ),
    ];
  }

  // ---- containers
  "containers.sort"(msg: Message, state: InfraState): Effect[] {
    return this._commit(state, {
      cSort: toggleSort(state.cSort, msg.payload as string),
    });
  }

  "containers.act"(msg: Message, state: InfraState): Effect[] {
    const [id, what] = msg.payload as [string, string];
    if (what === "logs") {
      const logs = setQuery(state.logs, id);
      return [
        ...patch({ logs, logv: deriveLogs(logs) }),
        ...this._goto(state, "logs"),
      ];
    }
    const action = what as ContainerAction;
    const containers = act(state.containers, id, action);
    return [
      ...this._commit(state, { containers }),
      ...(action === "restart"
        ? [time.setTimeout(`restart:${id}`, 1400, "restarted", id)]
        : []),
      ...notice(
        action === "start"
          ? `${id} started`
          : action === "stop"
            ? `${id} stopped`
            : `${id} is restarting`,
      ),
    ];
  }

  /** The timer of a restart ran out: the container is up again. */
  restarted(msg: Message, state: InfraState): Effect[] {
    return this._commit(state, {
      containers: act(state.containers, msg.payload as string, "restarted"),
    });
  }

  "cfilter.pick"(msg: Message, state: InfraState): Effect[] {
    return this._commit(state, { cFilter: msg.payload as string });
  }

  "cfilter.search"(msg: Message, state: InfraState): Effect[] {
    return this._commit(state, { cQuery: msg.event?.value ?? "" });
  }

  // ---- logs
  _logs(next: LogsState): Effect[] {
    return patch({ logs: next, logv: deriveLogs(next) });
  }

  tick(_msg: Message, state: InfraState): Effect[] {
    return this._logs(tick(state.logs));
  }

  "logs.level"(msg: Message, state: InfraState): Effect[] {
    return this._logs(toggleLevel(state.logs, msg.payload as Level));
  }

  "logs.search"(msg: Message, state: InfraState): Effect[] {
    return this._logs(setQuery(state.logs, msg.event?.value ?? ""));
  }

  "logs.pause"(_msg: Message, state: InfraState): Effect[] {
    const next = togglePause(state.logs);
    return [
      ...this._logs(next),
      next.paused
        ? time.cancel(LOG_TIMER)
        : time.setInterval(LOG_TIMER, LOG_MS, "tick"),
    ];
  }

  "logs.follow"(_msg: Message, state: InfraState): Effect[] {
    return this._logs(toggleFollow(state.logs));
  }

  "logs.clear"(_msg: Message, state: InfraState): Effect[] {
    return this._logs(clearLines(state.logs));
  }

  // ---- database
  "replicas.act"(msg: Message, state: InfraState): Effect[] {
    const [id] = msg.payload as [string, string];
    return [
      ...this._commit(state, { replicas: resync(state.replicas, id) }),
      ...notice(`${id} is catching up`),
    ];
  }

  "slow.sort"(msg: Message, state: InfraState): Effect[] {
    return this._commit(state, {
      slowSort: toggleSort(state.slowSort, msg.payload as string),
    });
  }

  "slow.act"(msg: Message, state: InfraState): Effect[] {
    const [id] = msg.payload as [string, string];
    return [
      ...this._commit(state, { slow: state.slow.filter((q) => q.id !== id) }),
      ...notice("Query dismissed"),
    ];
  }
}

export const page = new InfraDashboard();
