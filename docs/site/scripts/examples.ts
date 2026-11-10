/**
 * The examples of the landing page, from simple to complex. Each one is a
 * template and the states it is rendered and diffed with; build.ts compiles
 * it with the real compiler and runs the result, so what the page shows is
 * what the framework does.
 */
export interface Step {
  /** What changes between `prev` and `next`. */
  label: string;
  prev: unknown;
  next: unknown;
}

export interface Example {
  id: string;
  title: string;
  /** What this section adds, in a few sentences (HTML). */
  intro: string;
  template: string;
  /** The state `render` is shown with. */
  state: unknown;
  /** The changes `diff` is shown with. */
  steps: Step[];
  /** What to notice in the output (HTML list items). */
  notes: string[];
  /** What the diagram adds on top of the pipeline. */
  diagram: string;
}

export const examples: Example[] = [
  {
    id: "static",
    title: "1. An element with text",
    intro: `A template is an indented tree of elements. This one reads nothing
      from the state, so <code>render</code> always returns the same nodes and
      <code>diff</code> has nothing to say: no node here has an <code>id</code>,
      because nothing can ever change it.`,
    template: `p.note Hello, world`,
    state: {},
    steps: [{ label: "any state to any state", prev: {}, next: { x: 1 } }],
    notes: [
      "<code>render</code> returns plain data: a <code>VNode</code> is an object with a tag, attributes, events and children.",
      "<code>diff</code> returns <code>[]</code>: the compiler saw that the template reads no state.",
    ],
    diagram: "static",
  },
  {
    id: "text",
    title: "2. Text from the state",
    intro: `<code>{expr}</code> puts a value of the state in the text. The text node
      now gets an <code>id</code>, and <code>diff</code> compares the expression
      on both sides: a <code>text</code> patch names the node and the new text.`,
    template: `p Hello, {name}! You have {count} items.`,
    state: { name: "Ann", count: 2 },
    steps: [
      {
        label: "count 2 → 3",
        prev: { name: "Ann", count: 2 },
        next: { name: "Ann", count: 3 },
      },
      {
        label: "nothing changed",
        prev: { name: "Ann", count: 2 },
        next: { name: "Ann", count: 2 },
      },
    ],
    notes: [
      "The whole text is one node: one patch replaces it, with the two values joined again.",
      "A guard first: <code>diff</code> only looks inside the <code>&lt;p&gt;</code> if <code>name</code> or <code>count</code> changed (<code>!==</code> on the state).",
    ],
    diagram: "text",
  },
  {
    id: "attributes",
    title: "3. Attributes",
    intro: `Attributes take expressions (<code>href=url</code>), strings with
      interpolation (<code>title="Open {title}"</code>) and class toggles
      (<code>class:active=active</code>). Each dynamic attribute becomes an
      <code>attr</code> patch when its value changes, or <code>rmAttr</code>
      when it goes away.`,
    template: `a.link(href=url class:active=active title="Open {title}") {title}`,
    state: { url: "/users", title: "Users", active: false },
    steps: [
      {
        label: "active false → true, url changed",
        prev: { url: "/users", title: "Users", active: false },
        next: { url: "/users?all", title: "Users", active: true },
      },
    ],
    notes: [
      "The class is computed on both sides (<code>link</code> vs <code>link active</code>) and patched as one attribute.",
      "<code>title</code> did not change, so no patch for it or for the text: each attribute is compared on its own.",
    ],
    diagram: "attributes",
  },
  {
    id: "events",
    title: "4. Events",
    intro: `An event attribute (<code>@click=go(nextPage)</code>) is not a
      function: <code>render</code> reads its arguments from the current state
      and attaches plain message data (<code>{ id: "go", payload: … }</code>).
      The numbers themselves (<code>prevPage</code>, <code>nextPage</code>) are
      computed in the component, not in the template: an expression is a path
      or a literal, never <code>page + 1</code>.
      <code>diff</code> compares the data by value — when only a payload changes,
      one <code>handler</code> patch rebinds the message on the same element;
      the DOM listener itself is attached once and never changes.`,
    template: `ul.pager
  li(@click=go(1)) first
  li(@click=go(prevPage)) prev
  li(@click=go(nextPage)) next
  li(@click=go(total)) last`,
    state: { prevPage: 1, nextPage: 3, total: 5 },
    steps: [
      {
        label: "page 2 → 3: two payloads change",
        prev: { prevPage: 1, nextPage: 3, total: 5 },
        next: { prevPage: 2, nextPage: 4, total: 5 },
      },
      {
        label: "total 5 → 9: one payload changes",
        prev: { prevPage: 2, nextPage: 4, total: 5 },
        next: { prevPage: 2, nextPage: 4, total: 9 },
      },
    ],
    notes: [
      "The <code>@click</code> data is in <code>render</code>'s output like an attribute; the DOM plugin keeps one stable listener per element and event type.",
      "<code>go(prevPage)</code> produced <code>{ id: 'go', payload: 1 }</code> for page 2 and <code>{ id: 'go', payload: 2 }</code> for page 3: one <code>handler</code> patch, no re-render of the element.",
      "Modifiers (<code>@click.prevent</code>, <code>@submit.prevent</code>, <code>@click.stop</code>) are part of the same data; <code>preventDefault</code> / <code>stopPropagation</code> are the DOM plugin's business.",
    ],
    diagram: "events",
  },
  {
    id: "if",
    title: "5. A condition",
    intro: `<code>if</code> / <code>else</code> render one branch. The block is
      delimited by two <em>markers</em> (empty comment nodes with ids), so a
      change of branch is two patches: <code>clear</code> what is between the
      markers, <code>insert</code> the new branch, rendered from the new state.
      Inside the same branch, only the usual small patches.`,
    template: `if loading
  p.status Loading...
else
  p.done Loaded {count} items`,
    state: { loading: true, count: 0 },
    steps: [
      {
        label: "loading true → false",
        prev: { loading: true, count: 0 },
        next: { loading: false, count: 8 },
      },
      {
        label: "same branch, count 8 → 9",
        prev: { loading: false, count: 8 },
        next: { loading: false, count: 9 },
      },
    ],
    notes: [
      "The markers <code>1s</code> / <code>1e</code> stay in the DOM forever; the branch lives between them.",
      "An <code>insert</code> patch carries whole VNodes: the DOM plugin builds them like a first render.",
    ],
    diagram: "if",
  },
  {
    id: "for",
    title: "6. A loop",
    intro: `<code>for</code> repeats its body. Without a <code>key</code> the
      index is the key: an item is known by its position. Every item is wrapped
      in its own pair of markers, so it can be inserted or removed as a range.`,
    template: `ul
  for item in items
    li {item}`,
    state: { items: ["a", "b"] },
    steps: [
      {
        label: "an item appended",
        prev: { items: ["a", "b"] },
        next: { items: ["a", "b", "c"] },
      },
      {
        label: "the first item removed",
        prev: { items: ["a", "b", "c"] },
        next: { items: ["b", "c"] },
      },
    ],
    notes: [
      "Appending inserts one range before the end marker <code>1e</code>.",
      "Removing the first item by position means every item shifts: two text patches and one removed range, not one removal. A <code>key</code> fixes that (next section).",
    ],
    diagram: "for",
  },
  {
    id: "list",
    title: "7. A keyed list",
    intro: `With <code>key</code>, an item is known by its key. <code>diff</code>
      reconciles the two key sequences: <code>remove</code> what is gone,
      <code>move</code> what changed place, <code>insert</code> what is new, and
      for the items that stayed, diff their bodies. Events are data too:
      <code>@click=pick(user.id)</code> is a message with a payload, compared by
      value like everything else.`,
    template: `ul.users
  for user in users key user.id
    li(class:on=user.on @click=pick(user.id)) {user.name}`,
    state: {
      users: [
        { id: 1, name: "Ann", on: false },
        { id: 2, name: "Bob", on: false },
        { id: 3, name: "Anton", on: false },
      ],
    },
    steps: [
      {
        label: "Bob removed, Anton moved first and switched on, Clara added",
        prev: {
          users: [
            { id: 1, name: "Ann", on: false },
            { id: 2, name: "Bob", on: false },
            { id: 3, name: "Anton", on: false },
          ],
        },
        next: {
          users: [
            { id: 3, name: "Anton", on: true },
            { id: 1, name: "Ann", on: false },
            { id: 4, name: "Clara", on: false },
          ],
        },
      },
    ],
    notes: [
      "Node ids carry the key (<code>2#3</code> is the <code>&lt;li&gt;</code> of user 3), so a moved item keeps its id and its DOM nodes.",
      "Ann's item is untouched: same key, same object (<code>prevUser === nextUser</code>), nothing to compare.",
    ],
    diagram: "list",
  },
  {
    id: "combined",
    title: "8. A condition and attributes together",
    intro: `A real form: attributes that depend on <code>busy</code>, a label
      the component derives from it (<code>saveLabel</code>), and an error block. Every node is guarded by the state
      roots it reads (the <code>// (reads: …)</code> comments in the generated
      code), so a change to <code>busy</code> is looked at by the button and the
      input but not by the error block.`,
    template: `form(@submit.prevent=save)
  input(value=name disabled={busy} @input=changed)
  button(class:busy=busy disabled={busy}) {saveLabel}
  if error
    p.error {error}`,
    state: { name: "Ann", busy: false, saveLabel: "Save", error: "" },
    steps: [
      {
        label: "busy false → true",
        prev: { name: "Ann", busy: false, saveLabel: "Save", error: "" },
        next: { name: "Ann", busy: true, saveLabel: "Saving...", error: "" },
      },
      {
        label: "busy true → false, an error arrives",
        prev: { name: "Ann", busy: true, saveLabel: "Saving...", error: "" },
        next: {
          name: "Ann",
          busy: false,
          saveLabel: "Save",
          error: "Name taken",
        },
      },
    ],
    notes: [
      "<code>disabled={busy}</code>: <code>true</code> renders the attribute empty, <code>false</code> removes it (<code>rmAttr</code>).",
      "The first step produces no patch for the error block: its guard (<code>prev.error !== next.error</code>) is false.",
      "Events (<code>@submit.prevent</code>, <code>@input</code>) are in <code>render</code>'s output as data; the DOM plugin turns them into listeners once.",
    ],
    diagram: "combined",
  },
];
