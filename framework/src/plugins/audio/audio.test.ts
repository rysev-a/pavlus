import { describe, expect, test } from "vitest";
import type { Message } from "../../core/types.ts";
import {
  audioEffector as audio,
  createAudioPlugin,
  next,
  playlist,
  prev,
  shuffle,
  type AudioContextLike,
  type AudioLike,
  type MediaSessionLike,
} from "./mod.ts";

function harness() {
  const got: Message[] = [];
  return {
    got,
    ctx: {
      dispatch: (m: Message) => got.push(m),
      getState: () => undefined as never,
      dispatchEffect() {},
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

class FakeAudio implements AudioLike {
  static made: FakeAudio[] = [];
  src = "";
  preload = "";
  currentTime = 0;
  duration = NaN;
  paused = true;
  ended = false;
  volume = 1;
  muted = false;
  playbackRate = 1;
  loop = false;
  readyState = 0;
  error: { code?: number; message?: string } | null = null;
  buffered = { length: 0, start: () => 0, end: () => 0 };
  loads = 0;
  playError: unknown = null;
  listeners = new Map<string, Set<() => void>>();
  constructor() {
    FakeAudio.made.push(this);
  }
  play() {
    if (this.playError) return Promise.reject(this.playError);
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {
    this.loads++;
  }
  removeAttribute(n: string) {
    if (n === "src") this.src = "";
  }
  addEventListener(t: string, f: () => void) {
    (this.listeners.get(t) ?? this.listeners.set(t, new Set()).get(t)!).add(f);
  }
  removeEventListener(t: string, f: () => void) {
    this.listeners.get(t)?.delete(f);
  }
  emit(t: string) {
    [...(this.listeners.get(t) ?? [])].forEach((f) => f());
  }
  count() {
    return [...this.listeners.values()].reduce((n, s) => n + s.size, 0);
  }
}

class FakeAudioContext implements AudioContextLike {
  static made: FakeAudioContext[] = [];
  state = "suspended";
  currentTime = 10;
  destination = { dest: true };
  resumed = 0;
  oscs: any[] = [];
  analysers: any[] = [];
  sources: any[] = [];
  closed = false;
  fill = (_d: Uint8Array) => {};
  constructor() {
    FakeAudioContext.made.push(this);
  }
  resume() {
    this.resumed++;
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.closed = true;
  }
  createOscillator() {
    const o: any = {
      type: "",
      frequency: { value: 0 },
      onended: null,
      started: false,
      stoppedAt: undefined,
      disconnected: false,
      connect() {},
      disconnect() {
        o.disconnected = true;
      },
      start() {
        o.started = true;
      },
      stop(t?: number) {
        o.stoppedAt = t;
      },
    };
    this.oscs.push(o);
    return o;
  }
  createGain() {
    return { gain: { value: 0 }, connect() {}, disconnect() {} };
  }
  createAnalyser() {
    const self = this;
    const a: any = {
      fftSize: 0,
      get frequencyBinCount() {
        return a.fftSize / 2;
      },
      getByteFrequencyData: (d: Uint8Array) => self.fill(d),
      connect() {},
      disconnect() {
        a.disconnected = true;
      },
    };
    this.analysers.push(a);
    return a;
  }
  createMediaElementSource(el: unknown) {
    const s = { el, connect() {}, disconnect() {} };
    this.sources.push(s);
    return s;
  }
}

function setup(extra: Record<string, unknown> = {}) {
  FakeAudio.made = [];
  FakeAudioContext.made = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let n = 0;
  let t = 0;
  const p = createAudioPlugin({
    Audio: FakeAudio,
    AudioContext: FakeAudioContext,
    now: () => t,
    setInterval: (fn, ms) => (timers.set(++n, { fn, ms }), n),
    clearInterval: (h) => void timers.delete(h as number),
    ...extra,
  });
  return {
    p,
    timers,
    advance(ms: number) {
      t += ms;
      [...timers.values()].forEach((x) => x.fn());
    },
    ...harness(),
  };
}

describe("audio elements", () => {
  test("load replies metadata and errors, sets preload", () => {
    const { p, got, ctx } = setup();
    p.handle(
      audio.load({
        id: "a",
        src: "a.mp3",
        preload: "auto",
        onSuccess: "ok",
        onError: "bad",
      }),
      ctx,
    );
    const el = FakeAudio.made[0];
    expect([el.src, el.preload, el.loads]).toEqual(["a.mp3", "auto", 1]);
    el.duration = 30;
    el.emit("loadedmetadata");
    expect(got).toEqual([{ id: "ok", payload: { duration: 30 } }]);
    p.handle(audio.load({ id: "b", src: "x", onError: "bad" }), ctx);
    FakeAudio.made[1].error = { code: 4, message: "nope" };
    FakeAudio.made[1].emit("error");
    expect(got[1]).toEqual({
      id: "bad",
      payload: { name: "MediaError", message: "nope", code: 4 },
    });
    expect(p.sounds()).toEqual(["a", "b"]);
  });

  test("play / from / pause / stop / seek / volume / mute / loop / rate", () => {
    const { p, ctx } = setup();
    p.handle(audio.load({ id: "a", src: "a" }), ctx);
    const el = FakeAudio.made[0];
    p.handle(audio.play("a", { from: 4 }), ctx);
    expect([el.paused, el.currentTime]).toEqual([false, 4]);
    p.handle(audio.pause("a"), ctx);
    expect([el.paused, el.currentTime]).toEqual([true, 4]);
    p.handle(audio.play("a"), ctx);
    p.handle(audio.stop("a"), ctx);
    expect([el.paused, el.currentTime]).toEqual([true, 0]);
    p.handle(audio.seek("a", 9), ctx);
    p.handle(audio.volume("a", 2), ctx);
    p.handle(audio.mute("a"), ctx);
    p.handle(audio.loop("a"), ctx);
    p.handle(audio.rate("a", 2), ctx);
    expect([
      el.currentTime,
      el.volume,
      el.muted,
      el.loop,
      el.playbackRate,
    ]).toEqual([9, 1, true, true, 2]);
  });

  test("onEnded fires per play; cleared by a new play without it", () => {
    const { p, got, ctx } = setup();
    p.handle(audio.load({ id: "a", src: "a" }), ctx);
    const el = FakeAudio.made[0];
    p.handle(audio.play("a", { onEnded: "done" }), ctx);
    el.emit("ended");
    expect(got).toEqual([{ id: "done" }]);
    p.handle(audio.play("a"), ctx);
    el.emit("ended");
    expect(got).toHaveLength(1);
  });

  test("play rejection goes to onError, with fallback to load's", async () => {
    const { p, got, ctx } = setup();
    p.handle(audio.load({ id: "a", src: "a", onError: "loadErr" }), ctx);
    FakeAudio.made[0].playError = {
      name: "NotAllowedError",
      message: "gesture",
    };
    p.handle(audio.play("a", { onError: "blocked" }), ctx);
    p.handle(audio.play("a"), ctx);
    await tick();
    const payload = { name: "NotAllowedError", message: "gesture" };
    expect(got).toEqual([
      { id: "blocked", payload },
      { id: "loadErr", payload },
    ]);
  });

  test("fade ramps volume then replies; volume cancels a fade", () => {
    const { p, got, timers, advance, ctx } = setup();
    p.handle(audio.load({ id: "a", src: "a" }), ctx);
    const el = FakeAudio.made[0];
    p.handle(audio.fade("a", 0, 1000, "faded"), ctx);
    advance(500);
    expect(el.volume).toBeCloseTo(0.5);
    expect(got).toEqual([]);
    advance(500);
    expect(el.volume).toBe(0);
    expect(got).toEqual([{ id: "faded" }]);
    expect(timers.size).toBe(0);
    p.handle(audio.fade("a", 1, 1000, "faded2"), ctx);
    advance(250);
    p.handle(audio.volume("a", 0.1), ctx);
    expect(timers.size).toBe(0);
    advance(1000);
    expect(el.volume).toBe(0.1);
    expect(got).toHaveLength(1);
    p.handle(audio.fade("a", 0.5, 0, "instant"), ctx);
    expect(el.volume).toBe(0.5);
    expect(got[1]).toEqual({ id: "instant" });
  });

  test("a new fade replaces the running one", () => {
    const { p, timers, ctx } = setup();
    p.handle(audio.load({ id: "a", src: "a" }), ctx);
    p.handle(audio.fade("a", 0, 1000), ctx);
    p.handle(audio.fade("a", 1, 1000), ctx);
    expect(timers.size).toBe(1);
  });

  test("observe snapshots, throttle, replacement", () => {
    const { p, got, advance, ctx } = setup();
    p.handle(audio.load({ id: "a", src: "a" }), ctx);
    const el = FakeAudio.made[0];
    el.buffered = { length: 1, start: () => 0, end: () => 3 };
    p.handle(audio.observe({ id: "a", onChange: "chg", intervalMs: 500 }), ctx);
    el.emit("timeupdate");
    advance(100);
    el.emit("timeupdate");
    el.emit("play");
    expect(got).toHaveLength(2);
    expect(got[0].payload).toMatchObject({
      paused: true,
      buffered: [[0, 3]],
      rate: 1,
    });
    p.handle(
      audio.observe({ id: "a", onChange: "x", events: ["seeked"] }),
      ctx,
    );
    el.emit("play");
    expect(got).toHaveLength(2);
    el.emit("seeked");
    expect(got[2].id).toBe("x");
  });

  test("unload, unloadAll, reload and dispose release elements", () => {
    const { p, ctx } = setup();
    p.handle(audio.load({ id: "a", src: "1" }), ctx);
    p.handle(audio.load({ id: "b", src: "2" }), ctx);
    p.handle(audio.observe({ id: "a", onChange: "c" }), ctx);
    const [a, b] = FakeAudio.made;
    p.handle(audio.unload("a"), ctx);
    expect([a.src, a.count(), p.sounds()]).toEqual(["", 0, ["b"]]);
    p.handle(audio.load({ id: "b", src: "3" }), ctx);
    expect([b.src, FakeAudio.made[2].src]).toEqual(["", "3"]);
    p.handle(audio.load({ id: "c", src: "4" }), ctx);
    p.handle(audio.unloadAll(), ctx);
    expect(p.sounds()).toEqual([]);
    expect(FakeAudio.made.every((e) => e.src === "" && e.count() === 0)).toBe(
      true,
    );
    p.handle(audio.load({ id: "d", src: "5" }), ctx);
    p.dispose!();
    expect(p.sounds()).toEqual([]);
  });

  test("unknown id throws", () => {
    const { p, ctx } = setup();
    expect(() => p.handle(audio.play("zz"), ctx)).toThrow(/no sound "zz"/);
    expect(() => p.handle(audio.unload("zz"), ctx)).not.toThrow();
  });

  test("unsupported environment replies onError and ignores the rest", () => {
    const { got, ctx } = harness();
    const p = createAudioPlugin({
      Audio: null,
      AudioContext: null,
      mediaSession: null,
    });
    p.handle(audio.load({ id: "a", src: "x", onError: "bad" }), ctx);
    p.handle(audio.tone({ frequency: 440, ms: 10, onError: "bad" }), ctx);
    p.handle(audio.mediaSession({ title: "t", onError: "bad" }), ctx);
    p.handle(audio.play("a"), ctx);
    p.handle(audio.pause("a"), ctx);
    expect(got).toHaveLength(3);
    expect(
      got.every((m) => (m.payload as any).name === "UnsupportedError"),
    ).toBe(true);
  });
});

describe("audio WebAudio", () => {
  test("tone plays an oscillator, lazily creating and resuming the context", () => {
    const { p, got, ctx } = setup();
    expect(FakeAudioContext.made).toHaveLength(0);
    p.handle(
      audio.tone({
        frequency: 880,
        ms: 250,
        wave: "square",
        volume: 0.5,
        onEnded: "beep",
      }),
      ctx,
    );
    const ac = FakeAudioContext.made[0];
    const o = ac.oscs[0];
    expect(ac.resumed).toBe(1);
    expect([o.type, o.frequency.value, o.started, o.stoppedAt]).toEqual([
      "square",
      880,
      true,
      10.25,
    ]);
    o.onended();
    expect(got).toEqual([{ id: "beep" }]);
    expect(o.disconnected).toBe(true);
    p.handle(audio.tone({ frequency: 440, ms: 10 }), ctx);
    expect(FakeAudioContext.made).toHaveLength(1);
  });

  test("dispose stops running tones and closes the context", () => {
    const { p, got, ctx } = setup();
    p.handle(audio.tone({ frequency: 440, ms: 1000, onEnded: "e" }), ctx);
    const ac = FakeAudioContext.made[0];
    p.dispose!();
    expect(ac.oscs[0].disconnected).toBe(true);
    expect(ac.oscs[0].onended).toBeNull();
    expect(ac.closed).toBe(true);
    expect(got).toEqual([]);
  });

  test("analyse streams level and bands, reuses the graph, stops", () => {
    const { p, got, timers, advance, ctx } = setup();
    p.handle(audio.load({ id: "a", src: "a" }), ctx);
    p.handle(audio.play("a"), ctx);
    p.handle(
      audio.analyse({
        id: "a",
        onChange: "fft",
        fftSize: 8,
        bands: 2,
        intervalMs: 50,
      }),
      ctx,
    );
    const ac = FakeAudioContext.made[0];
    expect(ac.sources[0].el).toBe(FakeAudio.made[0]);
    expect(ac.analysers[0].fftSize).toBe(8);
    ac.fill = (d) => d.set([255, 255, 0, 0]);
    advance(50);
    expect(got[0]).toEqual({
      id: "fft",
      payload: { level: 0.5, bands: [1, 0] },
    });
    // re-analysing keeps one source / one timer
    p.handle(
      audio.analyse({ id: "a", onChange: "fft2", fftSize: 8, bands: 4 }),
      ctx,
    );
    expect(ac.sources).toHaveLength(1);
    expect(timers.size).toBe(1);
    p.handle(audio.stopAnalyse("a"), ctx);
    expect(timers.size).toBe(0);
    p.handle(audio.unload("a"), ctx);
    expect(ac.analysers[0].disconnected).toBe(true);
  });

  test("analyse errors go to onError", () => {
    const { p, got, ctx } = setup();
    p.handle(audio.load({ id: "a", src: "a", onError: "bad" }), ctx);
    FakeAudioContext.prototype.createMediaElementSource = () => {
      throw { name: "InvalidStateError", message: "already connected" };
    };
    p.handle(audio.analyse({ id: "a", onChange: "fft" }), ctx);
    expect(got[0]).toEqual({
      id: "bad",
      payload: { name: "InvalidStateError", message: "already connected" },
    });
  });
});

describe("audio mediaSession", () => {
  function fakeSession() {
    const s: MediaSessionLike & { handlers: Record<string, any> } = {
      metadata: null,
      handlers: {},
      setActionHandler(a, h) {
        if (h) this.handlers[a] = h;
        else delete this.handlers[a];
      },
    };
    return s;
  }
  class Meta {
    init: unknown;
    constructor(init: unknown) {
      this.init = init;
    }
  }

  test("sets metadata and action handlers that dispatch messages", () => {
    const session = fakeSession();
    const { p, got, ctx } = setup({
      mediaSession: session,
      MediaMetadata: Meta,
    });
    p.handle(
      audio.mediaSession({
        title: "Song",
        artist: "Band",
        album: "LP",
        artwork: [{ src: "c.png" }],
        actions: { play: "mp.play", next: "mp.next", seek: "mp.seek" },
      }),
      ctx,
    );
    expect((session.metadata as Meta).init).toEqual({
      title: "Song",
      artist: "Band",
      album: "LP",
      artwork: [{ src: "c.png" }],
    });
    expect(Object.keys(session.handlers).sort()).toEqual([
      "nexttrack",
      "play",
      "seekto",
    ]);
    session.handlers.play({ action: "play" });
    session.handlers.nexttrack({ action: "nexttrack" });
    session.handlers.seekto({ action: "seekto", seekTime: 42, junk: 1 });
    expect(got).toEqual([
      { id: "mp.play", payload: { action: "play" } },
      { id: "mp.next", payload: { action: "nexttrack" } },
      { id: "mp.seek", payload: { seekTime: 42 } },
    ]);
    // a second call replaces the handlers
    p.handle(
      audio.mediaSession({
        actions: { pause: "mp.pause", previous: "mp.prev" },
      }),
      ctx,
    );
    expect(Object.keys(session.handlers).sort()).toEqual([
      "pause",
      "previoustrack",
    ]);
    p.dispose!();
    expect(session.handlers).toEqual({});
  });

  test("missing Media Session replies unsupported", () => {
    const { p, got, ctx } = setup({ mediaSession: null });
    p.handle(audio.mediaSession({ title: "x", onError: "bad" }), ctx);
    expect(got[0].payload).toMatchObject({ name: "UnsupportedError" });
  });

  test("missing MediaMetadata replies unsupported", () => {
    const { p, got, ctx } = setup({
      mediaSession: fakeSession(),
      MediaMetadata: null,
    });
    p.handle(audio.mediaSession({ title: "x", onError: "bad" }), ctx);
    expect(got[0].payload).toMatchObject({ name: "UnsupportedError" });
  });
});

describe("playlist helpers", () => {
  test("next / prev with and without loop", () => {
    expect(next(3, 0)).toBe(1);
    expect(next(3, 2)).toBe(-1);
    expect(next(3, 2, true)).toBe(0);
    expect(prev(3, 2)).toBe(1);
    expect(prev(3, 0)).toBe(-1);
    expect(prev(3, 0, true)).toBe(2);
    expect(next(0, 0, true)).toBe(-1);
    expect(playlist.next).toBe(next);
    expect(playlist.NO_TRACK).toBe(-1);
  });

  test("shuffle is a pure permutation, deterministic with a seeded random", () => {
    const items = [1, 2, 3, 4, 5];
    let s = 1;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const a = shuffle(items, rnd);
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect([...a].sort()).toEqual(items);
    s = 1;
    expect(shuffle(items, rnd)).toEqual(a);
    expect(shuffle([], rnd)).toEqual([]);
  });
});
