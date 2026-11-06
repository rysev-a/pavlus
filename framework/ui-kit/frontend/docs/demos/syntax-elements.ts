import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  hello: {
    template: `p Hello, world`,
    state: {},
  },
  selectors: {
    template: `section.panel#intro
  h2.panel-title.big Welcome
  .badge New`,
    state: {},
  },
  "text-lines": {
    template: `// a comment: not in the output
p
  | First line of text,
  | and a second one.
  strong bold text
  | and some more.`,
    state: {},
  },
  attributes: {
    template: `a.link(href=url title="Open {name}" target="_blank") Open
button(type="button" disabled) Save`,
    state: { url: "/docs/overview", name: "the overview" },
    steps: [
      {
        label: "url changes",
        prev: { url: "/a", name: "A" },
        next: { url: "/b", name: "A" },
      },
    ],
  },
  "class-toggle": {
    template: `li.item(class:active=active class:done=done) Task`,
    state: { active: true, done: false },
    steps: [
      {
        label: "active true → false",
        prev: { active: true, done: false },
        next: { active: false, done: false },
      },
    ],
  },
  card: {
    template: `div.card
  h3#card-title {title}
  p.muted Created by {author.name}
  button.btn(type="button" disabled={locked} title="Open {title}") Open`,
    state: { title: "Release notes", author: { name: "Ann" }, locked: false },
    steps: [
      {
        label: "title changes",
        prev: { title: "A", author: { name: "Ann" }, locked: false },
        next: { title: "B", author: { name: "Ann" }, locked: false },
      },
    ],
  },
};
