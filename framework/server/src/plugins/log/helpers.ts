import type { LogEffect, LogLevel } from "./mod.ts";
import type { Labels } from "./metrics.ts";

type Of<T extends LogEffect["type"]> = Extract<LogEffect, { type: T }>;
type Fields = Record<string, unknown>;

export interface LogEffector {
  log(level: LogLevel, msg: string, fields?: Fields): Of<"log">;
  trace(msg: string, fields?: Fields): Of<"log">;
  debug(msg: string, fields?: Fields): Of<"log">;
  info(msg: string, fields?: Fields): Of<"log">;
  warn(msg: string, fields?: Fields): Of<"log">;
  error(msg: string, fields?: Fields): Of<"log">;
  fatal(msg: string, fields?: Fields): Of<"log">;
  inc(name: string, labels?: Labels, by?: number): Of<"metrics.inc">;
  observe(
    name: string,
    value: number,
    labels?: Labels,
    buckets?: number[],
  ): Of<"metrics.observe">;
  /** Replies the Prometheus text exposition as message `replyTo`. */
  metrics(replyTo: string): Of<"metrics.get">;
}

const mk =
  (level: LogLevel) =>
  (msg: string, fields?: Fields): Of<"log"> =>
    fields === undefined
      ? { plugin: "log", type: "log", level, msg }
      : { plugin: "log", type: "log", level, msg, fields };

export const logEffector: LogEffector = {
  log: (level, msg, fields) => mk(level)(msg, fields),
  trace: mk("trace"),
  debug: mk("debug"),
  info: mk("info"),
  warn: mk("warn"),
  error: mk("error"),
  fatal: mk("fatal"),
  inc: (name, labels, by) => ({
    plugin: "log",
    type: "metrics.inc",
    name,
    ...(labels && { labels }),
    ...(by !== undefined && { by }),
  }),
  observe: (name, value, labels, buckets) => ({
    plugin: "log",
    type: "metrics.observe",
    name,
    value,
    ...(labels && { labels }),
    ...(buckets && { buckets }),
  }),
  metrics: (replyTo) => ({ plugin: "log", type: "metrics.get", replyTo }),
};
