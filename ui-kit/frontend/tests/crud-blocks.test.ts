import { expect, test } from "vitest";
import {
  type ColumnDef,
  type FilterDef,
  initialTable,
  jumpsOf,
  reduceTable,
  tableView,
} from "../blocks/crud-table/table.ts";
import {
  draftOf,
  fieldsView,
  type FieldDef,
  reduceDraft,
  rowOf,
  validateDraft,
} from "../blocks/crud-form/form.ts";

interface P {
  id: number;
  name: string;
  kind: string;
  price: number;
}
const rows: P[] = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  name: `Item ${25 - i}`,
  kind: i % 2 ? "a" : "b",
  price: (i * 7) % 20,
}));
const cols: ColumnDef<P>[] = [
  { key: "name", label: "Name", value: (r) => r.name },
  { key: "price", label: "Price", align: "right", value: (r) => r.price },
];
const filters: FilterDef<P>[] = [
  { key: "kind", label: "Kind", options: [{ value: "", label: "All" }, { value: "a", label: "A" }], value: (r) => r.kind },
];
const ids = (st = initialTable("name")) => tableView(rows, cols, filters, st).rows.map((r) => r.id);

test("table: paging, the range and the jumps", () => {
  const v = tableView(rows, cols, filters, initialTable("name"));
  expect(v.rows).toHaveLength(10);
  expect(v.pages).toBe(3);
  expect(v.range).toBe("1-10");
  expect(tableView(rows, cols, filters, { ...initialTable("name"), page: 3 }).range).toBe("21-25");
  // a page past the end falls back to the last
  expect(tableView(rows, cols, filters, { ...initialTable("name"), page: 99 }).page).toBe(3);
  expect(jumpsOf(1, 3).map((j) => j.n)).toEqual([1, 2, 3]);
  expect(jumpsOf(10, 20).map((j) => j.n)).toEqual([8, 9, 10, 11, 12]);
});

test("table: sort numbers by value, text by text, ties by id, and toggle the direction", () => {
  const byPrice = initialTable("price");
  const asc = tableView(rows, cols, filters, { ...byPrice, pageSize: 100 }).rows.map((r) => r.cells[1].text);
  expect(asc.map(Number)).toEqual([...asc.map(Number)].sort((a, b) => a - b));
  let st = reduceTable(initialTable("name"), "sort", "name", () => []);
  expect(st.sortDir).toBe("desc");
  st = reduceTable(st, "sort", "price", () => []);
  expect([st.sortKey, st.sortDir]).toEqual(["price", "asc"]);
});

test("table: search and filters narrow the rows and go back to page 1", () => {
  let st = reduceTable({ ...initialTable("name"), page: 3 }, "search", "item 2", () => []);
  expect(st.page).toBe(1);
  expect(tableView(rows, cols, filters, st).total).toBe(rows.filter((r) => r.name.toLowerCase().includes("item 2")).length);
  st = reduceTable(initialTable("name"), "filter", ["kind", "a"], () => []);
  expect(tableView(rows, cols, filters, st).total).toBe(12);
});

test("table: tick a row, tick a page, untick a page", () => {
  const visible = (st: ReturnType<typeof initialTable>) => ids(st);
  let st = reduceTable(initialTable("name"), "toggleRow", 25, visible);
  expect(tableView(rows, cols, filters, st).selectedCount).toBe(1);
  expect(tableView(rows, cols, filters, st).someSelected).toBe(true);
  st = reduceTable(st, "toggleAll", null, visible);
  expect(tableView(rows, cols, filters, st).allSelected).toBe(true);
  st = reduceTable(st, "toggleAll", null, visible);
  expect(st.selected).toEqual([]);
});

interface Ctx { names: string[] }
const ctx: Ctx = { names: ["x", "y"] };
const defs: FieldDef<Ctx>[] = [
  { key: "name", label: "Name", kind: "text", required: true },
  { key: "mail", label: "Email", kind: "email", required: true },
  { key: "age", label: "Age", kind: "number", min: 18, max: 99 },
  { key: "pick", label: "Pick", kind: "select", numeric: true, options: () => [{ value: "1", label: "One" }, { value: "2", label: "Two" }] },
  { key: "on", label: "On", kind: "switch" },
  { key: "tags", label: "Tags", kind: "checks", numeric: true, options: () => [{ value: "1", label: "a" }, { value: "2", label: "b" }] },
  { key: "lines", label: "Lines", kind: "lines", options: () => [{ value: "1", label: "P1" }, { value: "2", label: "P2" }], priceOf: (id) => (id === "1" ? "10" : "20") },
];

test("form: a row becomes a draft and a valid draft becomes the row again", () => {
  const row = { name: "Ann", mail: "a@b.co", age: 30, pick: 2, on: true, tags: [1, 2], lines: [{ productId: 1, qty: 2, price: 10 }], extra: "keep" };
  const draft = draftOf(defs, row, ctx);
  expect(draft.pick).toBe("2");
  expect(validateDraft(defs, draft, ctx)).toEqual({});
  expect(rowOf(defs, draft, row, ctx)).toEqual(row);
});

test("form: the messages", () => {
  const e = validateDraft(defs, draftOf(defs, { age: 5, pick: 9, lines: [] }, ctx), ctx);
  expect(e.name).toBe("Name is required");
  expect(e.mail).toBe("Email is required");
  expect(e.age).toBe("At least 18");
  expect(e.pick).toBe("Choose one of the options");
  expect(e.lines).toMatch(/Add at least one/);
  const bad = validateDraft(defs, draftOf(defs, { name: "A", mail: "nope", lines: [{ productId: 1, qty: 0, price: 1 }] }, ctx), ctx);
  expect(bad.mail).toBe("That is not an email address");
  expect(bad.lines).toMatch(/quantity/);
});

test("form: the changes of a draft, lines included", () => {
  let d = draftOf(defs, {}, ctx);
  d = reduceDraft(defs, d, "change", "name", { value: "Zed" }, ctx);
  expect(d.name).toBe("Zed");
  d = reduceDraft(defs, d, "check", ["tags", "2"], { checked: true }, ctx);
  d = reduceDraft(defs, d, "check", ["tags", "1"], { checked: true }, ctx);
  d = reduceDraft(defs, d, "check", ["tags", "2"], { checked: false }, ctx);
  expect(d.tags).toEqual(["1"]);
  d = reduceDraft(defs, d, "lineAdd", "lines", undefined, ctx);
  d = reduceDraft(defs, d, "lineSet", ["lines", 0, "productId"], { value: "2" }, ctx);
  expect(d.lines).toEqual([{ productId: "2", qty: "1", price: "20" }]);
  d = reduceDraft(defs, d, "lineSet", ["lines", 0, "qty"], { value: "3" }, ctx);
  const view = fieldsView(defs, d, {}, ctx).find((f) => f.key === "lines")!;
  expect(view.lines[0].sum).toBe("$60.00");
  expect(view.count).toBe("Total $60.00");
  d = reduceDraft(defs, d, "lineRemove", ["lines", 0], undefined, ctx);
  expect(d.lines).toEqual([]);
});
