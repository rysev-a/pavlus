// @vitest-environment jsdom
import { expect, test } from "vitest";
import { rootOf, stripBase, windowAt, withBase } from "../base-window.ts";

test("the base path is taken off the location and put back on navigation", () => {
  expect(rootOf("/pavlus/")).toBe("/pavlus");
  expect(rootOf("/")).toBe("");

  expect(stripBase("/pavlus", "/pavlus/button")).toBe("/button");
  expect(stripBase("/pavlus", "/pavlus/")).toBe("/");
  expect(stripBase("/pavlus", "/pavlus")).toBe("/");
  expect(stripBase("/pavlus", "/other")).toBe("/other");
  expect(stripBase("", "/button")).toBe("/button");

  expect(withBase("/pavlus", "/button?x=1")).toBe("/pavlus/button?x=1");
  expect(withBase("/pavlus", "/")).toBe("/pavlus/");
  expect(withBase("", "/button")).toBe("/button");
});

test("windowAt shows the router a window without the base", () => {
  window.history.replaceState(null, "", "/pavlus/tabs?x=1#top");
  const win = windowAt("/pavlus");
  expect(win.location.pathname).toBe("/tabs");
  expect(win.location.search).toBe("?x=1");
  expect(win.location.hash).toBe("#top");

  win.history.pushState(null, "", "/dialog");
  expect(window.location.pathname).toBe("/pavlus/dialog");
  expect(win.location.pathname).toBe("/dialog");

  win.history.replaceState(null, "", "/");
  expect(window.location.pathname).toBe("/pavlus/");
  expect(win.location.pathname).toBe("/");

  let heard = 0;
  win.addEventListener("popstate", () => heard++);
  win.dispatchEvent(new PopStateEvent("popstate"));
  expect(heard).toBe(1);
});
