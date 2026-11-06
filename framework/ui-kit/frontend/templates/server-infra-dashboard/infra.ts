import { loadTone, type Tone } from "../../blocks/admin-shell/shell.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import { columns, type Column } from "../../blocks/bar-chart/chart.ts";
import {
  action,
  type ColumnDef,
  columnsOf,
  meter,
  mono,
  number,
  pill,
  type Row,
  rowOf,
  type Sort,
  sortBy,
  strong,
  text,
} from "../../blocks/data-grid/grid.ts";
import { item, type Item } from "../../blocks/progress-list/items.ts";
import {
  listAction,
  loadMeter,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";

// ---- servers ----------------------------------------------------------------

export type ServerStatus = "online" | "degraded" | "offline";

export interface Server {
  id: string;
  name: string;
  ip: string;
  role: string;
  status: ServerStatus;
  cpu: number;
  ram: number;
  disk: number;
  /** Hours since the last boot. */
  uptime: number;
}

export const SERVERS: Server[] = [
  {
    id: "web-1",
    name: "web-1",
    ip: "10.0.1.11",
    role: "Web",
    status: "online",
    cpu: 38,
    ram: 62,
    disk: 54,
    uptime: 990,
  },
  {
    id: "web-2",
    name: "web-2",
    ip: "10.0.1.12",
    role: "Web",
    status: "online",
    cpu: 44,
    ram: 58,
    disk: 51,
    uptime: 986,
  },
  {
    id: "api-1",
    name: "api-1",
    ip: "10.0.2.21",
    role: "API",
    status: "online",
    cpu: 67,
    ram: 71,
    disk: 43,
    uptime: 290,
  },
  {
    id: "db-1",
    name: "db-1",
    ip: "10.0.3.31",
    role: "Database",
    status: "degraded",
    cpu: 82,
    ram: 89,
    disk: 93,
    uptime: 290,
  },
  {
    id: "cache-1",
    name: "cache-1",
    ip: "10.0.4.41",
    role: "Cache",
    status: "online",
    cpu: 12,
    ram: 47,
    disk: 22,
    uptime: 2112,
  },
  {
    id: "backup-1",
    name: "backup-1",
    ip: "10.0.5.51",
    role: "Backup",
    status: "offline",
    cpu: 0,
    ram: 0,
    disk: 71,
    uptime: 0,
  },
];

export const STATUS_TONE: Record<ServerStatus, Tone> = {
  online: "success",
  degraded: "warning",
  offline: "destructive",
};

/** Pure: `990` hours as `41d 6h`; `0` as `down`. */
export function uptimeLabel(hours: number): string {
  if (hours <= 0) return "down";
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

/** Pure: a rebooted server comes back healthy with a fresh uptime. */
export function reboot(list: Server[], id: string): Server[] {
  return list.map((s) =>
    s.id !== id
      ? s
      : { ...s, status: "online", uptime: 0.1, cpu: 9, ram: 21, disk: s.disk },
  );
}

export function serverRow(s: Server): StatusRow {
  const up = s.status !== "offline";
  return statusRow(s.id, s.name, s.status, STATUS_TONE[s.status], {
    sub: `${s.role} · ${s.ip}`,
    facts: [{ label: "Uptime", value: uptimeLabel(s.uptime) }],
    meters: up
      ? [
          loadMeter("CPU", s.cpu),
          loadMeter("RAM", s.ram),
          loadMeter("Disk", s.disk),
        ]
      : [{ label: "Disk", pct: s.disk, text: `${s.disk}%`, tone: "muted" }],
    actions: [
      up
        ? listAction("reboot", "Reboot", { icon: "k-ai-refresh" })
        : listAction("reboot", "Power on", {
            icon: "k-ai-play",
            variant: "default",
          }),
    ],
  });
}

export const serverRows = (list: Server[]): StatusRow[] => list.map(serverRow);

const avg = (list: number[]): number =>
  list.length === 0
    ? 0
    : Math.round(list.reduce((a, b) => a + b, 0) / list.length);

/** Pure: the cards on top of the servers view. */
export function clusterCards(list: Server[], containers: Container[]): Card[] {
  const up = list.filter((s) => s.status !== "offline");
  const bad = list.filter((s) => s.status !== "online").length;
  return [
    card("up", "Servers up", `${up.length} / ${list.length}`, {
      hint: bad ? `${bad} need attention` : "all healthy",
      icon: "k-ai-server",
      tone: bad ? "warning" : "success",
    }),
    card("cpu", "Average CPU", `${avg(up.map((s) => s.cpu))}%`, {
      hint: "online servers",
      icon: "k-ai-pulse",
      tone: "info",
      series: list.map((s) => s.cpu),
    }),
    card("ram", "Average memory", `${avg(up.map((s) => s.ram))}%`, {
      hint: "online servers",
      icon: "k-ai-chart",
      tone: "default",
      series: list.map((s) => s.ram),
    }),
    card(
      "run",
      "Containers running",
      `${containers.filter((c) => c.state === "running").length} / ${containers.length}`,
      {
        hint: `${containers.filter((c) => c.state === "exited").length} stopped`,
        icon: "k-ai-box",
        tone: "success",
      },
    ),
  ];
}

/** The cluster's CPU over the last twelve minutes (seeded). */
export const CPU_HISTORY = [41, 44, 43, 48, 52, 49, 57, 63, 61, 58, 54, 52];

export function cpuColumns(): Column[] {
  return columns(
    CPU_HISTORY.map((v, i) => ({
      id: String(i),
      label: i % 3 === 0 ? `-${(CPU_HISTORY.length - 1 - i) * 1}m` : "",
      value: v,
      tone: loadTone(v),
    })),
    100,
    "%",
  );
}

// ---- containers -------------------------------------------------------------

export type ContainerState = "running" | "exited" | "restarting";

export interface Container {
  id: string;
  name: string;
  image: string;
  server: string;
  state: ContainerState;
  cpu: number;
  mem: string;
  /** Hours since it started. */
  uptime: number;
}

const c = (
  name: string,
  image: string,
  server: string,
  state: ContainerState,
  cpu: number,
  mem: string,
  uptime: number,
): Container => ({ id: name, name, image, server, state, cpu, mem, uptime });

export const CONTAINERS: Container[] = [
  c("api-gateway", "registry/api:2.8.1", "api-1", "running", 24, "312 MB", 290),
  c(
    "web-frontend",
    "registry/web:5.2.0",
    "web-1",
    "running",
    18,
    "188 MB",
    990,
  ),
  c("nginx", "nginx:1.27-alpine", "web-1", "running", 6, "24 MB", 990),
  c("worker", "registry/worker:2.8.1", "api-1", "running", 33, "420 MB", 120),
  c("worker-2", "registry/worker:2.8.1", "api-1", "exited", 0, "0 MB", 0),
  c("postgres", "postgres:16", "db-1", "running", 78, "3.4 GB", 290),
  c("redis", "redis:7.4", "cache-1", "running", 9, "612 MB", 2112),
  c("cron", "registry/cron:1.3.0", "api-1", "exited", 0, "0 MB", 0),
  c("mailer", "registry/mailer:0.9.4", "api-1", "running", 4, "96 MB", 52),
  c("grafana", "grafana/grafana:11", "backup-1", "exited", 0, "0 MB", 0),
];

export const STATE_TONE: Record<ContainerState, Tone> = {
  running: "success",
  exited: "muted",
  restarting: "warning",
};

export type ContainerAction = "start" | "stop" | "restart" | "restarted";

/** Pure: the state a container is in after an action (`restarted` ends a restart). */
export function nextState(
  state: ContainerState,
  what: ContainerAction,
): ContainerState {
  switch (what) {
    case "start":
      return state === "exited" ? "running" : state;
    case "stop":
      return state === "running" ? "exited" : state;
    case "restart":
      return state === "running" ? "restarting" : state;
    case "restarted":
      return state === "restarting" ? "running" : state;
  }
}

/** Pure: the containers after one action on one of them. */
export function act(
  list: Container[],
  id: string,
  what: ContainerAction,
): Container[] {
  return list.map((x) => {
    if (x.id !== id) return x;
    const state = nextState(x.state, what);
    if (state === x.state) return x;
    return {
      ...x,
      state,
      cpu: state === "running" ? Math.max(x.cpu, 5) : 0,
      uptime:
        state === "exited" || state === "restarting"
          ? 0
          : what === "start"
            ? 0.1
            : x.uptime,
    };
  });
}

export const CONTAINER_FILTERS: [string, string][] = [
  ["all", "All"],
  ["running", "Running"],
  ["exited", "Stopped"],
];

export const passes = (x: Container, id: string): boolean =>
  id === "exited" ? x.state === "exited" : x.state === id;

export const CONTAINER_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Container", sortable: true },
  { key: "server", label: "Server", sortable: true },
  { key: "state", label: "State", sortable: true },
  { key: "cpu", label: "CPU", sortable: true },
  { key: "mem", label: "Memory" },
  { key: "uptime", label: "Uptime", sortable: true, align: "right" },
];

const valueOf = (x: Container, key: string): string | number =>
  key === "cpu"
    ? x.cpu
    : key === "uptime"
      ? x.uptime
      : key === "state"
        ? x.state
        : key === "server"
          ? x.server
          : x.name;

export function containerActions(x: Container) {
  return [
    x.state === "exited"
      ? action("start", "Start", { icon: "k-ai-play" })
      : action("stop", "Stop", {
          icon: "k-ai-stop",
          disabled: x.state !== "running",
        }),
    action("restart", "Restart", {
      icon: "k-ai-refresh",
      disabled: x.state !== "running",
    }),
    action("logs", "Logs", { icon: "k-ai-file", variant: "ghost" }),
  ];
}

/** Pure: the table of containers for a filter, a search and a sorting. */
export function containerRows(
  list: Container[],
  filter: string,
  query: string,
  sort: Sort | null,
): Row[] {
  const q = query.trim().toLowerCase();
  const shown = list
    .filter((x) => filter === "all" || passes(x, filter))
    .filter(
      (x) =>
        !q ||
        x.name.toLowerCase().includes(q) ||
        x.image.toLowerCase().includes(q) ||
        x.server.includes(q),
    );
  return sortBy(shown, sort, valueOf).map((x) =>
    rowOf(
      CONTAINER_COLUMNS,
      x.id,
      {
        name: strong(x.name, x.image),
        server: mono(x.server),
        state: pill(x.state, STATE_TONE[x.state]),
        cpu: meter(x.cpu, loadTone(x.cpu), `${x.cpu}%`),
        mem: text(x.mem),
        uptime: number(x.state === "running" ? uptimeLabel(x.uptime) : "-"),
      },
      containerActions(x),
    ),
  );
}

export const containerColumns = (sort: Sort | null) =>
  columnsOf(CONTAINER_COLUMNS, sort);

// ---- database ---------------------------------------------------------------

export interface Replica {
  id: string;
  name: string;
  role: "primary" | "replica";
  /** Seconds behind the primary. */
  lag: number;
}

export const REPLICAS: Replica[] = [
  { id: "db-1", name: "db-1", role: "primary", lag: 0 },
  { id: "db-2", name: "db-2", role: "replica", lag: 1.2 },
  { id: "db-3", name: "db-3", role: "replica", lag: 9.4 },
];

/** Pure: a replica that catches up is a few tenths of a second behind. */
export function resync(list: Replica[], id: string): Replica[] {
  return list.map((r) =>
    r.id === id && r.role === "replica" ? { ...r, lag: 0.4 } : r,
  );
}

export function replicaRows(list: Replica[]): StatusRow[] {
  return list.map((r) => {
    const tone: Tone =
      r.role === "primary" ? "success" : r.lag >= 5 ? "warning" : "success";
    return statusRow(
      r.id,
      r.name,
      r.role === "primary" ? "Primary" : r.lag >= 5 ? "Lagging" : "In sync",
      tone,
      {
        sub: r.role === "primary" ? "Accepts writes" : "Streaming replica",
        facts: [
          {
            label: "Lag",
            value: r.role === "primary" ? "-" : `${r.lag.toFixed(1)} s`,
          },
        ],
        actions:
          r.role === "primary"
            ? []
            : [
                listAction("resync", "Resync", {
                  icon: "k-ai-refresh",
                  disabled: r.lag < 1,
                }),
              ],
      },
    );
  });
}

export interface SlowQuery {
  id: string;
  sql: string;
  ms: number;
  calls: number;
  seen: string;
}

export const SLOW: SlowQuery[] = [
  {
    id: "q1",
    sql: "SELECT * FROM orders WHERE status = $1 ORDER BY created_at",
    ms: 1840,
    calls: 214,
    seen: "2 min ago",
  },
  {
    id: "q2",
    sql: "SELECT count(*) FROM events WHERE ts > now() - interval '1 day'",
    ms: 2630,
    calls: 12,
    seen: "9 min ago",
  },
  {
    id: "q3",
    sql: "UPDATE inventory SET stock = stock - $1 WHERE sku = $2",
    ms: 920,
    calls: 88,
    seen: "4 min ago",
  },
  {
    id: "q4",
    sql: "DELETE FROM sessions WHERE expires_at < now()",
    ms: 740,
    calls: 6,
    seen: "21 min ago",
  },
  {
    id: "q5",
    sql: "INSERT INTO audit_log (actor, action, payload) VALUES ($1, $2, $3)",
    ms: 610,
    calls: 1403,
    seen: "just now",
  },
];

export const SLOW_COLUMNS: ColumnDef[] = [
  { key: "sql", label: "Query" },
  { key: "ms", label: "Time", sortable: true, align: "right" },
  { key: "calls", label: "Calls", sortable: true, align: "right" },
  { key: "seen", label: "Last seen" },
];

const slowValue = (q: SlowQuery, key: string): string | number =>
  key === "ms" ? q.ms : key === "calls" ? q.calls : q.sql;

export function slowRows(list: SlowQuery[], sort: Sort | null): Row[] {
  return sortBy(list, sort, slowValue).map((q) =>
    rowOf(
      SLOW_COLUMNS,
      q.id,
      {
        sql: mono(q.sql.length > 40 ? `${q.sql.slice(0, 40)}...` : q.sql),
        ms: pill(`${q.ms} ms`, q.ms >= 1500 ? "destructive" : "warning"),
        calls: number(q.calls),
        seen: text(q.seen),
      },
      [action("dismiss", "Dismiss", { variant: "ghost" })],
    ),
  );
}

export const slowColumns = (sort: Sort | null) => columnsOf(SLOW_COLUMNS, sort);

/** Pure: the cards of the database view. */
export function dbCards(replicas: Replica[], slow: SlowQuery[]): Card[] {
  const worst = replicas.reduce((m, r) => Math.max(m, r.lag), 0);
  return [
    card("conn", "Connections", "64 / 200", {
      hint: "32% of the pool",
      icon: "k-ai-users",
      tone: "info",
    }),
    card("qps", "Queries per second", "1,840", {
      hint: "+6.2% vs last hour",
      icon: "k-ai-pulse",
      tone: "success",
      trend: "up",
      series: [1500, 1620, 1580, 1710, 1790, 1840],
    }),
    card("lag", "Replication lag", `${worst.toFixed(1)} s`, {
      hint: worst >= 5 ? "a replica is lagging" : "all in sync",
      icon: "k-ai-refresh",
      tone: worst >= 5 ? "warning" : "success",
    }),
    card("slow", "Slow queries", String(slow.length), {
      hint: "over 500 ms",
      icon: "k-ai-alert",
      tone: slow.length > 3 ? "warning" : "default",
    }),
  ];
}

export const poolItems = (): Item[] => [
  item("conn", "Connections", 64, 200, { sub: "max_connections = 200" }),
  item("cache", "Cache hit ratio", 98, 100, {
    text: "98%",
    invert: true,
    sub: "Higher is better",
  }),
  item("disk", "Disk", 412, 500, { text: "412 GB of 500 GB" }),
  item("wal", "WAL size", 3, 16, { text: "3 GB of 16 GB" }),
];
