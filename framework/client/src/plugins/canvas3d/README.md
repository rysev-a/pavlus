# canvas3d plugin

3D on a 2D canvas, from data. The app describes a scene — flat polygons in world space and an
orbit camera — and the plugin projects it (perspective, back-face culling, painter's algorithm)
into a list of `canvas` ops and hands them to the [canvas plugin](../canvas/README.md), which must
be mounted next to it. No WebGL, no dependencies; the whole projection is a pure function you can
test without a DOM.

| effect   | fields                                                   | reply                          |
| -------- | -------------------------------------------------------- | ------------------------------ |
| `render` | `target`, `scene`, `width`, `height`, `onError?`         | `onError` (from the canvas)    |

`width`/`height` are the logical (CSS px) size of the canvas, the one given to `canvas.size`.

## Scene

```ts
type Vec3 = readonly [number, number, number];
interface Poly3 { points: Vec3[]; fill?: string; stroke?: string; lineWidth?: number;
                  normal?: Vec3; twoSided?: boolean; tag?: string }
interface Camera3 { yaw: number; pitch: number; distance: number; focal: number }
interface Scene3 { camera: Camera3; polys: Poly3[]; background?: string; cull?: boolean }
```

World is right-handed: x right, y up, z towards the viewer at `yaw = pitch = 0`; the camera sits
`distance` away from the origin and always looks at it. List a polygon's points counter-clockwise
as seen from outside (or pass the outward `normal`): faces turned away are skipped.

## Pure helpers

- `sceneOps(scene, size)` — the canvas ops of the scene (what `render` draws)
- `project(scene, size)` — the screen polygons, far to near
- `orbit(camera, dx, dy)` — the camera after a drag of `dx`, `dy` pixels (pitch is kept in range)
- `pick(scene, size, x, y)` — the nearest polygon under a point, by index and `tag`

## Example

```ts
import { canvasEffector as canvas, createCanvasPlugin } from "@pavlus/client/plugins/canvas";
import { canvas3dEffector as canvas3d, createCanvas3dPlugin, orbit } from "@pavlus/client/plugins/canvas3d";

createApp({ app, plugins: [store, new DomPlugin(), createCanvasPlugin(), createCanvas3dPlugin()] });

// in the app
start: () => [canvas.size("#view", 480, 400), canvas.pointer("mouse", "#view", "mouse")],
mouse: (msg, s) => {
  const { type, x, y, down } = msg.payload;
  const camera = type === "pointermove" && down ? orbit(s.camera, x - s.x, y - s.y) : s.camera;
  return [store.merge({ camera, x, y }), canvas3d.render("#view", { camera, polys: s.polys }, { width: 480, height: 400 })];
},
```

A full application — a Rubik's cube turning in 3D next to its flat net — is in
[`applications/rubik`](../../../../../applications/rubik).
