import { describe, expect, test } from "vitest";
import type { Message } from "../../core/types.ts";
import {
  createVideoPlugin,
  videoEffector as video,
  type DocumentLike,
  type VideoLike,
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

class FakeVideo implements VideoLike {
  src = "";
  poster = "";
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
  buffered = { length: 1, start: () => 0, end: () => 5 };
  videoWidth = 0;
  videoHeight = 0;
  loads = 0;
  playError: unknown = null;
  listeners = new Map<string, Set<() => void>>();
  types: string[] = [];
  requestFullscreen?: () => Promise<void> | void;
  requestPictureInPicture?: () => Promise<unknown>;
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
  canPlayType(t: string) {
    return this.types.includes(t) ? "probably" : "";
  }
  emit(t: string) {
    [...(this.listeners.get(t) ?? [])].forEach((f) => f());
  }
  count() {
    return [...this.listeners.values()].reduce((n, s) => n + s.size, 0);
  }
}

function fakeDoc(existing: Record<string, FakeVideo> = {}) {
  const created: FakeVideo[] = [];
  const canvas = {
    width: 0,
    height: 0,
    drawn: null as unknown,
    getContext: () => ({
      drawImage: (s: unknown) => (canvas.drawn = s),
    }),
    toDataURL: (t?: string) => `data:${t ?? "image/png"};base64,AAA`,
  };
  const doc: DocumentLike & {
    created: FakeVideo[];
    canvas: typeof canvas;
    exits: string[];
  } = {
    created,
    canvas,
    exits: [],
    createElement: (tag: string) =>
      tag === "canvas"
        ? canvas
        : (created.push(new FakeVideo()), created.at(-1)),
    querySelector: (s: string) => existing[s] ?? null,
    exitFullscreen() {
      doc.exits.push("fs");
    },
    exitPictureInPicture() {
      doc.exits.push("pip");
    },
  };
  return doc;
}

describe("video", () => {
  test("load creates an off-DOM video and replies metadata", () => {
    const { got, ctx } = harness();
    const doc = fakeDoc();
    const p = createVideoPlugin({ document: doc });
    p.handle(
      video.load({
        id: "v",
        src: "a.mp4",
        poster: "p.png",
        preload: "metadata",
        onSuccess: "ok",
        onError: "bad",
      }),
      ctx,
    );
    const el = doc.created[0];
    expect(el.src).toBe("a.mp4");
    expect(el.poster).toBe("p.png");
    expect(el.preload).toBe("metadata");
    expect(el.loads).toBe(1);
    expect(p.videos()).toEqual(["v"]);
    el.duration = 12;
    el.videoWidth = 640;
    el.videoHeight = 360;
    el.emit("loadedmetadata");
    expect(got).toEqual([
      { id: "ok", payload: { duration: 12, width: 640, height: 360 } },
    ]);
    expect(el.count()).toBe(0);
  });

  test("load picks a playable source by type", () => {
    const { ctx } = harness();
    const doc = fakeDoc();
    const p = createVideoPlugin({ document: doc });
    // fake: created elements know webm only
    const orig = doc.createElement;
    doc.createElement = (t) => {
      const e = orig(t) as FakeVideo;
      e.types = ["video/webm"];
      return e;
    };
    p.handle(
      video.load({
        id: "v",
        sources: [
          { src: "a.mp4", type: "video/mp4" },
          { src: "a.webm", type: "video/webm" },
        ],
      }),
      ctx,
    );
    expect(doc.created[0].src).toBe("a.webm");
    p.handle(
      video.load({ id: "w", sources: [{ src: "z.ogv", type: "video/ogg" }] }),
      ctx,
    );
    expect(doc.created[1].src).toBe("z.ogv");
  });

  test("load error and missing target go to onError", () => {
    const { got, ctx } = harness();
    const doc = fakeDoc();
    const p = createVideoPlugin({ document: doc });
    p.handle(video.load({ id: "v", src: "x", onError: "bad" }), ctx);
    doc.created[0].error = { code: 4, message: "unsupported source" };
    doc.created[0].emit("error");
    expect(got[0]).toEqual({
      id: "bad",
      payload: { name: "MediaError", message: "unsupported source", code: 4 },
    });
    p.handle(
      video.load({ id: "n", target: "#nope", src: "x", onError: "bad" }),
      ctx,
    );
    expect(got[1].payload).toMatchObject({ name: "NotFoundError" });
    expect(p.videos()).toEqual(["v"]); // failed load keeps its entry; "n" never registered
  });

  test("target by selector or element; unload does not touch an unloaded src", () => {
    const { got, ctx } = harness();
    const el = new FakeVideo();
    el.readyState = 1;
    el.duration = 3;
    const direct = new FakeVideo();
    const p = createVideoPlugin({ document: fakeDoc({ "#v": el }) });
    p.handle(video.load({ id: "a", target: "#v", onSuccess: "ok" }), ctx);
    expect(got).toEqual([
      { id: "ok", payload: { duration: 3, width: 0, height: 0 } },
    ]);
    expect(el.loads).toBe(0);
    p.handle(video.load({ id: "b", target: direct, onSuccess: "ok2" }), ctx);
    direct.emit("loadedmetadata");
    expect(got).toHaveLength(2);
    p.handle(video.unload("a"), ctx);
    expect(el.loads).toBe(0);
  });

  test("basic controls", () => {
    const { ctx } = harness();
    const doc = fakeDoc();
    const p = createVideoPlugin({ document: doc });
    p.handle(video.load({ id: "v", src: "a" }), ctx);
    const el = doc.created[0];
    p.handle(video.play("v"), ctx);
    expect(el.paused).toBe(false);
    p.handle(video.toggle("v"), ctx);
    expect(el.paused).toBe(true);
    p.handle(video.toggle("v"), ctx);
    expect(el.paused).toBe(false);
    p.handle(video.pause("v"), ctx);
    expect(el.paused).toBe(true);
    p.handle(video.seek("v", 7), ctx);
    p.handle(video.volume("v", 5), ctx);
    p.handle(video.mute("v"), ctx);
    p.handle(video.rate("v", 1.5), ctx);
    p.handle(video.loop("v"), ctx);
    expect([
      el.currentTime,
      el.volume,
      el.muted,
      el.playbackRate,
      el.loop,
    ]).toEqual([7, 1, true, 1.5, true]);
    p.handle(video.volume("v", -1), ctx);
    expect(el.volume).toBe(0);
  });

  test("unknown id throws, except unload", () => {
    const { ctx } = harness();
    const p = createVideoPlugin({ document: fakeDoc() });
    expect(() => p.handle(video.play("zz"), ctx)).toThrow(/no video "zz"/);
    expect(() => p.handle(video.unload("zz"), ctx)).not.toThrow();
  });

  test("play rejection (autoplay) goes to onError, not the console", async () => {
    const { got, ctx } = harness();
    const doc = fakeDoc();
    const p = createVideoPlugin({ document: doc });
    p.handle(video.load({ id: "v", src: "a", onError: "loadErr" }), ctx);
    const el = doc.created[0];
    el.playError = { name: "NotAllowedError", message: "blocked" };
    p.handle(video.play("v", "blocked"), ctx);
    p.handle(video.play("v"), ctx); // falls back to load's onError
    await tick();
    expect(got).toEqual([
      {
        id: "blocked",
        payload: { name: "NotAllowedError", message: "blocked" },
      },
      {
        id: "loadErr",
        payload: { name: "NotAllowedError", message: "blocked" },
      },
    ]);
  });

  test("observe streams snapshots, throttles timeupdate, replaces observer", () => {
    const { got, ctx } = harness();
    const doc = fakeDoc();
    let t = 0;
    const p = createVideoPlugin({ document: doc, now: () => t });
    p.handle(video.load({ id: "v", src: "a" }), ctx);
    const el = doc.created[0];
    el.duration = 10;
    p.handle(video.observe({ id: "v", onChange: "chg", intervalMs: 500 }), ctx);
    el.emit("timeupdate");
    t = 100;
    el.emit("timeupdate");
    expect(got).toHaveLength(1);
    el.emit("pause"); // never throttled
    expect(got).toHaveLength(2);
    t = 600;
    el.emit("timeupdate");
    expect(got).toHaveLength(3);
    expect(got[0]).toEqual({
      id: "chg",
      payload: {
        currentTime: 0,
        duration: 10,
        paused: true,
        ended: false,
        volume: 1,
        muted: false,
        rate: 1,
        buffered: [[0, 5]],
        readyState: 0,
      },
    });
    el.error = { code: 3, message: "decode" };
    el.emit("error");
    expect((got[3].payload as any).error).toEqual({
      code: 3,
      message: "decode",
    });
    p.handle(
      video.observe({ id: "v", onChange: "other", events: ["seeked"] }),
      ctx,
    );
    el.emit("pause");
    expect(got).toHaveLength(4);
    el.emit("seeked");
    expect(got[4].id).toBe("other");
  });

  test("unload releases src and listeners", () => {
    const { ctx } = harness();
    const doc = fakeDoc();
    const p = createVideoPlugin({ document: doc });
    p.handle(video.load({ id: "v", src: "a", onSuccess: "ok" }), ctx);
    p.handle(video.observe({ id: "v", onChange: "c" }), ctx);
    const el = doc.created[0];
    el.paused = false;
    p.handle(video.unload("v"), ctx);
    expect(el.src).toBe("");
    expect(el.paused).toBe(true);
    expect(el.count()).toBe(0);
    expect(p.videos()).toEqual([]);
  });

  test("reloading an id releases the previous element", () => {
    const { ctx } = harness();
    const doc = fakeDoc();
    const p = createVideoPlugin({ document: doc });
    p.handle(video.load({ id: "v", src: "a" }), ctx);
    p.handle(video.load({ id: "v", src: "b" }), ctx);
    expect(doc.created[0].src).toBe("");
    expect(doc.created[1].src).toBe("b");
    expect(p.videos()).toEqual(["v"]);
  });

  test("fullscreen and picture-in-picture", async () => {
    const { got, ctx } = harness();
    const doc = fakeDoc();
    const p = createVideoPlugin({ document: doc });
    p.handle(video.load({ id: "v", src: "a" }), ctx);
    const el = doc.created[0];
    let fs = 0;
    let pip = 0;
    el.requestFullscreen = () => void fs++;
    el.requestPictureInPicture = async () => void pip++;
    p.handle(video.fullscreen("v", true), ctx);
    p.handle(video.pictureInPicture("v", true), ctx);
    expect([fs, pip]).toEqual([1, 1]);
    doc.fullscreenElement = el;
    doc.pictureInPictureElement = el;
    p.handle(video.fullscreen("v", false), ctx);
    p.handle(video.pictureInPicture("v", false), ctx);
    expect(doc.exits).toEqual(["fs", "pip"]);
    el.requestFullscreen = () =>
      Promise.reject({ name: "TypeError", message: "no" });
    p.handle(video.fullscreen("v", true, "err"), ctx);
    await tick();
    expect(got).toEqual([
      { id: "err", payload: { name: "TypeError", message: "no" } },
    ]);
    el.requestPictureInPicture = undefined;
    p.handle(video.pictureInPicture("v", true, "err"), ctx);
    expect(got[1].payload).toMatchObject({ name: "UnsupportedError" });
  });

  test("captureFrame replies a data URL", () => {
    const { got, ctx } = harness();
    const doc = fakeDoc();
    const p = createVideoPlugin({ document: doc });
    p.handle(video.load({ id: "v", src: "a" }), ctx);
    const el = doc.created[0];
    p.handle(
      video.captureFrame({ id: "v", onSuccess: "shot", onError: "bad" }),
      ctx,
    );
    expect(got[0].id).toBe("bad"); // no frame yet
    el.videoWidth = 320;
    el.videoHeight = 180;
    p.handle(
      video.captureFrame({
        id: "v",
        imageType: "image/jpeg",
        onSuccess: "shot",
      }),
      ctx,
    );
    expect(got[1]).toEqual({
      id: "shot",
      payload: "data:image/jpeg;base64,AAA",
    });
    expect(doc.canvas.drawn).toBe(el);
    expect([doc.canvas.width, doc.canvas.height]).toEqual([320, 180]);
  });

  test("unsupported environment is a no-op that replies onError", () => {
    const { got, ctx } = harness();
    const p = createVideoPlugin({ document: null });
    p.handle(video.load({ id: "v", src: "a", onError: "bad" }), ctx);
    p.handle(video.play("v", "bad"), ctx);
    p.handle(video.pause("v"), ctx);
    expect(got).toEqual([
      {
        id: "bad",
        payload: { name: "UnsupportedError", message: "unsupported" },
      },
      {
        id: "bad",
        payload: { name: "UnsupportedError", message: "unsupported" },
      },
    ]);
    expect(p.videos()).toEqual([]);
  });

  test("dispose releases everything", () => {
    const { ctx } = harness();
    const doc = fakeDoc();
    const p = createVideoPlugin({ document: doc });
    p.handle(video.load({ id: "a", src: "1" }), ctx);
    p.handle(video.load({ id: "b", src: "2" }), ctx);
    p.handle(video.observe({ id: "a", onChange: "c" }), ctx);
    p.dispose!();
    expect(p.videos()).toEqual([]);
    expect(doc.created.every((e) => e.src === "" && e.count() === 0)).toBe(
      true,
    );
  });
});
