import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  basic: {
    template: `p Hello, {name}`,
    state: { name: "Ann" },
    steps: [
      { label: "name Ann → Bob", prev: { name: "Ann" }, next: { name: "Bob" } },
      {
        label: "other field changes",
        prev: { name: "Ann", n: 1 },
        next: { name: "Ann", n: 2 },
      },
    ],
  },
  members: {
    template: `p {user.profile.name} / {user.role}
p {items[index].title}
p {fmt(count, unit)}`,
    state: {
      user: { profile: { name: "Ann" }, role: "admin" },
      items: [{ title: "A" }],
      index: 0,
      fmt: (n: number, u: string) => `${n} ${u}`,
      count: 2,
      unit: "pcs",
    },
  },
  "static-mix": {
    template: `div.card
  h3 Title (never changes)
  p.muted A static paragraph
  p Visits: {visits}`,
    state: { visits: 1 },
    steps: [
      {
        label: "visits 1 → 2",
        prev: { visits: 1 },
        next: { visits: 2 },
      },
    ],
  },
  parts: {
    template: `a.link(href=url class:active=active title="Open {title}" @click=go(id)) {label}`,
    state: { url: "/a", active: false, title: "A", id: 1, label: "Go" },
    steps: [
      {
        label: "only id changes",
        prev: { url: "/a", active: false, title: "A", id: 1, label: "Go" },
        next: { url: "/a", active: false, title: "A", id: 2, label: "Go" },
      },
      {
        label: "title and label change",
        prev: { url: "/a", active: false, title: "A", id: 1, label: "Go" },
        next: { url: "/a", active: false, title: "B", id: 1, label: "Open" },
      },
    ],
  },
  "two-fields": {
    template: `section
  h2 {title}
  p {body}
  p.meta by {author}`,
    state: { title: "T", body: "B", author: "Ann" },
    steps: [
      {
        label: "only body changes",
        prev: { title: "T", body: "B", author: "Ann" },
        next: { title: "T", body: "C", author: "Ann" },
      },
      {
        label: "title and author change",
        prev: { title: "T", body: "B", author: "Ann" },
        next: { title: "U", body: "B", author: "Bob" },
      },
    ],
  },
  "same-deps": {
    template: `button(title=label @click=pick(label)) Pick {label}`,
    state: { label: "A" },
    steps: [
      { label: "label A → B", prev: { label: "A" }, next: { label: "B" } },
    ],
  },
  loop: {
    template: `ul
  for item in items key item.id
    li(class:hot=item.hot) {prefix}{item.name}`,
    state: {
      prefix: "- ",
      items: [
        { id: 1, name: "Tea", hot: false },
        { id: 2, name: "Coffee", hot: true },
      ],
    },
    steps: [
      {
        label: "one item changes",
        prev: {
          prefix: "- ",
          items: [
            { id: 1, name: "Tea", hot: false },
            { id: 2, name: "Coffee", hot: true },
          ],
        },
        next: {
          prefix: "- ",
          items: [
            { id: 1, name: "Tea", hot: true },
            { id: 2, name: "Coffee", hot: true },
          ],
        },
      },
      {
        label: "prefix changes",
        prev: {
          prefix: "- ",
          items: [{ id: 1, name: "Tea", hot: false }],
        },
        next: {
          prefix: "* ",
          items: [{ id: 1, name: "Tea", hot: false }],
        },
      },
    ],
  },
  "loop-index": {
    template: `for row, n in rows key row
  p {n}. {row}`,
    state: { rows: ["a", "b"] },
    steps: [
      {
        label: "rows a,b → b,a",
        prev: { rows: ["a", "b"] },
        next: { rows: ["b", "a"] },
      },
    ],
  },
  shadow: {
    template: `p {name}
for name in names
  span {name}`,
    state: { name: "outer", names: ["x", "y"] },
  },
  branches: {
    template: `if user
  p Hello, {user.name}
else if guest
  p Welcome, guest
else
  p.muted Please sign in`,
    state: { user: { name: "Ann" }, guest: false },
    steps: [
      {
        label: "name Ann → Bob (same branch)",
        prev: { user: { name: "Ann" }, guest: false },
        next: { user: { name: "Bob" }, guest: false },
      },
      {
        label: "user → none (branch changes)",
        prev: { user: { name: "Ann" }, guest: false },
        next: { user: null, guest: false },
      },
    ],
  },
  nested: {
    template: `div.panel(class:open=open)
  h2 {title}
  if open
    p {body}
  footer {count} views`,
    state: { open: true, title: "T", body: "B", count: 1 },
    steps: [
      {
        label: "count 1 → 2",
        prev: { open: true, title: "T", body: "B", count: 1 },
        next: { open: true, title: "T", body: "B", count: 2 },
      },
      {
        label: "body B → C",
        prev: { open: true, title: "T", body: "B", count: 1 },
        next: { open: true, title: "T", body: "C", count: 1 },
      },
    ],
  },
  embed: {
    template: `import Badge from "./badge.pavlus"

div
  h3 {title}
  +Badge#state(label=status)
  p Static note`,
    state: { title: "Order", status: "paid" },
    components: { Badge: `span.badge {label}` },
    steps: [
      {
        label: "status paid → sent",
        prev: { title: "Order", status: "paid" },
        next: { title: "Order", status: "sent" },
      },
      {
        label: "title changes",
        prev: { title: "Order", status: "paid" },
        next: { title: "Order 2", status: "paid" },
      },
    ],
  },
  big: {
    template: `main.app
  header
    h1 {site.title}
    nav
      for link in links key link.href
        a(href=link.href class:current={link.href === page}) {link.label}
  if flash
    p.flash {flash}
  article
    h2 {article.title}
    p.static This line never changes.
  footer © {site.year}`,
    state: {
      site: { title: "Docs", year: 2026 },
      links: [
        { href: "/", label: "Home" },
        { href: "/about", label: "About" },
      ],
      page: "/",
      flash: "",
      article: { title: "Hello" },
    },
    steps: [
      {
        label: "page / → /about",
        prev: {
          site: { title: "Docs", year: 2026 },
          links: [
            { href: "/", label: "Home" },
            { href: "/about", label: "About" },
          ],
          page: "/",
          flash: "",
          article: { title: "Hello" },
        },
        next: {
          site: { title: "Docs", year: 2026 },
          links: [
            { href: "/", label: "Home" },
            { href: "/about", label: "About" },
          ],
          page: "/about",
          flash: "",
          article: { title: "Hello" },
        },
      },
      {
        label: "article title changes",
        prev: {
          site: { title: "Docs", year: 2026 },
          links: [{ href: "/", label: "Home" }],
          page: "/",
          flash: "",
          article: { title: "Hello" },
        },
        next: {
          site: { title: "Docs", year: 2026 },
          links: [{ href: "/", label: "Home" }],
          page: "/",
          flash: "",
          article: { title: "Hello again" },
        },
      },
    ],
  },
};
