// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { compileToView } from "../../compiler/mod.ts";
import { parse } from "../../template/parser.ts";
import { TemplateError } from "../../template/errors.ts";
import { mountView } from "../../testing/mod.ts";
import { expectSameAs } from "../equivalence.ts";
import { parseJsx } from "./parse.ts";

const same = (
  jsx: string,
  native: string,
  states: unknown[],
  components?: Record<string, never>,
) => expectSameAs(parseJsx, jsx, native, states, components);

const todos = [
  { items: [], title: "T", draft: "", isEmpty: true },
  {
    items: [
      { id: 1, text: "a", done: false },
      { id: 2, text: "b", done: true },
    ],
    title: "Todos",
    draft: "x",
    isEmpty: false,
  },
  {
    items: [{ id: 2, text: "b", done: true }],
    title: "Todos",
    draft: "",
    isEmpty: false,
  },
];

describe("equivalence with the native syntax", () => {
  test("todo list", () => {
    same(
      `export default (
  <div id="app" className="todos wide">
    <h1>{title}</h1>
    <form onSubmitPrevent={add(draft)}>
      <label htmlFor="draft">New</label>
      <input id="draft" type="text" value={draft} disabled />
      <button type="submit">Add</button>
    </form>
    {isEmpty && <p className="empty">Nothing to do</p>}
    <ul>
      {items.map((item) => (
        <li key={item.id} class:done={item.done}>
          <span>{item.text}</span>
          <button onClick={remove(item.id)}>x</button>
        </li>
      ))}
    </ul>
  </div>
);`,
      `div#app.todos.wide
  h1 {title}
  form(@submit.prevent=add(draft))
    label(for="draft") New
    input#draft(type="text" value={draft} disabled)
    button(type="submit") Add
  if isEmpty
    p.empty Nothing to do
  ul
    for item in items key item.id
      li(class:done=item.done)
        span {item.text}
        button(@click=remove(item.id)) x`,
      todos,
    );
  });

  test("nested loops with index and keys, else-if chain", () => {
    const states = [
      { groups: [], modeA: true, modeB: false, notC: true },
      {
        groups: [
          {
            id: 1,
            name: "g1",
            rows: [
              { id: 1, v: "x" },
              { id: 2, v: "y" },
            ],
          },
          { id: 2, name: "g2", rows: [] },
        ],
        modeA: false,
        modeB: true,
        notC: true,
      },
      {
        groups: [{ id: 2, name: "g2", rows: [{ id: 9, v: "z" }] }],
        modeA: false,
        modeB: false,
        notC: false,
      },
    ];
    same(
      `<>
  {groups.map((g, gi) => (
    <section key={g.id}>
      <h2>{gi}: {g.name}</h2>
      {g.rows.map((r, ri) => <p key={r.id}>{ri}-{r.v}</p>)}
    </section>
  ))}
  {modeA ? <i>A</i> : modeB ? <b>B</b> : <u>C</u>}
  {modeA ? <i>A</i> : null}
  {notC && <s>not c</s>}
</>`,
      `for g, gi in groups key g.id
  section
    h2 {gi}: {g.name}
    for r, ri in g.rows key r.id
      p {ri}-{r.v}
if modeA
  i A
else if modeB
  b B
else
  u C
if modeA
  i A
if notC
  s not c`,
      states,
    );
  });

  test("a missing key is allowed", () => {
    same(
      `<ul>{xs.map(x => <li>{x}</li>)}</ul>`,
      `ul
  for x in xs
    li {x}`,
      [{ xs: [] }, { xs: ["a", "b"] }, { xs: ["b"] }],
    );
  });

  test("text rules: entities, line collapsing, comments, literal braces", () => {
    same(
      `<p>
  Fish &amp; chips
  {/* a comment */}
  cost {price}&nbsp;&#36; {"{"}x{"}"}
</p>`,
      `p Fish & chipscost {price} $ \\{x\\}`,
      [{ price: 3 }],
    );
    same(
      `<div>
  <b>bold</b>

  <i>it</i>
</div>`,
      `div
  b bold
  i it`,
      [{}],
    );
  });

  test("attributes: dynamic class, void tags, spread-free elements", () => {
    same(
      `<div className={cls} data-x="1" aria-label={label}><br /><img src={src} alt="" /><input type="checkbox" checked={on} /></div>`,
      `div(class=cls data-x="1" aria-label={label})
  br
  img(src=src alt="")
  input(type="checkbox" checked=on)`,
      [{ cls: "a b", label: "L", src: "/x.png", on: true }],
    );
  });

  test("events: args, modifiers, member ids, keydown", () => {
    same(
      `<div onClickStop={tick}><a href="#" onClickPreventStop={go(a, 1)}>go</a><input onKeyDown={key} onInput={users.edit(id)} /></div>`,
      `div(@click.stop=tick)
  a(href="#" @click.prevent.stop=go(a, 1)) go
  input(@keydown=key @input=users.edit(id))`,
      [{ a: "q", id: 3 }],
    );
  });

  test("style as a string, class toggles with flags", () => {
    same(
      `<p style="color: red" class:on={on} class:off={off}>x</p>`,
      `p(style="color: red" class:on=on class:off=off) x`,
      [
        { on: true, off: false },
        { on: false, off: true },
      ],
    );
  });

  const row = compileToView(`li {label}`);
  const body = compileToView(`b {n}`);

  test("embeds: static, instance name, props, spread, dynamic, outlet", () => {
    const jsx = `import Row from "./row.pavlus";
export default (
  <ul>
    <Row label="static" />
    <Row name="second" label={title} {...rest} flag />
    <Embed view={Comp} name="dyn" n={1} />
  </ul>
);`;
    const native = `import Row from "./row.pavlus"
ul
  +Row(label="static")
  +Row#second(label=title ...rest flag)
  +{Comp}#dyn(n=1)`;
    const rowComp = { view: row } as never;
    const states = [{ title: "t", rest: { label: "r" }, Comp: { view: body } }];
    expectSameAs(parseJsx, jsx, native, states, { Row: row });
    void rowComp;
  });

  test("outlet and same nid order", () => {
    const a = parseJsx(`<div><Outlet /><p>{x}</p>{x ? <b>1</b> : null}</div>`);
    const b = parse(`div
  +outlet
  p {x}
  if x
    b 1`);
    const strip = (n: unknown): unknown =>
      JSON.parse(
        JSON.stringify(n, (k, v) =>
          k === "pos" || k === "line" ? undefined : v,
        ),
      );
    expect(strip(a)).toEqual(strip(b));
  });

  test("ast is identical for a mixed template (nids, parts, order)", () => {
    const a = parseJsx(`import Card from "./c.pavlus";
<main id="m" className="a b">
  Hello, {name}!
  {open && <Card name="main" title="x" />}
  <ul>{xs.map((x, i) => <li key={x.id}>{i}</li>)}</ul>
</main>`);
    const b = parse(`import Card from "./c.pavlus"
main#m.a.b
  | Hello, {name}!
  if open
    +Card#main(title="x")
  ul
    for x, i in xs key x.id
      li {i}`);
    const strip = (n: unknown): unknown =>
      JSON.parse(
        JSON.stringify(n, (k, v) =>
          k === "pos" || k === "line" ? undefined : v,
        ),
      );
    expect(strip(a)).toEqual(strip(b));
  });
});

function err(src: string): TemplateError {
  try {
    parseJsx(src);
  } catch (e) {
    expect(e).toBeInstanceOf(TemplateError);
    return e as TemplateError;
  }
  throw new Error("expected an error");
}

describe("errors carry positions", () => {
  test("unclosed element points at the opening tag", () => {
    const e = err(`<div>\n  <p>hi\n</div>`);
    expect(e.message).toMatch(/Expected <\/p>.*found <\/div>/);
    expect([e.line, e.col]).toEqual([3, 1]);
    const u = err(`<div>\n  <p>hi</p>\n`);
    expect([u.line, u.col]).toEqual([1, 1]);
  });

  test("expression errors land on the offending character, across lines", () => {
    const e = err(`<div>\n  <p>{\n    a +\n  }</p>\n</div>`);
    expect(e.message).toMatch(/not allowed in a template expression/);
    expect([e.line, e.col]).toEqual([3, 7]);
    const f = err(`<p>{a +}</p>`);
    expect([f.line, f.col]).toEqual([1, 7]);
    const g = err(`<p>\n  <a href={x +}/>\n</p>`);
    expect([g.line, g.col]).toEqual([2, 14]);
  });

  test("a negated branch is not allowed, inverted flags come from component code", () => {
    const e = err(`<p>{closed ? null : <s>open</s>}</p>`);
    expect(e.message).toMatch(
      /`cond \? null : <X\/>` is not allowed — pass an inverted flag from component code/,
    );
    expect([e.line, e.col]).toEqual([1, 5]);
  });

  test("unknown component, member names, children on components", () => {
    const e = err(`<div>\n  <Card />\n</div>`);
    expect(e.message).toMatch(/not imported/);
    expect([e.line, e.col]).toEqual([2, 4]);
    expect(err(`<A.B />`).message).toMatch(/Member names/);
    expect(err(`import C from "./c";\n<C>hi</C>`).message).toMatch(
      /cannot have children/,
    );
  });

  test("imports", () => {
    expect(err(`import card from "./c";\n<div/>`).message).toMatch(/capital/);
    expect(err(`import { C } from "./c";\n<div/>`).message).toMatch(
      /default imports/,
    );
    expect(err(`import C from "./c";\nimport C from "./d";\n<C />`).line).toBe(
      2,
    );
    expect(err(`<div/>\nimport C from "./c";`).message).toMatch(
      /Unexpected content/,
    );
  });

  test("handlers, styles, maps, stray braces and siblings", () => {
    expect(err(`<a onClick={1 + 2} />`).message).toMatch(/message id/);
    expect(err(`<a onClick="go" />`).message).toMatch(/expression/);
    expect(err(`<a style={{ color: "red" }} />`).message).toMatch(/style/);
    expect(err(`<ul>{xs.map(({ a }) => <li/>)}</ul>`).message).toMatch(
      /plain names/,
    );
    expect(err(`<ul>{xs.map(x => x)}</ul>`).message).toMatch(/one JSX element/);
    const b = err(`<p>a } b</p>`);
    expect([b.line, b.col]).toEqual([1, 6]);
    expect(err(`<a/><b/>`).message).toMatch(/Unexpected content/);
    expect(err(`<p>{foo(<b/>)}</p>`).message).toMatch(/JSX can only appear/);
    expect(err(`<a {...x} />`).message).toMatch(/only allowed on components/);
    expect(err(`<Embed view={x} />`).message).toMatch(/instance name/);
  });
});

describe("mounted in the DOM", () => {
  test("clicks dispatch messages and updates patch", () => {
    const view = compileToView<{
      items: { id: number; t: string }[];
      empty: boolean;
    }>(
      `export default (
  <ul>
    {items.map((item, i) => (
      <li key={item.id}>
        <button onClick={pick(item)}>{i}:{item.t}</button>
      </li>
    ))}
    {empty && <li className="none">empty</li>}
  </ul>
);`,
      { parser: parseJsx },
    );
    const h = mountView(view, {
      items: [{ id: 1, t: "a" }],
      empty: false,
    });
    const html = () => h.root.innerHTML.replace(/<!--.*?-->/g, "");
    expect(html()).toBe("<ul><li><button>0:a</button></li></ul>");
    h.root.querySelector("button")!.click();
    expect(h.messages.map((m) => [m.id, m.payload])).toEqual([
      ["pick", { id: 1, t: "a" }],
    ]);
    h.set({ items: [], empty: true });
    expect(html()).toBe('<ul><li class="none">empty</li></ul>');
    h.set({
      items: [
        { id: 2, t: "b" },
        { id: 1, t: "a" },
      ],
      empty: false,
    });
    expect(h.root.querySelectorAll("li").length).toBe(2);
    h.messages.length = 0;
    h.root.querySelectorAll("button")[1].click();
    expect(h.messages[0].payload).toEqual({ id: 1, t: "a" });
    h.unmount();
  });
});
