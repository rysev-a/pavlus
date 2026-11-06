import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  hello: {
    template: `p Hello, {name}!`,
    state: { name: "Ann" },
    steps: [
      {
        label: "name Ann → Bob",
        prev: { name: "Ann" },
        next: { name: "Bob" },
      },
      {
        label: "name Ann → Ann",
        prev: { name: "Ann" },
        next: { name: "Ann" },
      },
    ],
  },
  compiled: {
    template: `p {user.name} wrote {count} {count === 1 ? "post" : "posts"}`,
    state: { user: { name: "Ann" }, count: 3 },
    steps: [
      {
        label: "count 3 → 4",
        prev: { user: { name: "Ann" }, count: 3 },
        next: { user: { name: "Ann" }, count: 4 },
      },
    ],
  },
  "in-attributes": {
    template: `a.link(href="/users/{user.id}" title="Open {user.name}") {user.name}
img(src=user.avatar alt={user.name})`,
    state: { user: { id: 7, name: "Ann", avatar: "/img/ann.png" } },
    steps: [
      {
        label: "user.name Ann → Bob",
        prev: { user: { id: 7, name: "Ann", avatar: "/a.png" } },
        next: { user: { id: 7, name: "Bob", avatar: "/a.png" } },
      },
    ],
  },
  members: {
    template: `p {user.name} lives in {user.address.city}.
p Phone: [{user.phone.number}]
p Zip: [{user.address.zip.code}]`,
    state: { user: { name: "Ann", address: { city: "Oslo" } } },
  },
  indexing: {
    template: `p First: {names[0]}
p Chosen: {names[chosen]}
p Looked up: {labels[kind]}
p Next: {names[chosen + 1]}`,
    state: {
      names: ["Ann", "Bob", "Cid"],
      chosen: 1,
      labels: { a: "Alpha", b: "Beta" },
      kind: "b",
    },
  },
  calls: {
    template: `p {title.toUpperCase()}
p {tags.join(", ")}
p {price.toFixed(2)}
p {missing.toUpperCase()}
p [{notAFunction()}]`,
    state: { title: "release notes", tags: ["new", "fix"], price: 4.5 },
  },
  operators: {
    template: `p {price} x {qty} = {price * qty}
p Left: {limit - qty}, remainder {qty % 2}
p {qty > 1 && "many"}
p {qty >= 3 || "few"}
p {label ?? "no label"}
p {-qty} and {!done}`,
    state: { price: 4, qty: 3, limit: 10, label: null, done: false },
  },
  ternary: {
    template: `p {count} {count === 1 ? "item" : "items"}
p {count === 0 ? "empty" : count < 5 ? "few" : "many"}`,
    state: { count: 1 },
    steps: [
      { label: "count 1 → 2", prev: { count: 1 }, next: { count: 2 } },
      { label: "count 2 → 9", prev: { count: 2 }, next: { count: 9 } },
    ],
  },
  arrays: {
    template: `p {[first, last].join(" ... ")}
p {[1, 2, 3].length} numbers
p {[a, b][which]}`,
    state: { first: "start", last: "end", a: "A", b: "B", which: 1 },
  },
  precedence: {
    template: `p {1 + 2 * 3}
p {(1 + 2) * 3}
p {10 - 2 - 3}
p {!a && b}
p {a || b && c}
p {nothing ?? 0 || 5}`,
    state: { a: 0, b: "B", c: "C", nothing: null },
  },
  nullish: {
    template: `p {count || "none"}
p {count ?? "none"}`,
    state: { count: 0 },
    steps: [{ label: "count 0 → 3", prev: { count: 0 }, next: { count: 3 } }],
  },
  "text-values": {
    template: `p [{nothing}]
p [{missing}]
p [{no}]
p [{yes}]
p [{zero}]
p [{empty}]
p [{list}]
p [{obj}]`,
    state: {
      nothing: null,
      no: false,
      yes: true,
      zero: 0,
      empty: "",
      list: [1, 2],
      obj: { a: 1 },
    },
  },
  "attr-values": {
    template: `input(type="checkbox" checked={on} disabled=off title="{note}" data-count=count data-empty=empty)`,
    state: { on: true, off: false, note: null, count: 0, empty: "" },
    steps: [
      {
        label: "off false → true",
        prev: { on: true, off: false, note: null, count: 0, empty: "" },
        next: { on: true, off: true, note: null, count: 0, empty: "" },
      },
      {
        label: "note null → hi",
        prev: { on: true, off: true, note: null, count: 0, empty: "" },
        next: { on: true, off: true, note: "hi", count: 0, empty: "" },
      },
      {
        label: "note hi → null",
        prev: { on: true, off: true, note: "hi", count: 0, empty: "" },
        next: { on: true, off: true, note: null, count: 0, empty: "" },
      },
    ],
  },
  "attr-strings": {
    template: `p(title="{note}") whole value
p(title="Note: {note}") part of a string`,
    state: { note: null },
    steps: [
      { label: "note null → hi", prev: { note: null }, next: { note: "hi" } },
    ],
  },
  "ternary-attr": {
    template: `button(data-state={busy ? "busy" : null} aria-pressed={on ? "true" : "false"}) Go`,
    state: { busy: false, on: true },
  },
  truthiness: {
    template: `p 0 is {zero ? "truthy" : "falsy"}
p empty string is {empty ? "truthy" : "falsy"}
p "0" is {zeroText ? "truthy" : "falsy"}
p null is {nothing ? "truthy" : "falsy"}
p an empty array is {list ? "truthy" : "falsy"}
p an empty object is {obj ? "truthy" : "falsy"}
p list.length is {list.length ? "truthy" : "falsy"}`,
    state: {
      zero: 0,
      empty: "",
      zeroText: "0",
      nothing: null,
      list: [],
      obj: {},
    },
  },
  escapes: {
    template: `p Use \\{braces\\} to show braces, and {"}"} inside a string.
p A lone } is fine. Quote: {'say "hi"'}`,
    state: {},
  },
  "all-in-one": {
    template: `article.order
  h3 Order #{order.id}
  p {order.lines.length} {order.lines.length === 1 ? "line" : "lines"}, total {total.toFixed(2)}
  p.note(class:late=order.late title="Placed by {order.customer?.name ?? 'someone'}") {order.customer?.name ?? "Unknown customer"}`,
    state: {
      order: { id: 12, lines: [1, 2], late: true, customer: { name: "Ann" } },
      total: 19.5,
    },
    steps: [
      {
        label: "customer removed",
        prev: {
          order: {
            id: 12,
            lines: [1, 2],
            late: true,
            customer: { name: "Ann" },
          },
          total: 19.5,
        },
        next: {
          order: { id: 12, lines: [1, 2], late: true, customer: null },
          total: 19.5,
        },
      },
    ],
  },
};
