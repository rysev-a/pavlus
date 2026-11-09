// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { compileToView } from "../../compiler/mod.ts";
import { parse as parseNative } from "../../template/parser.ts";
import { TemplateError } from "../../template/errors.ts";
import { toHtml } from "../../runtime/vnode.ts";
import { mountView } from "../../testing/mod.ts";
import { expectSameAs } from "../equivalence.ts";
import { parsePug } from "./parse.ts";

const same = (
  pug: string,
  native: string,
  states: unknown[],
  components: Record<string, any> = {},
) => expectSameAs(parsePug, pug, native, states, components);

/** The error a source throws, for position assertions. */
function error(src: string): TemplateError {
  try {
    parsePug(src);
  } catch (e) {
    if (e instanceof TemplateError) return e;
    throw e;
  }
  throw new Error("expected a TemplateError");
}

const items = (...ids: number[]) =>
  ids.map((id) => ({
    id,
    name: `n${id}`,
    done: id % 2 === 0,
    tags: [id, id + 1],
  }));

describe("equivalence with the native syntax", () => {
  test("todo list", () => {
    same(
      `section.todo#main
  h1.title Todos (#{items.length})
  input(type="text" placeholder="What?" value=draft @input="draft" disabled)
  ul
    each item, i in items key item.id
      li(class:done="item.done" @click="toggle(item.id)")
        span.index #{i}.
        span #{item.name}
        button.remove(@click.stop="remove(item)") x
  if empty
    p.empty Nothing to do
  else
    p #{items.length} left`,
      `section.todo#main
  h1.title Todos ({items.length})
  input(type="text" placeholder="What?" value=draft @input=draft disabled)
  ul
    for item, i in items key item.id
      li(class:done=item.done @click=toggle(item.id))
        span.index {i}.
        span {item.name}
        button.remove(@click.stop=remove(item)) x
  if empty
    p.empty Nothing to do
  else
    p {items.length} left`,
      [
        { items: [], draft: "", empty: true },
        { items: items(1, 2, 3), draft: "x", empty: false },
        { items: items(3, 1), draft: "", empty: false },
        { items: items(2, 4, 6, 8), draft: "y", empty: false },
      ],
    );
  });

  test("nested loops with keys, bare and quoted attributes, comma separators", () => {
    same(
      `//- a silent comment
// an output comment, dropped too
  with a nested block
table
  each row in rows key row.id
    tr(data-id=row.id, class="r #{row.id}")
      each cell, c in row.cells key cell
        td(title="cell #{c}: #{cell}") #{cell}`,
      `table
  for row in rows key row.id
    tr(data-id=row.id class="r {row.id}")
      for cell, c in row.cells key cell
        td(title="cell {c}: {cell}") {cell}`,
      [
        { rows: [] },
        { rows: [{ id: 1, cells: ["a", "b"] }] },
        {
          rows: [
            { id: 2, cells: ["b"] },
            { id: 1, cells: ["a", "c", "d"] },
          ],
        },
      ],
    );
  });

  test("conditionals: if / else if / else / precomputed negation / nesting", () => {
    same(
      `div
  if a
    p A
  else if b
    p B
    if c
      i nested
  else
    p none
  if notA
    p not a
  else
    p is a`,
      `div
  if a
    p A
  else if b
    p B
    if c
      i nested
  else
    p none
  if notA
    p not a
  else
    p is a`,
      [
        { a: true, b: false, c: false, notA: false },
        { a: false, b: true, c: true, notA: true },
        { a: false, b: true, c: false, notA: true },
        { a: false, b: false, c: false, notA: true },
      ],
    );
  });

  test("`case` / `when` is rejected: comparisons belong to component code", () => {
    const e = error(`div\n  case kind\n    when "a"\n      p A`);
    expect([e.line, e.col]).toEqual([2, 3]);
    expect(e.message).toMatch(
      /^`case` is not supported — comparisons belong to component code, pass ready flags \(framework\/docs\/philosophy\.md\)/,
    );
    // the `when value: tag` expansion form is gone with it
    expect(() => parsePug(`case n\n  when 1: p one\n  when 2: b: i two`)).toThrow(
      /philosophy/,
    );
  });

  test("each ... else maps to an if on the length", () => {
    same(
      `ul
  each x in xs key x
    li #{x}
  else
    li.empty none`,
      `ul
  if xs.length
    for x in xs key x
      li {x}
  else
    li.empty none`,
      [{ xs: [] }, { xs: ["a"] }, { xs: ["a", "b"] }],
    );
  });

  test("text: pipes, buffered code, escapes, dot blocks, inline tags, expansion", () => {
    same(
      `p
  | first #{a}
  | second \\#{not an interpolation}
  = b
  | { literal } braces
div: p: span.x= a
pre.
  line one #{a}
    indented
  line two`,
      `p
  | first {a}
  | second #\\{not an interpolation}
  {b}
  | \\{ literal \\} braces
div
  p
    span.x {a}
pre
  | line one {a}
  |   indented
  | line two`,
      [{ a: "A<b>", b: "B&" }],
    );
  });

  test("inline tags keep the spaces around them (pug), unlike `|` lines", () => {
    const v = compileToView(
      `p Hello #[b.strong world #{a}] and #[a(href="/x") link].`,
      { parser: parsePug },
    );
    expect(toHtml(v.render({ a: "<" }))).toBe(
      `<p>Hello <b class="strong">world &lt;</b> and <a href="/x">link</a>.</p>`,
    );
  });

  test("class attribute merging, ids, implicit div, quoted values", () => {
    same(
      `.box.big#top(class="x y" class=extra title='say "hi"')
  #inner(class="a #{extra}")
  br/
  img(src="a.png")`,
      `div.box.big.x.y#top(class="{extra}" title='say "hi"')
  div#inner(class="a {extra}")
  br
  img(src="a.png")`,
      [{ extra: "z" }, { extra: "" }],
    );
  });

  test("multi-line attribute lists; operators in unquoted values are rejected", () => {
    same(
      `a(href=href
   title=label
   disabled
   @click="go(next)") link`,
      `a(href={href} title={label} disabled @click=go(next)) link`,
      [
        { href: "/x/1", label: "small", next: 2 },
        { href: "/x/5", label: "big", next: 6 },
      ],
    );
    const plus = error(`a(href="/x/" + id) link`);
    expect([plus.line, plus.col]).toEqual([1, 14]);
    expect(plus.message).toMatch(/the "\+" operator is not allowed/);
    const cmp = error(`a(title=id > 1) link`);
    expect([cmp.line, cmp.col]).toEqual([1, 12]);
    expect(cmp.message).toMatch(/the ">" operator is not allowed/);
    expect(() => parsePug(`a(@click="go(id + 1)") link`)).toThrow(/philosophy/);
  });

  test("embeds: static imported, dynamic, instance names, props, spread, outlet", () => {
    const Row = compileToView(`li.row(class:on=on @click=pick(id)) {label}`);
    const Plain = compileToView(`p.plain {title}`);
    const Numbered = compileToView(`ol.n\n  li {title}`);
    same(
      `- import Row from "./row.pavlus"
ul.list
  each it in items key it.id
    +Row#row(id=it.id label="#{it.name}!" on=it.done)
  +Row(id=0 label="solo" on=false)
  +Row#rest&attributes(extra)(label="x")
  +#{View}#view(title=title)`,
      `import Row from "./row.pavlus"
ul.list
  for it in items key it.id
    +Row#row(id=it.id label="{it.name}!" on=it.done)
  +Row(id=0 label="solo" on=false)
  +Row#rest(...extra label="x")
  +{View}#view(title=title)`,
      [
        { items: [], extra: { id: 9, on: true }, View: Plain, title: "t" },
        {
          items: items(1, 2),
          extra: { id: 7, label: "e" },
          View: Numbered,
          title: "u",
        },
        { items: items(2), extra: {}, View: Plain, title: "v" },
      ],
      { Row },
    );
  });

  test("whitespace: text after text joins with a newline, nid order matches", () => {
    const a = parsePug(`p one\n  | two\n  b x\n  | three\n| root`);
    const b = parseNative(`p one\n  | two\n  b x\n  | three\n| root`);
    expect(a).toEqual(b);
  });

  test("whole-tree AST equality with the native parser", () => {
    const pug = `- import Card from "./card.pavlus"
div.app#a(class:on=big @click.prevent.stop="go(x, y)")
  each u, i in users key u.id
    +Card#card(title=u.name)&attributes(u)`;
    const native = `import Card from "./card.pavlus"
div.app#a(class:on={big} @click.prevent.stop=go(x, y))
  for u, i in users key u.id
    +Card#card(title=u.name ...u)`;
    expect(parsePug(pug)).toEqual(parseNative(native));
  });
});

describe("rejected constructs", () => {
  test.each([
    ["p!= html", /Unescaped/],
    ["p !{html}", /Unescaped/],
    ["p(title!='x')", /Unescaped/],
    ["| a !{b}", /Unescaped/],
    ["!= x", /Unescaped/],
    ["<div></div>", /Inline HTML/],
    ["- var x = 1", /Unbuffered code/],
    ["mixin card\n  p x", /Mixin definitions/],
    ["include a.pug", /include/],
    ["doctype html", /doctype/],
    ["while x\n  p", /while/],
    ["unless a\n  p", /`unless` is not supported/],
    ["case a\n  when 1\n    p", /`case` is not supported/],
    ["p #{a ? b : c}", /ternary is not allowed/],
    ["div(&attributes(x))", /in attributes/],
    ["div&attributes(x)", /only supported on component calls/],
  ])("%s", (src, re) => {
    expect(() => parsePug(src)).toThrow(re);
  });
});

describe("error positions", () => {
  const at = (src: string, line: number, col: number, re?: RegExp) => {
    const e = error(src);
    expect([e.line, e.col]).toEqual([line, col]);
    if (re) expect(e.message).toMatch(re);
  };

  test("lines and attributes", () => {
    at("div\n\tp", 2, 1, /Tabs/);
    at("div\n    p\n  p", 3, 1, /Inconsistent/);
    at("div\n  p(a=1", 2, 4, /Unclosed \(/);
    at("div\n  p(a='x)", 2, 7, /Unterminated/);
    at("p\n  | a #{b", 2, 7, /Unclosed \{/);
    at("div\n  p(a=)", 2, 7, /Expected a value/);
    at("p(@click=1) x", 1, 10, /message id/);
    at("p(@click.bogus=go) x", 1, 3, /modifier/);
    at("p(class:=a)", 1, 3, /class name/);
    at("p(class:x) x", 1, 3, /needs an expression/);
    at("div\n  | ok\n  p(a=b +) x", 3, 9, /not allowed/);
  });

  test("structure", () => {
    at("br\n  p x", 2, 3, /cannot have children/);
    at("br text", 1, 1, /cannot have content/);
    at("a: br: p", 1, 8, /cannot have children/);
    at("p\n  | x\n    | y", 3, 5, /cannot have children/);
    at("else\n  p", 1, 1, /without matching/);
    at("if a\n  p\nelse\n  p\nelse\n  p", 5, 1, /without matching/);
    at("p\nelse if a", 2, 1, /without matching/);
    at("each x in xs\n  p\nelse if a", 3, 1, /without matching/);
    at("if", 1, 3, /needs a condition/);
    at("each x xs", 1, 8, /Expected `item in expr`/);
    at("each x in xs key", 1, 14, /key/);
    at("div\n  case kind\n    when 1\n      p", 2, 3, /`case` is not supported/);
    at("case a", 1, 1, /`case` is not supported/);
    at("when 1\n  p", 1, 1, /outside/);
    at("default\n  p", 1, 1, /outside/);
  });

  test("imports and components", () => {
    at("p x\n- import Row from './r'", 2, 1, /top of the file/);
    at("- import row from './r'", 1, 1, /capital/);
    at("- import Map from './r'", 1, 1, /cannot be used/);
    at('- import Row from "./r"\n- import Row from "./r"', 2, 1, /twice/);
    at("- import Row from", 1, 18, /quoted path/);
    at("+Row#r", 1, 2, /"Row" is not imported/);
    at("+#{Row}", 1, 1, /needs an instance name/);
    at("- import Row from './r'\n+Row text", 2, 6, /after a component/);
    at("- import Row from './r'\n+Row\n  p", 3, 3, /cannot have children/);
    at("- import Row from './r'\n+Row(@click=go)", 2, 6, /not a valid prop/);
    at("+outlet(a=1)", 1, 8, /takes nothing/);
    at("- import Row from './r'\n+Row.big", 2, 5, /Classes/);
  });

  test("expressions report their own position", () => {
    at("p\n  if a +\n    p", 2, 8, /the "\+" operator is not allowed/);
    at("p #{a b}", 1, 7);
  });
});

describe("rendered through the dom plugin", () => {
  test("click, class toggle, loop with key, if", () => {
    const view = compileToView<{
      items: { id: number; name: string; on: boolean }[];
      shown: boolean;
    }>(
      `ul
  each it in items key it.id
    li(class:on="it.on" @click="pick(it.id)") #{it.name}
  if shown
    li.more
      button(@click.prevent="more") more`,
      { parser: parsePug },
    );
    const state = {
      items: [
        { id: 1, name: "a", on: false },
        { id: 2, name: "b", on: true },
      ],
      shown: true,
    };
    const h = mountView(view, state);
    const lis = () => [...h.root.querySelectorAll("li")];
    expect(lis().map((l) => l.className)).toEqual(["", "on", "more"]);
    (lis()[0] as HTMLElement).click();
    expect(h.messages).toMatchObject([{ id: "pick", payload: 1 }]);
    h.set({
      items: [
        { id: 2, name: "b", on: false },
        { id: 1, name: "a", on: true },
        { id: 3, name: "c", on: false },
      ],
      shown: false,
    });
    expect(lis().map((l) => l.textContent)).toEqual(["b", "a", "c"]);
    expect(lis().map((l) => l.className)).toEqual(["", "on", ""]);
    (lis()[2] as HTMLElement).click();
    expect(h.messages[1]).toMatchObject({ id: "pick", payload: 3 });
    h.unmount();
  });
});
