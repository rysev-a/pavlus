import type { Plugin } from "../../core/types.ts";

export type HttpEffect =
  /**
   * Sends a request. `id` is required: a new request with a running id
   * cancels the old one, and a cancelled request never produces a message.
   */
  | {
      plugin: "http";
      type: "request";
      id: string;
      url: string;
      method?: string;
      headers?: Record<string, string>;
      /** Objects are sent as JSON. */
      body?: unknown;
      responseType?: "json" | "text";
      /** Message id for a 2xx answer; payload `{ status, data }`. */
      onSuccess: string;
      /** Message id for failures; payload `{ status?, error }`. */
      onError: string;
    }
  | { plugin: "http"; type: "cancel"; id: string };

export interface HttpPluginOptions {
  fetch?: typeof fetch;
}

export interface HttpPlugin extends Plugin<HttpEffect, any> {
  /** Ids of requests currently in flight. */
  pending(): string[];
  /**
   * Resolves once no request is in flight, including the ones the answers
   * started (server-side rendering: load, then render).
   */
  settled(): Promise<void>;
}

export function createHttpPlugin(opts: HttpPluginOptions = {}): HttpPlugin {
  const doFetch = opts.fetch ?? ((...a) => globalThis.fetch(...a));
  const inflight = new Map<string, AbortController>();
  const running = new Set<Promise<void>>();

  return {
    name: "http",
    handle(effect, ctx) {
      if (effect.type === "cancel") {
        inflight.get(effect.id)?.abort();
        inflight.delete(effect.id);
        return;
      }
      inflight.get(effect.id)?.abort();
      const ac = new AbortController();
      inflight.set(effect.id, ac);
      const headers = { ...effect.headers };
      let body: BodyInit | undefined;
      if (effect.body !== undefined) {
        if (typeof effect.body === "string") body = effect.body;
        else {
          body = JSON.stringify(effect.body);
          headers["content-type"] ??= "application/json";
        }
      }
      const current = () =>
        inflight.get(effect.id) === ac && !ac.signal.aborted;
      const run = (async () => {
        try {
          const res = await doFetch(effect.url, {
            method: effect.method ?? "GET",
            headers,
            body,
            signal: ac.signal,
          });
          const data =
            effect.responseType === "text"
              ? await res.text()
              : await res.json().catch(() => null);
          if (!current()) return;
          inflight.delete(effect.id);
          if (res.ok)
            ctx.dispatch({
              id: effect.onSuccess,
              payload: { status: res.status, data },
            });
          else
            ctx.dispatch({
              id: effect.onError,
              payload: { status: res.status, error: res.statusText, data },
            });
        } catch (e) {
          if (!current()) return;
          inflight.delete(effect.id);
          ctx.dispatch({
            id: effect.onError,
            payload: { error: e instanceof Error ? e.message : String(e) },
          });
        }
      })();
      running.add(run);
      void run.then(() => running.delete(run));
    },
    pending: () => [...inflight.keys()],
    async settled() {
      while (running.size) await Promise.all([...running]);
    },
    dispose() {
      for (const ac of inflight.values()) ac.abort();
      inflight.clear();
    },
  };
}

export { httpEffector } from "./helpers.ts";
export type { HttpEffector } from "./helpers.ts";
