// Builders for the effects of the ws plugin.
import type { WsEffect } from "./mod.ts";

type Of<T extends WsEffect["type"]> = Extract<WsEffect, { type: T }>;

export interface WsEffector {
  /** Sends to `connId`, default: the connection of the message being handled. */
  send(data: unknown, connId?: string): Of<"send">;
  broadcast(
    room: string | undefined,
    data: unknown,
    except?: string | readonly string[],
  ): Of<"broadcast">;
  join(room: string, connId?: string): Of<"join">;
  leave(room: string, connId?: string): Of<"leave">;
  close(code?: number, reason?: string, connId?: string): Of<"close">;
  ping(data?: string, connId?: string): Of<"ping">;
}

const opt = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export const wsEffector: WsEffector = {
  send: (data, connId) =>
    ({ plugin: "ws", type: "send", data, ...opt({ connId }) }) as Of<"send">,
  broadcast: (room, data, except) =>
    ({
      plugin: "ws",
      type: "broadcast",
      data,
      ...opt({ room, except }),
    }) as Of<"broadcast">,
  join: (room, connId) =>
    ({ plugin: "ws", type: "join", room, ...opt({ connId }) }) as Of<"join">,
  leave: (room, connId) =>
    ({ plugin: "ws", type: "leave", room, ...opt({ connId }) }) as Of<"leave">,
  close: (code, reason, connId) =>
    ({
      plugin: "ws",
      type: "close",
      ...opt({ code, reason, connId }),
    }) as Of<"close">,
  ping: (data, connId) =>
    ({ plugin: "ws", type: "ping", ...opt({ data, connId }) }) as Of<"ping">,
};
