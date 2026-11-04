import { describe, expect, test } from "vitest";
import { toHandler } from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import {
  initialUsers,
  list,
  table,
  type UsersState,
} from "../modules/users/users.ts";

// The component is pure: no DOM, no plugins, no network. A message and a
// state go in, effects come out.
const handle = toHandler(list);
const state: UsersState = {
  ...initialUsers,
  items: [
    { id: 1, name: "Ann", email: "ann@example.com", role: "admin" },
    { id: 2, name: "Bob", email: "bob@example.com", role: "editor" },
  ],
};

describe("users component", () => {
  test("load asks the http plugin for the users", () => {
    expect(handle({ id: "load" }, state)).toEqual([
      store.set("status", "loading"),
      http.request({
        id: "users",
        url: "/api/users",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ]);
  });

  test("loaded stores the users, failed records the failure", () => {
    const data = [{ id: 3, name: "Cy" }];
    expect(
      handle({ id: "loaded", payload: { status: 200, data } }, state),
    ).toEqual([store.set("items", data), store.set("status", "idle")]);
    expect(handle({ id: "failed" }, state)).toEqual([
      store.set("status", "failed"),
    ]);
  });

  test("select and remove", () => {
    expect(handle({ id: "select", payload: 2 }, state)).toEqual([
      store.set("selectedId", 2),
    ]);
    expect(handle({ id: "remove", payload: 1 }, state)).toEqual([
      http.request({
        id: "remove:1",
        method: "DELETE",
        url: "/api/users/1",
        onSuccess: "removed",
        onError: "removeFailed",
      }),
    ]);
  });

  test("removed drops the confirmed user, removeFailed only logs", () => {
    expect(
      handle(
        { id: "removed", payload: { status: 200, data: { deleted: 1 } } },
        state,
      ),
    ).toEqual([
      store.set("items", [
        { id: 2, name: "Bob", email: "bob@example.com", role: "editor" },
      ]),
    ]);
    expect(
      handle(
        { id: "removeFailed", payload: { status: 404, error: "Not Found" } },
        state,
      ).map((effect) => (effect as { message?: string }).message),
    ).toEqual(["user not removed"]);
  });

  test("unknown messages and helper methods do nothing", () => {
    expect(handle({ id: "nope" }, state)).toEqual([]);
    expect(handle({ id: "constructor" }, state)).toEqual([]);
  });

  test("the table is the same component with another view", () => {
    expect(table.view).not.toBe(list.view);
    for (const message of [
      { id: "load" },
      { id: "select", payload: 2 },
      { id: "remove", payload: 1 },
    ]) {
      expect(toHandler(table)(message, state)).toEqual(handle(message, state));
    }
  });
});
