# geolocation

Position, watches, permission and geofences. The browser's `navigator.geolocation` /
`navigator.permissions` are injectable (`createGeolocationPlugin({ navigator })`); without them
every effect replies `onError` with `{ code: "UNSUPPORTED" }` (permission replies `'unsupported'`).

| Effect                | Fields                                                                                                     | Replies                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `current`             | `options?`, `onSuccess`, `onError?`                                                                        | `GeoPosition` / `GeoError`                       |
| `watch`               | `id`, `options?`, `onChange`, `onError?`                                                                   | `GeoPosition` per fix. Same id restarts.         |
| `clearWatch`          | `id`                                                                                                       |                                                  |
| `clearAll`            |                                                                                                            | stops watches, geofences, permission observers   |
| `permission`          | `onSuccess`, `onError?`                                                                                    | `'granted'｜'denied'｜'prompt'｜'unsupported'`   |
| `observePermission`   | `id`, `onChange`                                                                                           | current permission at once, then on every change |
| `unobservePermission` | `id`                                                                                                       |                                                  |
| `geofence`            | `id`, `center`, `radius` (m), `hysteresis?` (m, default 10% of radius), `options?`, `onChange`, `onError?` | `{event: 'enter'｜'leave', distance, position}`  |
| `clearGeofence`       | `id`                                                                                                       |                                                  |

`GeoPosition = {lat, lng, accuracy, altitude, altitudeAccuracy, heading, speed, timestamp}` (plain data).
`GeoError = {code: 'PERMISSION_DENIED'｜'POSITION_UNAVAILABLE'｜'TIMEOUT'｜'UNSUPPORTED', message}`.

Geofence: built on a watch. The first fix sets the state (inside fires `enter`; outside fires nothing).
Afterwards `enter` fires at distance <= radius and `leave` only beyond `radius + hysteresis`, which stops
flapping on the boundary.

## Pure helpers (`geo.ts`, also exported as `geo`)

`distance` (haversine, metres), `bearing`, `destination`, `boundingBox` (antimeridian and poles handled),
`inBox`, `isInside(point, center, radius)`, `formatLat/formatLng/formatLatLng` (`decimal` or `dms`).

## Example

```ts
import {
  geolocationEffector as geolocation,
  geo,
} from "@pavlus/client/plugins/geolocation";

const home = { lat: 52.52, lng: 13.405 };
const app = (msg, state) => {
  switch (msg.id) {
    case "start":
      return [
        geolocation.watch({
          id: "me",
          options: { enableHighAccuracy: true },
          onChange: "moved",
          onError: "geoFailed",
        }),
        geolocation.geofence({
          id: "home",
          center: home,
          radius: 150,
          onChange: "homeFence",
        }),
      ];
    case "moved": // pure: use the helpers in handlers
      return [
        store.set("me", {
          ...msg.payload,
          away: geo.distance(msg.payload, home),
          label: geo.formatLatLng(msg.payload),
        }),
      ];
    case "homeFence":
      return [store.set("atHome", msg.payload.event === "enter")];
    case "geoFailed":
      return [store.set("geoError", msg.payload.code)];
  }
  return [];
};
```

Notes: errors during a watch do not end it (stop it with `clearWatch`). Positions are copied into plain
objects so they can be stored and serialized.
