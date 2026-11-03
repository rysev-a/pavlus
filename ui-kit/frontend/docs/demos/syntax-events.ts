import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  click: {
    template: `button(@click=save) Save`,
    state: {},
  },
  payload: {
    template: `li
  span {item.title}
  button(@click=remove(item.id)) Remove`,
    state: { item: { id: 1, title: "Write docs" } },
    steps: [
      {
        label: "item.id 1 → 2",
        prev: { item: { id: 1, title: "Write docs" } },
        next: { item: { id: 2, title: "Write docs" } },
      },
      {
        label: "item.title changes",
        prev: { item: { id: 1, title: "Write docs" } },
        next: { item: { id: 1, title: "Ship docs" } },
      },
    ],
  },
  "several-args": {
    template: `button(@click=move(item.id, "up", 1)) Move up`,
    state: { item: { id: 5 } },
  },
  "static-event": {
    template: `button(@click=save class:busy=busy) Save`,
    state: { busy: false },
    steps: [
      {
        label: "busy false → true",
        prev: { busy: false },
        next: { busy: true },
      },
    ],
  },
  modifiers: {
    template: `form(@submit.prevent=send(email))
  input(type="email" value=email @input=typing)
  button(type="submit") Send
a(href="/help" @click.prevent.stop=openHelp) Help`,
    state: { email: "ann@example.com" },
  },
  dotted: {
    template: `button(@click=users.open(user.id)) Open {user.name}`,
    state: { user: { id: 3, name: "Ann" } },
  },
  "empty-parens": {
    template: `button(@click=save()) Save`,
    state: {},
  },
  "in-loop": {
    template: `ul
  for task in tasks key task.id
    li
      span {task.title}
      button(@click=toggle(task.id)) Done
      button(@click.stop=remove(task.id)) x`,
    state: {
      tasks: [
        { id: 10, title: "Write" },
        { id: 20, title: "Test" },
      ],
    },
  },
  "with-component": {
    components: { Row: `li
  span {label}
  button(@click=pick(id)) Pick` },
    template: `import Row from "./row.pavlus"
ul
  +Row#first(id=1 label="One")
  +Row#second(id=2 label="Two")
button(@click=reset) Reset`,
    state: {},
  },
  "default-name": {
    components: { UserCard: `button(@click=open) {name}` },
    template: `import UserCard from "./user-card.pavlus"
+UserCard(name=who)
+UserCard#admin(name="Root")`,
    state: { who: "Ann" },
  },
  "many-events": {
    template: `input(type="text" value=text @input=setText @keydown=key @focus=focused @blur=blurred)`,
    state: { text: "" },
  },
};
