import type { Demo } from "../demo.ts";

export const demos: Record<string, Demo> = {
  counter: {
    template: `div.counter
  p Clicked {count} times
  button(type="button" @click=inc) Click me`,
    state: { count: 0 },
    steps: [
      { label: "count 0 → 1", prev: { count: 0 }, next: { count: 1 } },
      { label: "count 1 → 2", prev: { count: 1 }, next: { count: 2 } },
    ],
  },
  "notes-list": {
    template: `section.notes
  form(@submit.prevent=add)
    input(value=draft placeholder="A note" @input=setDraft)
    button(type="submit") Add
  ul
    for note in notes key note.id
      li
        span {note.text}
        button(type="button" @click=remove(note.id)) remove
  p Notes: {notes.length}`,
    state: { draft: "", notes: [{ id: 1, text: "Buy milk" }] },
    steps: [
      {
        label: "typing: draft '' → 'Call Ann'",
        prev: { draft: "", notes: [{ id: 1, text: "Buy milk" }] },
        next: { draft: "Call Ann", notes: [{ id: 1, text: "Buy milk" }] },
      },
      {
        label: "add: one more note, draft cleared",
        prev: { draft: "Call Ann", notes: [{ id: 1, text: "Buy milk" }] },
        next: {
          draft: "",
          notes: [
            { id: 1, text: "Buy milk" },
            { id: 2, text: "Call Ann" },
          ],
        },
      },
      {
        label: "remove note 1",
        prev: {
          draft: "",
          notes: [
            { id: 1, text: "Buy milk" },
            { id: 2, text: "Call Ann" },
          ],
        },
        next: { draft: "", notes: [{ id: 2, text: "Call Ann" }] },
      },
    ],
  },
};
