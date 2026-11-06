import type { Demo } from "../demo.ts";

const ann = { id: 1, title: "Ann" };
const bob = { id: 2, title: "Bob" };
const eve = { id: 3, title: "Eve" };

// One array, changed in place, and the same array in the next state: what a
// mutation looks like to the compiled diff.
const shared = [ann, bob];
const grown = shared;
grown.push(eve);

export const demos: Record<string, Demo> = {
  "quotes-text": {
    template: `a(href="url") Open`,
    state: { url: "/docs/overview" },
  },
  "quotes-expression": {
    template: `a(href=url) Open`,
    state: { url: "/docs/overview" },
    steps: [
      {
        label: "url /a → /b",
        prev: { url: "/a" },
        next: { url: "/b" },
      },
    ],
  },
  keyed: {
    template: `ul
  for person in people key person.id
    li {person.title}`,
    state: { people: [ann, bob, eve] },
    steps: [
      {
        label: "first item removed",
        prev: { people: [ann, bob, eve] },
        next: { people: [bob, eve] },
      },
    ],
  },
  unkeyed: {
    template: `ul
  for person in people
    li {person.title}`,
    state: { people: [ann, bob, eve] },
    steps: [
      {
        label: "first item removed",
        prev: { people: [ann, bob, eve] },
        next: { people: [bob, eve] },
      },
    ],
  },
  mutation: {
    template: `ul
  for person in people key person.id
    li {person.title}`,
    state: { people: [ann, bob] },
    steps: [
      {
        label: "push into the same array",
        prev: { people: shared },
        next: { people: grown },
      },
      {
        label: "a new array with the item",
        prev: { people: [ann, bob] },
        next: { people: [ann, bob, eve] },
      },
    ],
  },
  braces: {
    template: `p Write \\{name} to show the field, not {name}.`,
    state: { name: "Ann" },
  },
};
