import type { Plugin } from "../../core/types.ts";
import { distance, type LatLng } from "./geo.ts";

export interface GeoOptions {
  enableHighAccuracy?: boolean;
  /** ms */
  timeout?: number;
  /** ms */
  maximumAge?: number;
}

/** Plain, serializable position (not a live `GeolocationPosition`). */
export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export type GeoErrorCode =
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "TIMEOUT"
  | "UNSUPPORTED";

export interface GeoError {
  code: GeoErrorCode;
  message: string;
}

export type GeoPermission = "granted" | "denied" | "prompt" | "unsupported";

/** Payload of a geofence `onChange`. */
export interface GeofenceEvent {
  event: "enter" | "leave";
  /** Metres from the fence centre. */
  distance: number;
  position: GeoPosition;
}

export type GeolocationEffect =
  /** One-shot position. */
  | {
      plugin: "geolocation";
      type: "current";
      options?: GeoOptions;
      onSuccess: string;
      onError?: string;
    }
  /** (Re)starts the watch `id`; every fix is `onChange` with a GeoPosition. */
  | {
      plugin: "geolocation";
      type: "watch";
      id: string;
      options?: GeoOptions;
      onChange: string;
      onError?: string;
    }
  | { plugin: "geolocation"; type: "clearWatch"; id: string }
  /** Stops every watch, geofence and permission observer. */
  | { plugin: "geolocation"; type: "clearAll" }
  /** Replies with a GeoPermission. */
  | {
      plugin: "geolocation";
      type: "permission";
      onSuccess: string;
      onError?: string;
    }
  /** Replies with the current GeoPermission at once, then on every change. */
  | {
      plugin: "geolocation";
      type: "observePermission";
      id: string;
      onChange: string;
    }
  | { plugin: "geolocation"; type: "unobservePermission"; id: string }
  /** Enter/leave events on top of a watch. Restarts fence `id`. */
  | {
      plugin: "geolocation";
      type: "geofence";
      id: string;
      center: LatLng;
      /** Metres. */
      radius: number;
      /** Extra metres outside the radius before `leave` fires. Default 10% of radius. */
      hysteresis?: number;
      options?: GeoOptions;
      onChange: string;
      onError?: string;
    }
  | { plugin: "geolocation"; type: "clearGeofence"; id: string };

export interface GeolocationLike {
  getCurrentPosition(
    ok: (p: any) => void,
    err: (e: any) => void,
    options?: GeoOptions,
  ): void;
  watchPosition(
    ok: (p: any) => void,
    err: (e: any) => void,
    options?: GeoOptions,
  ): number;
  clearWatch(handle: number): void;
}

export interface PermissionStatusLike {
  state: string;
  addEventListener?(type: "change", fn: () => void): void;
  removeEventListener?(type: "change", fn: () => void): void;
  onchange?: ((ev: unknown) => void) | null;
}

export interface GeoNavigatorLike {
  geolocation?: GeolocationLike;
  permissions?: {
    query(d: { name: string }): Promise<PermissionStatusLike>;
  };
}

export interface GeolocationPluginOptions {
  /** Defaults to `globalThis.navigator`. Pass `undefined` to simulate SSR. */
  navigator?: GeoNavigatorLike;
}

export interface GeolocationPlugin extends Plugin<GeolocationEffect, any> {
  /** Ids of running watches. */
  watches(): string[];
  /** Ids of running geofences. */
  geofences(): string[];
  /** Ids of permission observers. */
  permissionObservers(): string[];
}

const NAMES: Record<number, GeoErrorCode> = {
  1: "PERMISSION_DENIED",
  2: "POSITION_UNAVAILABLE",
  3: "TIMEOUT",
};

export function toGeoError(e: any): GeoError {
  const code = NAMES[e?.code as number] ?? "POSITION_UNAVAILABLE";
  return { code, message: String(e?.message ?? code) };
}

export function toGeoPosition(p: any): GeoPosition {
  const c = p.coords ?? {};
  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: c.accuracy,
    altitude: c.altitude ?? null,
    altitudeAccuracy: c.altitudeAccuracy ?? null,
    heading: c.heading ?? null,
    speed: c.speed ?? null,
    timestamp: p.timestamp,
  };
}

const UNSUPPORTED: GeoError = {
  code: "UNSUPPORTED",
  message: "Geolocation is not available in this environment",
};

/** Geolocation: one-shot position, watches, permission and geofences. */
export function createGeolocationPlugin(
  opts: GeolocationPluginOptions = {},
): GeolocationPlugin {
  const nav = (): GeoNavigatorLike | undefined =>
    "navigator" in opts
      ? opts.navigator
      : ((globalThis as any).navigator as GeoNavigatorLike | undefined);
  const geo = (): GeolocationLike | undefined => nav()?.geolocation;

  const watches = new Map<string, () => void>();
  const fences = new Map<string, () => void>();
  const observers = new Map<string, () => void>();

  const stop = (m: Map<string, () => void>, id: string): void => {
    m.get(id)?.();
    m.delete(id);
  };
  const stopAll = (m: Map<string, () => void>): void => {
    for (const id of [...m.keys()]) stop(m, id);
  };

  const watchPosition = (
    g: GeolocationLike,
    options: GeoOptions | undefined,
    ok: (p: GeoPosition) => void,
    err: (e: GeoError) => void,
  ): (() => void) => {
    const h = g.watchPosition(
      (p) => ok(toGeoPosition(p)),
      (e) => err(toGeoError(e)),
      options,
    );
    return () => g.clearWatch(h);
  };

  return {
    name: "geolocation",
    handle(effect, ctx) {
      const send = (id: string | undefined, payload?: unknown): void => {
        if (id) ctx.dispatch({ id, payload });
      };
      switch (effect.type) {
        case "current": {
          const g = geo();
          if (!g) return send(effect.onError, UNSUPPORTED);
          try {
            g.getCurrentPosition(
              (p) => send(effect.onSuccess, toGeoPosition(p)),
              (e) => send(effect.onError, toGeoError(e)),
              effect.options,
            );
          } catch (e) {
            send(effect.onError, toGeoError(e));
          }
          return;
        }
        case "watch": {
          stop(watches, effect.id);
          const g = geo();
          if (!g) return send(effect.onError, UNSUPPORTED);
          try {
            watches.set(
              effect.id,
              watchPosition(
                g,
                effect.options,
                (p) => send(effect.onChange, p),
                (e) => send(effect.onError, e),
              ),
            );
          } catch (e) {
            send(effect.onError, toGeoError(e));
          }
          return;
        }
        case "clearWatch":
          return stop(watches, effect.id);
        case "geofence": {
          stop(fences, effect.id);
          const g = geo();
          if (!g) return send(effect.onError, UNSUPPORTED);
          const hysteresis = effect.hysteresis ?? effect.radius * 0.1;
          let inside: boolean | null = null;
          try {
            fences.set(
              effect.id,
              watchPosition(
                g,
                effect.options,
                (position) => {
                  const d = distance(position, effect.center);
                  const next =
                    inside === null
                      ? d <= effect.radius
                      : inside
                        ? d <= effect.radius + hysteresis
                        : d <= effect.radius;
                  const first = inside === null;
                  if (next === inside) return;
                  inside = next;
                  // starting outside is not a "leave"
                  if (first && !next) return;
                  send(effect.onChange, {
                    event: next ? "enter" : "leave",
                    distance: d,
                    position,
                  } satisfies GeofenceEvent);
                },
                (e) => send(effect.onError, e),
              ),
            );
          } catch (e) {
            send(effect.onError, toGeoError(e));
          }
          return;
        }
        case "clearGeofence":
          return stop(fences, effect.id);
        case "clearAll":
          stopAll(watches);
          stopAll(fences);
          stopAll(observers);
          return;
        case "permission": {
          const q = nav()?.permissions?.query;
          if (!q) return send(effect.onSuccess, "unsupported");
          Promise.resolve()
            .then(() => nav()!.permissions!.query({ name: "geolocation" }))
            .then(
              (s) => send(effect.onSuccess, normalizePermission(s.state)),
              (e) =>
                send(effect.onError, {
                  code: "UNSUPPORTED",
                  message: String(e?.message ?? e),
                } satisfies GeoError),
            );
          return;
        }
        case "observePermission": {
          stop(observers, effect.id);
          const q = nav()?.permissions?.query;
          if (!q) return send(effect.onChange, "unsupported");
          let cancelled = false;
          let detach = (): void => {};
          observers.set(effect.id, () => {
            cancelled = true;
            detach();
          });
          Promise.resolve()
            .then(() => nav()!.permissions!.query({ name: "geolocation" }))
            .then(
              (s) => {
                if (cancelled) return;
                const fn = (): void =>
                  send(effect.onChange, normalizePermission(s.state));
                if (s.addEventListener) {
                  s.addEventListener("change", fn);
                  detach = () => s.removeEventListener?.("change", fn);
                } else {
                  s.onchange = fn;
                  detach = () => {
                    s.onchange = null;
                  };
                }
                fn();
              },
              () => {
                if (!cancelled) send(effect.onChange, "unsupported");
              },
            );
          return;
        }
        case "unobservePermission":
          return stop(observers, effect.id);
      }
    },
    watches: () => [...watches.keys()],
    geofences: () => [...fences.keys()],
    permissionObservers: () => [...observers.keys()],
    dispose() {
      stopAll(watches);
      stopAll(fences);
      stopAll(observers);
    },
  };
}

function normalizePermission(s: string): GeoPermission {
  return s === "granted" || s === "denied" || s === "prompt"
    ? s
    : "unsupported";
}

export { geolocationEffector } from "./helpers.ts";
export type { GeolocationEffector } from "./helpers.ts";
export * as geo from "./geo.ts";
