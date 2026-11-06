// @vitest-environment jsdom
import { expect, test } from "vitest";
import { traceTemplate } from "../engine/trace.ts";

const tpl = `ul.list
  for item, i in items key item.id
    li(class:done=item.done @click=toggle(item.id)) {i + 1}. {item.title}
if items.length === 0
  p.empty Nothing here
`;
const a = JSON.stringify({ items: [{ id: 1, title: "A", done: false }] });
const b = JSON.stringify({
  items: [
    { id: 1, title: "A", done: true },
    { id: 2, title: "B", done: false },
  ],
});

test("every stage produces something for a real template", () => {
  const t = traceTemplate(tpl, a, b);
  expect(t.error).toBe("");
  expect(t.lines).toHaveLength(6);
  expect(t.astJson.length).toBeGreaterThan(10);
  expect(t.exprs.map((e) => e.where)).toContain("class:done");
  expect(t.render.length).toBeGreaterThan(10);
  expect(t.diff.length).toBeGreaterThan(10);
  expect(t.render.some((l) => l.src === 3)).toBe(true);
  expect(t.module.length).toBeGreaterThan(t.render.length);
  expect(t.newFunction.params).toContain("toText");
  expect(t.patches.map((p) => p.op)).toContain("insert");
  expect(t.domBefore.length).toBeGreaterThan(2);
  expect(t.mutations.length).toBeGreaterThan(0);
  expect(t.listeners).toBeGreaterThan(0);
});

test("errors and bad state are reported, not thrown", () => {
  expect(traceTemplate("p {a +}", "{}", "{}").error).not.toBe("");
  expect(traceTemplate("p hi", "{", "{}").stateError).not.toBe("");
});
