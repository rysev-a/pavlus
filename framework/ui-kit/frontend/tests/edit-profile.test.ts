import { expect, test } from "vitest";
import {
  BIO_MAX,
  derive,
  hueOf,
  initialsOf,
  initial,
  isDirty,
  roleLabel,
  validate,
} from "../blocks/edit-profile/edit-profile.ts";

test("initials: first and last word", () => {
  expect(initialsOf("Maya Okafor")).toBe("MO");
  expect(initialsOf("  ann  marie  lee ")).toBe("AL");
  expect(initialsOf("Plato")).toBe("P");
  expect(initialsOf("   ")).toBe("?");
});

test("a name always gives the same hue", () => {
  expect(hueOf("Maya Okafor")).toBe(hueOf("maya okafor "));
  expect(hueOf("Maya Okafor")).toBeGreaterThanOrEqual(0);
  expect(hueOf("Maya Okafor")).toBeLessThan(360);
});

test("dirty means different from what is saved", () => {
  const p = initial.saved;
  expect(isDirty(p, p)).toBe(false);
  expect(isDirty(p, { ...p })).toBe(false);
  expect(isDirty(p, { ...p, bio: p.bio + "!" })).toBe(true);
  expect(isDirty(p, { ...p, notifyPush: !p.notifyPush })).toBe(true);
});

test("validation by field", () => {
  const p = initial.saved;
  expect(validate(p)).toEqual({});
  expect(validate({ ...p, name: " " }).name).toBeDefined();
  expect(validate({ ...p, username: "A B" }).username).toBeDefined();
  expect(validate({ ...p, email: "maya@" }).email).toBeDefined();
  expect(validate({ ...p, bio: "x".repeat(BIO_MAX + 1) }).bio).toBeDefined();
});

test("derived values follow the draft", () => {
  const p = initial.saved;
  const d = derive(p, { ...p, name: "Li Wei", bio: "hi", role: "admin" });
  expect(d.dirty).toBe(true);
  expect(d.initials).toBe("LW");
  expect(d.bioCount).toBe(2);
  expect(d.bioLeft).toBe(BIO_MAX - 2);
  expect(d.roleLabel).toBe("Administrator");
  expect(roleLabel("nobody")).toBe("nobody");
});
