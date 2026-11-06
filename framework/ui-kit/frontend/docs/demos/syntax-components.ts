import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  badge: {
    components: { Badge: `span.badge {label}` },
    template: `import Badge from "./badge.pavlus"
p
  | Status:
  +Badge#status(label=text)`,
    state: { text: "New" },
    steps: [
      {
        label: "text New → Done",
        prev: { text: "New" },
        next: { text: "Done" },
      },
    ],
  },
  props: {
    components: {
      Chip: `span.chip(class:on=active title="{kind}: {label}") {label} {count}`,
    },
    template: `import Chip from "./chip.pavlus"
+Chip#a(label="Fixed" kind="static" count=3)
+Chip#b(label=user.name kind="user {user.id}" count=items.length active)
+Chip#c(...user count=0)`,
    state: {
      user: { id: 7, name: "Ann", label: "From spread" },
      items: [1, 2],
    },
  },
  "child-diff": {
    components: {
      Card: `div.card
  h4 {title}
  p {body}
  p.muted Fixed footer`,
    },
    template: `import Card from "./card.pavlus"
h2 {heading}
+Card#note(title=noteTitle body=noteBody)`,
    state: { heading: "Notes", noteTitle: "First", noteBody: "Hello" },
    steps: [
      {
        label: "noteBody changes",
        prev: { heading: "Notes", noteTitle: "First", noteBody: "Hello" },
        next: { heading: "Notes", noteTitle: "First", noteBody: "Hi" },
      },
      {
        label: "heading changes (props untouched)",
        prev: { heading: "Notes", noteTitle: "First", noteBody: "Hello" },
        next: { heading: "My notes", noteTitle: "First", noteBody: "Hello" },
      },
    ],
  },
  "two-instances": {
    components: {
      Counter: `div.counter
  span {value}
  button(@click=inc) +
  button(@click=reset(value)) reset`,
    },
    template: `import Counter from "./counter.pavlus"
+Counter#apples(value=apples)
+Counter#pears(value=pears)`,
    state: { apples: 2, pears: 5 },
    steps: [
      {
        label: "pears 5 → 6",
        prev: { apples: 2, pears: 5 },
        next: { apples: 2, pears: 6 },
      },
    ],
  },
  "in-loop": {
    components: {
      Row: `li.row(class:done=done)
  span {title}
  button(@click=toggle(id)) Toggle`,
    },
    template: `import Row from "./row.pavlus"
ul
  for task in tasks key task.id
    +Row#row(id=task.id title=task.title done=task.done)`,
    state: {
      tasks: [
        { id: 1, title: "Write", done: false },
        { id: 2, title: "Test", done: false },
      ],
    },
    steps: [
      {
        label: "task 2 done false → true",
        prev: {
          tasks: [
            { id: 1, title: "Write", done: false },
            { id: 2, title: "Test", done: false },
          ],
        },
        next: {
          tasks: [
            { id: 1, title: "Write", done: false },
            { id: 2, title: "Test", done: true },
          ],
        },
      },
    ],
  },
  "in-if": {
    components: { Panel: `aside.panel\n  h4 {title}\n  p Details for {title}` },
    template: `import Panel from "./panel.pavlus"
button(@click=toggle) {open ? "Hide" : "Show"}
if open
  +Panel#details(title=name)`,
    state: { open: false, name: "Ann" },
    steps: [
      {
        label: "open false → true",
        prev: { open: false, name: "Ann" },
        next: { open: true, name: "Ann" },
      },
      {
        label: "open true → false",
        prev: { open: true, name: "Ann" },
        next: { open: false, name: "Ann" },
      },
    ],
  },
  "empty-child": {
    components: {
      Notice: `if text
  p.notice {text}`,
    },
    template: `import Notice from "./notice.pavlus"
h2 Page
+Notice#notice(text=message)
p After the notice`,
    state: { message: "" },
    steps: [
      {
        label: "message '' → Saved",
        prev: { message: "" },
        next: { message: "Saved" },
      },
      {
        label: "message Saved → Done",
        prev: { message: "Saved" },
        next: { message: "Done" },
      },
      {
        label: "message Done → ''",
        prev: { message: "Done" },
        next: { message: "" },
      },
    ],
  },
  "dynamic-empty": {
    template: `h2 Tab
+{tab}#content(title="Hello")
p After the tab`,
    state: { tab: null },
    steps: [
      { label: "tab null → null", prev: { tab: null }, next: { tab: null } },
    ],
  },
};
