import { onCleanup, signal } from "../../src/mod.ts";

/** The slice of WebSocket used here, so tests can pass a fake. */
export interface SocketLike {
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: ((e: unknown) => void) | null;
  close(): void;
}

export type Status = "connecting" | "open" | "closed";

/**
 * Subscribe to a socket for the lifetime of the current owner. Call it inside
 * a component (or `root`): the socket is closed by `onCleanup`, so unmounting
 * the component is all it takes to avoid a leak.
 */
export function useSocket<T>(
  url: string,
  options: {
    create?: (url: string) => SocketLike;
    parse?: (s: string) => T;
  } = {},
) {
  const create =
    options.create ??
    ((u: string) => new WebSocket(u) as unknown as SocketLike);
  const parse = options.parse ?? ((s: string) => JSON.parse(s) as T);
  const status = signal<Status>("connecting");
  const last = signal<T | undefined>(undefined);
  const log = signal<T[]>([]);
  const ws = create(url);
  ws.onopen = () => status.set("open");
  ws.onclose = () => status.set("closed");
  ws.onmessage = (e) => {
    const v = parse(e.data);
    last.set(v);
    log.update((all) => [...all.slice(-99), v]);
  };
  onCleanup(() => {
    ws.onopen = ws.onmessage = ws.onclose = null; // no late writes
    ws.close();
  });
  return { status, last, log };
}
