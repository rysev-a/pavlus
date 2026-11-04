import type { Plugin } from "../../core/types.ts";

/** Normalized failure shape for every effect of this plugin. */
export interface SwError {
  code: "UNSUPPORTED" | "NOT_REGISTERED" | "FAILED";
  message: string;
}

export type WorkerPhase =
  "installing" | "waiting" | "active" | "redundant" | "none";

/** Registration state, as replied by register / ready and streamed by observe. */
export interface SwState {
  /** Newest worker: installing, else waiting, else active; `redundant` if the last one was discarded. */
  phase: WorkerPhase;
  installing: boolean;
  waiting: boolean;
  active: boolean;
  redundant: boolean;
  scope: string | null;
  /** An update was found since observing started. */
  updateFound: boolean;
  /** The page is controlled by a worker. */
  controller: boolean;
  /** Why `observe` emitted. */
  event?: "init" | "updatefound" | "statechange" | "controllerchange";
}

export interface SwResponseSpec {
  /** string as is; objects are sent as JSON. */
  body?: unknown;
  status?: number;
  headers?: Record<string, string>;
}

export interface SwRequestSpec {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}

export interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  /** Body as text. */
  body: string;
}

type Reg = { registration?: string };
type Reply = { onSuccess?: string; onError?: string };

export type ServiceWorkerEffect =
  | {
      plugin: "serviceworker";
      type: "register";
      /** Name of this registration for later effects. Default "default". */
      id?: string;
      script: string;
      scope?: string;
      /** The worker script type (the effect's own `type` is taken). */
      workerType?: "classic" | "module";
      updateViaCache?: "imports" | "all" | "none";
      /** Payload: SwState. */
      onSuccess?: string;
      onError?: string;
    }
  | ({
      plugin: "serviceworker";
      type: "unregister";
      /** Unregister the registration for this scope instead of a named one. */
      scope?: string;
    } & Reg &
      Reply)
  | ({ plugin: "serviceworker"; type: "update" } & Reg & Reply)
  | ({ plugin: "serviceworker"; type: "skipWaiting" } & Reg & Reply)
  | ({
      plugin: "serviceworker";
      type: "postMessage";
      data: unknown;
      target?: "active" | "waiting" | "installing";
    } & Reg &
      Reply)
  | ({
      plugin: "serviceworker";
      type: "observe";
      id: string;
      /** `onChange` payload: SwState. */
      onChange?: string;
      /** Payload: the data the worker posted. */
      onMessage?: string;
    } & Reg)
  | { plugin: "serviceworker"; type: "unobserve"; id: string }
  | {
      plugin: "serviceworker";
      type: "ready";
      onSuccess: string;
      onError?: string;
    }
  /** Connectivity: replies a boolean now and on every online/offline event. */
  | { plugin: "serviceworker"; type: "online"; id: string; onChange: string }
  | { plugin: "serviceworker"; type: "unobserveOnline"; id: string }
  | ({
      plugin: "serviceworker";
      type: "cachePut";
      cache: string;
      url?: string;
      request?: string | SwRequestSpec;
      /** Without a response the request is fetched and stored. */
      response?: SwResponseSpec;
    } & Reply)
  | {
      plugin: "serviceworker";
      type: "cacheMatch";
      cache: string;
      url: string;
      ignoreSearch?: boolean;
      /** Payload: CachedResponse or null. */
      onSuccess: string;
      onError?: string;
    }
  | ({
      plugin: "serviceworker";
      type: "cacheDelete";
      cache: string;
      /** Without a url the whole cache is deleted. */
      url?: string;
    } & Reply)
  | ({
      plugin: "serviceworker";
      type: "cacheKeys";
      /** Without a cache, the names of all caches. */
      cache?: string;
    } & Reply)
  | ({
      plugin: "serviceworker";
      type: "cacheClear";
      /** Empties this cache; without it every cache is deleted. */
      cache?: string;
    } & Reply)
  | ({
      plugin: "serviceworker";
      type: "notify";
      title: string;
      options?: Record<string, unknown>;
    } & Reg &
      Reply)
  | {
      plugin: "serviceworker";
      type: "notificationPermission";
      onSuccess: string;
      onError?: string;
    };

/* --- injectable environment ---------------------------------------------- */

export interface WorkerLike {
  state: string;
  postMessage(data: unknown): void;
  addEventListener(type: "statechange", fn: () => void): void;
  removeEventListener?(type: "statechange", fn: () => void): void;
}

export interface RegistrationLike {
  scope: string;
  installing: WorkerLike | null;
  waiting: WorkerLike | null;
  active: WorkerLike | null;
  update(): Promise<unknown>;
  unregister(): Promise<boolean>;
  addEventListener?(type: "updatefound", fn: () => void): void;
  removeEventListener?(type: "updatefound", fn: () => void): void;
  showNotification?(title: string, options?: unknown): Promise<void>;
}

export interface ServiceWorkerContainerLike {
  controller: unknown;
  ready: Promise<RegistrationLike>;
  register(script: string, options?: object): Promise<RegistrationLike>;
  getRegistration(scope?: string): Promise<RegistrationLike | undefined>;
  addEventListener(type: string, fn: (ev: any) => void): void;
  removeEventListener?(type: string, fn: (ev: any) => void): void;
}

export interface CacheLike {
  put(request: any, response: any): Promise<void>;
  add(request: any): Promise<void>;
  match(request: any, options?: object): Promise<any>;
  delete(request: any): Promise<boolean>;
  keys(): Promise<{ url: string }[]>;
}

export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
  keys(): Promise<string[]>;
}

export interface NotificationLike {
  requestPermission(): Promise<string> | string;
}

export interface EventTargetLike {
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

export interface ServiceWorkerPluginOptions {
  /** Defaults to `navigator.serviceWorker`. */
  serviceWorker?: ServiceWorkerContainerLike;
  /** Defaults to `globalThis.caches`. */
  caches?: CacheStorageLike;
  /** Defaults to `globalThis.Notification`. */
  Notification?: NotificationLike;
  /** Source of `onLine`. Defaults to `globalThis.navigator`. */
  navigator?: { onLine?: boolean };
  /** Target of online/offline events. Defaults to `globalThis`. */
  eventTarget?: EventTargetLike;
  /** Defaults to `globalThis.Response`. */
  Response?: new (body?: any, init?: any) => any;
  /** Defaults to `globalThis.Request`. */
  Request?: new (url: string, init?: any) => any;
}

export interface ServiceWorkerPlugin extends Plugin<ServiceWorkerEffect, any> {
  /** Ids of known registrations. */
  registrations(): string[];
  /** Ids of `observe` streams. */
  observers(): string[];
  /** Ids of `online` streams. */
  onlineObservers(): string[];
}

const DEFAULT = "default";

const isSwError = (e: any): e is SwError =>
  !!e && typeof e === "object" && !(e instanceof Error) && "code" in e;

const unsupported = (what: string): SwError => ({
  code: "UNSUPPORTED",
  message: `${what} is not available in this environment`,
});
const failed = (e: any): SwError => ({
  code: "FAILED",
  message: String(e?.message ?? e),
});
const notRegistered: SwError = {
  code: "NOT_REGISTERED",
  message: "No service worker registration",
};

interface Observer {
  detachReg: () => void;
  detach: () => void;
  regId: string;
  onChange?: string;
  attach: (reg: RegistrationLike) => void;
  attached: boolean;
}

/**
 * Service worker lifecycle, page-side Cache Storage, notifications and the
 * connectivity half (`online`).
 */
export function createServiceWorkerPlugin(
  opts: ServiceWorkerPluginOptions = {},
): ServiceWorkerPlugin {
  const g = globalThis as any;
  const swc = (): ServiceWorkerContainerLike | undefined =>
    "serviceWorker" in opts ? opts.serviceWorker : g.navigator?.serviceWorker;
  const cachesOf = (): CacheStorageLike | undefined =>
    "caches" in opts ? opts.caches : g.caches;
  const notif = (): NotificationLike | undefined =>
    "Notification" in opts ? opts.Notification : g.Notification;
  const isOnline = (): boolean | undefined =>
    ("navigator" in opts ? opts.navigator : g.navigator)?.onLine;
  const evTarget = (): EventTargetLike | undefined => {
    const t = "eventTarget" in opts ? opts.eventTarget : g;
    return typeof t?.addEventListener === "function" ? t : undefined;
  };

  const regs = new Map<string, RegistrationLike>();
  const observers = new Map<string, Observer>();
  const onlines = new Map<string, () => void>();
  let gen = 0;

  const stateOf = (
    reg: RegistrationLike | undefined,
    extra: {
      updateFound?: boolean;
      redundant?: boolean;
      event?: SwState["event"];
    } = {},
  ): SwState => {
    const installing = !!reg?.installing;
    const waiting = !!reg?.waiting;
    const active = !!reg?.active;
    const redundant = !!extra.redundant;
    const phase: WorkerPhase = installing
      ? "installing"
      : waiting
        ? "waiting"
        : active
          ? "active"
          : redundant
            ? "redundant"
            : "none";
    const s: SwState = {
      phase,
      installing,
      waiting,
      active,
      redundant,
      scope: reg?.scope ?? null,
      updateFound: !!extra.updateFound,
      controller: !!swc()?.controller,
    };
    if (extra.event) s.event = extra.event;
    return s;
  };

  const stopObserver = (id: string): void => {
    const o = observers.get(id);
    if (!o) return;
    observers.delete(id);
    o.detachReg();
    o.detach();
  };
  const stopOnline = (id: string): void => {
    onlines.get(id)?.();
    onlines.delete(id);
  };

  const getReg = async (id?: string): Promise<RegistrationLike | undefined> =>
    regs.get(id ?? DEFAULT) ?? (await swc()?.getRegistration());

  return {
    name: "serviceworker",
    handle(effect, ctx) {
      const myGen = gen;
      const send = (id: string | undefined, payload?: unknown): void => {
        if (id && myGen === gen) ctx.dispatch({ id, payload });
      };
      /** Runs `fn`, replies its result to onSuccess or the failure to onError. */
      const settle = (
        r: Reply,
        fn: () => unknown | Promise<unknown>,
        map: (v: any) => unknown = (v) => v,
      ): void => {
        Promise.resolve()
          .then(fn)
          .then(
            (v) => send(r.onSuccess, map(v)),
            (e) => send(r.onError, isSwError(e) ? e : failed(e)),
          );
      };
      const needSw = (r: Reply): ServiceWorkerContainerLike | undefined => {
        const s = swc();
        if (!s) send(r.onError, unsupported("Service workers"));
        return s;
      };
      const needCaches = (r: Reply): CacheStorageLike | undefined => {
        const c = cachesOf();
        if (!c) send(r.onError, unsupported("Cache Storage"));
        return c;
      };
      const fail = (e: SwError): never => {
        throw e;
      };

      switch (effect.type) {
        case "register": {
          const sw = needSw(effect);
          if (!sw) return;
          const id = effect.id ?? DEFAULT;
          const options: Record<string, unknown> = {};
          if (effect.scope !== undefined) options.scope = effect.scope;
          if (effect.workerType !== undefined) options.type = effect.workerType;
          if (effect.updateViaCache !== undefined)
            options.updateViaCache = effect.updateViaCache;
          settle(
            effect,
            async () => {
              const reg = await sw.register(effect.script, options);
              if (myGen === gen) {
                regs.set(id, reg);
                for (const o of observers.values())
                  if (o.regId === id) o.attach(reg);
              }
              return reg;
            },
            (reg) => stateOf(reg),
          );
          return;
        }
        case "unregister": {
          if (!needSw(effect)) return;
          settle(effect, async () => {
            const reg = effect.scope
              ? await swc()!.getRegistration(effect.scope)
              : await getReg(effect.registration);
            if (!reg) return false;
            const ok = await reg.unregister();
            for (const [k, v] of [...regs]) if (v === reg) regs.delete(k);
            return ok;
          });
          return;
        }
        case "update": {
          if (!needSw(effect)) return;
          settle(
            effect,
            async () => {
              const reg =
                (await getReg(effect.registration)) ?? fail(notRegistered);
              await reg.update();
              return reg;
            },
            (reg) => stateOf(reg),
          );
          return;
        }
        case "skipWaiting": {
          if (!needSw(effect)) return;
          settle(effect, async () => {
            const reg =
              (await getReg(effect.registration)) ?? fail(notRegistered);
            if (!reg.waiting) return false;
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
            return true;
          });
          return;
        }
        case "postMessage": {
          if (!needSw(effect)) return;
          settle(effect, async () => {
            const reg =
              (await getReg(effect.registration)) ?? fail(notRegistered);
            const w = reg[effect.target ?? "active"];
            if (!w)
              return fail({
                code: "NOT_REGISTERED",
                message: `No ${effect.target ?? "active"} worker`,
              });
            w.postMessage(effect.data);
            return true;
          });
          return;
        }
        case "ready": {
          if (!needSw(effect)) return;
          settle(
            effect,
            () => swc()!.ready,
            (reg) => stateOf(reg),
          );
          return;
        }
        case "observe": {
          stopObserver(effect.id);
          const sw = swc();
          if (!sw) {
            send(effect.onChange, undefined);
            return;
          }
          const regId = effect.registration ?? DEFAULT;
          let current: RegistrationLike | undefined;
          let regCleanups: (() => void)[] = [];
          let updateFound = false;
          let redundant = false;
          const watched = new Set<WorkerLike>();
          const emit = (event: SwState["event"]): void =>
            send(
              effect.onChange,
              stateOf(current, { updateFound, redundant, event }),
            );
          const watchWorker = (w: WorkerLike | null): void => {
            if (!w || watched.has(w)) return;
            watched.add(w);
            const f = (): void => {
              if (w.state === "redundant") redundant = true;
              emit("statechange");
            };
            w.addEventListener("statechange", f);
            regCleanups.push(() => w.removeEventListener?.("statechange", f));
          };
          const o: Observer = {
            regId,
            onChange: effect.onChange,
            attached: false,
            detachReg: () => {
              regCleanups.forEach((f) => f());
              regCleanups = [];
              watched.clear();
            },
            detach: () => {},
            attach(reg) {
              if (current === reg) return;
              o.detachReg();
              current = reg;
              o.attached = true;
              updateFound = false;
              redundant = false;
              const onUpdate = (): void => {
                updateFound = true;
                redundant = false;
                watchWorker(reg.installing);
                emit("updatefound");
              };
              reg.addEventListener?.("updatefound", onUpdate);
              regCleanups.push(() =>
                reg.removeEventListener?.("updatefound", onUpdate),
              );
              watchWorker(reg.installing);
              watchWorker(reg.waiting);
              watchWorker(reg.active);
              emit("init");
            },
          };
          const onController = (): void => emit("controllerchange");
          const onMsg = (ev: { data: unknown }): void =>
            send(effect.onMessage, ev.data);
          sw.addEventListener("controllerchange", onController);
          if (effect.onMessage) sw.addEventListener("message", onMsg);
          o.detach = () => {
            sw.removeEventListener?.("controllerchange", onController);
            sw.removeEventListener?.("message", onMsg);
          };
          observers.set(effect.id, o);
          const known = regs.get(regId);
          if (known) o.attach(known);
          else
            Promise.resolve()
              .then(() => sw.getRegistration())
              .then((reg) => {
                if (reg && observers.get(effect.id) === o && !o.attached)
                  o.attach(reg);
              })
              .catch(() => {});
          return;
        }
        case "unobserve":
          return stopObserver(effect.id);
        case "online": {
          stopOnline(effect.id);
          const now = (): boolean => isOnline() ?? true;
          send(effect.onChange, now());
          const t = evTarget();
          if (!t) return;
          const on = (): void => send(effect.onChange, true);
          const off = (): void => send(effect.onChange, false);
          t.addEventListener("online", on);
          t.addEventListener("offline", off);
          onlines.set(effect.id, () => {
            t.removeEventListener("online", on);
            t.removeEventListener("offline", off);
          });
          return;
        }
        case "unobserveOnline":
          return stopOnline(effect.id);
        case "cachePut": {
          const cs = needCaches(effect);
          if (!cs) return;
          settle(effect, async () => {
            const spec = effect.request ?? effect.url;
            if (!spec) return fail(failed("cachePut needs url or request"));
            const request = toRequest(spec, opts);
            const c = await cs.open(effect.cache);
            if (effect.response)
              await c.put(request, toResponse(effect.response, opts));
            else await c.add(request);
            return true;
          });
          return;
        }
        case "cacheMatch": {
          const cs = needCaches(effect);
          if (!cs) return;
          settle(effect, async () => {
            const c = await cs.open(effect.cache);
            const res = await c.match(
              effect.url,
              effect.ignoreSearch ? { ignoreSearch: true } : undefined,
            );
            if (!res) return null;
            const headers: Record<string, string> = {};
            res.headers?.forEach?.((v: string, k: string) => (headers[k] = v));
            return {
              status: res.status,
              headers,
              body: await res.text(),
            } satisfies CachedResponse;
          });
          return;
        }
        case "cacheDelete": {
          const cs = needCaches(effect);
          if (!cs) return;
          settle(effect, async () =>
            effect.url
              ? (await cs.open(effect.cache)).delete(effect.url)
              : cs.delete(effect.cache),
          );
          return;
        }
        case "cacheKeys": {
          const cs = needCaches(effect);
          if (!cs) return;
          settle(effect, async () =>
            effect.cache
              ? (await (await cs.open(effect.cache)).keys()).map((r) => r.url)
              : cs.keys(),
          );
          return;
        }
        case "cacheClear": {
          const cs = needCaches(effect);
          if (!cs) return;
          settle(effect, async () => {
            if (effect.cache) {
              const c = await cs.open(effect.cache);
              const keys = await c.keys();
              await Promise.all(keys.map((k) => c.delete(k)));
              return keys.length;
            }
            const names = await cs.keys();
            await Promise.all(names.map((n) => cs.delete(n)));
            return names.length;
          });
          return;
        }
        case "notify": {
          if (!needSw(effect)) return;
          settle(effect, async () => {
            const reg =
              (await getReg(effect.registration)) ?? fail(notRegistered);
            if (!reg.showNotification)
              return fail(unsupported("registration.showNotification"));
            await reg.showNotification(effect.title, effect.options);
            return true;
          });
          return;
        }
        case "notificationPermission": {
          const N = notif();
          if (!N) return send(effect.onError, unsupported("Notification"));
          settle(effect, () => N.requestPermission());
          return;
        }
      }
    },
    registrations: () => [...regs.keys()],
    observers: () => [...observers.keys()],
    onlineObservers: () => [...onlines.keys()],
    dispose() {
      gen++;
      for (const id of [...observers.keys()]) stopObserver(id);
      for (const id of [...onlines.keys()]) stopOnline(id);
      regs.clear();
    },
  };
}

function toRequest(
  spec: string | SwRequestSpec,
  opts: ServiceWorkerPluginOptions,
) {
  if (typeof spec === "string") return spec;
  if (!spec.method && !spec.headers) return spec.url;
  const R = opts.Request ?? (globalThis as any).Request;
  return R
    ? new R(spec.url, { method: spec.method, headers: spec.headers })
    : spec.url;
}

function toResponse(spec: SwResponseSpec, opts: ServiceWorkerPluginOptions) {
  const R = opts.Response ?? (globalThis as any).Response;
  const headers = { ...spec.headers };
  let body = spec.body;
  if (body !== undefined && body !== null && typeof body !== "string") {
    body = JSON.stringify(body);
    if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type"))
      headers["content-type"] = "application/json";
  }
  return new R(body ?? null, { status: spec.status ?? 200, headers });
}

export { serviceWorkerEffector } from "./helpers.ts";
export type { ServiceWorkerEffector } from "./helpers.ts";
export { workerSource } from "./worker-template.ts";
export type { WorkerSourceOptions, CacheStrategy } from "./worker-template.ts";
