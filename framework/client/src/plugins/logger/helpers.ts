import type { LogEffect, LogLevel } from "./mod.ts";

/** Builders for log effects. `data` is shown next to the message. */
export interface LoggerEffector {
  /** A log entry at `level`. */
  log(level: LogLevel, message: string, data?: unknown): LogEffect;
  debug(message: string, data?: unknown): LogEffect;
  info(message: string, data?: unknown): LogEffect;
  warn(message: string, data?: unknown): LogEffect;
  error(message: string, data?: unknown): LogEffect;
}

const entry = (level: LogLevel, message: string, data: unknown): LogEffect =>
  data === undefined
    ? { plugin: "logger", type: "log", level, message }
    : { plugin: "logger", type: "log", level, message, data };

/**
 * ```ts
 * import { loggerEffector as log } from "@pavlus/client/plugins/logger";
 *
 * return [log.info("user removed", { id: 3 })];
 * ```
 */
export const loggerEffector: LoggerEffector = {
  log: entry,
  debug: (message, data) => entry("debug", message, data),
  info: (message, data) => entry("info", message, data),
  warn: (message, data) => entry("warn", message, data),
  error: (message, data) => entry("error", message, data),
};
