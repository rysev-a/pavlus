import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  smallest: {
    template: `p Hello, {name}`,
    state: { name: "Ann" },
    steps: [
      { label: "name Ann → Bob", prev: { name: "Ann" }, next: { name: "Bob" } },
    ],
  },
  "with-child": {
    template: `import Badge from "./badge.pavlus"

li.user
  span.name {name}
  +Badge#badge(label=role)`,
    components: {
      Badge: `span.badge {label}`,
    },
    state: { name: "Ann", role: "owner" },
    steps: [
      {
        label: "role owner → guest",
        prev: { name: "Ann", role: "owner" },
        next: { name: "Ann", role: "guest" },
      },
    ],
  },
  "many-helpers": {
    template: `ul
  for task in tasks key task.id
    li(class:done=task.done title=task.note) {task.title}`,
    state: {
      tasks: [
        { id: 1, title: "Write", note: "first", done: true },
        { id: 2, title: "Test", note: null, done: false },
      ],
    },
    steps: [
      {
        label: "task 2 gets a note",
        prev: {
          tasks: [
            { id: 1, title: "Write", note: "first", done: true },
            { id: 2, title: "Test", note: null, done: false },
          ],
        },
        next: {
          tasks: [
            { id: 1, title: "Write", note: "first", done: true },
            { id: 2, title: "Test", note: "next", done: false },
          ],
        },
      },
    ],
  },
};
