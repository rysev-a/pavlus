# canvas plugin

2D canvas drawing from data. The app builds a list of plain-data ops; the plugin interprets
them with a fixed `switch` (no `eval`, no dynamic method lookup). The whole list is validated
before anything is drawn: an unknown or malformed op replies `onError` and draws nothing.

| effect        | fields                                                     | reply                                                                |
| ------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `draw`        | `target` (selector or canvas), `ops`, `clear?`, `onError?` | `onError` `{code, message, index?}`                                  |
| `loadImage`   | `id`, `src`, `onSuccess?`, `onError?`                      | `onSuccess` `{id,width,height}`                                      |
| `size`        | `target`, `width`, `height`, `dpr?`                        | - (CSS size; backing store is `size*dpr`)                            |
| `frames`      | `id`, `onFrame`, `target?`                                 | `onFrame` `{time, dt, frame, width?, height?}` every animation frame |
| `stopFrames`  | `id`                                                       | -                                                                    |
| `pointer`     | `id`, `target`, `onChange`                                 | `onChange` `{type, x, y, nx, ny, button, buttons, down}`             |
| `stopPointer` | `id`                                                       | -                                                                    |
| `snapshot`    | `target`, `mime?`, `quality?`, `onSuccess`, `onError?`     | `onSuccess` data URL                                                 |

Ops (`{ op: ... }`): `fillRect strokeRect clearRect rect`, `beginPath closePath moveTo lineTo arc ellipse
bezierCurveTo quadraticCurveTo fill stroke clip`, `fillText strokeText`, `drawImage {image: id, x, y, w?, h?, sx?, sy?, sw?, sh?}`,
`save restore translate rotate scale setTransform`, setters `fillStyle strokeStyle lineWidth font globalAlpha lineCap
lineJoin textAlign textBaseline shadowColor shadowBlur shadowOffsetX shadowOffsetY` (all `{op, value}`), `setLineDash {segments}`,
and gradients `linearGradient` / `radialGradient {name, ..., stops: [{offset, color}]}`, used as `{op:"fillStyle", value:{gradient:"name"}}`.

## Example

```ts
import { canvasEffector as canvas } from "@pavlus/client/plugins/canvas";

const app: AppFn<Game> = (msg, s) => {
  switch (msg.id) {
    case "start":
      return [
        canvas.size("#game", 320, 240),
        canvas.frames("loop", "tick", "#game"),
        canvas.pointer("mouse", "#game", "mouse"),
      ];
    case "tick": {
      const { dt } = msg.payload as { dt: number };
      const next = step(s, dt); // pure game logic; state update is done by the store plugin
      return [
        canvas.draw(
          "#game",
          [
            { op: "fillStyle", value: "#222" },
            { op: "fillRect", x: 0, y: 0, w: 320, h: 240 },
            { op: "fillStyle", value: "gold" },
            { op: "beginPath" },
            {
              op: "arc",
              x: next.x,
              y: next.y,
              r: 8,
              start: 0,
              end: Math.PI * 2,
            },
            { op: "fill" },
          ],
          { onError: "drawFailed" },
        ),
      ];
    }
    case "quit":
      return [canvas.stopFrames("loop"), canvas.stopPointer("mouse")];
  }
  return [];
};
```

## Notes

- Each `draw` runs inside `save()`/`restore()`; unbalanced `save`s are closed, and `restore` without `save`
  is rejected. Style does not leak between draws: set it in every list.
- Coordinates are logical (CSS) pixels. After `size`, the context is scaled by `dpr`
  (default `devicePixelRatio`); `setTransform` is applied on top of that scale. `clear: true` wipes the whole backing store.
- Gradients live for one `draw` call and must be defined before use. Images persist per `id` (reloading an id replaces it);
  `drawImage` of an unloaded id is rejected.
- Pointer `x`/`y` are in canvas logical coordinates, `nx`/`ny` are 0..1 across the canvas.
- Without `onError`, invalid input throws; "unsupported" (no document, no `requestAnimationFrame`, no `Image`) is a silent no-op.
- Injectable for tests/SSR: `document`, `requestAnimationFrame`, `cancelAnimationFrame`, `Image`, `devicePixelRatio`.
  `validateOps(ops)` is exported for checking op lists in tests.
- `dispose()` stops all frame loops and pointer streams.
