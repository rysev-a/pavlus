# video

Controls and observes `<video>` elements. Attach to an element on the page by selector, or create an off-DOM one; everything is addressed by `id`.

```ts
import { videoEffector as video } from "@service-laboratory/pavlus/plugins/video";
import { createVideoPlugin } from "@service-laboratory/pavlus/plugins/video";

// app: (message, state) => effects
case "hero.mount":
  return [
    video.load({ id: "hero", target: "#hero", src: "/a.mp4", onSuccess: "hero.ready", onError: "hero.failed" }),
    video.observe({ id: "hero", onChange: "hero.state", intervalMs: 250 }),
  ];
case "hero.toggle": return [video.play("hero", "hero.blocked")];   // autoplay rejection -> hero.blocked
case "hero.snap":   return [video.captureFrame({ id: "hero", onSuccess: "hero.frame" })];
```

| Effect                            | Fields                                                                                       | Reply                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `load`                            | `id`, `target?` (selector or element), `src` or `sources[{src,type}]`, `poster?`, `preload?` | `onSuccess` `{duration,width,height}` on `loadedmetadata`; `onError` `{name,message,code?}`               |
| `play` / `toggle`                 | `id`, `onError?`                                                                             | rejection (e.g. `NotAllowedError`) goes to `onError`, never the console                                   |
| `pause`                           | `id`                                                                                         |                                                                                                           |
| `seek`                            | `id`, `time`                                                                                 |                                                                                                           |
| `volume`                          | `id`, `value` (clamped 0..1)                                                                 |                                                                                                           |
| `mute` / `loop`                   | `id`, `muted` / `value`                                                                      |                                                                                                           |
| `rate`                            | `id`, `value`                                                                                |                                                                                                           |
| `fullscreen` / `pictureInPicture` | `id`, `on`, `onError?`                                                                       | `UnsupportedError` when the API is missing                                                                |
| `observe`                         | `id`, `onChange`, `events?`, `intervalMs?`                                                   | snapshot `{currentTime,duration,paused,ended,volume,muted,rate,buffered:[start,end][],readyState,error?}` |
| `unload`                          | `id`                                                                                         | releases `src`, removes listeners                                                                         |
| `captureFrame`                    | `id`, `imageType?`, `onSuccess`, `onError?`                                                  | data URL drawn on an offscreen canvas                                                                     |

## Notes

- `onError` of `play`, `fullscreen`, ... falls back to the `onError` given to `load`. With neither, errors are dropped silently.
- `observe` has one observer per id (a new one replaces the old). `intervalMs` throttles only the high-frequency `timeupdate`/`progress` events; `play`, `pause`, `ended`, `error`, ... are always delivered. Default events: `timeupdate play pause ended volumechange waiting canplay error`.
- `load` on an existing id releases the previous element first. When the `target` is a page element, `src` may be omitted to just attach to it; `unload` only clears `src` if the plugin set it.
- A `sources` list picks the first entry the element's `canPlayType` accepts, else the first.
- Effects for an unknown id throw (except `unload`). Without a DOM (SSR) every effect is a no-op that replies `onError` `{name:"UnsupportedError"}` where it has one.
- Options: `createVideoPlugin({ document, now })` - pass a fake `document` (or `null`) in tests. `plugin.videos()` lists managed ids; `dispose()` unloads everything.
- The effect discriminator is `type`, so the image type of `captureFrame` is called `imageType`.
