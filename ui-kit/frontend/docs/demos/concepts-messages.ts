import type { Demo } from "../demo.ts";

const users = {
  status: "idle",
  items: [
    { id: 1, name: "Ann" },
    { id: 2, name: "Bob" },
  ],
  selectedId: 0,
};
const tasks = { items: [{ id: 7, title: "Ship it", done: false }] };

export const demos: Record<string, Demo> = {
  "message-ids": {
    template: `ul
  for u in users key u.id
    li(@click=select(u.id))
      span {u.name}
      button(type="button" @click.stop=remove(u.id)) remove`,
    state: {
      users: [
        { id: 1, name: "Ann" },
        { id: 2, name: "Bob" },
      ],
    },
  },
  dashboard: {
    template: `import Users from "./users.pavlus"
import Tasks from "./tasks.pavlus"

div.dashboard
  input.filter(value=filter placeholder="Filter" @input=setFilter)
  +Users#users(...users filter=filter)
  +Tasks#tasks(...tasks)`,
    components: {
      Users: `ul.users
  for u in items key u.id
    if !filter || u.name.includes(filter)
      li(class:selected={u.id === selectedId} @click=select(u.id)) {u.name}`,
      Tasks: `ul.tasks
  for t in items key t.id
    li(class:done=t.done)
      input(type="checkbox" checked=t.done @change=toggle(t.id))
      span {t.title}`,
    },
    state: { filter: "", users, tasks },
    steps: [
      {
        label: "users.selectedId 0 → 2",
        prev: { filter: "", users, tasks },
        next: { filter: "", users: { ...users, selectedId: 2 }, tasks },
      },
      {
        label: "tasks: 7 done false → true",
        prev: { filter: "", users, tasks },
        next: {
          filter: "",
          users,
          tasks: { items: [{ id: 7, title: "Ship it", done: true }] },
        },
      },
      {
        label: "filter '' → 'Bo'",
        prev: { filter: "", users, tasks },
        next: { filter: "Bo", users, tasks },
      },
    ],
  },
};
