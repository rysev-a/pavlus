import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
  parseUrl,
} from "./history.ts";

describe("parseUrl", () => {
  it("splits path, search and hash", () => {
    expect(parseUrl("/a/b?x=1#h")).toEqual({
      path: "/a/b",
      search: "?x=1",
      hash: "#h",
    });
    expect(parseUrl("/a#h?notquery")).toEqual({
      path: "/a",
      search: "",
      hash: "#h?notquery",
    });
    expect(parseUrl("a")).toEqual({ path: "/a", search: "", hash: "" });
    expect(parseUrl("?q")).toEqual({ path: "/", search: "?q", hash: "" });
    expect(parseUrl("/a?#")).toEqual({ path: "/a", search: "", hash: "" });
  });
});

describe("memory history", () => {
  it("starts at the last initial entry", () => {
    const h = createMemoryHistory(["/a", "/b"]);
    expect(h.location().path).toBe("/b");
    expect(createMemoryHistory().location().path).toBe("/");
    expect(createMemoryHistory(["/a", "/b"], 0).location().path).toBe("/a");
  });

  it("push/replace are silent; back/forward/go notify with the delta", () => {
    const h = createMemoryHistory(["/"]);
    const seen: Array<[string, number]> = [];
    const off = h.listen((l, d) => seen.push([l.path, d]));
    h.push("/a?x=1#t", { n: 1 });
    expect(h.location()).toMatchObject({
      path: "/a",
      search: "?x=1",
      hash: "#t",
      state: { n: 1 },
    });
    h.push("/b");
    h.replace("/b2");
    expect(seen).toEqual([]);
    h.back();
    expect(seen).toEqual([["/a", -1]]);
    h.go(-1);
    expect(h.location().path).toBe("/");
    h.forward();
    h.go(1);
    expect(h.location().path).toBe("/b2");
    expect(seen.at(-1)).toEqual(["/b2", 1]);
    off();
    h.back();
    expect(seen.length).toBe(4);
  });

  it("ignores moves outside the stack and truncates forward entries on push", () => {
    const h = createMemoryHistory(["/a", "/b"]);
    const fn = vi.fn();
    h.listen(fn);
    h.forward();
    h.go(-5);
    h.go(0);
    expect(fn).not.toHaveBeenCalled();
    h.back();
    h.push("/c");
    h.forward();
    expect(h.location().path).toBe("/c");
  });

  it("replace keeps the entry key, push creates a new one", () => {
    const h = createMemoryHistory(["/a"]);
    const k = h.location().key;
    h.replace("/b");
    expect(h.location().key).toBe(k);
    h.push("/c");
    expect(h.location().key).not.toBe(k);
  });

  it("href is the url and destroy drops listeners", () => {
    const h = createMemoryHistory(["/a", "/b"]);
    const fn = vi.fn();
    h.listen(fn);
    h.destroy();
    h.back();
    expect(fn).not.toHaveBeenCalled();
    expect(h.href("/x")).toBe("/x");
  });
});

describe("browser history", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("reads the location, pushes and replaces via the History API", () => {
    window.history.replaceState(null, "", "/start?q=1#h");
    const h = createBrowserHistory();
    expect(h.location()).toMatchObject({
      path: "/start",
      search: "?q=1",
      hash: "#h",
    });
    h.push("/next", { a: 1 });
    expect(window.location.pathname).toBe("/next");
    expect(h.location().state).toEqual({ a: 1 });
    const key = h.location().key;
    h.replace("/other");
    expect(window.location.pathname).toBe("/other");
    expect(h.location().key).toBe(key);
    h.destroy();
  });

  it("reports pops with the delta, once", async () => {
    const h = createBrowserHistory();
    const seen: Array<[string, number]> = [];
    h.listen((l, d) => seen.push([l.path, d]));
    h.push("/one");
    h.push("/two");
    h.back();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual([["/one", -1]]);
    h.forward();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.at(-1)).toEqual(["/two", 1]);
    h.destroy();
  });

  it("destroy removes the popstate listener", async () => {
    const h = createBrowserHistory();
    const fn = vi.fn();
    h.listen(fn);
    h.push("/x");
    h.destroy();
    h.back();
    await new Promise((r) => setTimeout(r, 20));
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("hash history", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("keeps the route in the fragment", async () => {
    window.history.replaceState(null, "", "/#/home?x=1");
    const h = createHashHistory();
    expect(h.location()).toMatchObject({ path: "/home", search: "?x=1" });
    h.push("/about");
    expect(window.location.hash).toBe("#/about");
    expect(h.href("/about")).toBe("#/about");
    const seen: string[] = [];
    h.listen((l) => seen.push(l.path));
    h.back();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual(["/home"]);
    h.destroy();
  });

  it("defaults to / without a fragment", () => {
    window.history.replaceState(null, "", "/");
    const h = createHashHistory();
    expect(h.location().path).toBe("/");
    h.destroy();
  });
});
