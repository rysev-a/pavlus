import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  tiny: {
    template: `p Hello, {name}`,
    state: { name: "Ann" },
    steps: [
      {
        label: "name Ann → Bob",
        prev: { name: "Ann" },
        next: { name: "Bob" },
      },
      {
        label: "nothing changed",
        prev: { name: "Ann" },
        next: { name: "Ann" },
      },
    ],
  },
  static: {
    template: `p.note Hello, world`,
    state: {},
    steps: [{ label: "any state to any state", prev: {}, next: { x: 1 } }],
  },
  stages: {
    template: `a.link(href=url class:active=active) {title}`,
    state: { url: "/users", title: "Users", active: false },
    steps: [
      {
        label: "active false → true",
        prev: { url: "/users", title: "Users", active: false },
        next: { url: "/users", title: "Users", active: true },
      },
    ],
  },
  events: {
    template: `button.btn(@click=add(step)) Add {step}`,
    state: { step: 1 },
    steps: [
      {
        label: "step 1 → 5",
        prev: { step: 1 },
        next: { step: 5 },
      },
    ],
  },
  helpers: {
    template: `input(type="checkbox" checked=done disabled=locked class:done=done)
p {note}`,
    state: { done: true, locked: false, note: null },
    steps: [
      {
        label: "done true → false",
        prev: { done: true, locked: false, note: null },
        next: { done: false, locked: false, note: null },
      },
    ],
  },
  embed: {
    template: `import Badge from "./badge.pavlus"

section
  h3 {title}
  +Badge#status(label=state)`,
    state: { title: "Order 7", state: "paid" },
    components: { Badge: `span.badge {label}` },
    steps: [
      {
        label: "state paid → shipped",
        prev: { title: "Order 7", state: "paid" },
        next: { title: "Order 7", state: "shipped" },
      },
    ],
  },
  todo: {
    template: `section.todo
  h2 {title}
  if items.length
    ul
      for item in items key item.id
        li(class:done=item.done @click=toggle(item.id))
          | {item.text}
  else
    p.empty Nothing to do
  footer {items.length} items`,
    state: {
      title: "Today",
      items: [
        { id: 1, text: "Write docs", done: false },
        { id: 2, text: "Ship it", done: true },
      ],
    },
    steps: [
      {
        label: "item 1 done",
        prev: {
          title: "Today",
          items: [
            { id: 1, text: "Write docs", done: false },
            { id: 2, text: "Ship it", done: true },
          ],
        },
        next: {
          title: "Today",
          items: [
            { id: 1, text: "Write docs", done: true },
            { id: 2, text: "Ship it", done: true },
          ],
        },
      },
      {
        label: "list becomes empty",
        prev: {
          title: "Today",
          items: [{ id: 1, text: "Write docs", done: false }],
        },
        next: { title: "Today", items: [] },
      },
    ],
  },
};
