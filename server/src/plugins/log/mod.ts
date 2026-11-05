import type { Plugin } from "@service-laboratory/pavlus";
import { type EffectCtx, deliver, ok } from "../../ctx.ts";
import { type Labels, Metrics } from "./metrics.ts";
import { DEFAULT_REDACT, sanitize } from "./redact.ts";

export { logEffector } from "./helpers.ts";
export type { LogEffector } from "./helpers.ts";
export { Metrics } from "./metrics.ts";
export type { Labels } from "./metrics.ts";
export { sanitize, DEFAULT_REDACT } from "./redact.ts";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
const ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

type Base = { plugin: "log"; ctx?: EffectCtx };

export type LogEffect =
  | (Base & {
      type: "log";
      level: LogLevel;
      msg: string;
      fields?: Record<string, unknown>;
    })
  | (Base & { type: "metrics.inc"; name: string; labels?: Labels; by?: number })
  | (Base & {
      type: "metrics.observe";
      name: string;
      value: number;
      labels?: Labels;
      buckets?: number[];
    })
  /** Replies `replyTo` with the Prometheus text. */
  | (Base & { type: "metrics.get"; replyTo: string });

export interface LogRecord {
  ts: string;
  level: LogLevel;
  msg: string;
  rid?: unknown;
  connId?: unknown;
  [k: string]: unknown;
}

export interface LogPluginOptions {
  /** Minimum level (default "info"). */
  level?: LogLevel;
  /** Human readable lines instead of JSON (default false). */
  pretty?: boolean;
  /** Extra key fragments to redact, added to the defaults. */
  redact?: string[];
  /** Replace the default redaction list instead of extending it. */
  replaceRedact?: boolean;
  /** Where lines go (default stdout, stderr for warn and up). */
  sink?: (line: string, record: LogRecord) => void;
  now?: () => number;
  metrics?: Metrics;
}

export interface LogPlugin extends Plugin<LogEffect, any> {
  /** Direct (non-effect) logging, e.g. from other plugins. */
  log(
    level: LogLevel,
    msg: string,
    fields?: Record<string, unknown>,
    ctx?: EffectCtx,
  ): void;
  readonly metrics: Metrics;
  /** Prometheus text exposition. */
  metricsText(): string;
}

const COLORS: Record<LogLevel, string> = {
  trace: "\x1b[90m",
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  fatal: "\x1b[35m",
};

export function createLogPlugin(opts: LogPluginOptions = {}): LogPlugin {
  const min = ORDER[opts.level ?? "info"];
  const redact = (opts.replaceRedact ? [] : DEFAULT_REDACT)
    .concat(opts.redact ?? [])
    .map((r) => r.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const now = opts.now ?? Date.now;
  const metrics = opts.metrics ?? new Metrics();
  const sink =
    opts.sink ??
    ((line: string, r: LogRecord) => {
      (ORDER[r.level] >= ORDER.warn ? process.stderr : process.stdout).write(
        line + "\n",
      );
    });

  function log(
    level: LogLevel,
    msg: string,
    fields?: Record<string, unknown>,
    ctx?: EffectCtx,
  ): void {
    if (ORDER[level] < min) return;
    const rec: LogRecord = { ts: new Date(now()).toISOString(), level, msg };
    if (ctx?.rid !== undefined) rec.rid = ctx.rid;
    if (ctx?.connId !== undefined) rec.connId = ctx.connId;
    if (fields) {
      const clean = sanitize(fields, redact) as Record<string, unknown>;
      for (const [k, v] of Object.entries(clean)) if (!(k in rec)) rec[k] = v;
    }
    let line: string;
    if (opts.pretty) {
      const { ts, level: lv, msg: m, rid, connId, ...rest } = rec;
      const ids = [rid, connId].filter((x) => x !== undefined).join("/");
      const extra = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
      line = `${ts.slice(11, 23)} ${COLORS[lv]}${lv.toUpperCase().padEnd(5)}\x1b[0m${ids ? ` [${ids}]` : ""} ${m}${extra}`;
    } else line = JSON.stringify(rec);
    sink(line, rec);
  }

  return {
    name: "log",
    handle(effect, ctx) {
      switch (effect.type) {
        case "log":
          return log(effect.level, effect.msg, effect.fields, effect.ctx);
        case "metrics.inc":
          return metrics.inc(effect.name, effect.labels, effect.by);
        case "metrics.observe":
          return metrics.observe(
            effect.name,
            effect.value,
            effect.labels,
            effect.buckets,
          );
        case "metrics.get":
          return deliver(ctx.dispatch, ok(effect, metrics.text()));
      }
    },
    log,
    metrics,
    metricsText: () => metrics.text(),
  };
}
