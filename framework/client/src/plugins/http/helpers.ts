import type { HttpEffect } from "./mod.ts";

type Of<T extends HttpEffect["type"]> = Extract<HttpEffect, { type: T }>;

/** Builders for http effects. */
export interface HttpEffector {
  /**
   * Sends a request. `id` is required: a request with the id of a running one
   * cancels it. Replies as messages `onSuccess` / `onError`.
   */
  request(options: Omit<Of<"request">, "plugin" | "type">): Of<"request">;
  /** Cancels the running request `id`. A cancelled request never replies. */
  cancel(id: string): Of<"cancel">;
}

/**
 * ```ts
 * import { httpEffector as http } from "@pavlus/client/plugins/http";
 *
 * return [http.request({ id: "users", url: "/api/users", onSuccess: "loaded", onError: "failed" })];
 * ```
 */
export const httpEffector: HttpEffector = {
  request: (options) => ({ plugin: "http", type: "request", ...options }),
  cancel: (id) => ({ plugin: "http", type: "cancel", id }),
};
