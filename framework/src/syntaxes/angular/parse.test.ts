// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { compileToView } from "../../compiler/mod.ts";
import { TemplateError } from "../../template/errors.ts";
import { mountView } from "../../testing/mod.ts";
import { expectSameAs } from "../equivalence.ts";
import { parseAngular } from "./parse.ts";

const same = (
  source: string,
  native: string,
  states: unknown[],
  components: Record<string, any> = {},
) => expectSameAs(parseAngular, source, native, states, components);

/** The error thrown by parsing `source`. */
function errorOf(source: string): TemplateError {
  try {
    parseAngular(source);
  } catch (e) {
    expect(e).toBeInstanceOf(TemplateError);
    return e as TemplateError;
  }
  throw new Error("expected a TemplateError");
}

/** Position of `needle` (first occurrence) in `source`, 1-based. */
function where(source: string, needle: string) {
  const at = source.indexOf(needle);
  expect(at).toBeGreaterThanOrEqual(0);
  const before = source.slice(0, at).split("\n");
  return { line: before.length, col: before[before.length - 1].length + 1 };
}

function expectErrorAt(source: string, needle: string, message?: RegExp) {
  const e = errorOf(source);
  expect({ line: e.line, col: e.col }).toEqual(where(source, needle));
  if (message) expect(e.message).toMatch(message);
}

describe("elements, text, attributes", () => {
  test("nesting, ids, classes, static and interpolated attributes", () => {
    same(
      `<div id="root" class="box big">
  <h1 class="title">{{ title }}</h1>
  <a href="/u/{{ id }}" target=_blank>Go to {{ name }}</a>
  <input type="text" disabled [value]="name" />
  <br>
</div>`,
      `div.box.big#root
  h1.title {title}
  a(href="/u/{id}" target="_blank") Go to {name}
  input(type="text" disabled value=name)
  br`,
      [
        { title: "A", id: 1, name: "x" },
        { title: "B", id: 2, name: "y" },
      ],
    );
  });

  test("the attribute order is kept", () => {
    same(`<div id="a" class="c" title="t"></div>`, `div.c(id="a" title="t")`, [
      {},
    ]);
  });

  test("boolean attributes follow the native semantics", () => {
    same(
      `<button [disabled]="busy" hidden>x</button>`,
      `button(disabled=busy hidden) x`,
      [{ busy: true }, { busy: false }],
    );
  });

  test("[attr.name] binds an attribute, [class] a class value", () => {
    same(
      `<p [attr.data-id]="id" [class]="cls">x</p>`,
      `p(data-id=id class=cls) x`,
      [
        { id: 1, cls: "a" },
        { id: 2, cls: "b" },
      ],
    );
  });

  test("entities decode in text and attributes, tags keep their case", () => {
    same(
      `<p title="a &amp; b">&lt;b&gt; &quot;x&quot; &#39;y&#39; &amp; &#x41;&nbsp;z</p>`,
      `p(title="a & b") <b> "x" 'y' & A z`,
      [{}],
    );
    const ast = parseAngular("<svg><linearGradient></linearGradient></svg>");
    const svg = ast.nodes[0];
    expect(svg.type === "element" && svg.children[0]).toMatchObject({
      tag: "linearGradient",
    });
  });

  test("&nbsp; survives trimming", () => {
    const ast = parseAngular("<p>&nbsp;x&nbsp;</p>");
    const p = ast.nodes[0] as any;
    expect(p.children[0].parts).toEqual([" x "]);
  });

  test("comments vanish; texts around them join with a newline", () => {
    same(
      `<p>one<!-- c -->two</p>`,
      `p
  | one
  | two`,
      [{}],
    );
  });

  test("multi-line text is trimmed per line", () => {
    same(
      `<p>
      first {{ a }}
         second

      third
    </p>`,
      `p
  | first {a}
  | second
  | third`,
      [{ a: 1 }],
    );
  });

  test("literal braces are written as entities", () => {
    same(
      `<p>&#123;&#123; a &#125;&#125; {{ a }} } done</p>`.replace(
        " } done",
        "",
      ),
      `p \\{\\{ a \\}\\} {a}`,
      [{ a: 5 }],
    );
  });

  test("{{ in strings and < in expressions are handled", () => {
    same(`<p>{{ a < b ? '}}' : "<i>" }}</p>`, `p {a < b ? "}}" : "<i>"}`, [
      { a: 1, b: 2 },
      { a: 3, b: 2 },
    ]);
  });

  test("a lone @ and a < in text are literal", () => {
    same(`<p>me@site.com 1 < 2</p>`, `p me@site.com 1 < 2`, [{}]);
  });

  test("void and self-closing elements", () => {
    same(
      `<div><img src="a.png"><hr/><span/></div>`,
      `div
  img(src="a.png")
  hr
  span`,
      [{}],
    );
  });

  test("raw text elements keep their content", () => {
    same(
      `<style>a { color: red; } @media x { }</style>`,
      `style a \\{ color: red; \\} @media x \\{ \\}`,
      [{}],
    );
  });
});

describe("class toggles and events", () => {
  test("[class.name] toggles", () => {
    same(
      `<li class="item" [class.active]="on" [class.big]="n > 1">{{ n }}</li>`,
      `li.item(class:active=on class:big=n>1) {n}`,
      [
        { on: true, n: 1 },
        { on: false, n: 2 },
      ],
    );
  });

  test("events: names, calls, args, modifiers", () => {
    same(
      `<form (submit.prevent)="save($event)">
  <button (click)="remove(item.id, 2)">x</button>
  <a (click.prevent.stop)="open(item)">y</a>
  <i (click)="menu.close">z</i>
</form>`,
      `form(@submit.prevent=save)
  button(@click=remove(item.id, 2)) x
  a(@click.prevent.stop=open(item)) y
  i(@click=menu.close) z`,
      [{ item: { id: 3 } }],
    );
  });
});

describe("control flow", () => {
  test("@if / @else if / @else", () => {
    same(
      `@if (a) {
  <p>A</p>
} @else if (b > 1) {
  <p>B {{ b }}</p>
} @else {
  <p>none</p>
}
<footer>f</footer>`,
      `if a
  p A
else if b > 1
  p B {b}
else
  p none
footer f`,
      [
        { a: true, b: 0 },
        { a: false, b: 2 },
        { a: false, b: 0 },
      ],
    );
  });

  test("@else on the next line and comments between branches", () => {
    same(
      `@if (a) { <i>1</i> }
<!-- nothing -->
@else { <i>2</i> }`,
      `if a
  i 1
else
  i 2`,
      [{ a: true }, { a: false }],
    );
  });

  test("@for with track, index and @empty", () => {
    const states = [
      { items: [] },
      { items: [{ id: 1, t: "a" }] },
      {
        items: [
          { id: 2, t: "b" },
          { id: 1, t: "a" },
          { id: 3, t: "c" },
        ],
      },
    ];
    same(
      `<ul>
  @for (item of items; track item.id; let i = $index) {
    <li>{{ i }}: {{ item.t }}</li>
  } @empty {
    <li>Nothing</li>
  }
</ul>`,
      `ul
  for item, i in items key item.id
    li {i}: {item.t}
  if !items.length
    li Nothing`,
      states,
    );
  });

  test("implicit $index and track $index", () => {
    same(
      `@for (x of xs; track $index) { <b>{{ $index }}{{ x }}</b> }`,
      `for x, i in xs
  b {i}{x}`,
      [{ xs: ["a", "b"] }, { xs: ["c"] }],
    );
  });

  test("nested loops keep their own $index", () => {
    same(
      `@for (row of rows; track row.id; let r = $index) {
  @for (c of row.cells; track c; let k = $index) {
    <i>{{ r }}.{{ k }}={{ c }}</i>
  }
}`,
      `for row, r in rows key row.id
  for c, k in row.cells key c
    i {r}.{k}={c}`,
      [
        {
          rows: [
            { id: 1, cells: ["a", "b"] },
            { id: 2, cells: [] },
          ],
        },
        {
          rows: [
            { id: 2, cells: ["z"] },
            { id: 1, cells: ["b"] },
          ],
        },
      ],
    );
  });

  test("@for without track", () => {
    same(
      `@for (x of xs) {<i>{{ x }}</i>}`,
      `for x in xs
  i {x}`,
      [{ xs: [1, 2] }],
    );
  });

  test("legacy *ngIf and *ngFor", () => {
    same(
      `<ul *ngIf="show" class="l">
  <li *ngFor="let u of users; trackBy: u.id; let i = index" [class.on]="u.on">{{ i }}{{ u.n }}</li>
  <li *ngFor="let u of users; index as k">{{ k }}</li>
</ul>`,
      `if show
  ul.l
    for u, i in users key u.id
      li(class:on=u.on) {i}{u.n}
    for u, k in users
      li {k}`,
      [
        { show: true, users: [{ id: 1, n: "a", on: true }] },
        { show: true, users: [] },
        { show: false, users: [] },
      ],
    );
  });

  test("<ng-container> emits no element", () => {
    same(
      `<div>
  <ng-container *ngIf="a"><b>1</b><i>2</i></ng-container>
  <ng-container *ngFor="let x of xs"><u>{{ x }}</u></ng-container>
  <ng-container>plain</ng-container>
</div>`,
      `div
  if a
    b 1
    i 2
  for x in xs
    u {x}
  | plain`,
      [
        { a: true, xs: [1, 2] },
        { a: false, xs: [] },
      ],
    );
  });
});

describe("components", () => {
  const card = compileToView(`div.card\n  h2 {title}\n  p {text}`);
  const components = { Card: card, Panel: card };

  test("imported components, props, instance names, spread", () => {
    same(
      `<!-- import Card from "./card.pavlus" as app-card -->
<!-- import Panel from './panel.pavlus' -->
<main>
  <app-card title="Hi {{ name }}" [text]="body" #side />
  <Panel [props]="extra"></Panel>
  <app-card [title]="t" text="static" />
</main>`,
      `import Card from "./card.pavlus"
import Panel from './panel.pavlus'
main
  +Card#side(title="Hi {name}" text=body)
  +Panel(...extra)
  +Card(title=t text="static")`,
      [
        { name: "A", body: "b", extra: { title: "T", text: "X" }, t: 1 },
        { name: "B", body: "c", extra: { title: "U" }, t: 2 },
      ],
      components,
    );
  });

  test("dynamic component and structural directives on a component", () => {
    same(
      `<!-- import Card from "./card.pavlus" -->
<ng-component [is]="view" #main title="d" />
<Card *ngIf="on" title="x" />`,
      `import Card from "./card.pavlus"
+{view}#main(title="d")
if on
  +Card(title="x")`,
      [
        { view: card, on: true },
        { view: card, on: false },
      ],
      components,
    );
  });

  test("router-outlet", () => {
    const parsed = parseAngular(
      `<div><router-outlet /></div><router-outlet></router-outlet>`,
    );
    expect(JSON.stringify(parsed.nodes)).toContain('"type":"outlet"');
    expect(parsed.nodes).toHaveLength(2);
    expect((parsed.nodes[0] as any).children[0].type).toBe("outlet");
    expect(parsed.nodes[1].type).toBe("outlet");
  });

  test("an unregistered dashed tag is a plain custom element", () => {
    same(`<x-foo bar="1">t</x-foo>`, `x-foo(bar="1") t`, [{}]);
  });

  test("imports", () => {
    expect(
      parseAngular(
        `<!-- import Card from "./c.pavlus" as app-card -->\n<!-- plain comment -->`,
      ).imports,
    ).toEqual([{ local: "Card", from: "./c.pavlus" }]);
  });
});

describe("node ids follow the native numbering", () => {
  test("a big template parses to the same AST shape", () => {
    const ng = parseAngular(`<div>
  @if (a) {<p>{{ x }}</p>} @else {<i>y</i>}
  @for (i of is; track i) {<b>{{ i }}</b>} @empty {<u>z</u>}
  <router-outlet />
</div>`);
    const nids: number[] = [];
    const walk = (nodes: any[]) =>
      nodes.forEach((n) => {
        nids.push(n.nid);
        if (n.children) walk(n.children);
        if (n.branches) n.branches.forEach((b: any) => walk(b.children));
      });
    walk(ng.nodes);
    expect(nids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe("errors point into the original HTML", () => {
  test("mismatched and unclosed tags", () => {
    expectErrorAt(`<div>\n  <p>x</div>`, "</div>", /expected <\/p>/);
    expectErrorAt(`<div>\n <p>x`, "<p>", /Unclosed <p>/);
    expectErrorAt(`<p>x</p>\n</i>`, "</i>", /Unexpected closing tag/);
    expectErrorAt(`<div`, "<div", /Unclosed tag/);
    expectErrorAt(`<br>\n</br>`, "</br>", /void element/);
    expectErrorAt(`<a href="x>t</a>`, '"x>t', /Unterminated/);
  });

  test("expression errors are mapped to the expression", () => {
    expectErrorAt(`<p>\n  {{ a + }}\n</p>`, "}}\n", /Unexpected/);
    expectErrorAt(`<p title="x {{ 1 @ 2 }}">`, "@ 2", /Unexpected character/);
    expectErrorAt(`<p [x]="a.">t</p>`, '">t', /property name/);
    expectErrorAt(`<p>\n{{ a\n   + (b }}</p>`, "}}", /Expected|Unexpected/);
    expectErrorAt(`<p>{{ }}</p>`, " }}", /Empty expression/);
    expectErrorAt(`<p>{{ a | upper }}</p>`, "| upper", /Unexpected/);
  });

  test("interpolation", () => {
    expectErrorAt(`<p>\n a {{ b</p>`, "{{ b", /Unclosed {{/);
  });

  test("control flow", () => {
    expectErrorAt(`<p>a</p>\n@else { x }`, "@else", /without a matching @if/);
    expectErrorAt(`@if (a) { x } text @else { y }`, "@else", /without/);
    expectErrorAt(
      `@if (a) { x } @else { y } @else { z }`,
      "@else { z",
      /without/,
    );
    expectErrorAt(`@if (a { x }`, "(a", /Unclosed \(/);
    expectErrorAt(`@if a { x }`, "a {", /Expected "\("/);
    expectErrorAt(`@if (a) <p></p>`, "<p>", /Expected "\{"/);
    expectErrorAt(`<p>\n@if (a) {\n x`, "@if", /Unclosed @if/);
    expectErrorAt(`<p>x }</p>`, "}</p>", /Unexpected "}"/);
    expectErrorAt(`<p>@if (a) { x </p> }</p>`, "</p> }", /still open/);
    expectErrorAt(`@if (a) { <p> } </p>`, "} </p>", /still open/);
    expectErrorAt(`@empty { x }`, "@empty", /without a matching @for/);
    expectErrorAt(`@switch (a) { }`, "@switch", /not supported/);
    expectErrorAt(`@for (x in xs; track x) { }`, "x in xs", /item of items/);
    expectErrorAt(
      `@for (x of xs; track x; let f = $first) { }`,
      "let f",
      /\$index/,
    );
    expectErrorAt(`@for (x of xs; foo) { }`, "foo", /Unexpected "foo"/);
    expectErrorAt(
      `<p>{{ $index }}</p>`,
      " $index",
      /only available inside @for/,
    );
    expectErrorAt(`@for (x of xs; track x.) { }`, ") {", /property name/);
  });

  test("legacy directives", () => {
    expectErrorAt(`<p *ngIf="a; else b"></p>`, "else b", /else/);
    expectErrorAt(`<p *ngIf></p>`, "*ngIf", /needs a value/);
    expectErrorAt(`<p *ngFor="let x in y"></p>`, "let x in y", /let item of/);
    expectErrorAt(
      `<p *ngFor="let x of y; foo"></p>`,
      "foo",
      /Unexpected "foo"/,
    );
    expectErrorAt(
      `<p *ngIf="a" *ngFor="let x of y"></p>`,
      "*ngFor",
      /Only one/,
    );
    expectErrorAt(`<p *ngSwitch="a"></p>`, "*ngSwitch", /Unknown structural/);
  });

  test("attributes", () => {
    expectErrorAt(`<p (click)="a = 1"></p>`, "= 1", /Unexpected character/);
    expectErrorAt(`<p (click)="a + b"></p>`, "a + b", /message id/);
    expectErrorAt(`<p (click.foo)="a"></p>`, "(click.foo)", /modifier/);
    expectErrorAt(`<p [(x)]="a"></p>`, "[(x)]", /Two-way/);
    expectErrorAt(
      `<p [style.color]="a"></p>`,
      "[style.color]",
      /not supported/,
    );
    expectErrorAt(
      `<p [props]="a"></p>`,
      "[props]",
      /only allowed on components/,
    );
    expectErrorAt(`<p #ref></p>`, "#ref", /instance/);
    expectErrorAt(`<p [x]></p>`, "[x]", /needs a value/);
  });

  test("components", () => {
    expectErrorAt(`<div>\n <Card /></div>`, "Card", /not imported/);
    expectErrorAt(
      `<!-- import Card from "./c" -->\n<Card (click)="x" />`,
      "(click)",
      /event/,
    );
    expectErrorAt(
      `<!-- import Card from "./c" -->\n<Card data-x="1" />`,
      "data-x",
      /valid prop name/,
    );
    expectErrorAt(
      `<!-- import Card from "./c" -->\n<Card>text</Card>`,
      "text",
      /cannot have children/,
    );
    expectErrorAt(`<ng-component [is]="v" />`, "ng-component", /instance name/);
    expectErrorAt(`<ng-component #x />`, "ng-component", /\[is\]/);
    expectErrorAt(
      `<ng-template></ng-template>`,
      "ng-template",
      /not supported/,
    );
    expectErrorAt(`<router-outlet a="1" />`, 'a="1"', /no attributes/);
  });

  test("imports", () => {
    expectErrorAt(
      `<p></p>\n<!-- import A from "./a" -->`,
      "import A",
      /at the top/,
    );
    expectErrorAt(`<!-- import a from "./a" -->`, "import a", /capital/);
    expectErrorAt(
      `<!-- import String from "./a" -->`,
      "import String",
      /component name/,
    );
    expectErrorAt(
      `<!-- import A from "./a" -->\n<!-- import A from "./b" -->`,
      'import A from "./b',
      /twice/,
    );
    expectErrorAt(`<!-- import A "./a" -->`, "import A", /Malformed/);
    expectErrorAt(
      `<!-- import A from "./a" as x-y -->\n<!-- import B from "./b" as x-y -->`,
      "import B",
      /already used/,
    );
  });

  test("filename is prefixed by the compiler", async () => {
    const { compileTemplate } = await import("../../compiler/mod.ts");
    expect(() =>
      compileTemplate("<p>{{ a + }}</p>", {
        parser: parseAngular,
        filename: "x.ng.html",
      }),
    ).toThrow(/x\.ng\.html: Unexpected/);
  });
});

describe("DOM", () => {
  const TODO = `
<section class="todo">
  <form (submit.prevent)="add">
    <input type="text" [value]="draft" />
    <button type="submit" [disabled]="!draft">Add</button>
  </form>
  <ul>
    @for (t of todos; track t.id) {
      <li [class.done]="t.done">
        <span (click)="toggle(t.id)">{{ t.title }}</span>
        <button (click.stop)="remove(t.id)">x</button>
      </li>
    } @empty {
      <li class="empty">Nothing to do</li>
    }
  </ul>
  <p *ngIf="todos.length">{{ todos.length }} left</p>
</section>`;

  interface S {
    draft: string;
    todos: { id: number; title: string; done: boolean }[];
  }

  test("mounts, handles clicks and patches on updates", () => {
    const view = compileToView<S>(TODO, { parser: parseAngular });
    const h = mountView(view, { draft: "", todos: [] });
    expect(h.root.querySelector(".empty")).not.toBeNull();
    expect(
      h.root.querySelector("button[type=submit]")!.hasAttribute("disabled"),
    ).toBe(true);
    expect(h.root.querySelector("p")).toBeNull();

    h.set({
      draft: "x",
      todos: [
        { id: 1, title: "milk", done: false },
        { id: 2, title: "eggs", done: true },
      ],
    });
    expect(h.root.querySelector(".empty")).toBeNull();
    expect(h.root.querySelectorAll("li")).toHaveLength(2);
    expect(h.root.querySelector("li.done span")!.textContent).toBe("eggs");
    expect(h.root.querySelector("p")!.textContent).toBe("2 left");
    expect(
      h.root.querySelector("button[type=submit]")!.hasAttribute("disabled"),
    ).toBe(false);

    h.root.querySelectorAll<HTMLElement>("li span")[0].click();
    h.root.querySelectorAll<HTMLElement>("li button")[1].click();
    expect(h.messages.map((m) => [m.id, m.payload])).toEqual([
      ["toggle", 1],
      ["remove", 2],
    ]);

    h.set({ draft: "", todos: [{ id: 2, title: "eggs", done: false }] });
    expect(h.root.querySelectorAll("li")).toHaveLength(1);
    expect(h.root.querySelector("li.done")).toBeNull();
    h.unmount();
    expect(h.dom.stats()).toEqual({ mounts: 0, nodes: 0, listeners: 0 });
  });
});
