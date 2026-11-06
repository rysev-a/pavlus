import { expect, test } from "vitest";
import {
  parsePath,
  pathOfScreen,
  SCREEN_PATHS,
  titleOf,
} from "../app/routes.ts";

test("every screen has its own path and the path leads back to the screen", () => {
  const paths = Object.values(SCREEN_PATHS);
  expect(new Set(paths).size).toBe(paths.length);
  for (const [screen, path] of Object.entries(SCREEN_PATHS)) {
    expect(pathOfScreen(screen)).toBe(path);
    expect(parsePath(path)).toEqual({ screen, mode: "list" });
    expect(parsePath(`${path}/`)).toEqual({ screen, mode: "list" });
  }
});

test("a form is /<screen>/new or /<screen>/<id>", () => {
  expect(parsePath("/orders/new")).toEqual({
    screen: "orders",
    mode: "form",
    id: 0,
  });
  expect(parsePath("/orders/42")).toEqual({
    screen: "orders",
    mode: "form",
    id: 42,
  });
  expect(parsePath("/budget/entries/7")).toEqual({
    screen: "budgetEntries",
    mode: "form",
    id: 7,
  });
  expect(parsePath("/shops/map")).toEqual({ screen: "shopsMap", mode: "list" });
});

test("unknown paths and forms of screens without a form are not found", () => {
  for (const p of [
    "/nope",
    "/orders/abc",
    "/orders/0",
    "/sales/new",
    "/settings/1",
    "/orders/1/2",
  ])
    expect(parsePath(p)).toBeNull();
});

test("document titles", () => {
  expect(titleOf("/orders")).toBe("Orders - PhoneHub CRM");
  expect(titleOf("/orders/new")).toBe("New order - PhoneHub CRM");
  expect(titleOf("/users/3")).toBe("User #3 - PhoneHub CRM");
  expect(titleOf("/zzz")).toContain("not found");
});
