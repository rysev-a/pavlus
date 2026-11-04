// @vitest-environment jsdom
import { expect, test } from "vitest";
import {
  createIdbPlugin,
  createMemoryBackend,
  idbEffector,
  type Backend,
  type IdbEffect,
} from "../idb.ts";
import {
  createFilesPlugin,
  filesEffector,
  isImageDataUrl,
  scaleSize,
} from "../files.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

function rig(backend: Backend = createMemoryBackend()) {
  const sent: { id: string; payload: unknown }[] = [];
  const ctx = {
    dispatch: (m: { id: string; payload: unknown }) => sent.push(m),
  } as never;
  const plugin = createIdbPlugin(backend);
  const run = async (e: IdbEffect) => {
    plugin.handle(e, ctx);
    await flush();
  };
  return { sent, run };
}

const T = ["a", "b"];

test("load of an empty database replies empty tables and empty: true", async () => {
  const { sent, run } = rig();
  await run(idbEffector.load("d", T, "ok", "bad"));
  expect(sent).toEqual([
    { id: "ok", payload: { data: { a: [], b: [] }, empty: true } },
  ]);
});

test("put upserts by id, remove deletes, and a reload sees both", async () => {
  const { sent, run } = rig();
  await run(
    idbEffector.put("d", "a", [
      { id: 1, v: "x" },
      { id: 2, v: "y" },
    ]),
  );
  await run(idbEffector.put("d", "a", [{ id: 2, v: "z" }]));
  await run(idbEffector.put("d", "b", [{ id: 7 }]));
  await run(idbEffector.remove("d", "a", [1]));
  expect(sent).toEqual([]); // fire and forget: no reply
  await run(idbEffector.load("d", T, "ok", "bad"));
  expect(sent[0]).toEqual({
    id: "ok",
    payload: { data: { a: [{ id: 2, v: "z" }], b: [{ id: 7 }] }, empty: false },
  });
});

test("writes keep the order they were asked in, even when the backend is slow", async () => {
  const mem = createMemoryBackend();
  const slow: Backend = {
    ...mem,
    put: async (...a) => {
      await new Promise((r) => setTimeout(r, 20));
      return mem.put(...a);
    },
  };
  const { sent, run } = rig(slow);
  const p = rig(slow);
  p.run(idbEffector.put("d", "a", [{ id: 1, v: 1 }]));
  p.run(idbEffector.put("d", "a", [{ id: 1, v: 2 }]));
  await new Promise((r) => setTimeout(r, 80));
  await run(idbEffector.load("d", ["a"], "ok", "bad"));
  expect((sent[0].payload as { data: { a: unknown[] } }).data.a).toEqual([
    { id: 1, v: 2 },
  ]);
});

test("replaceAll clears every table, writes the data and replies the row count", async () => {
  const { sent, run } = rig();
  await run(idbEffector.put("d", "a", [{ id: 1 }, { id: 2 }]));
  await run(idbEffector.put("d", "b", [{ id: 5 }]));
  await run(
    idbEffector.replaceAll("d", { a: [{ id: 9 }], b: [] }, "done", "bad"),
  );
  expect(sent).toEqual([{ id: "done", payload: { rows: 1 } }]);
  await run(idbEffector.load("d", T, "ok", "bad"));
  expect(sent[1].payload).toEqual({
    data: { a: [{ id: 9 }], b: [] },
    empty: false,
  });
});

test("the database is isolated by name", async () => {
  const { sent, run } = rig();
  await run(idbEffector.put("one", "a", [{ id: 1 }]));
  await run(idbEffector.load("two", T, "ok", "bad"));
  expect((sent[0].payload as { empty: boolean }).empty).toBe(true);
});

test("errors are replied to the error id (load, replaceAll, and put/remove when asked)", async () => {
  const boom: Backend = {
    load: () => Promise.reject(new Error("disk")),
    put: () => Promise.reject(new Error("full")),
    remove: () => Promise.reject(new Error("locked")),
    replaceAll: () => Promise.reject(new Error("quota")),
  };
  const { sent, run } = rig(boom);
  await run(idbEffector.load("d", T, "ok", "bad"));
  await run(idbEffector.replaceAll("d", { a: [] }, "done", "bad2"));
  await run(idbEffector.put("d", "a", [{ id: 1 }], "bad3"));
  await run(idbEffector.remove("d", "a", [1], "bad4"));
  await run(idbEffector.put("d", "a", [{ id: 1 }])); // no onError: silent
  expect(sent).toEqual([
    { id: "bad", payload: "disk" },
    { id: "bad2", payload: "quota" },
    { id: "bad3", payload: "full" },
    { id: "bad4", payload: "locked" },
  ]);
});

test("the memory backend rejects a row without an id and writes nothing of the batch", async () => {
  const { sent, run } = rig();
  await run(idbEffector.put("d", "a", [{ id: 1 }, { nope: true }], "bad"));
  expect(sent).toEqual([{ id: "bad", payload: "a row has no numeric id" }]);
  await run(idbEffector.load("d", ["a"], "ok", "bad"));
  expect((sent[1].payload as { empty: boolean }).empty).toBe(true);
});

// ---- the files plugin ----

function filesRig() {
  const sent: { id: string; payload: unknown }[] = [];
  const ctx = {
    dispatch: (m: { id: string; payload: unknown }) => sent.push(m),
  } as never;
  return { sent, ctx, plugin: createFilesPlugin(document) };
}

test("download makes a link with the file name, clicks it and replies", () => {
  const { sent, ctx, plugin } = filesRig();
  let made: Blob | undefined;
  const win = document.defaultView!;
  win.URL.createObjectURL = ((b: Blob) => ((made = b), "blob:x")) as never;
  win.URL.revokeObjectURL = (() => {}) as never;
  const clicked: string[] = [];
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    clicked.push(this.download);
  };
  try {
    plugin.handle(
      filesEffector.download("a.json", '{"x":1}', "application/json", "saved"),
      ctx,
    );
  } finally {
    HTMLAnchorElement.prototype.click = orig;
  }
  expect(clicked).toEqual(["a.json"]);
  expect(made?.type).toBe("application/json");
  expect(made?.size).toBe(7);
  expect(document.querySelector("a[download]")).toBeNull();
  expect(sent).toEqual([{ id: "saved", payload: { name: "a.json" } }]);
});

test("pick opens a hidden file input, reads the chosen file and replies its name and text", async () => {
  const { sent, ctx, plugin } = filesRig();
  let input: HTMLInputElement | undefined;
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
    input = this;
  };
  try {
    plugin.handle(filesEffector.pick(".json", "got", "bad"), ctx);
  } finally {
    HTMLInputElement.prototype.click = orig;
  }
  expect(input!.type).toBe("file");
  expect(input!.accept).toBe(".json");
  expect(input!.hidden).toBe(true);
  expect(document.body.contains(input!)).toBe(true);
  const file = new File(["héllo"], "data.json", { type: "application/json" });
  Object.defineProperty(input!, "files", { value: [file] });
  input!.dispatchEvent(new Event("change"));
  await flush();
  expect(sent).toEqual([
    { id: "got", payload: { name: "data.json", text: "héllo" } },
  ]);
  expect(document.body.contains(input!)).toBe(false);
});

test("a cancelled dialog replies nothing and leaves nothing in the page", async () => {
  const { sent, ctx, plugin } = filesRig();
  let input: HTMLInputElement | undefined;
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
    input = this;
  };
  try {
    plugin.handle(filesEffector.pick(".json", "got", "bad"), ctx);
  } finally {
    HTMLInputElement.prototype.click = orig;
  }
  input!.dispatchEvent(new Event("cancel"));
  await flush();
  expect(sent).toEqual([]);
  expect(document.body.contains(input!)).toBe(false);
});

test("a file that cannot be read replies the error id", async () => {
  const { sent, ctx, plugin } = filesRig();
  let input: HTMLInputElement | undefined;
  const orig = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
    input = this;
  };
  try {
    plugin.handle(filesEffector.pick(".json", "got", "bad"), ctx);
  } finally {
    HTMLInputElement.prototype.click = orig;
  }
  const file = {
    name: "x.json",
    text: () => Promise.reject(new Error("gone")),
  };
  Object.defineProperty(input!, "files", { value: [file] });
  input!.dispatchEvent(new Event("change"));
  await flush();
  expect(sent).toEqual([{ id: "bad", payload: "cannot read x.json: gone" }]);
});

// ---- pickImages ----

test("scaleSize keeps the proportions, never scales up", () => {
  expect(scaleSize(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  expect(scaleSize(1000, 4000, 512)).toEqual({ width: 128, height: 512 });
  expect(scaleSize(300, 200, 512)).toEqual({ width: 300, height: 200 });
  expect(scaleSize(512, 512, 512)).toEqual({ width: 512, height: 512 });
  expect(scaleSize(10000, 1, 100)).toEqual({ width: 100, height: 1 });
});

test("isImageDataUrl", () => {
  expect(isImageDataUrl("data:image/jpeg;base64,AAAA")).toBe(true);
  expect(isImageDataUrl("data:image/svg+xml,<svg/>")).toBe(true);
  expect(isImageDataUrl("data:text/plain;base64,AAAA")).toBe(false);
  expect(isImageDataUrl("grad:10:20:x")).toBe(false);
  expect(isImageDataUrl("")).toBe(false);
});

/** Runs pickImages with a fake Image and a fake canvas; `files` are the chosen ones. */
async function pickImagesRun(
  files: File[],
  opts: {
    decode?: (name: string) => { w: number; h: number } | null;
    maxSide?: number;
    multiple?: boolean;
  } = {},
) {
  const { sent, ctx, plugin } = filesRig();
  const win = document.defaultView as unknown as Record<string, unknown>;
  const realImage = win.Image;
  const proto = HTMLCanvasElement.prototype as unknown as Record<
    string,
    unknown
  >;
  const realCtx = proto.getContext;
  const realUrl = proto.toDataURL;
  const drawn: { w: number; h: number; dw: number; dh: number }[] = [];
  let lastSrc = "";
  win.Image = class {
    onload: () => void = () => {};
    onerror: () => void = () => {};
    naturalWidth = 0;
    naturalHeight = 0;
    set src(v: string) {
      lastSrc = v;
      const size = (opts.decode ?? (() => ({ w: 2000, h: 1000 })))(v);
      setTimeout(() => {
        if (!size) return this.onerror();
        this.naturalWidth = size.w;
        this.naturalHeight = size.h;
        this.onload();
      }, 0);
    }
  };
  proto.getContext = function (this: HTMLCanvasElement) {
    return {
      fillRect() {},
      fillStyle: "",
      drawImage: (
        _i: unknown,
        _x: number,
        _y: number,
        dw: number,
        dh: number,
      ) => drawn.push({ w: this.width, h: this.height, dw, dh }),
    };
  };
  proto.toDataURL = (type: string, q: number) => `data:${type};base64,Q${q}`;
  let input: HTMLInputElement | undefined;
  const origClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
    input = this;
  };
  try {
    plugin.handle(
      filesEffector.pickImages(
        opts.maxSide ?? 512,
        opts.multiple ?? true,
        "got",
        "bad",
      ),
      ctx,
    );
    expect(input!.type).toBe("file");
    expect(input!.accept).toBe("image/*");
    expect(input!.multiple).toBe(opts.multiple ?? true);
    Object.defineProperty(input!, "files", { value: files });
    input!.dispatchEvent(new Event("change"));
    await new Promise((r) => setTimeout(r, 30));
  } finally {
    HTMLInputElement.prototype.click = origClick;
    win.Image = realImage;
    proto.getContext = realCtx;
    proto.toDataURL = realUrl;
  }
  return { sent, drawn, input: input!, lastSrc };
}

test("pickImages downsizes every chosen image to a JPEG data URL", async () => {
  const a = new File(["x"], "a.png", { type: "image/png" });
  const b = new File(["y"], "b.png", { type: "image/png" });
  const r = await pickImagesRun([a, b], { maxSide: 512 });
  expect(r.sent).toEqual([
    {
      id: "got",
      payload: {
        images: [
          { name: "a.png", src: "data:image/jpeg;base64,Q0.8" },
          { name: "b.png", src: "data:image/jpeg;base64,Q0.8" },
        ],
      },
    },
  ]);
  expect(r.drawn[0]).toEqual({ w: 512, h: 256, dw: 512, dh: 256 });
  expect(r.lastSrc.startsWith("data:")).toBe(true);
  expect(document.body.contains(r.input)).toBe(false);
});

test("pickImages skips what cannot be decoded and replies the rest", async () => {
  const good = new File(["x"], "ok.png", { type: "image/png" });
  const bad = new File(["y"], "no.txt", { type: "text/plain" });
  let n = 0;
  const r = await pickImagesRun([bad, good], {
    decode: () => (n++ === 0 ? null : { w: 100, h: 100 }),
  });
  expect(r.sent).toHaveLength(1);
  expect((r.sent[0].payload as { images: unknown[] }).images).toEqual([
    { name: "ok.png", src: "data:image/jpeg;base64,Q0.8" },
  ]);
});

test("pickImages replies the error id when nothing can be decoded, nothing when cancelled", async () => {
  const bad = new File(["y"], "no.txt", { type: "text/plain" });
  const r = await pickImagesRun([bad], { decode: () => null });
  expect(r.sent).toEqual([
    { id: "bad", payload: "cannot read no.txt: not an image" },
  ]);
  const none = await pickImagesRun([]);
  expect(none.sent).toEqual([]);
  expect(document.body.contains(none.input)).toBe(false);
});

test("pickImages with multiple = false asks for one file", async () => {
  const r = await pickImagesRun([new File(["x"], "a.png")], {
    multiple: false,
  });
  expect(r.sent).toHaveLength(1);
});
