import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  static: {
    template: `p.note Hello, world`,
    state: {},
    steps: [{ label: "{} → {x: 1}", prev: {}, next: { x: 1 } }],
  },
  text: {
    template: `p Hello, {name}! You have {count} items.`,
    state: { name: "Ann", count: 2 },
    steps: [
      {
        label: "count 2 → 3",
        prev: { name: "Ann", count: 2 },
        next: { name: "Ann", count: 3 },
      },
      {
        label: "name Ann → Bob, count 2 → 5",
        prev: { name: "Ann", count: 2 },
        next: { name: "Bob", count: 5 },
      },
      {
        label: "nothing changed",
        prev: { name: "Ann", count: 2 },
        next: { name: "Ann", count: 2 },
      },
    ],
  },
  "other-field": {
    template: `p Hello, {name}!`,
    state: { name: "Ann", theme: "light" },
    steps: [
      {
        label: "theme light → dark",
        prev: { name: "Ann", theme: "light" },
        next: { name: "Ann", theme: "dark" },
      },
    ],
  },
  guards: {
    template: `div.card
  h2 {title}
  p.muted by {author}
  p Static line`,
    state: { title: "Release notes", author: "Ann" },
    steps: [
      {
        label: "title changes",
        prev: { title: "A", author: "Ann" },
        next: { title: "B", author: "Ann" },
      },
      {
        label: "author changes",
        prev: { title: "A", author: "Ann" },
        next: { title: "A", author: "Bob" },
      },
      {
        label: "both change",
        prev: { title: "A", author: "Ann" },
        next: { title: "B", author: "Bob" },
      },
      {
        label: "title: same text, new value",
        prev: { title: "1", author: "Ann" },
        next: { title: 1, author: "Ann" },
      },
    ],
  },
  attributes: {
    template: `a.link(href=url title="Open {name}" target="_blank") Open`,
    state: { url: "/docs", name: "the docs" },
    steps: [
      {
        label: "url changes",
        prev: { url: "/a", name: "A" },
        next: { url: "/b", name: "A" },
      },
      {
        label: "name changes",
        prev: { url: "/a", name: "A" },
        next: { url: "/a", name: "B" },
      },
      {
        label: "url and name change",
        prev: { url: "/a", name: "A" },
        next: { url: "/b", name: "B" },
      },
    ],
  },
  "attribute-removed": {
    template: `button(type="button" disabled=locked title=hint) Save`,
    state: { locked: true, hint: "Saving is off" },
    steps: [
      {
        label: "locked true → false",
        prev: { locked: true, hint: "h" },
        next: { locked: false, hint: "h" },
      },
      {
        label: "locked false → true",
        prev: { locked: false, hint: "h" },
        next: { locked: true, hint: "h" },
      },
      {
        label: "hint null → text",
        prev: { locked: false, hint: null },
        next: { locked: false, hint: "Saved" },
      },
      {
        label: "hint text → null",
        prev: { locked: false, hint: "Saved" },
        next: { locked: false, hint: null },
      },
      {
        label: "hint text → empty string",
        prev: { locked: false, hint: "Saved" },
        next: { locked: false, hint: "" },
      },
    ],
  },
  classes: {
    template: `li.item(class:active=active class:done=done) {title}`,
    state: { active: true, done: false, title: "Task" },
    steps: [
      {
        label: "active true → false",
        prev: { active: true, done: false, title: "Task" },
        next: { active: false, done: false, title: "Task" },
      },
      {
        label: "done false → true",
        prev: { active: true, done: false, title: "Task" },
        next: { active: true, done: true, title: "Task" },
      },
      {
        label: "title changes",
        prev: { active: true, done: false, title: "Task" },
        next: { active: true, done: false, title: "Task 2" },
      },
    ],
  },
  "class-removed": {
    template: `li(class:on=on) Item`,
    state: { on: true },
    steps: [
      { label: "on true → false", prev: { on: true }, next: { on: false } },
      { label: "on false → true", prev: { on: false }, next: { on: true } },
    ],
  },
  handler: {
    template: `button(@click=pick(id)) Pick`,
    state: { id: 1 },
    steps: [
      { label: "id 1 → 2", prev: { id: 1 }, next: { id: 2 } },
      { label: "id 2 → 2", prev: { id: 2 }, next: { id: 2 } },
    ],
  },
  "handler-many": {
    template: `a(href=url @click.prevent=open(id, kind)) {title}`,
    state: { url: "/post/7", id: 7, kind: "post", title: "Read" },
    steps: [
      {
        label: "kind post → page",
        prev: { url: "/p/7", id: 7, kind: "post", title: "Read" },
        next: { url: "/p/7", id: 7, kind: "page", title: "Read" },
      },
      {
        label: "title changes only",
        prev: { url: "/p/7", id: 7, kind: "post", title: "Read" },
        next: { url: "/p/7", id: 7, kind: "post", title: "Open" },
      },
      {
        label: "url and id change",
        prev: { url: "/p/7", id: 7, kind: "post", title: "Read" },
        next: { url: "/p/8", id: 8, kind: "post", title: "Read" },
      },
    ],
  },
  "static-handler": {
    template: `button(@click=save) Save`,
    state: {},
    steps: [{ label: "{} → {x: 1}", prev: {}, next: { x: 1 } }],
  },
  redundant: {
    template: `p.note(title=text) {text}`,
    state: { text: "Hello" },
    steps: [
      {
        label: "text Hello → Hi",
        prev: { text: "Hello" },
        next: { text: "Hi" },
      },
    ],
  },
  member: {
    template: `p {user.name}`,
    state: { user: { name: "Ann", age: 30 } },
    steps: [
      {
        label: "age changes, new user object",
        prev: { user: { name: "Ann", age: 30 } },
        next: { user: { name: "Ann", age: 31 } },
      },
    ],
  },
  product: {
    template: `article.product(class:sale=onSale class:out={stock === 0})
  h3#product-title {name}
  p.price {price} {currency}
  if onSale
    p.badge Sale
  button.buy(type="button" disabled={stock === 0} title="Buy {name}" @click=buy(id)) Buy
  p.stock {stock} left`,
    state: {
      id: 7,
      name: "Lamp",
      price: 20,
      currency: "EUR",
      stock: 3,
      onSale: false,
    },
    steps: [
      {
        label: "stock 3 → 2",
        prev: {
          id: 7,
          name: "Lamp",
          price: 20,
          currency: "EUR",
          stock: 3,
          onSale: false,
        },
        next: {
          id: 7,
          name: "Lamp",
          price: 20,
          currency: "EUR",
          stock: 2,
          onSale: false,
        },
      },
      {
        label: "stock 1 → 0",
        prev: {
          id: 7,
          name: "Lamp",
          price: 20,
          currency: "EUR",
          stock: 1,
          onSale: false,
        },
        next: {
          id: 7,
          name: "Lamp",
          price: 20,
          currency: "EUR",
          stock: 0,
          onSale: false,
        },
      },
      {
        label: "price 20 → 15, onSale false → true",
        prev: {
          id: 7,
          name: "Lamp",
          price: 20,
          currency: "EUR",
          stock: 3,
          onSale: false,
        },
        next: {
          id: 7,
          name: "Lamp",
          price: 15,
          currency: "EUR",
          stock: 3,
          onSale: true,
        },
      },
      {
        label: "another product",
        prev: {
          id: 7,
          name: "Lamp",
          price: 20,
          currency: "EUR",
          stock: 3,
          onSale: false,
        },
        next: {
          id: 8,
          name: "Desk",
          price: 90,
          currency: "EUR",
          stock: 3,
          onSale: false,
        },
      },
      {
        label: "currency only",
        prev: {
          id: 7,
          name: "Lamp",
          price: 20,
          currency: "EUR",
          stock: 3,
          onSale: false,
        },
        next: {
          id: 7,
          name: "Lamp",
          price: 20,
          currency: "USD",
          stock: 3,
          onSale: false,
        },
      },
    ],
  },
};
