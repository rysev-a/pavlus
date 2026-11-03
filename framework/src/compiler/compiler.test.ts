import { describe, expect, test } from "vitest";
import { parse } from "../template/parser.ts";
import { TemplateError } from "../template/errors.ts";
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
    const src = `if n > 1
  | many
else if n === 1
  | one
else
  | none`;
    expect(html(src, { n: 3 })).toBe("many");
    expect(html(src, { n: 1 })).toBe("one");
    expect(html(src, { n: 0 })).toBe("none");
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

  test("meta lists the instance names", () => {
    const p = compileToView(
      `import Row from "./r"\n+Row#a\nif x\n  +{V}#b\n+Row#a`,
      { components: { Row: row } },
    );
    expect(p.meta).toEqual({ embeds: ["a", "b"], outlet: false });
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
      embeds: [],
      outlet: true,
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
