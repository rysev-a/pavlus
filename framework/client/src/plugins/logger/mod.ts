import type { Plugin } from "../../core/types.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEffect = {
  plugin: "logger";
  type: "log";
  level?: LogLevel;
  message: string;
  data?: unknown;
};

export interface LoggerOptions {
  /** Defaults to the global `console`. */
  sink?: Pick<Console, LogLevel>;
}

/** Writes log effects to the console. */
export function createLoggerPlugin(
  opts: LoggerOptions = {},
): Plugin<LogEffect, any> {
  return {
    name: "logger",
    handle(effect) {
      const sink = opts.sink ?? console;
      const fn = sink[effect.level ?? "info"].bind(sink);
      if (effect.data === undefined) fn(effect.message);
      else fn(effect.message, effect.data);
    },
  };
}

export { loggerEffector } from "./helpers.ts";
export type { LoggerEffector } from "./helpers.ts";
