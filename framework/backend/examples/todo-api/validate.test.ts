import { describe, expect, it } from "vitest";
import {
  validateChat,
  validateId,
  validateLogin,
  validateReorder,
  validateRoom,
  validateSignup,
  validateTodoCreate,
  validateTodoPatch,
} from "./validate.ts";

// Validation is plain functions: no scenario, no mocks.
describe("validation", () => {
  it("signup normalises the email and checks the password", () => {
    expect(
      validateSignup({ email: " Ann@Example.COM ", password: "12345678" }),
    ).toEqual({
      ok: true,
      value: { email: "ann@example.com", password: "12345678" },
    });
    expect(validateSignup({ email: "nope", password: "short" })).toEqual({
      ok: false,
      errors: {
        email: "a valid email is required",
        password: "at least 8 characters",
      },
    });
    expect(validateSignup("x")).toMatchObject({ ok: false });
    expect(
      validateSignup({ email: "a@b.co", password: "x".repeat(201) }),
    ).toMatchObject({ ok: false });
  });
  it("login only requires presence", () => {
    expect(validateLogin({ email: "A@b.co", password: "p" })).toMatchObject({
      ok: true,
    });
    expect(validateLogin({})).toMatchObject({
      ok: false,
      errors: { email: "required", password: "required" },
    });
  });
  it("ids are positive integers in a path segment", () => {
    expect(validateId("12")).toEqual({ ok: true, value: 12 });
    for (const bad of [
      "0",
      "-1",
      "1e3",
      "01",
      "abc",
      "9999999999999",
      undefined,
    ])
      expect(validateId(bad), String(bad)).toMatchObject({ ok: false });
  });
  it("todos", () => {
    expect(validateTodoCreate({ title: "  hi " })).toEqual({
      ok: true,
      value: { title: "hi" },
    });
    expect(validateTodoCreate({ title: " " })).toMatchObject({ ok: false });
    expect(validateTodoPatch({ done: true })).toEqual({
      ok: true,
      value: { done: true },
    });
    expect(validateTodoPatch({})).toMatchObject({ ok: false });
    expect(validateTodoPatch({ done: "yes" })).toMatchObject({ ok: false });
  });
  it("reorder wants unique positive ids", () => {
    expect(validateReorder({ ids: [3, 1] })).toEqual({
      ok: true,
      value: { ids: [3, 1] },
    });
    for (const ids of [
      [],
      [1, 1],
      [0],
      [1.5],
      ["1"],
      new Array(501).fill(1).map((_, i) => i + 1),
    ])
      expect(
        validateReorder({ ids }),
        JSON.stringify(ids).slice(0, 20),
      ).toMatchObject({ ok: false });
  });
  it("chat rooms and frames", () => {
    expect(validateRoom(undefined)).toEqual({ ok: true, value: "general" });
    expect(validateRoom("a b")).toMatchObject({ ok: false });
    expect(validateChat('{"text":" hi "}')).toEqual({
      ok: true,
      value: { text: "hi" },
    });
    for (const f of [
      "nope",
      "{}",
      '{"text":""}',
      Buffer.from("x"),
      JSON.stringify({ text: "x".repeat(1001) }),
    ])
      expect(validateChat(f)).toMatchObject({ ok: false });
  });
});
