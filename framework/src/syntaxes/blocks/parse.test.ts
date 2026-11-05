// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { compileToView } from "../../compiler/mod.ts";
import { parse } from "../../template/parser.ts";
import { TemplateError } from "../../template/errors.ts";
import { mountView } from "../../testing/mod.ts";
import { toHtml } from "../../runtime/vnode.ts";
import { expectSameAs } from "../equivalence.ts";
import { parseBlocks } from "./parse.ts";

const same = (
  source: string,
  native: string,
  states: unknown[],
  components: Parameters<typeof expectSameAs>[4] = {},
) => expectSameAs(parseBlocks, source, native, states, components);

/** The same AST, ignoring positions (which differ by syntax). */
function shape(ast: unknown): unknown {
  return JSON.parse(
    JSON.stringify(ast, (k, v) =>
      k === "pos" || k === "line" ? undefined : v,
    ),
  );
}

function errorOf(source: string): TemplateError {
  try {
    parseBlocks(source);
  } catch (e) {
    expect(e).toBeInstanceOf(TemplateError);
    return e as TemplateError;
  }
  throw new Error("expected a TemplateError");
}

const todos = [
  { items: [] },
  { items: [{ id: 1, text: "a", done: false }] },
  {
    items: [
      { id: 2, text: "b", done: true },
      { id: 1, text: "a", done: false },
      { id: 3, text: "c & <d>", done: true },
    ],
  },
];

describe("blocks: same AST as native", () => {
  test("nid order and node shapes", () => {
    const blocks = `{#import Row from "./row.pavlus"}
<div id="app" class="a b">
  <h1>Hi {name}</h1>
  {#each xs as x, i (x.id)}
    <p class:on={x.on} on:click|preventDefault|stop={pick(x, i)}>{x.t}</p>
  {:else}
    <Row name="r" a={1} {...rest} />
  {/each}
  {#if a}
    <br />
  {:else if b}
    <Outlet />
  {:else}
    <Dynamic this={V} name="v" k="x {y}" />
  {/if}
</div>`;
    const native = `import Row from "./row.pavlus"
div.a.b#app
  h1 Hi {name}
  for x, i in xs key x.id
    p(class:on=x.on @click.prevent.stop=pick(x, i)) {x.t}
  if !xs.length
    +Row#r(a=1 ...rest)
  if a
    br
  else if b
    +outlet
  else
    +{V}#v(k="x {y}")`;
    const a = shape(parseBlocks(blocks)) as any;
    const b = shape(parse(native)) as any;
    expect(a).toEqual(b);
  });
});

describe("blocks: equivalence with native", () => {
  test("todo list", () => {
    same(
      `<section class="todo">
  <h2>{title}</h2>
  <ul>
    {#each items as item (item.id)}
      <li class="todo__item" class:done={item.done}>
        <input type="checkbox" checked={item.done} on:change={toggle(item.id)} />
        <span>{item.text}</span>
        <button class="rm" on:click={remove(item)}>x</button>
      </li>
    {:else}
      <li class="empty">Nothing to do</li>
    {/each}
  </ul>
  <p>{items.length} items</p>
</section>`,
      `section.todo
  h2 {title}
  ul
    for item in items key item.id
      li.todo__item(class:done=item.done)
        input(type="checkbox" checked=item.done @change=toggle(item.id))
        span {item.text}
        button.rm(@click=remove(item)) x
    if !items.length
      li.empty Nothing to do
  p {items.length} items`,
      todos.map((t) => ({ ...t, title: "T" })),
    );
  });

  test("nested loops with keys, index and conditionals", () => {
    same(
      `<div>
  {#each groups as g, gi (g.id)}
    <section class:first={gi === 0}>
      <h3>{gi}: {g.name}</h3>
      {#each g.rows as r, ri (r.id)}
        {#if r.ok}
          <span class="ok">{ri}-{r.v}</span>
        {:else if r.maybe}
          <span class="maybe">{r.v}?</span>
        {:else}
          <span class="no">{r.v}</span>
        {/if}
      {/each}
    </section>
  {/each}
</div>`,
      `div
  for g, gi in groups key g.id
    section(class:first={gi === 0})
      h3 {gi}: {g.name}
      for r, ri in g.rows key r.id
        if r.ok
          span.ok {ri}-{r.v}
        else if r.maybe
          span.maybe {r.v}?
        else
          span.no {r.v}`,
      [
        { groups: [] },
        {
          groups: [
            {
              id: 1,
              name: "a",
              rows: [
                { id: 1, ok: true, v: "x" },
                { id: 2, ok: false, maybe: true, v: "y" },
              ],
            },
          ],
        },
        {
          groups: [
            {
              id: 2,
              name: "b",
              rows: [{ id: 3, ok: false, maybe: false, v: "z" }],
            },
            { id: 1, name: "a", rows: [{ id: 1, ok: true, v: "w" }] },
          ],
        },
      ],
    );
  });

  test("each without a key and each-else on an expression", () => {
    same(
      `<ul>
  {#each user.tags as t}
    <li>{t}</li>
  {:else}
    <li>none</li>
  {/each}
</ul>`,
      `ul
  for t in user.tags
    li {t}
  if !user.tags.length
    li none`,
      [{ user: { tags: [] } }, { user: { tags: ["a", "b"] } }],
    );
  });

  test("form: bound values, events, modifiers, bare boolean attributes", () => {
    same(
      `<form class="f" on:submit|preventDefault={save}>
  <input name="q" value={q} placeholder="Search {what}" on:input={setQ} />
  <input type="checkbox" checked={on} disabled />
  <select on:change={pick}>
    <option value="1" selected={sel === 1}>One</option>
  </select>
  <a href="/x/{id}?y={y}" on:click|stopPropagation={go(id, 'a')}>go</a>
  <button type="submit" disabled={!q}>Save</button>
</form>`,
      `form.f(@submit.prevent=save)
  input(name="q" value=q placeholder="Search {what}" @input=setQ)
  input(type="checkbox" checked=on disabled)
  select(@change=pick)
    option(value="1" selected={sel === 1}) One
  a(href="/x/{id}?y={y}" @click.stop=go(id, 'a')) go
  button(type="submit" disabled=!q) Save`,
      [
        { q: "", what: "w", on: false, sel: 1, id: 3, y: "z" },
        { q: "abc", what: "v", on: true, sel: 2, id: 4, y: "k" },
      ],
    );
  });

  test("text: lines, joining, inline elements, comments", () => {
    same(
      `<p>
  the application code is pure
  functions, and {what} is a plugin

  too <!-- dropped -->
  <b>bold</b> after
</p>
<!-- top comment -->
<footer>   </footer>`,
      `p
  | the application code is pure
  | functions, and {what} is a plugin
  | too
  b bold
  | after
footer`,
      [{ what: "x" }, { what: "y" }],
    );
  });

  test("entities and escaped braces", () => {
    same(
      `<p title="a &amp; &quot;b&quot; \\{n\\}">&lt;{n}&gt; &#39;x&#39; &#65;&nbsp;\\{n\\} {'{'}</p>`,
      `p(title='a & "b" \\{n\\}') <{n}> 'x' A \\{n\\} {'{'}`,
      [{ n: 1 }, { n: 2 }],
    );
  });

  test("void elements, self-closing slash and unquoted attributes", () => {
    same(
      `<div><br><hr/><img src=a.png alt="" /><input type=text value={v}></div>`,
      `div
  br
  hr
  img(src="a.png" alt="")
  input(type="text" value=v)`,
      [{ v: "1" }, { v: "2" }],
    );
  });

  test("class attribute: static, with toggles, and interpolated", () => {
    same(
      `<div class="a  b" class:c={c} class:d>x</div>
<p class="x {k}">y</p>`,
      `div.a.b(class:c=c class:d=d) x
p(class="x {k}") y`,
      [
        { c: true, d: false, k: "1" },
        { c: false, d: true, k: "2" },
      ],
    );
  });

  test("embeds: static, dynamic, instance names, props, spread, outlet", () => {
    const row = compileToView(`li.row(@click=pick(id)) {label}`);
    const components = { Row: row, "Side Bar": row };
    same(
      `{#import Row from "./row.pavlus"}
<main>
  <ul>
    {#each items as it (it.id)}
      <Row name="row" id={it.id} label="#{it.label}" {...extra} />
    {/each}
  </ul>
  <Row />
  <Dynamic this={Comp} name="c" label={text}></Dynamic>
  {#if showFirst}<Row name="first" label="f" flag />{/if}
</main>`,
      `import Row from "./row.pavlus"
main
  ul
    for it in items key it.id
      +Row#row(id=it.id label="#{it.label}" ...extra)
  +Row
  +{Comp}#c(label=text)
  if showFirst
    +Row#first(label="f" flag)`,
      [
        { items: [], Comp: null, text: "t", showFirst: false, extra: {} },
        {
          items: [
            { id: 1, label: "a" },
            { id: 2, label: "b" },
          ],
          Comp: row,
          text: "t",
          showFirst: true,
          extra: { z: 1 },
        },
      ],
      { Row: row },
    );
    void components;
  });

  test("outlet and instance names reach the view meta", () => {
    const row = compileToView(`li {label}`);
    const v = compileToView(
      `{#import Row from "./r"}<main><Row /><Row name="b" /><Outlet /></main>`,
      { parser: parseBlocks, components: { Row: row } },
    );
    expect(v.meta).toEqual({ embeds: { row: "/1", b: "/2" }, outlet: 3 });
  });

  // The same snippet is the side-by-side in README.md.
  test("phone-retail-crm snippet (README)", () => {
    const table = compileToView(`table.t {rows}`);
    same(
      `{#import Table from "../../blocks/crud-table/view.pavlus"}

<main class="k-ashell__content">
  {#if view === "list"}
    {#if confirm.open}
      <div class="ui-alert pcrm__alert pcrm__confirm">
        <span class="ui-alert-icon">
          <span class="k-icon k-icon-alert"></span>
        </span>
        <div class="ui-alert-body">
          <p class="ui-alert-title">Are you sure?</p>
          <div class="ui-alert-description">{confirm.text}</div>
          <div class="pcrm__confirmbar">
            <button class="ui-button ui-button-destructive ui-button-sm" type="button" on:click={confirmYes}>Delete</button>
            <button class="ui-button ui-button-outline ui-button-sm" type="button" on:click={confirmNo}>Cancel</button>
          </div>
        </div>
      </div>
    {/if}
    <Table name="table" {...grid} />
  {:else if view === "settings"}
    <div class="pcrm__counts">
      {#each settings.counts as item (item.id)}
        <div class="pcrm__count">
          <span class="pcrm__countlabel">{item.label}</span>
          <strong>{item.count}</strong>
        </div>
      {/each}
    </div>
    {#if settings.askReset}
      <span class="pcrm__ask">All your changes will be lost. Reset everything?</span>
      <button class="ui-button ui-button-destructive" type="button" on:click={settingsReset}>Yes, reset all data</button>
    {:else}
      <button class="ui-button ui-button-outline pcrm__danger" type="button" on:click={settingsAskReset}>
        <span class="k-icon k-ai-refresh"></span>
        Reset all data
      </button>
    {/if}
  {/if}
</main>`,
      `import Table from "../../blocks/crud-table/view.pavlus"

main.k-ashell__content
  if view === "list"
    if confirm.open
      div.ui-alert.pcrm__alert.pcrm__confirm
        span.ui-alert-icon
          span.k-icon.k-icon-alert
        div.ui-alert-body
          p.ui-alert-title Are you sure?
          div.ui-alert-description {confirm.text}
          div.pcrm__confirmbar
            button.ui-button.ui-button-destructive.ui-button-sm(type="button" @click=confirmYes) Delete
            button.ui-button.ui-button-outline.ui-button-sm(type="button" @click=confirmNo) Cancel
    +Table#table(...grid)
  else if view === "settings"
    div.pcrm__counts
      for item in settings.counts key item.id
        div.pcrm__count
          span.pcrm__countlabel {item.label}
          strong {item.count}
    if settings.askReset
      span.pcrm__ask All your changes will be lost. Reset everything?
      button.ui-button.ui-button-destructive(type="button" @click=settingsReset) Yes, reset all data
    else
      button.ui-button.ui-button-outline.pcrm__danger(type="button" @click=settingsAskReset)
        span.k-icon.k-ai-refresh
        | Reset all data`,
      [
        {
          view: "list",
          confirm: { open: true, text: "Delete 3?" },
          grid: { rows: 1 },
        },
        { view: "list", confirm: { open: false, text: "" }, grid: { rows: 2 } },
        {
          view: "settings",
          settings: {
            askReset: false,
            counts: [
              { id: 1, label: "users", count: 200 },
              { id: 2, label: "roles", count: 50 },
            ],
          },
        },
        { view: "settings", settings: { askReset: true, counts: [] } },
        { view: "other" },
      ],
      { Table: table },
    );
  });

  test("dashboard from the dom tests", () => {
    same(
      `<div class="dashboard">
  <h1 class="dashboard-title">{title}</h1>
  {#if showUsers}
    <div class="users">
      <h2>Users ({users.length})</h2>
      <ul class="users__list">
        {#each users as user (user.id)}
          {#if user.isVisible}
            <li class="users__item" class:admin={user.admin}>
              <a class="users__item-link" href={user.url}>{user.name}</a>
              <button class="users__item-remove" on:click={removeUser(user)}>x</button>
            </li>
          {/if}
        {/each}
      </ul>
    </div>
  {:else}
    <p>nothing</p>
  {/if}
  <footer>{prefix}{count}</footer>
</div>`,
      `div.dashboard
  h1.dashboard-title {title}
  if showUsers
    div.users
      h2 Users ({users.length})
      ul.users__list
        for user in users key user.id
          if user.isVisible
            li.users__item(class:admin=user.admin)
              a.users__item-link(href=user.url) {user.name}
              button.users__item-remove(@click=removeUser(user)) x
  else
    p nothing
  footer {prefix}{count}`,
      [
        { title: "A", showUsers: false, users: [], prefix: "#", count: 0 },
        {
          title: "B",
          showUsers: true,
          users: [
            { id: 1, name: "x", url: "/1", isVisible: true, admin: true },
            { id: 2, name: "y", url: "/2", isVisible: false, admin: false },
          ],
          prefix: "$",
          count: 2,
        },
      ],
    );
  });
});

describe("blocks: errors carry positions", () => {
  test("script and style are rejected", () => {
    const e = errorOf("<div>\n  <script>x</script>\n</div>");
    expect(e.message).toMatch(/<script> is not supported/);
    expect([e.line, e.col]).toEqual([2, 3]);
    expect(errorOf("<style>a{}</style>").message).toMatch(/<style>/);
  });

  test("mismatched and unclosed tags", () => {
    let e = errorOf("<div>\n<p>x</div>");
    expect(e.message).toMatch(/Expected <\/p> but found <\/div>/);
    expect([e.line, e.col]).toEqual([2, 5]);
    e = errorOf("<div>\n  <p>x");
    expect(e.message).toMatch(/Unclosed <p>/);
    expect([e.line, e.col]).toEqual([2, 3]);
    e = errorOf("a</b>");
    expect(e.message).toMatch(/Unexpected <\/b>/);
    expect(e.col).toBe(2);
  });

  test("unclosed and misplaced blocks", () => {
    let e = errorOf("<p>\n{#if a}\n  <b></b>\n</p>");
    expect(e.message).toMatch(/Unexpected <\/p> inside \{#if\}/);
    expect(e.line).toBe(4);
    e = errorOf("{#if a}\nx");
    expect(e.message).toMatch(/Unclosed \{#if\}/);
    expect([e.line, e.col]).toEqual([1, 1]);
    e = errorOf("{#each xs as x}\nx");
    expect(e.message).toMatch(/Unclosed \{#each\}/);
    expect(errorOf("{:else}").message).toMatch(/without matching/);
    expect(errorOf("x {/if}").message).toMatch(/without matching/);
    expect(errorOf("{#if a}{:else}{:else}{/if}").message).toMatch(
      /Nothing can follow/,
    );
    expect(errorOf("{#if a}{/each}").message).toMatch(/Expected \{\/if\}/);
    expect(errorOf("{#each xs}{/each}").message).toMatch(/as item/);
    expect(errorOf("{#while a}{/while}").message).toMatch(/Unknown block/);
  });

  test("bad expressions point inside the template", () => {
    let e = errorOf("<p>\n  hello {a +}\n</p>");
    expect(e.line).toBe(2);
    e = errorOf("{#if }\n{/if}");
    expect(e.message).toMatch(/Empty expression/);
    expect(e.line).toBe(1);
    e = errorOf("<p>{oops</p>");
    expect(e.message).toMatch(/Unclosed \{/);
    expect([e.line, e.col]).toEqual([1, 4]);
  });

  test("attribute errors", () => {
    let e = errorOf('<div>\n  <a href="x on:click={go}>t</a></div>');
    expect(e.message).toMatch(/Unterminated attribute value/);
    expect([e.line, e.col]).toEqual([2, 11]);
    e = errorOf("<p {...x}></p>");
    expect(e.message).toMatch(/only allowed on components/);
    expect(errorOf('<p on:click="go"></p>').message).toMatch(
      /needs a \{expression\}/,
    );
    expect(errorOf("<p on:click={a + b}></p>").message).toMatch(/message id/);
    expect(errorOf("<p on:click|nope={go}></p>").message).toMatch(/modifier/);
    expect(errorOf("<p class:a-b></p>").message).toMatch(/needs a/);
    expect(errorOf("<p").message).toMatch(/Unclosed <p/);
  });

  test("component errors", () => {
    let e = errorOf("<Card />");
    expect(e.message).toMatch(/"Card" is not imported/);
    expect([e.line, e.col]).toEqual([1, 1]);
    const imp = `{#import Card from "./c.pavlus"}\n`;
    expect(errorOf(`${imp}<Card><p></p></Card>`).message).toMatch(
      /cannot have children/,
    );
    expect(errorOf(`${imp}<Card on:click={x} />`).message).toMatch(
      /not a valid prop/,
    );
    expect(errorOf(`${imp}<Card name={n} />`).message).toMatch(
      /plain identifier/,
    );
    expect(errorOf('<Dynamic name="a" />').message).toMatch(/this=/);
    expect(errorOf("<Dynamic this={V} />").message).toMatch(/instance name/);
    expect(errorOf('<Outlet a="1" />').message).toMatch(/no attributes/);
    expect(errorOf("<svelte:component this={V} />").message).toMatch(/Dynamic/);
    expect(errorOf("<p></p>\n{#import A from 'a'}").message).toMatch(
      /top of the file/,
    );
    expect(errorOf("{#import a from 'a'}").message).toMatch(/capital/);
    expect(errorOf("{#import A from 'a'}{#import A from 'b'}").message).toMatch(
      /twice/,
    );
    expect(errorOf("<!doctype html>").message).toMatch(/comments/);
    expect(errorOf("<!-- x").message).toMatch(/Unclosed comment/);
  });
});

describe("blocks: mounted in the DOM", () => {
  const view = compileToView<{
    items: { id: number; text: string; done: boolean }[];
    draft: string;
  }>(
    `<form on:submit|preventDefault={add}>
  <input class="draft" value={draft} on:input={setDraft} />
</form>
<ul>
  {#each items as item (item.id)}
    <li class:done={item.done}>
      <span>{item.text}</span>
      <button on:click={toggle(item.id)}>toggle</button>
    </li>
  {:else}
    <li class="empty">Nothing yet</li>
  {/each}
</ul>`,
    { parser: parseBlocks },
  );

  test("clicks send messages and state changes patch the DOM", () => {
    const h = mountView(view, { items: [], draft: "" });
    expect(h.root.querySelector(".empty")).not.toBeNull();
    h.set({
      items: [
        { id: 1, text: "a", done: false },
        { id: 2, text: "b", done: true },
      ],
      draft: "",
    });
    expect(h.root.querySelector(".empty")).toBeNull();
    expect(h.root.querySelectorAll("li").length).toBe(2);
    expect(h.root.querySelectorAll("li.done").length).toBe(1);
    h.root.querySelectorAll("button")[1].click();
    expect(h.messages.map((m) => [m.id, m.payload])).toEqual([["toggle", 2]]);
    const submit = new Event("submit", { cancelable: true, bubbles: true });
    h.root.querySelector("form")!.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    expect(h.messages.at(-1)!.id).toBe("add");
    h.set({ items: [{ id: 2, text: "b", done: false }], draft: "z" });
    expect(h.root.querySelectorAll("li.done").length).toBe(0);
    expect((h.root.querySelector(".draft") as HTMLInputElement).value).toBe(
      "z",
    );
    expect(toHtml(view.render({ items: [], draft: "" }))).toContain(
      "Nothing yet",
    );
    h.unmount();
  });
});
