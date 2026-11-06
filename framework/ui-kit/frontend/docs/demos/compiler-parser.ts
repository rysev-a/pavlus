import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  indent: {
    template: `ul
  li One
  li Two
    b bold
p After`,
    state: {},
  },
  "ids-small": {
    template: `p Hello, {name}`,
    state: { name: "Ann" },
  },
  "text-join": {
    template: `p
  | one
  | two {x}`,
    state: { x: 2 },
  },
  "selector-attrs": {
    template: `a.btn#go(href=url disabled @click.prevent=save(id, 2) class:on=open) Go`,
    state: { url: "/x", id: 7, open: true },
  },
  "if-chain": {
    template: `if status === "loading"
  p Loading
else if status === "error"
  p.error {message}
else
  p Done`,
    state: { status: "error", message: "Boom" },
    steps: [
      {
        label: "status error → loading",
        prev: { status: "error", message: "Boom" },
        next: { status: "loading", message: "Boom" },
      },
    ],
  },
  "for-index": {
    template: `for u, i in users key u.id
  li {i}: {u.name}`,
    state: {
      users: [
        { id: "a", name: "Ann" },
        { id: "b", name: "Bob" },
      ],
    },
  },
  embeds: {
    template: `import Badge from "./badge.pavlus"

div
  +Badge#first(label="Hi {name}" strong)
  +Badge#second(...extra)`,
    state: { name: "Ann", extra: { label: "From spread" } },
    components: { Badge: `span.badge {label}` },
  },
  expressions: {
    template: `p {a + b * 2}
p {ok ? "yes" : "no"}
p {user?.name ?? "anonymous"}
p {list[0]} of {list.length}
p {format(price, "usd")}`,
    state: {
      a: 1,
      b: 3,
      ok: true,
      user: null,
      list: ["x", "y"],
      price: 5,
      format: (n: number, c: string) => `${n} ${c}`,
    },
  },
  escapes: {
    template: `// the line comment is dropped
a(href="http://example.com/a") Home // so is the trailing one
p Braces: \\{ and \\} stay, {n} is a value`,
    state: { n: 3 },
  },
  tree: {
    template: `section.cart
  h2 {title}
  if items.length
    ul
      for item in items key item.id
        li(@click=pick(item.id)) {item.name}
  else
    p.empty Nothing here
  footer
    | Total: {total}`,
    state: { title: "Cart", items: [{ id: 1, name: "Tea" }], total: 4 },
  },
};
