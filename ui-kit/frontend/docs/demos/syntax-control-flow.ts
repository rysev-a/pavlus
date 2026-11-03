import type { Demo } from "../demo.ts";

const tasks = [
  { id: 1, title: "Write", done: true },
  { id: 2, title: "Test", done: false },
  { id: 3, title: "Ship", done: false },
];

const inbox = [
  { id: 1, from: "Ann", subject: "Hello", read: true },
  { id: 2, from: "Bob", subject: "Report", read: false },
];

export const demos: Record<string, Demo> = {
  "if-simple": {
    template: `if loggedIn
  p Welcome back!`,
    state: { loggedIn: true },
    steps: [
      { label: "loggedIn true → false", prev: { loggedIn: true }, next: { loggedIn: false } },
      { label: "loggedIn false → true", prev: { loggedIn: false }, next: { loggedIn: true } },
    ],
  },
  "if-else": {
    template: `if user
  p Hello, {user.name}
else
  p Please sign in`,
    state: { user: { name: "Ann" } },
    steps: [
      { label: "user Ann → null", prev: { user: { name: "Ann" } }, next: { user: null } },
      { label: "user Ann → Bob", prev: { user: { name: "Ann" } }, next: { user: { name: "Bob" } } },
    ],
  },
  "else-if": {
    template: `if status === "loading"
  p Loading...
else if status === "error"
  p.error Something went wrong: {message}
else if items.length === 0
  p Nothing here yet
else
  p {items.length} items`,
    state: { status: "ready", message: "", items: [1, 2] },
    steps: [
      {
        label: "ready → loading",
        prev: { status: "ready", message: "", items: [1, 2] },
        next: { status: "loading", message: "", items: [1, 2] },
      },
      {
        label: "items 2 → 5 (same branch)",
        prev: { status: "ready", message: "", items: [1, 2] },
        next: { status: "ready", message: "", items: [1, 2, 3, 4, 5] },
      },
      {
        label: "ready → error",
        prev: { status: "ready", message: "", items: [1, 2] },
        next: { status: "error", message: "timeout", items: [1, 2] },
      },
    ],
  },
  "if-inside": {
    template: `div.card
  h3 {title}
  if subtitle
    p.muted {subtitle}
  p Footer`,
    state: { title: "Hello", subtitle: "" },
    steps: [
      {
        label: "subtitle empty → text",
        prev: { title: "Hello", subtitle: "" },
        next: { title: "Hello", subtitle: "Welcome" },
      },
    ],
  },
  "for-simple": {
    template: `ul
  for name in names
    li {name}`,
    state: { names: ["Ann", "Bob", "Cid"] },
  },
  "for-index": {
    template: `ol
  for name, i in names
    li {i + 1}. {name}`,
    state: { names: ["Ann", "Bob"] },
  },
  "for-empty": {
    template: `ul
  for name in names
    li {name}
p Total: {names.length}`,
    state: { names: [] },
    steps: [
      { label: "[] → one name", prev: { names: [] }, next: { names: ["Ann"] } },
    ],
  },
  "for-missing": {
    template: `ul
  for item in items
    li {item}
p done`,
    state: { items: null },
  },
  "for-if-else": {
    template: `if items.length
  ul
    for item in items key item
      li {item}
else
  p Nothing here yet`,
    state: { items: ["a", "b"] },
    steps: [
      { label: "two items → none", prev: { items: ["a", "b"] }, next: { items: [] } },
      { label: "none → two items", prev: { items: [] }, next: { items: ["a", "b"] } },
    ],
  },
  "keyed-reorder": {
    template: `ul
  for task in tasks key task.id
    li {task.title}`,
    state: { tasks },
    steps: [
      {
        label: "last item moves to the front",
        prev: { tasks },
        next: { tasks: [tasks[2], tasks[0], tasks[1]] },
      },
      {
        label: "first item removed",
        prev: { tasks },
        next: { tasks: [tasks[1], tasks[2]] },
      },
      {
        label: "new item at the end",
        prev: { tasks },
        next: { tasks: [...tasks, { id: 4, title: "Celebrate", done: false }] },
      },
      {
        label: "title of item 2 changes",
        prev: { tasks },
        next: { tasks: [tasks[0], { ...tasks[1], title: "Test well" }, tasks[2]] },
      },
    ],
  },
  "unkeyed-reorder": {
    template: `ul
  for task in tasks
    li {task.title}`,
    state: { tasks },
    steps: [
      {
        label: "last item moves to the front",
        prev: { tasks },
        next: { tasks: [tasks[2], tasks[0], tasks[1]] },
      },
      {
        label: "first item removed",
        prev: { tasks },
        next: { tasks: [tasks[1], tasks[2]] },
      },
    ],
  },
  "key-expression": {
    template: `ul
  for row, n in rows key row.id + "-" + n
    li {row.id}`,
    state: { rows: [{ id: "a" }, { id: "b" }] },
  },
  nested: {
    template: `for group in groups key group.name
  h4 {group.name}
  ul
    for item, i in group.items key item
      li {i + 1}. {item} ({group.name})`,
    state: {
      groups: [
        { name: "Fruit", items: ["apple", "pear"] },
        { name: "Veg", items: ["leek"] },
      ],
    },
    steps: [
      {
        label: "pear added to Veg",
        prev: {
          groups: [
            { name: "Fruit", items: ["apple", "pear"] },
            { name: "Veg", items: ["leek"] },
          ],
        },
        next: {
          groups: [
            { name: "Fruit", items: ["apple", "pear"] },
            { name: "Veg", items: ["leek", "pear"] },
          ],
        },
      },
    ],
  },
  "class-toggle": {
    template: `ul
  for task in tasks key task.id
    li(class:done=task.done class:current={task.id === currentId}) {task.title}`,
    state: { tasks, currentId: 2 },
    steps: [
      {
        label: "currentId 2 → 3",
        prev: { tasks, currentId: 2 },
        next: { tasks, currentId: 3 },
      },
      {
        label: "task 2 done false → true",
        prev: { tasks, currentId: 2 },
        next: {
          tasks: [tasks[0], { ...tasks[1], done: true }, tasks[2]],
          currentId: 2,
        },
      },
    ],
  },
  filtered: {
    template: `div.tasks
  input(type="search" value=query placeholder="Filter" @input=setQuery)
  ul
    for task in tasks key task.id
      if !query || task.title.toLowerCase().includes(query.toLowerCase())
        li(class:done=task.done)
          input(type="checkbox" checked={task.done} @change=toggle(task.id))
          span {task.title}
  if shown === 0
    p.muted No task matches "{query}"
  else
    p.muted Showing {shown} of {tasks.length}`,
    state: { tasks, query: "", shown: 3 },
    steps: [
      {
        label: "query '' → 'es'",
        prev: { tasks, query: "", shown: 3 },
        next: { tasks, query: "es", shown: 1 },
      },
      {
        label: "query 'es' → 'zzz'",
        prev: { tasks, query: "es", shown: 1 },
        next: { tasks, query: "zzz", shown: 0 },
      },
    ],
  },
  "filtered-visible": {
    template: `ul
  for task in visible key task.id
    li(class:done=task.done) {task.title}
if visible.length === 0
  p.muted Nothing to show`,
    state: { visible: tasks.slice(1) },
    steps: [
      {
        label: "filter changes visible",
        prev: { visible: tasks.slice(1) },
        next: { visible: [tasks[0]] },
      },
      {
        label: "visible becomes empty",
        prev: { visible: tasks.slice(1) },
        next: { visible: [] },
      },
    ],
  },
  inbox: {
    template: `section.inbox
  h3 Inbox
  if status === "loading"
    p Loading...
  else if status === "error"
    p.error {message}
    button(@click=retry) Try again
  else
    ul
      for mail in mails key mail.id
        li(class:unread={!mail.read})
          strong {mail.from}
          span  {mail.subject}
          if !mail.read
            button(@click=markRead(mail.id)) Mark as read
    if mails.length === 0
      p.muted Nothing here`,
    state: { status: "loading", message: "", mails: [] },
    steps: [
      {
        label: "loading → ready with two mails",
        prev: { status: "loading", message: "", mails: [] },
        next: { status: "ready", message: "", mails: inbox },
      },
      {
        label: "mail 2 marked as read",
        prev: { status: "ready", message: "", mails: inbox },
        next: {
          status: "ready",
          message: "",
          mails: [inbox[0], { ...inbox[1], read: true }],
        },
      },
      {
        label: "new mail 3 arrives on top",
        prev: { status: "ready", message: "", mails: inbox },
        next: {
          status: "ready",
          message: "",
          mails: [{ id: 3, from: "Cid", subject: "Lunch?", read: false }, ...inbox],
        },
      },
      {
        label: "all mails deleted",
        prev: { status: "ready", message: "", mails: inbox },
        next: { status: "ready", message: "", mails: [] },
      },
      {
        label: "ready → error",
        prev: { status: "ready", message: "", mails: inbox },
        next: { status: "error", message: "Offline", mails: inbox },
      },
    ],
  },
};
