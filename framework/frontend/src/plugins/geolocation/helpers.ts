import type { LatLng } from "./geo.ts";
import type { GeolocationEffect, GeoOptions } from "./mod.ts";

type Of<T extends GeolocationEffect["type"]> = Extract<
  GeolocationEffect,
  { type: T }
>;

/** Drops `undefined` keys so effects stay minimal and comparable. */
function build<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[])
    if (o[k] === undefined) delete o[k];
  return o;
}

/** Builders for geolocation effects. */
export interface GeolocationEffector {
  /** One-shot position; replies a GeoPosition to `onSuccess`. */
  current(p: {
    options?: GeoOptions;
    onSuccess: string;
    onError?: string;
  }): Of<"current">;
  /** Stream positions to `onChange`. Starting the same id again restarts it. */
  watch(p: {
    id: string;
    options?: GeoOptions;
    onChange: string;
    onError?: string;
  }): Of<"watch">;
  clearWatch(id: string): Of<"clearWatch">;
  /** Stops watches, geofences and permission observers. */
  clearAll(): Of<"clearAll">;
  /** Replies 'granted' | 'denied' | 'prompt' | 'unsupported'. */
  permission(p: { onSuccess: string; onError?: string }): Of<"permission">;
  observePermission(p: {
    id: string;
    onChange: string;
  }): Of<"observePermission">;
  unobservePermission(id: string): Of<"unobservePermission">;
  /** `onChange` receives `{event: 'enter'|'leave', distance, position}`. */
  geofence(p: {
    id: string;
    center: LatLng;
    radius: number;
    hysteresis?: number;
    options?: GeoOptions;
    onChange: string;
    onError?: string;
  }): Of<"geofence">;
  clearGeofence(id: string): Of<"clearGeofence">;
}

/**
 * ```ts
 * import { geolocationEffector as geolocation } from "@pavlus/frontend/plugins/geolocation";
 *
 * return [geolocation.watch({ id: "me", onChange: "moved", onError: "geoFailed" })];
 * ```
 */
export const geolocationEffector: GeolocationEffector = {
  current: (p) => build({ plugin: "geolocation", type: "current", ...p }),
  watch: (p) => build({ plugin: "geolocation", type: "watch", ...p }),
  clearWatch: (id) => ({ plugin: "geolocation", type: "clearWatch", id }),
  clearAll: () => ({ plugin: "geolocation", type: "clearAll" }),
  permission: (p) => build({ plugin: "geolocation", type: "permission", ...p }),
  observePermission: (p) => ({
    plugin: "geolocation",
    type: "observePermission",
    ...p,
  }),
  unobservePermission: (id) => ({
    plugin: "geolocation",
    type: "unobservePermission",
    id,
  }),
  geofence: (p) => build({ plugin: "geolocation", type: "geofence", ...p }),
  clearGeofence: (id) => ({ plugin: "geolocation", type: "clearGeofence", id }),
};
