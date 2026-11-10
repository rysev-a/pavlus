import { describe, expect, test } from "vitest";
import { parse } from "../template/parser.ts";
import { TemplateError } from "../template/errors.ts";
import type { EmbedNode } from "../template/ast.ts";
import { compileToView } from "./mod.ts";
import { toHtml } from "../runtime/vnode.ts";

const html = (src: string, state: unknown): string =>
  toHtml(compileToView(src).render(state));

describe("parser", () => {
  test("parses tags, classes, ids, attrs, text", () => {
    const ast = parse(`h1.header-1#page-title Pavlus framework`);
    const el = ast.nodes[0];
    expect(el).toMatchObject({
      type: "element",
      tag: "h1",
      classes: ["header-1"],
      attrs: [{ name: "id", value: ["page-title"] }],
    });
  });

  test("implicit div for .class lines", () => {
    expect(html(`.box hi`, {})).toBe(`<div class="box">hi</div>`);
  });

  test("comments are dropped, including trailing ones", () => {
    const out = html(
      `// full line
p one // trailing
p http://x.com
| keep // this`,
      {},
    );
    expect(out).toBe(`<p>one</p><p>http://x.com</p>keep // this`);
  });

  test("else without if is an error with a position", () => {
    expect(() => parse(`else\n  p x`)).toThrow(TemplateError);
    try {
      parse(`div\n  p {a +}`);
    } catch (e) {
      expect((e as TemplateError).line).toBe(2);
    }
  });

  test("errors: tabs, bad indentation, unclosed brace", () => {
    expect(() => parse("div\n\tp")).toThrow(/Tabs/);
    expect(() => parse("div\n    p\n  p")).toThrow(/indentation/);
    expect(() => parse("p {a")).toThrow(/Unclosed/);
    expect(() => parse("p(href=x")).toThrow(/Unclosed/);
  });

  test("void elements cannot have children", () => {
    expect(() => parse("input\n  p")).toThrow(/children/);
  });
});

describe("render", () => {
  test("text, attribute and class interpolation", () => {
    const out = html(
      `a.link(href=item.url class:on=item.on title="Go to {item.title}") {item.title}!`,
      { item: { url: "/x", on: true, title: "X" } },
    );
    expect(out).toBe(`<a href="/x" title="Go to X" class="link on">X!</a>`);
  });

  test("false / null attributes are omitted, true is empty", () => {
    expect(
      html(`input(disabled=a hidden=b value=c)`, {
        a: true,
        b: false,
        c: null,
      }),
    ).toBe(`<input disabled="">`);
  });

  test("if / else if / else", () => {
    const src = `if many
  | many
else if one
  | one
else
  | none`;
    expect(html(src, { many: true })).toBe("many");
    expect(html(src, { one: true })).toBe("one");
    expect(html(src, {})).toBe("none");
  });

  test("for with index and key", () => {
    const src = `ul
  for x, i in xs key x.id
    li {i}:{x.name}`;
    expect(
      html(src, {
        xs: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
      }),
    ).toBe(`<ul><li>0:a</li><li>1:b</li></ul>`);
  });

  test("operators, arrows and calls are not template expressions", () => {
    // logic lives in component code; the template only reads ready fields
    expect(() => parse(`p {n > 1}`)).toThrow(/the ">" operator.*philosophy/);
    expect(() => parse(`p {a && b}`)).toThrow(/the "&&" operator.*philosophy/);
    expect(() => parse(`p {a ? b : c}`)).toThrow(/a ternary.*philosophy/);
    expect(() => parse(`p {!a}`)).toThrow(/negation.*philosophy/);
    expect(() => parse(`p {a ?? b}`)).toThrow(/nullish operator.*philosophy/);
    expect(() =>
      parse(`ul
  for u in users.filter(u => u.active)
    li {u.name}`),
    ).toThrow(/a call.*philosophy/);
    expect(() => parse(`p {u => u.active}`)).toThrow(
      /arrow function.*philosophy/,
    );
    expect(() => parse(`p {pick((a, b) => a + b + n)}`)).toThrow(
      /a call.*philosophy/,
    );
    expect(() => parse(`p {name.toUpperCase()}`)).toThrow(/a call.*philosophy/);
  });

  test("html is escaped, expressions are null safe", () => {
    expect(html(`p {a.b.c}{x}`, { x: "<b>" })).toBe(`<p>&lt;b&gt;</p>`);
  });

  test("events render as message descriptors", () => {
    const v = compileToView(`button(@click.prevent=remove(user, 2)) x`);
    const [el] = v.render({ user: { id: 7 } });
    expect(el).toMatchObject({
      events: {
        click: { id: "remove", payload: [{ id: 7 }, 2], prevent: true },
      },
    });
  });
});

describe("embeds: parser", () => {
  const imp = `import Row from "./row.pavlus"\n`;

  test("static embed with instance name, props and spread", () => {
    const ast = parse(
      `${imp}div\n  +Row#users(...users filter=filter label="a {b}" flag)`,
    );
    expect(ast.imports).toEqual([{ local: "Row", from: "./row.pavlus" }]);
    const embed = (ast.nodes[0] as any).children[0];
    expect(embed).toMatchObject({
      type: "embed",
      component: "Row",
      name: "users",
      dynamic: null,
    });
    expect(
      embed.props.map((p: any) => ("spread" in p ? "..." : p.name)),
    ).toEqual(["...", "filter", "label", "flag"]);
  });

  test("default instance name is the camel-cased component name", () => {
    expect((parse(`${imp}+Row`).nodes[0] as any).name).toBe("row");
  });

  test("+Name must be imported; +{expr} is the dynamic form and needs a name", () => {
    expect(() => parse(`+Row#r`)).toThrow(/"Row" is not imported.*\+\{Row\}/);
    expect(parse(`+{Row}#r`).nodes[0] as any).toMatchObject({
      component: null,
      name: "r",
    });
    expect(() => parse(`+{Row}`)).toThrow(/needs an instance name/);
  });

  test("import rules", () => {
    expect(() => parse(`p x\nimport Row from "./r.pavlus"`)).toThrow(
      /top of the file/,
    );
    expect(() => parse(`import row from "./r.pavlus"`)).toThrow(/capital/);
    expect(() => parse(`import Map from "./r.pavlus"`)).toThrow(
      /cannot be used/,
    );
    expect(() => parse(`${imp}${imp}`)).toThrow(/twice/);
  });

  test("embeds are leaves, spread is for props only, props must be plain names", () => {
    expect(() => parse(`${imp}+Row\n  p x`)).toThrow(/children/);
    expect(() => parse(`div(...x)`)).toThrow(/spread/);
    expect(() => parse(`${imp}+Row(@click=go)`)).toThrow(/not a valid prop/);
    expect(() => parse(`${imp}+Row text`)).toThrow(/Unexpected/);
  });
});

describe("embeds: render", () => {
  const row = compileToView(`li.row(@click=pick(id)) {label}`);

  test("static embed renders the child with props, a prefix and unique ids", () => {
    const parent = compileToView(
      `import Row from "./row.pavlus"\nul\n  for it in items key it.id\n    +Row#row(id=it.id label=it.label)`,
      { components: { Row: row } },
    );
    const nodes = parent.render({
      items: [
        { id: 1, label: "a" },
        { id: 2, label: "b" },
      ],
    });
    expect(toHtml(nodes)).toBe(
      `<ul><li class="row">a</li><li class="row">b</li></ul>`,
    );
    const lis = (nodes[0] as any).children.filter((c: any) => c.t === "el");
    expect(lis.map((l: any) => l.events.click)).toEqual([
      { id: "row.pick", payload: 1 },
      { id: "row.pick", payload: 2 },
    ]);
  });

  test("dynamic embed: a view, a component with a view, or nothing", () => {
    const p = compileToView(`div\n  +{Comp}#c(label=text)`);
    expect(toHtml(p.render({ Comp: row, text: "x" }))).toBe(
      `<div><li class="row">x</li></div>`,
    );
    expect(toHtml(p.render({ Comp: { view: row }, text: "y" }))).toBe(
      `<div><li class="row">y</li></div>`,
    );
    expect(toHtml(p.render({ Comp: null, text: "z" }))).toBe(`<div></div>`);
    expect(() => p.render({ Comp: { nope: 1 }, text: "z" })).toThrow(
      /needs a view/,
    );
  });

  test("a keyed embed (key=expr) addresses each instance by its key", () => {
    const parent = compileToView(
      `import Row from "./row.pavlus"\nul\n  for it in items key it.id\n    +Row#row(key=it.id id=it.id label=it.label)`,
      { components: { Row: row } },
    );
    const nodes = parent.render({
      items: [
        { id: 1, label: "a" },
        { id: 2, label: "b" },
      ],
    });
    const lis = (nodes[0] as any).children.filter((c: any) => c.t === "el");
    expect(lis.map((l: any) => l.events.click)).toEqual([
      { id: "row.1.pick", payload: 1 },
      { id: "row.2.pick", payload: 2 },
    ]);
    // re-render and diff keep the key in the events of moved or new nodes
    const next = [
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ];
    const re = parent.render({ items: next });
    const reLis = (re[0] as any).children.filter((c: any) => c.t === "el");
    expect(reLis.map((l: any) => l.events.click)).toEqual([
      { id: "row.2.pick", payload: 2 },
      { id: "row.3.pick", payload: 3 },
    ]);
  });

  test("a keyed embed outside a loop: the key can be any expression", () => {
    const p = compileToView(
      `import Row from "./row.pavlus"\ndiv\n  +Row#editor(key=selected label=selected)`,
      { components: { Row: row } },
    );
    const nodes = p.render({ selected: "u7" });
    const li = (nodes[0] as any).children.find((c: any) => c.t === "el");
    expect(li.events.click).toEqual({
      id: "editor.u7.pick",
      payload: undefined,
    });
    // the key in the deps: a change remounts the embed — another key is
    // another instance, its events address the new key
    const patches = p.diff({ selected: "u7" }, { selected: "u8" });
    expect(patches).toEqual([
      { op: "clear", from: expect.any(String), to: expect.any(String) },
      {
        op: "insert",
        before: expect.any(String),
        nodes: expect.any(Array),
      },
    ]);
  });

  test("the embed's key is not a prop, and must be one expression", () => {
    const imp = `import Row from "./row.pavlus"\n`;
    const ast = parse(`${imp}+Row#row(key=user.id user=user)`);
    const embed = ast.nodes[0] as any as EmbedNode;
    expect(embed.key).toMatchObject({ k: "member", prop: "id" });
    expect(embed.props).toEqual([
      { name: "user", value: [{ k: "id", name: "user" }] },
    ]);
    expect(() => parse(`${imp}+Row#row(key="x")`)).toThrow(
      /key must be one expression/,
    );
    expect(() => parse(`${imp}+Row#row(key)`)).toThrow(/key must be one/);
  });

  test("meta lists the instance names with their id scope", () => {
    const p = compileToView(
      `import Row from "./r"\n+Row#a\nif x\n  +{V}#b\n+Row#a`,
      { components: { Row: row } },
    );
    expect(p.meta).toEqual({ embeds: { a: "/0", b: "/2" }, outlet: false });
  });

  test("an embed inside a for records the slot of the iteration key", () => {
    const p = compileToView(
      `import Row from "./r"\nul\n  for it in xs key it.id\n    +Row#row(key=it.id)\n    if it.ok\n      +Row#row(key=it.id)`,
      { components: { Row: row } },
    );
    // "#/…": the scope sits inside a `for` — the loop puts "#<key>" in front
    // of the ids; a keyed child's boundary fills the slot with its key.
    expect(p.meta).toEqual({ embeds: { row: "#/2" }, outlet: false });
  });

  test("compileToView without a needed component says which one", () => {
    expect(() => compileToView(`import Row from "./r"\n+Row`)).toThrow(
      /imports "Row"/,
    );
  });
});

describe("text lines", () => {
  test("consecutive text lines are separated by a newline (a space in HTML)", () => {
    const out = html(
      `p
  | the application code is pure
  | functions, and {what} is a plugin
  | too`,
      { what: "everything else" },
    );
    expect(out).toBe(
      "<p>the application code is pure\nfunctions, and everything else is a plugin\ntoo</p>",
    );
  });

  test("inline text followed by a text line is separated as well", () => {
    expect(html(`p hello\n  | world\n  {name}`, { name: "x" })).toBe(
      "<p>hello\nworld\nx</p>",
    );
  });

  test("a text line after an element gets no separator", () => {
    expect(html(`div\n  span a\n  | b`, {})).toBe("<div><span>a</span>b</div>");
  });
});

describe("+outlet", () => {
  test("is a built-in node, not an import", () => {
    expect(parse("main\n  +outlet").nodes[0]).toMatchObject({
      children: [{ type: "outlet" }],
    });
    expect(compileToView("main\n  +outlet").meta).toEqual({
      embeds: {},
      outlet: 1,
    });
    expect(compileToView("p x").meta?.outlet).toBe(false);
  });

  test("takes nothing after it, and can sit inside an if", () => {
    expect(() => parse("+outlet#x")).toThrow(/takes nothing/);
    expect(() => parse("+outlet(a=1)")).toThrow(/takes nothing/);
    expect(parse("if a\n  +outlet").nodes[0]).toMatchObject({ type: "if" });
  });

  test("rendering one without the owning component names the problem", () => {
    const view = compileToView("+outlet");
    expect(() => view.render({ route: { path: "/" } })).toThrow(/routing/);
  });
});
