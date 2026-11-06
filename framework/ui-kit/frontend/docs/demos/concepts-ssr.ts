import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  hello: {
    template: `p Hello, {name}`,
    state: { name: "Ann" },
  },
  list: {
    template: `ul
  for todo in todos key todo.id
    li(class:done=todo.done) {todo.title}`,
    state: {
      todos: [
        { id: 1, title: "a", done: true },
        { id: 2, title: "b", done: false },
      ],
    },
  },
  escape: {
    template: `p Hello, {name}`,
    state: { name: "<script>alert(1)</script> & more" },
  },
};
