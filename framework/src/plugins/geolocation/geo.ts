/** Pure geodesy helpers. No browser, no side effects: safe inside pure app handlers. */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Mean earth radius in metres (IUGG). */
export const EARTH_RADIUS_M = 6371008.8;

const toRad = (d: number): number => (d * Math.PI) / 180;
const toDeg = (r: number): number => (r * 180) / Math.PI;
const wrapLng = (lng: number): number =>
  ((((lng + 180) % 360) + 360) % 360) - 180;

/** Great-circle distance in metres (haversine). */
export function distance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from `a` to `b` in degrees clockwise from north, [0, 360). */
export function bearing(a: LatLng, b: LatLng): number {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(p2);
  const x =
    Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** The point reached from `from` after `meters` along `bearingDeg`. */
export function destination(
  from: LatLng,
  meters: number,
  bearingDeg: number,
): LatLng {
  const d = meters / EARTH_RADIUS_M;
  const t = toRad(bearingDeg);
  const p1 = toRad(from.lat);
  const l1 = toRad(from.lng);
  const p2 = Math.asin(
    Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t),
  );
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(t) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2),
    );
  return { lat: toDeg(p2), lng: wrapLng(toDeg(l2)) };
}

/**
 * Smallest lat/lng box containing the circle of `radius` metres around `center`.
 * If it crosses the antimeridian, `west > east`. If it contains a pole the box
 * spans all longitudes.
 */
export function boundingBox(center: LatLng, radius: number): BoundingBox {
  const north = destination(center, radius, 0).lat;
  const south = destination(center, radius, 180).lat;
  const angular = radius / EARTH_RADIUS_M;
  const latR = toRad(center.lat);
  if (center.lat + toDeg(angular) >= 90 || center.lat - toDeg(angular) <= -90) {
    return {
      south: Math.max(-90, center.lat - toDeg(angular)),
      north: Math.min(90, center.lat + toDeg(angular)),
      west: -180,
      east: 180,
    };
  }
  const dLng = Math.asin(Math.sin(angular) / Math.cos(latR));
  return {
    south,
    north,
    west: wrapLng(center.lng - toDeg(dLng)),
    east: wrapLng(center.lng + toDeg(dLng)),
  };
}

/** Is `point` inside the box (antimeridian aware)? */
export function inBox(point: LatLng, box: BoundingBox): boolean {
  if (point.lat < box.south || point.lat > box.north) return false;
  return box.west <= box.east
    ? point.lng >= box.west && point.lng <= box.east
    : point.lng >= box.west || point.lng <= box.east;
}

/** Is `point` within `radius` metres of `center` (inclusive)? */
export function isInside(
  point: LatLng,
  center: LatLng,
  radius: number,
): boolean {
  return distance(point, center) <= radius;
}

export interface FormatOptions {
  /** `decimal` (default) or `dms` (degrees, minutes, seconds with hemisphere). */
  style?: "decimal" | "dms";
  /** Decimals for `decimal` (default 5) or for seconds in `dms` (default 1). */
  digits?: number;
}

function formatAxis(value: number, axis: "lat" | "lng", o: FormatOptions) {
  if (o.style !== "dms") return value.toFixed(o.digits ?? 5);
  const digits = o.digits ?? 1;
  const unit = 10 ** digits;
  // work in integer units of the last second digit to avoid 59.99 -> 60.0
  const total = Math.round(Math.abs(value) * 3600 * unit);
  const deg = Math.floor(total / (3600 * unit));
  const min = Math.floor((total % (3600 * unit)) / (60 * unit));
  const sec = (total % (60 * unit)) / unit;
  const hemi = axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  return `${deg}°${min}'${sec.toFixed(digits)}"${hemi}`;
}

export function formatLat(lat: number, o: FormatOptions = {}): string {
  return formatAxis(lat, "lat", o);
}

export function formatLng(lng: number, o: FormatOptions = {}): string {
  return formatAxis(lng, "lng", o);
}

/** `"52.52000, 13.40500"` or `52°31'12.0"N 13°24'18.0"E`. */
export function formatLatLng(p: LatLng, o: FormatOptions = {}): string {
  const sep = o.style === "dms" ? " " : ", ";
  return `${formatLat(p.lat, o)}${sep}${formatLng(p.lng, o)}`;
}
