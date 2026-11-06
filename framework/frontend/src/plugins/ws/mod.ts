import type { Plugin } from "../../core/types.ts";

export type WsEffect =
  | {
      plugin: "ws";
      type: "connect";
      id: string;
      url: string;
      onOpen?: string;
      /** Payload is the received data (JSON frames are parsed). */
      onMessage: string;
      onClose?: string;
      onError?: string;
    }
  | { plugin: "ws"; type: "send"; id: string; data: unknown }
  | { plugin: "ws"; type: "close"; id: string; code?: number; reason?: string };

/** The subset of `WebSocket` the plugin needs, so tests can fake it. */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface WsPluginOptions {
  create?: (url: string) => SocketLike;
}

export interface WsPlugin extends Plugin<WsEffect, any> {
  /** Ids of open or connecting sockets. */
  connections(): string[];
}

export function createWsPlugin(opts: WsPluginOptions = {}): WsPlugin {
  const create =
    opts.create ?? ((url) => new WebSocket(url) as unknown as SocketLike);
  const sockets = new Map<string, SocketLike>();

  const drop = (id: string, s: SocketLike): void => {
    s.onopen = s.onmessage = s.onclose = s.onerror = null;
    if (sockets.get(id) === s) sockets.delete(id);
  };

  return {
    name: "ws",
    handle(effect, ctx) {
      switch (effect.type) {
        case "connect": {
          const old = sockets.get(effect.id);
          if (old) {
            drop(effect.id, old);
            old.close();
          }
          const s = create(effect.url);
          sockets.set(effect.id, s);
          s.onopen = () => effect.onOpen && ctx.dispatch({ id: effect.onOpen });
          s.onmessage = (ev) => {
            let data = ev.data;
            if (typeof data === "string") {
              try {
                data = JSON.parse(data);
              } catch {
                /* plain text frame */
              }
            }
            ctx.dispatch({ id: effect.onMessage, payload: data });
          };
          s.onclose = (ev) => {
            drop(effect.id, s);
            if (effect.onClose)
              ctx.dispatch({
                id: effect.onClose,
                payload: { code: ev.code, reason: ev.reason },
              });
          };
          s.onerror = () =>
            effect.onError && ctx.dispatch({ id: effect.onError });
          return;
        }
        case "send": {
          const s = sockets.get(effect.id);
          if (!s) throw new Error(`pavlus/ws: no connection "${effect.id}"`);
          s.send(
            typeof effect.data === "string"
              ? effect.data
              : JSON.stringify(effect.data),
          );
          return;
        }
        case "close": {
          const s = sockets.get(effect.id);
          if (s) s.close(effect.code, effect.reason);
        }
      }
    },
    connections: () => [...sockets.keys()],
    dispose() {
      for (const [id, s] of [...sockets]) {
        drop(id, s);
        s.close();
      }
    },
  };
}

export { wsEffector } from "./helpers.ts";
export type { WsEffector } from "./helpers.ts";
