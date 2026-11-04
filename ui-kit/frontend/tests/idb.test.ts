// @vitest-environment jsdom
import { expect, test } from "vitest";
import {
  createIdbPlugin,
  createMemoryBackend,
  idbEffector,
  type Backend,
  type IdbEffect,
} from "../idb.ts";
import { createFilesPlugin, filesEffector } from "../files.ts";

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
