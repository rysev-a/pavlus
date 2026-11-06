# audio

Sound without a DOM: `Audio` elements by `id`, WebAudio tones and analysis, Media Session, and pure playlist helpers.

```ts
import { audioEffector as audio, playlist } from "@pavlus/frontend/plugins/audio";

case "player.start":
  return [
    audio.load({ id: "track", src: state.tracks[state.index], onError: "player.error" }),
    audio.play("track", { onEnded: "player.ended" }),
    audio.observe({ id: "track", onChange: "player.state", intervalMs: 500 }),
    audio.mediaSession({ title: "Song", artist: "Band", actions: { play: "player.play", next: "player.next", seek: "player.seek" } }),
  ];
case "player.ended": {
  const i = playlist.next(state.tracks.length, state.index, state.repeat); // pure; the app owns the state
  return i === playlist.NO_TRACK ? [] : [/* load + play track i */];
}
case "ui.click": return [audio.tone({ frequency: 880, ms: 80 })];
```

| Effect                                       | Fields                                                                                                        | Reply                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `load`                                       | `id`, `src`, `preload?`                                                                                       | `onSuccess` `{duration}`; `onError` `{name,message,code?}`                                |
| `play`                                       | `id`, `from?`, `onEnded?`, `onError?`                                                                         | `onEnded` (no payload); autoplay rejection -> `onError` `{name:"NotAllowedError",...}`    |
| `pause` / `stop`                             | `id` (`stop` rewinds to 0)                                                                                    |                                                                                           |
| `seek` / `volume` / `mute` / `loop` / `rate` | `id`, `time` / `value` / `muted` / `value` / `value`                                                          |                                                                                           |
| `fade`                                       | `id`, `to`, `ms`, `onSuccess?`                                                                                | linear ramp (50 ms steps); `onSuccess` when complete; a new `fade` or `volume` cancels it |
| `observe`                                    | `id`, `onChange`, `events?`, `intervalMs?`                                                                    | same snapshot as `video`                                                                  |
| `unload` / `unloadAll`                       | `id`                                                                                                          | release `src`, listeners, graph                                                           |
| `tone`                                       | `frequency`, `ms`, `wave?`, `volume?` (default 0.2), `onEnded?`, `onError?`                                   | oscillator beep                                                                           |
| `analyse`                                    | `id`, `onChange`, `fftSize?`, `bands?` (8), `intervalMs?` (100), `onError?`                                   | `{level, bands:number[]}`, values 0..1                                                    |
| `stopAnalyse`                                | `id`                                                                                                          | stops polling, keeps the audio graph so sound continues                                   |
| `mediaSession`                               | `title?`, `artist?`, `album?`, `artwork?`, `actions?` {play,pause,next,previous,seek: message id}, `onError?` | handlers dispatch the action details; `seek` gets `{seekTime}`                            |

## Playlist helpers

`next(length, index, loop?)`, `prev(...)` return an index or `-1` (`NO_TRACK`) at the end; `shuffle(items, random?)` returns a shuffled copy. Pure functions, no hidden state; also available as the `playlist` object.

## Notes

- The `AudioContext` is created lazily on the first `tone`/`analyse` (call these from a user gesture) and resumed on every `play`/`tone`/`analyse`. `createMediaElementSource` may wrap an element only once, so the graph is kept per sound until `unload`.
- Options for tests and exotic hosts: `createAudioPlugin({ Audio, AudioContext, mediaSession, MediaMetadata, now, setInterval, clearInterval })`. Pass `null` to simulate a missing API: those effects reply `onError` `{name:"UnsupportedError"}`; others become no-ops.
- Unknown ids throw (except `unload`). `play`'s `onError` falls back to the `onError` of `load`. `plugin.sounds()` lists ids; `dispose()` unloads all, stops tones, removes Media Session handlers and closes the context.
- The effect discriminator is `type`, so the oscillator waveform of `tone` is `wave`.
