import { expect, test } from "vitest";
import { initialState } from "../../ui-kit/frontend/templates/orbit-social/orbit-social.ts";
import type { OrbitState } from "../../ui-kit/frontend/templates/orbit-social/core.ts";
import {
  nextOf,
  parsePath,
  pathOf,
  showsPath,
  titleOf,
} from "../app/routes.ts";

test("paths map to screens, with an optional id", () => {
  expect(parsePath("/")).toEqual({ kind: "root" });
  expect(parsePath("/login")).toEqual({ kind: "auth", view: "login" });
  expect(parsePath("/register")).toEqual({ kind: "auth", view: "register" });
  expect(parsePath("/music")).toEqual({
    kind: "screen",
    screen: "music",
    params: {},
  });
  expect(parsePath("/profile/12")).toEqual({
    kind: "screen",
    screen: "profile",
    params: { userId: 12 },
  });
  expect(parsePath("/blog/3/")).toEqual({
    kind: "screen",
    screen: "blog",
    params: { articleId: 3 },
  });
  expect(parsePath("/communities/9")).toMatchObject({
    params: { communityId: 9 },
  });
});

test("unknown paths are unknown", () => {
  for (const p of [
    "/nope",
    "/music/1",
    "/profile/x",
    "/profile/0",
    "/wall/1/2",
    "/login/1",
  ])
    expect(parsePath(p).kind).toBe("unknown");
});

test("the path of a state, and whether a path already shows it", () => {
  const s = {
    ...initialState(),
    view: "app",
    me: 1,
    screen: "profile",
  } as OrbitState;
  expect(pathOf(s)).toBe("/profile");
  expect(showsPath(s, "/profile")).toBe(true);
  expect(showsPath(s, "/profile/1")).toBe(true); // my own profile
  expect(showsPath(s, "/profile/5")).toBe(false);
  const other = { ...s, profile: { ...s.profile, userId: 5 } } as OrbitState;
  expect(pathOf(other)).toBe("/profile/5");
  expect(showsPath(other, "/profile/5")).toBe(true);
  expect(showsPath({ ...s, screen: "music" } as OrbitState, "/profile")).toBe(
    false,
  );
  const out = { ...s, view: "auth", authView: "register" } as OrbitState;
  expect(pathOf(out)).toBe("/register");
  expect(titleOf(out)).toBe("Register · Orbit");
  expect(titleOf(s)).toBe("Profile · Orbit");
});

test("?next= only takes the paths of the app", () => {
  expect(nextOf("?next=%2Fmusic")).toBe("/music");
  expect(nextOf("?next=https%3A%2F%2Fevil.example")).toBe("");
  expect(nextOf("")).toBe("");
});
