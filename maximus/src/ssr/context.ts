/**
 * Request context shared by the server renderer, the router and `resource`.
 * Kept in its own tiny module so that importing it does not pull the
 * renderer into a client bundle.
 *
 * @module
 */
import { createContext } from "../core/mod.ts";

export interface ServerInfo {
  url: string;
  request: unknown;
}

/** Provided during server rendering: the request URL and friends. */
export const ServerCtx = createContext<ServerInfo | null>(null);

/** The server request info, or `null` on the client. Call during component setup. */
export function useServer(): ServerInfo | null {
  return ServerCtx.use();
}
