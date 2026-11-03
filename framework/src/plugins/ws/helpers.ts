import type { WsEffect } from "./mod.ts";

type Of<T extends WsEffect["type"]> = Extract<WsEffect, { type: T }>;

/** Builders for WebSocket effects. */
export interface WsEffector {
  /** Opens connection `id`; an open connection with the same id is closed first. */
  connect(options: Omit<Of<"connect">, "plugin" | "type">): Of<"connect">;
  /** Sends `data` (strings as they are, anything else as JSON) on connection `id`. */
  send(id: string, data: unknown): Of<"send">;
  /** Closes connection `id`. */
  close(id: string, code?: number, reason?: string): Of<"close">;
}

/**
 * ```ts
 * import { wsEffector as ws } from "@service-laboratory/pavlus/plugins/ws";
 *
 * return [ws.connect({ id: "chat", url: "wss://example.com", onMessage: "chat.received" })];
 * ```
 */
export const wsEffector: WsEffector = {
  connect: (options) => ({ plugin: "ws", type: "connect", ...options }),
  send: (id, data) => ({ plugin: "ws", type: "send", id, data }),
  close: (id, code, reason) => ({
    plugin: "ws",
    type: "close",
    id,
    ...(code !== undefined && { code }),
    ...(reason !== undefined && { reason }),
  }),
};
