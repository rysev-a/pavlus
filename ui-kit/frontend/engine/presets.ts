export interface Preset {
  id: string;
  name: string;
  template: string;
  prev: string;
  next: string;
}

const json = (v: unknown): string => JSON.stringify(v, null, 2);

export const PRESETS: Preset[] = [
  {
    id: "counter",
    name: "Counter",
    template: `// a counter: text, an attribute and an event
div.counter
  p Clicked {count} {count === 1 ? "time" : "times"}
  button.btn(type="button" title="Now {count}" @click=inc) Add one`,
    prev: json({ count: 0 }),
    next: json({ count: 1 }),
  },
  {
    id: "list",
    name: "Todo list",
    template: `ul.list
  for item, i in items key item.id
    li(class:done=item.done @click=toggle(item.id)) {i + 1}. {item.title}
if items.length === 0
  p.empty Nothing here
else
  p.total {items.length} items`,
    prev: json({
      items: [
        { id: 1, title: "Write the docs", done: false },
        { id: 2, title: "Compile them", done: false },
      ],
    }),
    next: json({
      items: [
        { id: 2, title: "Compile them", done: true },
        { id: 1, title: "Write the docs", done: false },
        { id: 3, title: "Ship", done: false },
      ],
    }),
  },
  {
    id: "branches",
    name: "Branches",
    template: `section.panel
  if user
    h2 Hello, {user.name}!
    if user.admin
      span.badge Admin
    else if user.vip
      span.badge VIP
  else
    a(href="/login" @click.prevent=navigate("/login")) Sign in`,
    prev: json({ user: null }),
    next: json({ user: { name: "Ann", admin: false, vip: true } }),
  },
];
