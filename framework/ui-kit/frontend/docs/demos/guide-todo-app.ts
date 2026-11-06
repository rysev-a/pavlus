import type { Demo } from "../demo.ts";

const buy = { id: 1, title: "Buy milk", done: false };
const docs = { id: 2, title: "Write the docs", done: true };
const rent = { id: 3, title: "Pay rent", done: false };

const at = (path: string) => ({
  path,
  base: "",
  params: {},
  search: "",
  hash: "",
});

export const demos: Record<string, Demo> = {
  list: {
    template: `section.todos
  h1 Todo
  ul.todos__list
    for todo in items key todo.id
      li(class:done=todo.done) {todo.title}`,
    state: { items: [buy, docs] },
    steps: [
      {
        label: "item 3 added",
        prev: { items: [buy, docs] },
        next: { items: [buy, docs, rent] },
      },
      {
        label: "item 1 done",
        prev: { items: [buy, docs] },
        next: { items: [{ ...buy, done: true }, docs] },
      },
    ],
  },
  form: {
    template: `section.todos
  h1 Todo
  form.todos__add(@submit.prevent=add)
    input(type="text" placeholder="What needs to be done?" value=draft @input=typing)
    button(type="submit") Add
  ul.todos__list
    for todo in items key todo.id
      li(class:done=todo.done)
        input(type="checkbox" checked={todo.done} @change=toggle(todo.id))
        span {todo.title}
        button(type="button" @click=remove(todo.id)) Remove`,
    state: { items: [buy, docs], draft: "" },
    steps: [
      {
        label: "draft empty → Pay rent",
        prev: { items: [buy, docs], draft: "" },
        next: { items: [buy, docs], draft: "Pay rent" },
      },
      {
        label: "add: item 3, draft cleared",
        prev: { items: [buy, docs], draft: "Pay rent" },
        next: { items: [buy, docs, rent], draft: "" },
      },
      {
        label: "item 1 removed",
        prev: { items: [buy, docs], draft: "" },
        next: { items: [docs], draft: "" },
      },
    ],
  },
  filters: {
    template: `section.todos
  ul.todos__list
    for todo in visible key todo.id
      li(class:done=todo.done) {todo.title}
  p.todos__left {left} left
  div.todos__filters
    button(type="button" class:active={filter === "all"} @click=setFilter("all")) All
    button(type="button" class:active={filter === "active"} @click=setFilter("active")) Active
    button(type="button" class:active={filter === "done"} @click=setFilter("done")) Done`,
    state: { visible: [buy, docs], left: 1, filter: "all" },
    steps: [
      {
        label: "filter all → done",
        prev: { visible: [buy, docs], left: 1, filter: "all" },
        next: { visible: [docs], left: 1, filter: "done" },
      },
    ],
  },
  nav: {
    template: `nav.app__nav
  a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Todos
  a(href="/about" class:active={route.path === "/about"} @click.prevent=navigate("/about")) About`,
    state: { route: at("/") },
    steps: [
      {
        label: "path / → /about",
        prev: { route: at("/") },
        next: { route: at("/about") },
      },
    ],
  },
};
