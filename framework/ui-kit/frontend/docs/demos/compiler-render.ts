import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  "static-line": {
    template: `p.note Hello`,
    state: {},
  },
  nesting: {
    template: `div
  h1 Title
  p Text`,
    state: {},
  },
  "static-attrs": {
    template: `a.btn.big#go(href="/home" target="_blank" hidden) Home`,
    state: {},
  },
  interpolation: {
    template: `p Hello, {name}! You have {count} new messages.
p {name}
p {first} {last}`,
    state: { name: "Ann", count: 3, first: "A", last: "B" },
  },
  "dynamic-attrs": {
    template: `a(href=url title="Open {name}" data-id=id hidden=gone) Link`,
    state: { url: "/x", name: "page", id: 0, gone: false },
    steps: [
      {
        label: "url removed",
        prev: { url: "/x", name: "page", id: 0, gone: false },
        next: { url: null, name: "page", id: 0, gone: false },
      },
    ],
  },
  classes: {
    template: `li.item(class:active=active class:done={state === "done"} class=extra) Task`,
    state: { active: true, state: "open", extra: "wide" },
    steps: [
      {
        label: "state open → done",
        prev: { active: true, state: "open", extra: "wide" },
        next: { active: true, state: "done", extra: "wide" },
      },
    ],
  },
  voids: {
    template: `form
  input(type="text" value=query)
  br
  img(src="/logo.png" alt="Logo")`,
    state: { query: "pavlus" },
  },
  events: {
    template: `div
  button(@click=save) Save
  button(@click=remove(id)) Remove
  button(@click=move(id, 1)) Down
  form(@submit.prevent=send(text))
    a(href="#" @click.prevent.stop=open) Open`,
    state: { id: 4, text: "hi" },
    steps: [
      {
        label: "id 4 → 5",
        prev: { id: 4, text: "hi" },
        next: { id: 5, text: "hi" },
      },
    ],
  },
  operators: {
    template: `p {a + b * 2}
p {!done}
p {-n}
p {x > 0 && y < 10 || z}
p {name ?? "anonymous"}
p {count === 1 ? "item" : "items"}`,
    state: {
      a: 1,
      b: 2,
      done: false,
      n: 5,
      x: 1,
      y: 2,
      z: 0,
      name: null,
      count: 2,
    },
  },
  access: {
    template: `p {user.address.city}
p {rows[i].title}
p {format(price)}
p {tags.length}
p {["a", n].length}
p {null}`,
    state: {
      user: null,
      rows: [],
      i: 0,
      format: (n: number) => `$${n}`,
      price: 3,
      tags: ["x"],
      n: 1,
    },
  },
  "if-else": {
    template: `if loading
  p Loading
else
  p Loaded {count}`,
    state: { loading: false, count: 8 },
  },
  "for-loop": {
    template: `ul
  for tag, i in tags key tag
    li {i}: {tag}`,
    state: { tags: ["a", "b"] },
  },
  embed: {
    template: `import Badge from "./badge.pavlus"

div
  +Badge#one(label="Hi {name}" count=n)`,
    state: { name: "Ann", n: 2 },
    components: { Badge: `span.badge {label} ({count})` },
  },
  card: {
    template: `article.card(class:featured=featured)
  img.card-img(src=image alt=title)
  h3.card-title {title}
  p {summary ?? "No summary"}
  ul.tags
    for tag in tags key tag
      li.tag(@click=filter(tag)) {tag}
  if price
    button.buy(@click=buy(id, price) disabled=soldOut) Buy for {price}
  else
    span.free Free`,
    state: {
      id: 9,
      featured: true,
      image: "/a.png",
      title: "Tea",
      summary: null,
      tags: ["hot", "green"],
      price: 4,
      soldOut: false,
    },
    steps: [
      {
        label: "price 4 → 5",
        prev: {
          id: 9,
          featured: true,
          image: "/a.png",
          title: "Tea",
          summary: null,
          tags: ["hot", "green"],
          price: 4,
          soldOut: false,
        },
        next: {
          id: 9,
          featured: true,
          image: "/a.png",
          title: "Tea",
          summary: null,
          tags: ["hot", "green"],
          price: 5,
          soldOut: false,
        },
      },
    ],
  },
};
