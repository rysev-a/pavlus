import { describe, expect, test } from "vitest";
import { builder } from "../templates/visual-builder/build.ts";
import {
  addElement,
  clampRect,
  freeSpot,
  layoutOf,
  moveTo,
  nudge,
  overlaps,
  resizeTo,
  resolve,
  sectionRows,
  setRect,
} from "../templates/visual-builder/grid.ts";
import {
  canRedo,
  canUndo,
  commit,
  redo,
  start,
  undo,
} from "../templates/visual-builder/history.ts";
import {
  appendAction,
  blankAction,
  getAction,
  moveAction,
  removeAction,
  rows,
  updateAction,
} from "../templates/visual-builder/chain.ts";
import {
  validateField,
  validateForm,
} from "../templates/visual-builder/validate.ts";
import {
  blankField,
  duplicateElement,
  emptyModel,
  findElement,
  makeElement,
  removeElement,
  ELEMENTS,
  EL_TYPES,
} from "../templates/visual-builder/model.ts";
import { makeSection } from "../templates/visual-builder/sections.ts";
import {
  addSectionTo,
  deleteSection,
  duplicateSection,
  moveSection,
  newPage,
  uniqueSlug,
} from "../templates/visual-builder/pages.ts";

const b = builder(0);
const sec = () => {
  const bb = builder(0);
  return bb.section("empty", "S", [
    bb.el("text", 0, 0, 6, 2),
    bb.el("text", 6, 0, 6, 2),
    bb.el("text", 0, 2, 12, 1),
  ]);
};

describe("grid", () => {
  test("clamps to the 12 columns", () => {
    expect(clampRect({ x: 10, y: -3, w: 5, h: 0 })).toEqual({
      x: 7,
      y: 0,
      w: 5,
      h: 1,
    });
    expect(clampRect({ x: 0, y: 0, w: 99, h: 2 }).w).toBe(12);
  });

  test("moving onto another element pushes it down, the rest stays", () => {
    const s = sec();
    const [a, c, d] = s.elements;
    const out = moveTo(s, "desktop", a.id, 6, 0)!;
    const l = layoutOf(out, "desktop");
    expect(l[a.id]).toMatchObject({ x: 6, y: 0 });
    expect(l[c.id].y).toBe(2); // pushed below
    expect(l[d.id].y).toBeGreaterThanOrEqual(4); // and the cascade pushed the wide one
    expect(overlaps(l[a.id], l[c.id])).toBe(false);
    expect(overlaps(l[c.id], l[d.id])).toBe(false);
  });

  test("a move to free cells changes only the moved element", () => {
    const s = sec();
    const out = moveTo(s, "desktop", s.elements[2].id, 0, 5)!;
    const l = layoutOf(out, "desktop");
    expect(l[s.elements[0].id]).toEqual({ x: 0, y: 0, w: 6, h: 2 });
    expect(l[s.elements[2].id].y).toBe(5);
  });

  test("resize snaps to cells and pushes", () => {
    const s = sec();
    const out = resizeTo(s, "desktop", s.elements[0].id, 12, 3)!;
    const l = layoutOf(out, "desktop");
    expect(l[s.elements[0].id]).toMatchObject({ w: 12, h: 3 });
    expect(l[s.elements[1].id].y).toBeGreaterThanOrEqual(3);
  });

  test("nudge, setRect and a missing id", () => {
    const s = sec();
    expect(
      layoutOf(nudge(s, "desktop", s.elements[0].id, 1, 1)!, "desktop")[
        s.elements[0].id
      ],
    ).toMatchObject({ x: 1, y: 1 });
    expect(
      layoutOf(setRect(s, "desktop", s.elements[0].id, { w: 3 })!, "desktop")[
        s.elements[0].id
      ].w,
    ).toBe(3);
    expect(moveTo(s, "desktop", "nope", 0, 0)).toBeNull();
  });

  test("freeSpot finds the first free place; addElement uses it", () => {
    const s = sec();
    const spot = freeSpot(layoutOf(s, "desktop"), 4, 2);
    expect(spot).toEqual({ x: 0, y: 3 });
    const m = makeElement(emptyModel(), "button");
    const next = addElement(s, m.el);
    expect(layoutOf(next, "desktop")[m.el.id]).toMatchObject({ x: 0, y: 3 });
    expect(sectionRows(next, "desktop")).toBeGreaterThanOrEqual(4);
  });

  test("dropping a new element on a cell pushes what is there", () => {
    const s = sec();
    const m = makeElement(emptyModel(), "button");
    const next = addElement(s, m.el, { x: 0, y: 0 });
    const l = layoutOf(next, "desktop");
    expect(l[m.el.id]).toMatchObject({ x: 0, y: 0 });
    expect(overlaps(l[m.el.id], l[s.elements[0].id])).toBe(false);
  });

  test("devices: mobile stacks, tablet follows desktop, edits fork a layout", () => {
    const s = sec();
    const mob = layoutOf(s, "mobile");
    expect(Object.values(mob).every((r) => r.w === 12 && r.x === 0)).toBe(true);
    expect(layoutOf(s, "tablet")).toEqual(layoutOf(s, "desktop"));
    const edited = moveTo(s, "tablet", s.elements[0].id, 3, 0)!;
    expect(layoutOf(edited, "tablet")[s.elements[0].id].x).toBe(3);
    expect(layoutOf(edited, "desktop")[s.elements[0].id].x).toBe(0);
  });

  test("hidden on a device means no cell there", () => {
    const s = sec();
    s.elements[1].hide = { mobile: true };
    expect(Object.keys(layoutOf(s, "mobile"))).toHaveLength(2);
    expect(Object.keys(layoutOf(s, "desktop"))).toHaveLength(3);
  });

  test("resolve is stable when nothing collides", () => {
    const l = { a: { x: 0, y: 0, w: 2, h: 2 }, b: { x: 2, y: 0, w: 2, h: 2 } };
    expect(resolve(l, "a")).toEqual(l);
  });
});

describe("history", () => {
  test("commit, undo, redo", () => {
    let h = start(1);
    h = commit(h, 2);
    h = commit(h, 3);
    expect(h.present).toBe(3);
    h = undo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(3);
    expect(canRedo(h)).toBe(false);
    expect(undo(start(1)).present).toBe(1);
    expect(canUndo(start(1))).toBe(false);
  });

  test("a new commit drops the redo branch; same value records nothing", () => {
    let h = commit(commit(start(1), 2), 3);
    h = undo(h);
    h = commit(h, 9);
    expect(h.future).toEqual([]);
    expect(commit(h, 9)).toBe(h);
  });

  test("the same tag merges typing into one step", () => {
    let h = start("");
    for (const t of ["a", "ab", "abc"]) h = commit(h, t, "type");
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toBe("");
    h = commit(h, "x");
    h = commit(h, "xy", "type");
    expect(h.past).toHaveLength(3);
  });

  test("the history is limited", () => {
    let h = start(0);
    for (let i = 1; i < 150; i++) h = commit(h, i);
    expect(h.past.length).toBe(100);
  });
});

describe("chains", () => {
  const chain = [
    blankAction("set"),
    { ...blankAction("http"), then: [blankAction("notice")], catch: [] },
  ];

  test("paths address nested actions", () => {
    expect(getAction(chain, "1.then.0")?.t).toBe("notice");
    expect(getAction(chain, "9")).toBeNull();
    const c2 = updateAction(chain, "1.then.0", (a) => ({ ...a, text: "hi" }));
    expect(getAction(c2, "1.then.0")?.text).toBe("hi");
    expect(getAction(chain, "1.then.0")?.text).toBe("Done");
  });

  test("append, remove, move", () => {
    const c = appendAction(chain, "1.catch", blankAction("toggle"));
    expect(getAction(c, "1.catch.0")?.t).toBe("toggle");
    expect(removeAction(c, "0")).toHaveLength(1);
    expect(moveAction(chain, "0", 1)[0].t).toBe("http");
    expect(moveAction(chain, "0", -1)[0].t).toBe("set");
    expect(removeAction(chain, "1.then.0")[1].then).toEqual([]);
  });

  test("rows flatten for the editor", () => {
    const r = rows(chain);
    expect(r.map((x) => [x.path, x.depth, x.branch])).toEqual([
      ["0", 0, ""],
      ["1", 0, ""],
      ["1.then.0", 1, "then"],
    ]);
  });
});

describe("validation", () => {
  const f = (o: Partial<ReturnType<typeof blankField>>) => ({
    ...blankField("x", "X"),
    ...o,
  });
  test("required, email, number, length, pattern", () => {
    expect(validateField(f({ required: "yes" }), "")).toBe("X is required");
    expect(validateField(f({}), "")).toBe("");
    expect(validateField(f({ type: "email" }), "nope")).toBe(
      "Enter a valid email",
    );
    expect(validateField(f({ type: "email" }), "a@b.co")).toBe("");
    expect(
      validateField(f({ type: "number", min: "1", max: "5" }), "9"),
    ).toContain("at most");
    expect(validateField(f({ type: "number" }), "abc")).toBe("Enter a number");
    expect(validateField(f({ minLength: "3" }), "ab")).toContain("3");
    expect(validateField(f({ maxLength: "2" }), "abc")).toContain("2");
    expect(
      validateField(f({ pattern: "^[0-9]+$", message: "digits" }), "a1"),
    ).toBe("digits");
    expect(
      validateField(f({ type: "checkbox", required: "yes" }), false),
    ).toContain("required");
  });
  test("a form collects the errors by field", () => {
    const fields = [
      f({ name: "a", required: "yes" }),
      f({ name: "b", type: "email" }),
    ];
    expect(validateForm(fields, { a: "", b: "x" })).toEqual({
      a: "X is required",
      b: "Enter a valid email",
    });
    expect(validateForm(fields, { a: "1", b: "" })).toEqual({});
  });
});

describe("model operations", () => {
  test("every element type has a definition, a default size and defaults", () => {
    for (const t of EL_TYPES) {
      const d = ELEMENTS[t];
      expect(d.w).toBeGreaterThan(0);
      expect(d.events.length).toBeGreaterThan(0);
      for (const p of d.props) expect(p.name in d.defaults).toBe(true);
    }
  });

  test("the library makes sections and adds the keys they need", () => {
    let m = emptyModel();
    for (const kind of [
      "hero",
      "features",
      "pricing",
      "form",
      "table",
      "dashboard",
      "footer",
      "empty",
    ] as const) {
      const r = makeSection(m, kind);
      m = addSectionTo(r.model, m.pages[0].id, r.section);
    }
    expect(m.pages[0].sections).toHaveLength(8);
    expect(m.keys.map((k) => k.key)).toEqual(
      expect.arrayContaining(["plans", "lead", "rows", "sales"]),
    );
    const ids = new Set<string>();
    for (const s of m.pages[0].sections)
      for (const e of s.elements) ids.add(e.id);
    expect(ids.size).toBe(
      m.pages[0].sections.flatMap((s) => s.elements).length,
    );
  });

  test("sections move, duplicate with new ids, delete", () => {
    let m = emptyModel();
    const a = makeSection(m, "hero");
    m = addSectionTo(a.model, m.pages[0].id, a.section);
    const c = makeSection(m, "footer");
    m = addSectionTo(c.model, m.pages[0].id, c.section);
    const [s1, s2] = m.pages[0].sections;
    expect(moveSection(m, s2.id, -1).pages[0].sections[0].id).toBe(s2.id);
    expect(moveSection(m, s1.id, -1).pages[0].sections[0].id).toBe(s1.id);
    const dup = duplicateSection(m, s1.id)!;
    const copy = dup.model.pages[0].sections[1];
    expect(copy.id).toBe(dup.id);
    expect(copy.elements[0].id).not.toBe(s1.elements[0].id);
    expect(deleteSection(dup.model, dup.id).pages[0].sections).toHaveLength(2);
  });

  test("duplicate and remove an element; pages get unique slugs", () => {
    let m = emptyModel();
    const r = makeSection(m, "hero");
    m = addSectionTo(r.model, m.pages[0].id, r.section);
    const id = m.pages[0].sections[0].elements[0].id;
    const d = duplicateElement(m, id)!;
    expect(findElement(d.model, d.id)).not.toBeNull();
    expect(findElement(removeElement(d.model, d.id), d.id)).toBeNull();
    expect(newPage(m, "Pricing").model.pages[1].slug).toBe("/pricing");
    expect(uniqueSlug(m, "/")).toBe("/-2");
    expect(b.seq()).toBe(0);
  });
});
