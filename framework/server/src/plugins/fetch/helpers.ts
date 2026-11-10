import type { FetchEffect, FetchRequest } from "./mod.ts";

export type FetchCall = Omit<FetchRequest, "url" | "method"> & {
  replyTo: string;
  onError?: string;
};

export interface FetchEffector {
  request(url: string, o: FetchCall & { method?: string }): FetchEffect;
  get(url: string, o: FetchCall): FetchEffect;
  post(url: string, o: FetchCall): FetchEffect;
  put(url: string, o: FetchCall): FetchEffect;
  patch(url: string, o: FetchCall): FetchEffect;
  delete(url: string, o: FetchCall): FetchEffect;
}

const mk =
  (method: string | undefined) =>
  (url: string, o: FetchCall & { method?: string }): FetchEffect => {
    const clean = Object.fromEntries(
      Object.entries(o).filter(([, v]) => v !== undefined),
    );
    return {
      plugin: "fetch",
      type: "request",
      url,
      ...(method && { method }),
      ...clean,
    } as FetchEffect;
  };

/** `fetchEffector.get(url, { replyTo: "gotUser", onError: "userFailed", timeoutMs: 2000 })` */
export const fetchEffector: FetchEffector = {
  request: mk(undefined),
  get: mk("GET"),
  post: mk("POST"),
  put: mk("PUT"),
  patch: mk("PATCH"),
  delete: mk("DELETE"),
};
