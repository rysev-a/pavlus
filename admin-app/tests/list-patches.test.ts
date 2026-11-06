// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { mountView } from "@service-laboratory/pavlus/testing";
import view from "../app/user-list/user-list.pavlus";
import { rows } from "../app/user-list/user-list.ts";
import {
  assertBinding,
  listPatches,
  type ListNote,
} from "../app/list-patches.ts";
import type { ListState, RowState, User } from "../app/state.ts";

/**
 * The point-wise list patches (app/list-patches.ts) against the real users
 * page: its real compiled view and its real binding. The property that
 * matters is equivalence — whenever a note verifies, applying its patches
 * and applying the generic view.diff must leave the same DOM.
 *
 * The binding's field is `order` — ids, not row objects: the rows' contents
 * live in `byId`, outside the binding. Every prev/next pair differs in
 * `order` only, like the per-write answers the store really produces (a
 * same-tick change to another field arrives in its own answer); a note
 * claiming a remove or a sort says nothing about contents, and the handlers
 * only set one when contents did not change with it. (An "update" note is
 * for bindings whose items carry their contents; this one has none, so it
 * is not tested here.)
 */

const user = (id: number, over: Partial<User> = {}): RowState => ({
  id,
  name: `User ${id}`,
  email: `u${id}@example.com`,
  role_id: 1,
  role: "admin",
  starred: false,
  ...over,
});

/** A page state whose window shows exactly these rows, in this order. */
const page = (us: RowState[], over: Partial<ListState> = {}): ListState => {
  const byId: Record<string, RowState> = {};
  for (const u of us) byId[String(u.id)] = u;
  return {
    byId,
    order: us.map((u) => String(u.id)),
    total: us.length,
    filter: "",
    page: 1,
    pages: 1,
    pageSize: 10,
    status: "idle",
    error: "",
    selected: [],
    allOn: false,
    sortKey: "id",
    sortDir: 1,
    ...over,
  };
};

/** Mounts the pair twice, applies each patch set, compares the DOM. */
const agrees = (prev: ListState, next: ListState, note: ListNote) => {
  const a = mountView(view, prev);
  const b = mountView(view, prev);
  const patches = listPatches(view, rows, prev, next, note);
  if (patches === null) throw new Error("the note must verify");
  a.dom.update(a.root, patches);
  b.set(next);
  const aHtml = a.root.innerHTML;
  const bHtml = b.root.innerHTML;
  a.unmount();
  b.unmount();
  expect(aHtml).toBe(bHtml);
  return patches;
};

/** The note must be rejected: null, so the caller diffs generically. */
const fallsBack = (prev: ListState, next: ListState, note: ListNote): void => {
  expect(listPatches(view, rows, prev, next, note)).toBeNull();
};

describe("the rows binding", () => {
  test("matches the compiled template's markers", () => {
    assertBinding(view, rows, page([user(1), user(2), user(3)]));
  });

  test("flags a stale binding", () => {
    const stale = { ...rows, listEnd: "99e" };
    expect(() => assertBinding(view, stale, page([user(1)]))).toThrow(/stale/);
  });
});

describe("remove", () => {
  test("on the last page: one remove patch, same DOM as the generic diff", () => {
    const users = Array.from({ length: 30 }, (_, i) => user(i + 1));
    // `total` is pinned: it changes in its own write, its own answer — at the
    // order answer the slice differs in `order` (and `byId`) only.
    const prev = page(users.slice(20), { page: 3, pages: 3, total: 30 });
    const next = page(users.slice(20, 29), { page: 3, pages: 3, total: 30 }); // 21..29
    const patches = agrees(prev, next, { kind: "remove", keys: ["30"] });
    expect(patches).toEqual([{ op: "remove", from: "#3033[", to: "#3033]" }]);
  });

  test("that slides the window is rejected", () => {
    const users = Array.from({ length: 30 }, (_, i) => user(i + 1));
    const prev = page(users.slice(0, 10), { pages: 3 });
    // ids 1..4, 6..11 — row 11 slid in with the removal of row 5
    const next = page([...users.slice(0, 4), ...users.slice(5, 11)], {
      pages: 3,
    });
    fallsBack(prev, next, { kind: "remove", keys: ["5"] });
  });

  test("removing the last row crosses the empty state (fallback)", () => {
    const prev = page([user(1)]);
    const next = page([]);
    fallsBack(prev, next, { kind: "remove", keys: ["1"] });
  });

  test("with a key that survives is rejected", () => {
    const prev = page([user(1), user(2)]);
    fallsBack(prev, prev, { kind: "remove", keys: ["9"] });
  });
});

describe("add", () => {
  test("in the middle and at the end: inserts at their real positions", () => {
    // `total` still the old value at the order answer (see the remove test).
    const prev = page([user(1), user(3)], { total: 2 });
    const next = page([user(1), user(2), user(3), user(4)], { total: 2 });
    const patches = agrees(prev, next, { kind: "add", keys: ["2", "4"] });
    expect(patches.map((p) => p.op)).toEqual(["insert", "insert"]);
    expect(patches[0]).toMatchObject({ before: "#333[" }); // before id 3
    expect(patches[1]).toMatchObject({ before: "33e" }); // at the list end
  });

  test("adding the first row crosses the empty state (fallback)", () => {
    const prev = page([]);
    const next = page([user(1)]);
    fallsBack(prev, next, { kind: "add", keys: ["1"] });
  });

  test("with an incomplete key list is rejected", () => {
    const prev = page([user(1), user(3)]);
    const next = page([user(1), user(2), user(3), user(4)]);
    fallsBack(prev, next, { kind: "add", keys: ["2"] }); // key 4 unnoted
  });
});

describe("sort", () => {
  test("same ids reversed: moves only, same DOM as the generic diff", () => {
    const users = [user(1), user(2), user(3)];
    const prev = page(users);
    const next = page([...users].reverse()); // a pure reorder: byId untouched
    const patches = agrees(prev, next, { kind: "sort" });
    expect(patches.length).toBeGreaterThan(0);
    for (const p of patches) expect(p.op).toBe("move");
  });

  test("with a key set change hidden inside is rejected", () => {
    const users = [user(1), user(2), user(3)];
    const prev = page(users);
    const next = page([user(3), user(2)]); // 1 went away too, not just moved
    fallsBack(prev, next, { kind: "sort" });
  });
});

test("a replace note always falls back", () => {
  const prev = page([user(1)]);
  fallsBack(prev, prev, { kind: "replace" });
});
