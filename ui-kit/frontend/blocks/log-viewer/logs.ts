import type { Tone } from "../admin-shell/shell.ts";

export type Level = "debug" | "info" | "warn" | "error";

export const LEVELS: Level[] = ["debug", "info", "warn", "error"];

export const LEVEL_TONE: Record<Level, Tone> = {
  debug: "muted",
  info: "info",
  warn: "warning",
  error: "destructive",
};

export interface Line {
  id: number;
  /** `14:03:07` */
  time: string;
  level: Level;
  source: string;
  text: string;
  tone: Tone;
}

/** The whole state of a log viewer; every function below is pure. */
export interface LogsState {
  lines: Line[];
  /** The number of lines generated so far: the next line is `lineAt(seq)`. */
  seq: number;
  paused: boolean;
  following: boolean;
  /** The levels that are shown. */
  levels: Level[];
  query: string;
  /** While not following: the id of the newest line the pane shows. */
  frozenId: number;
}

export interface LevelChip {
  id: Level;
  label: string;
  count: number;
  tone: Tone;
  cls: string;
}

/** What the viewer's template needs, worked out from the state. */
export interface LogsView {
  /** The visible lines, newest first (the pane lays them out bottom up). */
  rows: Line[];
  chips: LevelChip[];
  shown: number;
  total: number;
  /** Lines that arrived while not following. */
  hidden: number;
}

/** How many lines are kept, and how many the pane draws. */
export const KEEP = 400;
export const DRAW = 120;

/** The messages the generator picks from, by level. */
const MESSAGES: Record<Level, [string, string][]> = {
  debug: [
    ["api-gateway", "cache lookup user:{n} hit"],
    ["worker", "polling queue emails (0 pending)"],
    ["redis", "evicted 12 expired keys"],
    ["web-frontend", "render /dashboard in {n}ms"],
    ["postgres", "checkpoint complete: wrote {n} buffers"],
    ["nginx", "upstream keepalive connection reused"],
  ],
  info: [
    ["api-gateway", "GET /api/orders 200 {n}ms"],
    ["api-gateway", "POST /api/login 200 {n}ms"],
    ["web-frontend", "GET /assets/app.js 304"],
    ["worker", "job invoice-mailer finished in {n}ms"],
    ["postgres", "connection authorized: user=app database=main"],
    ["nginx", "200 GET /health from 10.0.0.{n}"],
    ["redis", "background saving started"],
    ["worker", "job report-builder started"],
  ],
  warn: [
    ["api-gateway", "slow request GET /api/reports took {n}ms"],
    ["postgres", "slow query: SELECT * FROM orders took {n}ms"],
    ["redis", "memory usage above 80% of maxmemory"],
    ["worker", "retrying job webhook-sender (attempt 2 of 5)"],
    ["nginx", "upstream response is buffered to a temporary file"],
  ],
  error: [
    ["api-gateway", "upstream timed out (110) while reading response"],
    ["worker", "job webhook-sender failed: connection refused"],
    ["postgres", "deadlock detected, process {n} waits for ShareLock"],
    ["web-frontend", "unhandled rejection: Failed to fetch /api/cart"],
  ],
};

/** Pure: a 32-bit hash of a number (the same input, the same output; no randomness). */
export function mix(n: number): number {
  let x = (n + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Pure: seconds since midnight as `HH:MM:SS`. */
export function clock(seconds: number): string {
  const s = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** Pure: the level of line number `seq`: mostly info, some noise, a few errors. */
export function levelAt(seq: number): Level {
  const r = mix(seq) % 100;
  if (r < 14) return "debug";
  if (r < 74) return "info";
  if (r < 91) return "warn";
  return "error";
}

/** Pure: line number `seq`. Its time is `base` seconds plus about two seconds a line. */
export function lineAt(seq: number, base = 14 * 3600 + 3 * 60): Line {
  const level = levelAt(seq);
  const pool = MESSAGES[level];
  const h = mix(seq * 7 + 3);
  const [source, template] = pool[h % pool.length];
  const n = 8 + ((h >>> 8) % 480);
  return {
    id: seq,
    time: clock(base + seq * 2 + (h % 2)),
    level,
    source,
    text: template.replace("{n}", String(n)),
    tone: LEVEL_TONE[level],
  };
}

/** Pure: `count` lines starting at line number `from`. */
export const linesFrom = (from: number, count: number, base?: number): Line[] =>
  Array.from({ length: count }, (_, i) => lineAt(from + i, base));

/** Pure: a lines list with new ones at the end, capped to the newest `max`. */
export function append(lines: Line[], more: Line[], max = KEEP): Line[] {
  const all = [...lines, ...more];
  return all.length > max ? all.slice(all.length - max) : all;
}

/** Pure: does a line pass the level filter and the text query? */
export function matches(line: Line, levels: Level[], query: string): boolean {
  if (!levels.includes(line.level)) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    line.text.toLowerCase().includes(q) ||
    line.source.toLowerCase().includes(q) ||
    line.level.includes(q)
  );
}

export const filterLines = (
  lines: Line[],
  levels: Level[],
  query: string,
): Line[] => lines.filter((l) => matches(l, levels, query));

/** Pure: how many lines there are of each level. */
export function countByLevel(lines: Line[]): Record<Level, number> {
  const counts: Record<Level, number> = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
  };
  for (const l of lines) counts[l.level] += 1;
  return counts;
}

export function initialLogs(count = 60): LogsState {
  const lines = linesFrom(0, count);
  return {
    lines,
    seq: count,
    paused: false,
    following: true,
    levels: [...LEVELS],
    query: "",
    frozenId: count - 1,
  };
}

/** Pure: a timer tick: one to three new lines (nothing while paused). */
export function tick(state: LogsState): LogsState {
  if (state.paused) return state;
  const n = 1 + (mix(state.seq * 31) % 3);
  const lines = append(state.lines, linesFrom(state.seq, n));
  return {
    ...state,
    lines,
    seq: state.seq + n,
    frozenId: state.following ? lines[lines.length - 1].id : state.frozenId,
  };
}

/** Pure: switch a level on or off (the last one cannot be switched off). */
export function toggleLevel(state: LogsState, level: Level): LogsState {
  const on = state.levels.includes(level);
  if (on && state.levels.length === 1) return state;
  return {
    ...state,
    levels: on
      ? state.levels.filter((l) => l !== level)
      : LEVELS.filter((l) => l === level || state.levels.includes(l)),
  };
}

export const setQuery = (state: LogsState, query: string): LogsState => ({
  ...state,
  query,
});

export const togglePause = (state: LogsState): LogsState => ({
  ...state,
  paused: !state.paused,
});

/** Pure: following shows the newest line; turning it off freezes the pane where it is. */
export function toggleFollow(state: LogsState): LogsState {
  const newest = state.lines.length
    ? state.lines[state.lines.length - 1].id
    : -1;
  return state.following
    ? { ...state, following: false, frozenId: newest }
    : { ...state, following: true, frozenId: newest };
}

export const clearLines = (state: LogsState): LogsState => ({
  ...state,
  lines: [],
  frozenId: state.seq - 1,
});

/** Pure: show one source only (the container's logs), or all of them (`""`). */
export const withSource = (state: LogsState, source: string): LogsState => ({
  ...state,
  query: source,
});

/** Pure: everything the template needs. */
export function deriveLogs(state: LogsState): LogsView {
  const counts = countByLevel(state.lines);
  const filtered = filterLines(state.lines, state.levels, state.query);
  const visible = state.following
    ? filtered
    : filtered.filter((l) => l.id <= state.frozenId);
  const rows = visible.slice(-DRAW).reverse();
  return {
    rows,
    chips: LEVELS.map((id) => ({
      id,
      label: id,
      count: counts[id],
      tone: LEVEL_TONE[id],
      cls: state.levels.includes(id) ? "is-on" : "",
    })),
    shown: visible.length,
    total: state.lines.length,
    hidden: filtered.length - visible.length,
  };
}
