import type { Demo } from "../demo.ts";

const a = { id: 1, text: "Write docs", done: false };
const b = { id: 2, text: "Run tests", done: true };

export const demos: Record<string, Demo> = {
  "state-and-template": {
    template: `p Hello, {user.name}. You have {unread} unread messages.`,
    state: { user: { name: "Ann" }, unread: 3 },
    steps: [
      {
        label: "unread 3 → 4",
        prev: { user: { name: "Ann" }, unread: 3 },
        next: { user: { name: "Ann" }, unread: 4 },
      },
    ],
  },
  todo: {
    template: `section.todo
  form(@submit.prevent=add)
    input(value=draft placeholder="What needs doing?" @input=setDraft)
    button(type="submit" disabled={draft === ""}) Add
  nav.filters
    button(type="button" class:active={filter === "all"} @click=setFilter("all")) All
    button(type="button" class:active={filter === "open"} @click=setFilter("open")) Open
  ul.list
    for t in items key t.id
      if filter === "all" || !t.done
        li(class:done=t.done)
          input(type="checkbox" checked=t.done @change=toggle(t.id))
          span {t.text}
          button(type="button" @click=remove(t.id)) x
  p.left {left} left`,
    state: { draft: "", filter: "all", items: [a, b], left: 1 },
    steps: [
      {
        label: "toggle 1: done false → true",
        prev: { draft: "", filter: "all", items: [a, b], left: 1 },
        next: {
          draft: "",
          filter: "all",
          items: [{ ...a, done: true }, b],
          left: 0,
        },
      },
      {
        label: "filter all → open",
        prev: { draft: "", filter: "all", items: [a, b], left: 1 },
        next: { draft: "", filter: "open", items: [a, b], left: 1 },
      },
    ],
  },
};
