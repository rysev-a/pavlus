import type { Demo } from "../demo.ts";
import { compileToView } from "../../../../framework/src/compiler/mod.ts";

/**
 * A compiled view as a value of the state, for `+{expr}`. In the page the
 * state is shown as JSON, so it gets a `toJSON` that prints its name.
 */
const viewValue = (name: string, source: string) =>
  Object.assign(compileToView(source), { toJSON: () => `<view ${name}>` });

const listView = viewValue(
  "list.pavlus",
  `ul.list
  for item in items key item
    li {item}`,
);
const tableView = viewValue(
  "table.pavlus",
  `table.table
  for item, i in items key item
    tr
      td {i + 1}
      td {item}`,
);

const footerView = viewValue("footer.pavlus", `p.footer {count} cards`);

const todo = (id: number, title: string, done = false) => ({ id, title, done });
const A = todo(1, "Write");
const B = todo(2, "Test");
const C = todo(3, "Ship");
const D = todo(4, "Rest");
const dev = { id: "g1", name: "Dev", members: [{ id: "u1", name: "Ann" }] };
const ops = { id: "g2", name: "Ops", members: [{ id: "u2", name: "Bob" }] };

export const demos: Record<string, Demo> = {
  "if-else": {
    template: `if loggedIn
  p Welcome back
else
  p Please log in`,
    state: { loggedIn: false },
    steps: [
      {
        label: "loggedIn false → true",
        prev: { loggedIn: false },
        next: { loggedIn: true },
      },
      {
        label: "loggedIn true → true",
        prev: { loggedIn: true },
        next: { loggedIn: true },
      },
    ],
  },
  "if-alone": {
    template: `p Status
if error
  p.error {error}`,
    state: { error: null },
    steps: [
      { label: "error none → Oops", prev: { error: null }, next: { error: "Oops" } },
      { label: "error Oops → Again", prev: { error: "Oops" }, next: { error: "Again" } },
      { label: "error Oops → none", prev: { error: "Oops" }, next: { error: null } },
      { label: "error none → none", prev: { error: null }, next: { error: null } },
    ],
  },
  "if-chain": {
    template: `section
  if status === "loading"
    p.status Loading...
  else if status === "failed"
    p.status.status--error {error}
    button(@click=retry) Retry
  else
    ul
      for item in items
        li {item}`,
    state: { status: "ok", error: "", items: ["a", "b"] },
    steps: [
      {
        label: "ok → loading",
        prev: { status: "ok", error: "", items: ["a", "b"] },
        next: { status: "loading", error: "", items: ["a", "b"] },
      },
      {
        label: "loading → failed",
        prev: { status: "loading", error: "", items: [] },
        next: { status: "failed", error: "Timeout", items: [] },
      },
      {
        label: "failed, error changes",
        prev: { status: "failed", error: "Timeout", items: [] },
        next: { status: "failed", error: "Offline", items: [] },
      },
      {
        label: "loading, error changes",
        prev: { status: "loading", error: "", items: [] },
        next: { status: "loading", error: "x", items: [] },
      },
      {
        label: "ok, items change",
        prev: { status: "ok", error: "", items: ["a"] },
        next: { status: "ok", error: "", items: ["a", "b"] },
      },
    ],
  },
  "if-markers": {
    template: `div
  if a
    p A
  if b
    p B`,
    state: { a: true, b: false },
    steps: [
      {
        label: "b false → true",
        prev: { a: true, b: false },
        next: { a: true, b: true },
      },
      {
        label: "a true → false",
        prev: { a: true, b: true },
        next: { a: false, b: true },
      },
    ],
  },
  "for-unkeyed": {
    template: `ul
  for tag in tags
    li {tag}`,
    state: { tags: ["red", "green", "blue"] },
    steps: [
      {
        label: "append yellow",
        prev: { tags: ["red", "green", "blue"] },
        next: { tags: ["red", "green", "blue", "yellow"] },
      },
      {
        label: "remove the last",
        prev: { tags: ["red", "green", "blue"] },
        next: { tags: ["red", "green"] },
      },
      {
        label: "remove the first",
        prev: { tags: ["red", "green", "blue"] },
        next: { tags: ["green", "blue"] },
      },
      {
        label: "reverse",
        prev: { tags: ["red", "green", "blue"] },
        next: { tags: ["blue", "green", "red"] },
      },
    ],
  },
  "for-keyed": {
    template: `ul.todos
  for todo in todos key todo.id
    li(class:done=todo.done) {todo.title}`,
    state: { todos: [A, B, C] },
    steps: [
      { label: "append D", prev: { todos: [A, B, C] }, next: { todos: [A, B, C, D] } },
      { label: "remove A", prev: { todos: [A, B, C] }, next: { todos: [B, C] } },
      { label: "remove B", prev: { todos: [A, B, C] }, next: { todos: [A, C] } },
      { label: "insert D in the middle", prev: { todos: [A, B, C] }, next: { todos: [A, D, B, C] } },
      { label: "swap A and B", prev: { todos: [A, B, C] }, next: { todos: [B, A, C] } },
      { label: "C to the front", prev: { todos: [A, B, C] }, next: { todos: [C, A, B] } },
      { label: "A to the end", prev: { todos: [A, B, C] }, next: { todos: [B, C, A] } },
      {
        label: "B done",
        prev: { todos: [A, B, C] },
        next: { todos: [A, { ...B, done: true }, C] },
      },
      { label: "all replaced", prev: { todos: [A, B] }, next: { todos: [C, D] } },
      { label: "nothing changed", prev: { todos: [A, B, C] }, next: { todos: [A, B, C] } },
    ],
  },
  "for-moves": {
    template: `ul
  for tag in tags key tag
    li {tag}`,
    state: { tags: ["a", "b", "c", "d"] },
    steps: [
      {
        label: "first to the end",
        prev: { tags: ["a", "b", "c", "d"] },
        next: { tags: ["b", "c", "d", "a"] },
      },
      {
        label: "last to the front",
        prev: { tags: ["a", "b", "c", "d"] },
        next: { tags: ["d", "a", "b", "c"] },
      },
      {
        label: "reverse",
        prev: { tags: ["a", "b", "c", "d"] },
        next: { tags: ["d", "c", "b", "a"] },
      },
    ],
  },
  "for-index": {
    template: `ol
  for item, i in items key item.id
    li {i + 1}. {item.name}`,
    state: {
      items: [
        { id: "a", name: "Ann" },
        { id: "b", name: "Bob" },
        { id: "c", name: "Cy" },
      ],
    },
    steps: [
      {
        label: "remove the first",
        prev: {
          items: [
            { id: "a", name: "Ann" },
            { id: "b", name: "Bob" },
            { id: "c", name: "Cy" },
          ],
        },
        next: {
          items: [
            { id: "b", name: "Bob" },
            { id: "c", name: "Cy" },
          ],
        },
      },
    ],
  },
  "for-empty": {
    template: `ul
  for item in items key item
    li {item}
if items.length === 0
  p.empty Nothing here`,
    state: { items: [] },
    steps: [
      { label: "[] → [x, y]", prev: { items: [] }, next: { items: ["x", "y"] } },
      { label: "[x, y] → []", prev: { items: ["x", "y"] }, next: { items: [] } },
      { label: "[] → undefined", prev: { items: [] }, next: {} },
    ],
  },
  "for-nested": {
    template: `div.groups
  for group in groups key group.id
    section
      h3 {group.name}
      ul
        for member in group.members key member.id
          li {member.name}`,
    state: { groups: [dev, ops] },
    steps: [
      {
        label: "Cy joins Ops",
        prev: { groups: [dev, ops] },
        next: {
          groups: [
            dev,
            { ...ops, members: [...ops.members, { id: "u3", name: "Cy" }] },
          ],
        },
      },
    ],
  },
  "embed-static": {
    template: `import Badge from "./badge.pavlus"

li.user
  span.name {name}
  +Badge#badge(label=role hot=admin)`,
    components: {
      Badge: `span.badge(class:hot=hot) {label}`,
    },
    state: { name: "Ann", role: "owner", admin: true },
    steps: [
      {
        label: "role owner → guest",
        prev: { name: "Ann", role: "owner", admin: true },
        next: { name: "Ann", role: "guest", admin: true },
      },
      {
        label: "admin true → false",
        prev: { name: "Ann", role: "owner", admin: true },
        next: { name: "Ann", role: "owner", admin: false },
      },
      {
        label: "name changes",
        prev: { name: "Ann", role: "owner", admin: true },
        next: { name: "Bob", role: "owner", admin: true },
      },
    ],
  },
  "embed-in-loop": {
    template: `import Badge from "./badge.pavlus"

ul
  for user in users key user.id
    li
      | {user.name}
      +Badge#badge(label=user.role hot=user.admin)`,
    components: {
      Badge: `span.badge(class:hot=hot) {label}`,
    },
    state: {
      users: [
        { id: 1, name: "Ann", role: "owner", admin: true },
        { id: 2, name: "Bob", role: "guest", admin: false },
      ],
    },
    steps: [
      {
        label: "Bob becomes admin",
        prev: {
          users: [
            { id: 1, name: "Ann", role: "owner", admin: true },
            { id: 2, name: "Bob", role: "guest", admin: false },
          ],
        },
        next: {
          users: [
            { id: 1, name: "Ann", role: "owner", admin: true },
            { id: 2, name: "Bob", role: "admin", admin: true },
          ],
        },
      },
    ],
  },
  "embed-dynamic": {
    template: `section.panel
  h2 {title}
  +{panel}#panel(items=items)`,
    state: { title: "Items", panel: listView, items: ["x", "y"] },
    steps: [
      {
        label: "items [x, y] → [x, y, z]",
        prev: { title: "Items", panel: listView, items: ["x", "y"] },
        next: { title: "Items", panel: listView, items: ["x", "y", "z"] },
      },
      {
        label: "list view → table view",
        prev: { title: "Items", panel: listView, items: ["x", "y"] },
        next: { title: "Items", panel: tableView, items: ["x", "y"] },
      },
      {
        label: "list view → nothing",
        prev: { title: "Items", panel: listView, items: ["x", "y"] },
        next: { title: "Items", panel: null, items: ["x", "y"] },
      },
      {
        label: "nothing → table view",
        prev: { title: "Items", panel: null, items: ["x", "y"] },
        next: { title: "Items", panel: tableView, items: ["x", "y"] },
      },
      {
        label: "title changes",
        prev: { title: "Items", panel: listView, items: ["x", "y"] },
        next: { title: "Other", panel: listView, items: ["x", "y"] },
      },
    ],
  },
  "everything": {
    template: `import Badge from "./badge.pavlus"

main.board
  h1 {title}
  if loading
    p.loading Loading...
  else if cards.length === 0
    p.empty No cards
  else
    ul.cards
      for card, i in cards key card.id
        li.card(class:done=card.done @click=open(card.id))
          span.num {i + 1}
          span.title {card.title}
          +Badge#badge(label=card.tag hot=card.done)
  +{footer}#footer(count=cards.length)`,
    components: {
      Badge: `span.badge(class:hot=hot) {label}`,
    },
    state: {
      title: "Board",
      loading: false,
      cards: [
        { id: 1, title: "Write", tag: "doc", done: false },
        { id: 2, title: "Test", tag: "qa", done: true },
      ],
      footer: footerView,
    },
    steps: [
      {
        label: "loading true → false, two cards",
        prev: {
          title: "Board",
          loading: true,
          cards: [
            { id: 1, title: "Write", tag: "doc", done: false },
            { id: 2, title: "Test", tag: "qa", done: true },
          ],
          footer: footerView,
        },
        next: {
          title: "Board",
          loading: false,
          cards: [
            { id: 1, title: "Write", tag: "doc", done: false },
            { id: 2, title: "Test", tag: "qa", done: true },
          ],
          footer: footerView,
        },
      },
      {
        label: "card 1 done, card 2 moves up",
        prev: {
          title: "Board",
          loading: false,
          cards: [
            { id: 1, title: "Write", tag: "doc", done: false },
            { id: 2, title: "Test", tag: "qa", done: true },
          ],
          footer: footerView,
        },
        next: {
          title: "Board",
          loading: false,
          cards: [
            { id: 2, title: "Test", tag: "qa", done: true },
            { id: 1, title: "Write", tag: "doc", done: true },
          ],
          footer: footerView,
        },
      },
      {
        label: "last card removed",
        prev: {
          title: "Board",
          loading: false,
          cards: [
            { id: 1, title: "Write", tag: "doc", done: false },
            { id: 2, title: "Test", tag: "qa", done: true },
          ],
          footer: footerView,
        },
        next: {
          title: "Board",
          loading: false,
          cards: [{ id: 1, title: "Write", tag: "doc", done: false }],
          footer: footerView,
        },
      },
      {
        label: "all cards removed",
        prev: {
          title: "Board",
          loading: false,
          cards: [{ id: 1, title: "Write", tag: "doc", done: false }],
          footer: footerView,
        },
        next: { title: "Board", loading: false, cards: [], footer: footerView },
      },
    ],
  },
};
