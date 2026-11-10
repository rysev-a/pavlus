import type {
  ServiceWorkerEffect,
  SwRequestSpec,
  SwResponseSpec,
} from "./mod.ts";

type Of<T extends ServiceWorkerEffect["type"]> = Extract<
  ServiceWorkerEffect,
  { type: T }
>;
type Reply = { onSuccess?: string; onError?: string };
type Reg = { registration?: string };

/** Drops `undefined` keys so effects stay minimal and comparable. */
function build<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[])
    if (o[k] === undefined) delete o[k];
  return o;
}
const P = "serviceworker" as const;

/** Builders for service worker, cache, notification and connectivity effects. */
export interface ServiceWorkerEffector {
  register(
    p: {
      id?: string;
      script: string;
      scope?: string;
      workerType?: "classic" | "module";
      updateViaCache?: "imports" | "all" | "none";
    } & Reply,
  ): Of<"register">;
  unregister(p?: { scope?: string } & Reg & Reply): Of<"unregister">;
  update(p?: Reg & Reply): Of<"update">;
  /** Posts `{type: "SKIP_WAITING"}` to the waiting worker. */
  skipWaiting(p?: Reg & Reply): Of<"skipWaiting">;
  postMessage(
    p: {
      data: unknown;
      target?: "active" | "waiting" | "installing";
    } & Reg &
      Reply,
  ): Of<"postMessage">;
  /** Stream state transitions (`onChange`) and worker messages (`onMessage`). */
  observe(
    p: { id: string; onChange?: string; onMessage?: string } & Reg,
  ): Of<"observe">;
  unobserve(id: string): Of<"unobserve">;
  ready(p: { onSuccess: string; onError?: string }): Of<"ready">;
  /** Connectivity: boolean now and on every online/offline event. */
  online(p: { id: string; onChange: string }): Of<"online">;
  unobserveOnline(id: string): Of<"unobserveOnline">;
  cachePut(
    p: {
      cache: string;
      url?: string;
      request?: string | SwRequestSpec;
      response?: SwResponseSpec;
    } & Reply,
  ): Of<"cachePut">;
  cacheMatch(p: {
    cache: string;
    url: string;
    ignoreSearch?: boolean;
    onSuccess: string;
    onError?: string;
  }): Of<"cacheMatch">;
  cacheDelete(p: { cache: string; url?: string } & Reply): Of<"cacheDelete">;
  cacheKeys(p: { cache?: string } & Reply): Of<"cacheKeys">;
  cacheClear(p?: { cache?: string } & Reply): Of<"cacheClear">;
  notify(
    p: { title: string; options?: Record<string, unknown> } & Reg & Reply,
  ): Of<"notify">;
  notificationPermission(p: {
    onSuccess: string;
    onError?: string;
  }): Of<"notificationPermission">;
}

/**
 * ```ts
 * import { serviceWorkerEffector as sw } from "@pavlus/client/plugins/serviceworker";
 *
 * return [sw.register({ script: "/sw.js", onSuccess: "swReady" }), sw.observe({ id: "sw", onChange: "swState" })];
 * ```
 */
export const serviceWorkerEffector: ServiceWorkerEffector = {
  register: (p) => build({ plugin: P, type: "register", ...p }),
  unregister: (p) => build({ plugin: P, type: "unregister", ...p }),
  update: (p) => build({ plugin: P, type: "update", ...p }),
  skipWaiting: (p) => build({ plugin: P, type: "skipWaiting", ...p }),
  postMessage: (p) => build({ plugin: P, type: "postMessage", ...p }),
  observe: (p) => build({ plugin: P, type: "observe", ...p }),
  unobserve: (id) => ({ plugin: P, type: "unobserve", id }),
  ready: (p) => build({ plugin: P, type: "ready", ...p }),
  online: (p) => ({ plugin: P, type: "online", ...p }),
  unobserveOnline: (id) => ({ plugin: P, type: "unobserveOnline", id }),
  cachePut: (p) => build({ plugin: P, type: "cachePut", ...p }),
  cacheMatch: (p) => build({ plugin: P, type: "cacheMatch", ...p }),
  cacheDelete: (p) => build({ plugin: P, type: "cacheDelete", ...p }),
  cacheKeys: (p) => build({ plugin: P, type: "cacheKeys", ...p }),
  cacheClear: (p) => build({ plugin: P, type: "cacheClear", ...p }),
  notify: (p) => build({ plugin: P, type: "notify", ...p }),
  notificationPermission: (p) =>
    build({ plugin: P, type: "notificationPermission", ...p }),
};
